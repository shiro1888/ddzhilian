import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

import WebSocket, { WebSocketServer } from 'ws';

import { loadConfig, type AiProvider } from './config.js';
import {
  type ClientEvent,
  type PairReason,
  type ServerEvent,
  type TransportMode,
  parseClientEvent,
} from './protocol.js';
import {
  type ConnectedDevice,
  DeviceRegistry,
} from './registry/device-registry.js';
import { AdminConfigRegistry, type AdminAiSettingsSnapshot } from './registry/admin-config-registry.js';
import { AdminSessionRegistry } from './registry/admin-session-registry.js';
import { AiUsageRegistry } from './registry/ai-usage-registry.js';
import { HistoryRegistry } from './registry/history-registry.js';
import { RoomRegistry } from './registry/room-registry.js';
import { SessionRegistry } from './registry/session-registry.js';
import { UiStateRegistry } from './registry/ui-state-registry.js';
import {
  type AiQuotaReservation,
  CloudflareAiQuota,
} from './utils/cloudflare-ai-quota.js';
import { buildNetworkContext } from './utils/network.js';

type ErrorPayload = Extract<ServerEvent, { type: 'error' }>['payload'];
type CloudflareAiRunResponse = {
  result?: unknown;
  success?: boolean;
  errors?: Array<{
    message?: string;
  }>;
};
type CloudflareAiResultObject = {
  response?: unknown;
  text?: unknown;
  output_text?: unknown;
  output?: unknown;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};
type OpenRouterChatResponse = {
  output_text?: unknown;
  output?: unknown;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
    text?: unknown;
  }>;
  error?: {
    message?: string;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
};
type OpenRouterCreditsResponse = {
  data?: {
    total_credits?: number;
    total_usage?: number;
  };
};
type OpenRouterKeyResponse = {
  data?: {
    label?: string;
    usage?: number;
    limit?: number | null;
    limit_remaining?: number | null;
    is_free_tier?: boolean;
  };
};
type OpenRouterChatSuccess = {
  ok: true;
  model: string;
  answer: string;
  promptTokens: number;
  completionTokens: number;
};
type OpenRouterChatFailure = {
  ok: false;
  model: string;
  status: number;
  message?: string;
};
type AiChatRequestPayload = {
  prompt?: unknown;
  roomId?: unknown;
  historyId?: unknown;
  createdAt?: unknown;
  replyToName?: unknown;
  kind?: unknown;
  model?: unknown;
};
type SocketWithAddress = WebSocket & {
  clientAddress?: string;
  _socket?: {
    remoteAddress?: string;
  };
};

const config = loadConfig();
const devices = new DeviceRegistry();
const history = await HistoryRegistry.create({
  retentionMs: config.historyRetentionMs,
  maxBytes: config.historyMaxBytes,
  textRetentionMs: config.historyTextRetentionMs,
  supabase: config.supabase,
});
const adminConfig = new AdminConfigRegistry(config);
const adminSessions = new AdminSessionRegistry();
const aiUsage = new AiUsageRegistry(
  fileURLToPath(new URL('../data/admin/ai-usage.json', import.meta.url)),
);
const rooms = new RoomRegistry();
const sessions = new SessionRegistry();
const uiState = new UiStateRegistry();
const pendingRoomExitTimers = new Map<string, NodeJS.Timeout>();
const cloudflareAiQuota = new CloudflareAiQuota(
  fileURLToPath(new URL('../data/cloudflare-ai-quota.json', import.meta.url)),
);
const aiRequestMaxBytes = 64 * 1024;
const aiPromptMaxBytes = 32 * 1024;
const aiResponseMaxChars = 12_000;
const aiRoomContextWindowMs = 24 * 60 * 60 * 1000;
const aiRoomContextMaxChars = 12_000;
const aiBotDeviceId = 'bot_cloudflare_ai';
const aiBotDeviceName = 'bot';
const adminSessionCookieName = 'ddzhilian_admin_session';
const openRouterFallbackModelIds = [
  'inclusionai/ling-2.6-flash:free',
  'inclusionai/ling-2.6-1t:free',
  'openrouter/free',
];

class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large.');
  }
}

function isLoopbackOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function setCorsHeaders(
  request: {
    headers: {
      origin?: string | string[];
    };
  },
  response: {
  setHeader(name: string, value: string): void;
  },
) {
  const origin = Array.isArray(request.headers.origin)
    ? request.headers.origin[0]
    : request.headers.origin;

  if (!origin) {
    return true;
  }

  if (!config.allowedOrigins.includes(origin) && !isLoopbackOrigin(origin)) {
    return false;
  }

  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization,Content-Range,Content-Type,Range,X-File-Name,X-File-Created-At,X-Session-Id',
  );
  response.setHeader(
    'Access-Control-Expose-Headers',
    'Accept-Ranges,Content-Disposition,Content-Length,Content-Range',
  );

  return true;
}

async function readRequestBuffer(
  request: AsyncIterable<Buffer | string>,
  options?: { maxBytes?: number },
) {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.byteLength;

    if (options?.maxBytes && receivedBytes > options.maxBytes) {
      throw new RequestBodyTooLargeError();
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function decodeHeaderValue(value: string | string[] | undefined) {
  const headerValue = Array.isArray(value) ? value[0] : value;
  if (!headerValue) {
    return undefined;
  }

  try {
    return decodeURIComponent(headerValue);
  } catch {
    return headerValue;
  }
}

function writeJson(
  response: {
    writeHead(
      statusCode: number,
      headers?: Record<string, string>,
    ): unknown;
    end(body?: string): void;
  },
  statusCode: number,
  payload: Record<string, unknown>,
) {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function readBearerToken(value: string | string[] | undefined) {
  const headerValue = Array.isArray(value) ? value[0] : value;
  const trimmedValue = headerValue?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(trimmedValue);
  return match?.[1]?.trim();
}

function parseCookies(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return new Map<string, string>();
  }

  return new Map(
    raw
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf('=');
        if (index <= 0) {
          return [entry, ''] as const;
        }

        return [entry.slice(0, index), decodeURIComponent(entry.slice(index + 1))] as const;
      }),
  );
}

function appendResponseCookie(response: ServerResponse, value: string) {
  const current = response.getHeader('Set-Cookie');
  if (!current) {
    response.setHeader('Set-Cookie', value);
    return;
  }

  if (Array.isArray(current)) {
    response.setHeader('Set-Cookie', [...current, value]);
    return;
  }

  response.setHeader('Set-Cookie', [current.toString(), value]);
}

function buildAdminSessionCookie(sessionId: string) {
  const parts = [
    `${adminSessionCookieName}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${(7 * 24 * 60 * 60).toString()}`,
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function buildAdminSessionClearCookie() {
  const parts = [
    `${adminSessionCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function parseRangeHeader(value: string | string[] | undefined, size: number) {
  const headerValue = Array.isArray(value) ? value[0] : value;
  if (!headerValue) {
    return undefined;
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(headerValue.trim());
  if (!match) {
    return null;
  }

  const [, startText, endText] = match;
  let start: number;
  let end: number;

  if (!startText && !endText) {
    return null;
  }

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }

    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1),
  };
}

function parseContentRangeHeader(value: string | string[] | undefined) {
  const headerValue = Array.isArray(value) ? value[0] : value;
  if (!headerValue) {
    return undefined;
  }

  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(headerValue.trim());
  if (!match) {
    return null;
  }

  const [, startText, endText, totalText] = match;
  const start = Number(startText);
  const end = Number(endText);
  const total = Number(totalText);

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    start < 0 ||
    end < start ||
    total <= 0 ||
    end >= total
  ) {
    return null;
  }

  return {
    start,
    end,
    total,
  };
}

function authenticateHistoryRequest(request: {
  headers: {
    authorization?: string | string[];
  };
}) {
  const historyAuthToken = readBearerToken(request.headers.authorization);

  if (!historyAuthToken) {
    return {
      ok: false as const,
      statusCode: 401,
      message: 'Missing bearer token.',
    };
  }

  const device = devices.getByHistoryAuthToken(historyAuthToken);

  if (!device) {
    return {
      ok: false as const,
      statusCode: 401,
      message: 'Invalid bearer token.',
    };
  }

  return {
    ok: true as const,
    device,
  };
}

function collectCloudflareAiText(value: unknown): string[] {
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? [text] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectCloudflareAiText(item));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const record = value as Record<string, unknown>;
  return [
    ...collectCloudflareAiText(record.output_text),
    ...collectCloudflareAiText(record.response),
    ...collectCloudflareAiText(record.text),
    ...collectCloudflareAiText(record.content),
    ...collectCloudflareAiText(record.output),
  ];
}

function extractCloudflareAiText(payload: CloudflareAiRunResponse) {
  if (typeof payload.result === 'string') {
    return payload.result.trim();
  }

  if (!payload.result || typeof payload.result !== 'object') {
    return '';
  }

  const result = payload.result as CloudflareAiResultObject;
  const response = result.response;
  if (typeof response === 'string') {
    return response.trim();
  }

  const text = result.text;
  if (typeof text === 'string') {
    return text.trim();
  }

  const outputText = result.output_text;
  if (typeof outputText === 'string') {
    return outputText.trim();
  }

  const output = collectCloudflareAiText(result.output).join('\n').trim();
  if (output) {
    return output;
  }

  const choiceContent = result.choices?.[0]?.message?.content;
  if (typeof choiceContent === 'string') {
    return choiceContent.trim();
  }

  const choiceText = collectCloudflareAiText(choiceContent).join('\n').trim();
  if (choiceText) {
    return choiceText;
  }

  return '';
}

function formatCloudflareAiError(payload: CloudflareAiRunResponse) {
  return payload.errors
    ?.map((error) => error.message?.trim())
    .filter((message): message is string => Boolean(message))
    .join('; ');
}

function extractOpenRouterText(payload: OpenRouterChatResponse) {
  const outputText = collectCloudflareAiText(payload.output_text).join('\n').trim();
  if (outputText) {
    return outputText;
  }

  const output = collectCloudflareAiText(payload.output).join('\n').trim();
  if (output) {
    return output;
  }

  const choice = payload.choices?.[0];
  const messageContent = choice?.message?.content;
  if (typeof messageContent === 'string') {
    return messageContent.trim();
  }

  const contentText = collectCloudflareAiText(messageContent).join('\n').trim();
  if (contentText) {
    return contentText;
  }

  if (typeof choice?.text === 'string') {
    return choice.text.trim();
  }

  return '';
}

function buildOpenAiCompatibleRequestBody(
  model: string,
  prompt: string,
  maxOutputTokens: number,
) {
  if (config.openrouterAi.wireApi === 'responses') {
    const instructions = getAiSystemPrompt();
    return {
      model,
      ...(instructions ? { instructions } : {}),
      input: prompt,
      max_output_tokens: maxOutputTokens,
    };
  }

  return {
    model,
    messages: buildAiMessages(prompt),
    max_tokens: maxOutputTokens,
  };
}

function buildOpenAiCompatibleEndpoint() {
  const path = config.openrouterAi.wireApi === 'responses'
    ? '/responses'
    : '/chat/completions';
  return new URL(`${config.openrouterAi.baseUrl}${path}`);
}

function formatOpenRouterError(payload: OpenRouterChatResponse | null) {
  return payload?.error?.message?.trim();
}

function isOpenRouterBaseUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === 'openrouter.ai' || url.hostname.endsWith('.openrouter.ai');
  } catch {
    return false;
  }
}

function buildOpenRouterChatHeaders() {
  const headers: Record<string, string> = {
    authorization: `Bearer ${config.openrouterAi.apiKey ?? ''}`,
    'content-type': 'application/json',
  };

  if (!isOpenRouterBaseUrl(config.openrouterAi.baseUrl)) {
    return headers;
  }

  if (config.openrouterAi.siteUrl) {
    headers['HTTP-Referer'] = config.openrouterAi.siteUrl;
  }
  if (config.openrouterAi.siteName) {
    headers['X-OpenRouter-Title'] = config.openrouterAi.siteName;
  }

  return headers;
}

function getOpenRouterChatCandidates(primaryModel: string) {
  const candidates = [
    primaryModel,
    config.openrouterAi.model,
    ...openRouterFallbackModelIds,
  ];
  const seen = new Set<string>();

  return candidates.filter((modelId) => {
    if (!modelId || seen.has(modelId)) {
      return false;
    }

    seen.add(modelId);
    return true;
  });
}

async function requestOpenRouterChat(
  model: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<OpenRouterChatSuccess | OpenRouterChatFailure> {
  const endpoint = buildOpenAiCompatibleEndpoint();
  const aiResponse = await fetch(endpoint, {
    method: 'POST',
    headers: buildOpenRouterChatHeaders(),
    body: JSON.stringify(buildOpenAiCompatibleRequestBody(model, prompt, maxOutputTokens)),
  });
  const aiPayload = await aiResponse.json().catch(() => null) as
    | OpenRouterChatResponse
    | null;

  if (!aiResponse.ok || !aiPayload || aiPayload.error) {
    return {
      ok: false,
      model,
      status: aiResponse.status,
      message: formatOpenRouterError(aiPayload),
    };
  }

  const answer = extractOpenRouterText(aiPayload);
  if (!answer) {
    return {
      ok: false,
      model,
      status: 502,
      message: 'OpenAI-compatible API returned an empty response.',
    };
  }

  return {
    ok: true,
    model,
    answer,
    promptTokens: Math.max(0, Math.floor(aiPayload.usage?.prompt_tokens ?? aiPayload.usage?.input_tokens ?? 0)),
    completionTokens: Math.max(0, Math.floor(aiPayload.usage?.completion_tokens ?? aiPayload.usage?.output_tokens ?? 0)),
  };
}

function isCloudflareAiQuotaError(
  statusCode: number,
  payload: CloudflareAiRunResponse | null,
) {
  const message = payload ? formatCloudflareAiError(payload)?.toLowerCase() : '';
  return (
    statusCode === 429 ||
    Boolean(message && /\b(quota|allocation|limit|exceed|neuron|billing)\b/.test(message))
  );
}

function estimatePromptTokens(prompt: string) {
  // Char count is a conservative tokenizer-free estimate for mixed Chinese/English prompts.
  return Math.max(1, prompt.length);
}

function estimateCloudflareAiNeurons(prompt: string) {
  const {
    maxOutputTokens,
    estimatedInputNeuronsPerMillionTokens,
    estimatedOutputNeuronsPerMillionTokens,
  } = config.cloudflareAi;
  const inputNeurons =
    (estimatePromptTokens(prompt) * estimatedInputNeuronsPerMillionTokens) /
    1_000_000;
  const outputNeurons =
    (maxOutputTokens * estimatedOutputNeuronsPerMillionTokens) / 1_000_000;

  return Math.max(1, Math.ceil(inputNeurons + outputNeurons));
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function plainTextToRichText(value: string) {
  return value
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split(/\r?\n/)
        .map((line) => escapeHtml(line))
        .join('<br />'),
    )
    .map((paragraph) => `<p>${paragraph || '<br />'}</p>`)
    .join('');
}

function buildAiBotReplyText(senderName: string, response: string) {
  const lines = response.trim().split(/\r?\n/);
  const [firstLine = '', ...remainingLines] = lines;
  const mention = `<strong>@${escapeHtml(senderName)}</strong>`;
  const firstParagraph = `<p>${mention}${firstLine ? ` ${escapeHtml(firstLine)}` : ''}</p>`;
  const remainingText = remainingLines.join('\n').trim();

  return remainingText
    ? `${firstParagraph}${plainTextToRichText(remainingText)}`
    : firstParagraph;
}

function formatAiQuotaStatus(input: {
  remainingNeurons: number;
  dailyNeuronBudget: number;
  usedNeurons: number;
}) {
  return `今日 AI 免费额度剩余 ${input.remainingNeurons.toLocaleString()} / ${input.dailyNeuronBudget.toLocaleString()} Neurons，已使用 ${input.usedNeurons.toLocaleString()}。`;
}

function formatOpenRouterStatus(model: string) {
  return `当前 AI 提供方为 OpenAI 兼容接口，模型 ${model}。本站不统计该接口额度；实际费用和限额以你的 API 服务账户为准。`;
}

function normalizeBotTextValue(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.slice(0, 80) || fallback;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getActiveAiSettings() {
  if (config.aiProvider === 'openrouter') {
    const models = config.openrouterAi.models.filter((model) => model.enabled !== false);
    const defaultModel = models.find((model) => model.id === config.openrouterAi.model)?.id ?? models[0]?.id ?? '';
    return {
      provider: 'openrouter' as const,
      label: 'OpenAI 兼容接口',
      model: defaultModel,
      models,
      maxPromptChars: config.openrouterAi.maxPromptChars,
      maxOutputTokens: config.openrouterAi.maxOutputTokens,
    };
  }

  const models = config.cloudflareAi.models.filter((model) => model.enabled !== false);
  const defaultModel = models.find((model) => model.id === config.cloudflareAi.model)?.id ?? models[0]?.id ?? '';
  return {
    provider: 'cloudflare' as const,
    label: 'Cloudflare AI',
    model: defaultModel,
    models,
    maxPromptChars: config.cloudflareAi.maxPromptChars,
    maxOutputTokens: config.cloudflareAi.maxOutputTokens,
  };
}

function authenticateAdminRequest(request: {
  headers: {
    authorization?: string | string[];
    cookie?: string | string[];
  };
}) {
  if (!config.adminPassword) {
    return {
      ok: false as const,
      statusCode: 503,
      message: 'Admin API is not configured on this server.',
    };
  }

  const cookies = parseCookies(request.headers.cookie);
  const sessionId = cookies.get(adminSessionCookieName);
  if (sessionId) {
    const session = adminSessions.get(sessionId);
    if (session) {
      return {
        ok: true as const,
        sessionId: session.sessionId,
      };
    }
  }

  const adminPassword = readBearerToken(request.headers.authorization);
  if (adminPassword && adminPassword === config.adminPassword) {
    return {
      ok: true as const,
      sessionId: 'bearer',
    };
  }

  if (!sessionId && !adminPassword) {
    return {
      ok: false as const,
      statusCode: 401,
      message: 'Missing admin session.',
    };
  }

  return {
    ok: false as const,
    statusCode: 401,
    message: 'Invalid admin session.',
  };
}

function resolveAiModel(value: unknown) {
  const activeAi = getActiveAiSettings();
  const requestedModel = normalizeOptionalString(value);

  if (!requestedModel && activeAi.model) {
    return {
      ok: true as const,
      model: activeAi.model,
    };
  }

  if (!requestedModel) {
    return {
      ok: false as const,
      message: `${activeAi.label} default model is not configured.`,
    };
  }

  const model = activeAi.models.find(
    (option) =>
      option.id === requestedModel ||
      option.id.endsWith(`/${requestedModel}`),
  );

  if (!model) {
    return {
      ok: false as const,
      message: `Unsupported ${activeAi.label} model.`,
    };
  }

  return {
    ok: true as const,
    model: model.id,
  };
}

function normalizeCreatedAt(value: unknown) {
  if (typeof value !== 'string') {
    return new Date().toISOString();
  }

  const parsedTime = Date.parse(value);
  return Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : new Date().toISOString();
}

function enforceAiTextLimit(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n\n[内容过长，已截断]`;
}

type AiChatMessage = {
  role: 'system' | 'user';
  content: string;
};

function decodeHtmlEntity(entity: string) {
  switch (entity) {
    case '&amp;':
      return '&';
    case '&lt;':
      return '<';
    case '&gt;':
      return '>';
    case '&quot;':
      return '"';
    case '&#39;':
      return "'";
    case '&nbsp;':
      return ' ';
    default:
      return entity;
  }
}

function htmlToPlainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<\/?(p|div|li|ul|ol|blockquote|h[1-6]|pre)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => decodeHtmlEntity(entity))
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatAiContextTimestamp(value: string) {
  const parsedTime = Date.parse(value);
  if (!Number.isFinite(parsedTime)) {
    return value;
  }

  return new Date(parsedTime).toISOString().slice(0, 16).replace('T', ' ');
}

function buildRoomContextText(roomId: string, maxChars: number) {
  if (maxChars <= 0) {
    return '';
  }

  const minCreatedAt = Date.now() - aiRoomContextWindowMs;
  const recentRecords = history
    .listTextsForRoom(roomId)
    .filter((record) => {
      const createdAt = Date.parse(record.createdAt);
      return Number.isFinite(createdAt) && createdAt >= minCreatedAt;
    })
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

  if (recentRecords.length === 0) {
    return '';
  }

  const contextLines: string[] = [];
  let totalChars = 0;
  const cappedContextMaxChars = Math.max(0, Math.min(aiRoomContextMaxChars, maxChars));

  for (let index = recentRecords.length - 1; index >= 0; index -= 1) {
    const record = recentRecords[index];
    const plainText = htmlToPlainText(record.text);
    if (!plainText) {
      continue;
    }

    const line = `[${formatAiContextTimestamp(record.createdAt)}] ${record.sourceDeviceName}: ${plainText}`;
    const nextChars = totalChars + line.length + 2;
    if (contextLines.length > 0 && nextChars > cappedContextMaxChars) {
      break;
    }

    if (contextLines.length === 0 && line.length > cappedContextMaxChars) {
      continue;
    }

    contextLines.unshift(line);
    totalChars = nextChars;
  }

  return contextLines.join('\n\n');
}

function buildAiPrompt(input: { prompt: string; roomId?: string; maxPromptChars: number }) {
  if (!input.roomId) {
    return input.prompt;
  }

  const promptWrapper = [
    '以下是当前房间最近24小时的文本上下文，请优先基于这些上下文理解对话延续关系；如果上下文不足，再仅根据最后的用户问题回答。',
    '',
    '[房间上下文开始]',
    '[房间上下文结束]',
    '',
    '[当前用户问题]',
    input.prompt,
  ].join('\n');
  const remainingCharsForContext = input.maxPromptChars - promptWrapper.length;
  const roomContext = buildRoomContextText(input.roomId, remainingCharsForContext);
  if (!roomContext) {
    return input.prompt;
  }

  return [
    '以下是当前房间最近24小时的文本上下文，请优先基于这些上下文理解对话延续关系；如果上下文不足，再仅根据最后的用户问题回答。',
    '',
    '[房间上下文开始]',
    roomContext,
    '[房间上下文结束]',
    '',
    '[当前用户问题]',
    input.prompt,
  ].join('\n');
}

function getAiSystemPrompt() {
  return adminConfig.getAiSettingsSnapshot().systemPrompt.trim();
}

function buildAiMessages(prompt: string): AiChatMessage[] {
  const systemPrompt = getAiSystemPrompt();
  return [
    ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
    {
      role: 'user',
      content: prompt,
    },
  ];
}

function writeAiQuotaExhausted(response: ServerResponse) {
  writeJson(response, 429, {
    error: 'Cloudflare AI 免费额度已用尽，已停止请求以避免产生费用。',
  });
}

function getAiConfigurationError(provider: AiProvider) {
  if (provider === 'openrouter') {
    if (!config.openrouterAi.apiKey) {
      return 'OpenAI-compatible API is not configured on this server.';
    }

    if (!config.openrouterAi.model || config.openrouterAi.models.length === 0) {
      return 'OpenAI-compatible model list is not configured on this server.';
    }

    return undefined;
  }

  if (!config.cloudflareAi.accountId || !config.cloudflareAi.apiToken) {
    return 'Cloudflare AI is not configured on this server.';
  }

  return undefined;
}

function getAiModelLabel(provider: 'cloudflare' | 'openrouter', modelId: string) {
  const source = provider === 'openrouter' ? config.openrouterAi.models : config.cloudflareAi.models;
  return source.find((entry) => entry.id === modelId)?.label ?? modelId;
}

function buildAiQuotaPayload(model: string) {
  if (config.aiProvider === 'openrouter') {
    return {
      date: new Date().toISOString().slice(0, 10),
      usedNeurons: 0,
      dailyNeuronBudget: 0,
      remainingNeurons: 0,
      freeOnly: false,
      provider: 'openrouter',
      limitLabel: 'OpenAI-compatible API billing',
      model,
      models: config.openrouterAi.models
        .filter((entry) => entry.enabled !== false)
        .map((entry) => ({ id: entry.id, label: entry.label })),
    };
  }

  const {
    freeOnly,
    dailyNeuronBudget,
    models,
  } = config.cloudflareAi;

  return {
    ...cloudflareAiQuota.getStatus(dailyNeuronBudget),
    freeOnly,
    provider: 'cloudflare',
    model,
    models: models.filter((entry) => entry.enabled !== false).map((entry) => ({ id: entry.id, label: entry.label })),
  };
}

async function fetchOpenRouterBalanceSnapshot() {
  if (!isOpenRouterBaseUrl(config.openrouterAi.baseUrl)) {
    return {
      available: false,
      message: '当前使用 OpenAI 兼容接口，未提供统一余额查询。',
    };
  }

  const apiKey = config.openrouterAi.apiKey;
  if (!apiKey) {
    return {
      available: false,
      message: 'OpenRouter API key is not configured.',
    };
  }

  const headers = {
    authorization: `Bearer ${apiKey}`,
  };

  const [creditsResponse, keyResponse] = await Promise.allSettled([
    fetch('https://openrouter.ai/api/v1/credits', { headers }),
    fetch('https://openrouter.ai/api/v1/key', { headers }),
  ]);

  let totalCredits: number | undefined;
  let totalUsage: number | undefined;
  let keyLimit: number | null | undefined;
  let keyLimitRemaining: number | null | undefined;
  let keyUsage: number | undefined;
  let keyLabel: string | undefined;
  let freeTier: boolean | undefined;

  if (creditsResponse.status === 'fulfilled' && creditsResponse.value.ok) {
    const payload = await creditsResponse.value.json().catch(() => null) as OpenRouterCreditsResponse | null;
    totalCredits = typeof payload?.data?.total_credits === 'number' ? payload.data.total_credits : undefined;
    totalUsage = typeof payload?.data?.total_usage === 'number' ? payload.data.total_usage : undefined;
  }

  if (keyResponse.status === 'fulfilled' && keyResponse.value.ok) {
    const payload = await keyResponse.value.json().catch(() => null) as OpenRouterKeyResponse | null;
    keyLabel = typeof payload?.data?.label === 'string' ? payload.data.label : undefined;
    keyUsage = typeof payload?.data?.usage === 'number' ? payload.data.usage : undefined;
    keyLimit = typeof payload?.data?.limit === 'number' || payload?.data?.limit === null ? payload.data.limit : undefined;
    keyLimitRemaining =
      typeof payload?.data?.limit_remaining === 'number' || payload?.data?.limit_remaining === null
        ? payload.data.limit_remaining
        : undefined;
    freeTier = typeof payload?.data?.is_free_tier === 'boolean' ? payload.data.is_free_tier : undefined;
  }

  return {
    available: totalCredits !== undefined || keyLimitRemaining !== undefined || keyUsage !== undefined,
    totalCredits,
    totalUsage,
    remainingCredits:
      totalCredits !== undefined && totalUsage !== undefined
        ? Math.max(0, totalCredits - totalUsage)
        : undefined,
    keyLabel,
    keyUsage,
    keyLimit,
    keyLimitRemaining,
    freeTier,
  };
}

async function buildAdminStatePayload() {
  const aiSnapshot = adminConfig.getAiSettingsSnapshot();
  const modelUsage = aiUsage.list();
  const cloudflareBudget = cloudflareAiQuota.getStatus(config.cloudflareAi.dailyNeuronBudget);
  const openrouterBalance = await fetchOpenRouterBalanceSnapshot();

  return {
    history: history.getStats(),
    ai: aiSnapshot,
    usage: {
      models: modelUsage,
      trendBuckets: aiUsage.listTrendBuckets(24),
      cloudflareBudget: {
        ...cloudflareBudget,
        freeOnly: config.cloudflareAi.freeOnly,
      },
      openrouterBalance,
    },
    serverTime: new Date().toISOString(),
  };
}

async function handleAdminLoginRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (!config.adminPassword) {
    writeJson(response, 503, { error: 'Admin login is not configured on this server.' });
    return;
  }

  let payload: { password?: unknown };
  try {
    const buffer = await readRequestBuffer(request, { maxBytes: 16 * 1024 });
    payload = JSON.parse(buffer.toString('utf8')) as { password?: unknown };
  } catch {
    writeJson(response, 400, { error: 'Invalid admin login payload.' });
    return;
  }

  const password = normalizeOptionalString(payload.password);
  if (!password || password !== config.adminPassword) {
    writeJson(response, 401, { error: '管理员密码错误。' });
    return;
  }

  const session = adminSessions.create();
  appendResponseCookie(response, buildAdminSessionCookie(session.sessionId));
  const dashboard = await buildAdminStatePayload();
  writeJson(response, 200, {
    ok: true,
    authenticated: true,
    ...dashboard,
  });
}

function handleAdminLogoutRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const sessionId = parseCookies(request.headers.cookie).get(adminSessionCookieName);
  if (sessionId) {
    adminSessions.delete(sessionId);
  }

  appendResponseCookie(response, buildAdminSessionClearCookie());
  writeJson(response, 200, { ok: true });
}

function handleAdminSessionRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = authenticateAdminRequest(request);
  if (!authResult.ok) {
    writeJson(response, 200, { authenticated: false });
    return;
  }

  void buildAdminStatePayload().then((payload) => {
    writeJson(response, 200, {
      authenticated: true,
      ...payload,
    });
  }).catch((error) => {
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : 'Failed to load admin session.',
    });
  });
}

function handleAdminStateRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = authenticateAdminRequest(request);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  void buildAdminStatePayload().then((payload) => {
    writeJson(response, 200, payload);
  }).catch((error) => {
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : 'Failed to build admin dashboard.',
    });
  });
}

async function handleAdminAiConfigUpdate(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = authenticateAdminRequest(request);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  let payload: AdminAiSettingsSnapshot;
  try {
    const buffer = await readRequestBuffer(request, { maxBytes: 128 * 1024 });
    payload = JSON.parse(buffer.toString('utf8')) as AdminAiSettingsSnapshot;
  } catch {
    writeJson(response, 400, { error: 'Invalid admin AI configuration JSON.' });
    return;
  }

  try {
    adminConfig.updateAiSettings(payload);
  } catch (error) {
    writeJson(response, 400, {
      error: error instanceof Error ? error.message : 'Invalid admin AI configuration payload.',
    });
    return;
  }

  const dashboard = await buildAdminStatePayload();
  writeJson(response, 200, {
    ok: true,
    ...dashboard,
  });
}

function handleAdminHistoryClear(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = authenticateAdminRequest(request);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  void history.clearAll()
    .then(() => {
      broadcastSnapshots();
      return buildAdminStatePayload();
    })
    .then((dashboard) => {
      writeJson(response, 200, {
        ok: true,
        ...dashboard,
      });
    })
    .catch((error) => {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : 'Failed to rebuild admin dashboard.',
      });
    });
}

function handleAiQuotaRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = authenticateHistoryRequest(request);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  const configurationError = getAiConfigurationError(config.aiProvider);
  if (configurationError) {
    writeJson(response, 503, { error: configurationError });
    return;
  }

  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  const modelSelection = resolveAiModel(requestUrl.searchParams.get('model'));
  if (!modelSelection.ok) {
    writeJson(response, 400, { error: modelSelection.message });
    return;
  }

  writeJson(response, 200, buildAiQuotaPayload(modelSelection.model));
}

async function saveAiBotHistoryText(input: {
  requester: ConnectedDevice;
  roomId: string;
  historyId?: string;
  createdAt?: string;
  replyToName: string;
  responseText: string;
}) {
  const roomAccess = authorizeRoomMember(input.requester, input.roomId);
  if (!roomAccess.ok) {
    return {
      ok: false as const,
      statusCode: roomAccess.statusCode,
      message: roomAccess.message,
    };
  }

  const record = await history.saveText({
    historyId: input.historyId ?? randomUUID(),
    roomId: input.roomId,
    isPublic: roomAccess.room.isPublic,
    sourceDeviceId: aiBotDeviceId,
    sourceDeviceName: aiBotDeviceName,
    text: buildAiBotReplyText(
      input.replyToName,
      enforceAiTextLimit(input.responseText, aiResponseMaxChars),
    ),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });

  broadcastSnapshots();

  return {
    ok: true as const,
    text: history.toTextSummary(record),
  };
}

async function handleAiChatRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = authenticateHistoryRequest(request);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  const configurationError = getAiConfigurationError(config.aiProvider);
  if (configurationError) {
    writeJson(response, 503, {
      error: configurationError,
    });
    return;
  }

  const activeAi = getActiveAiSettings();
  let payload: AiChatRequestPayload;
  try {
    const buffer = await readRequestBuffer(request, { maxBytes: aiRequestMaxBytes });
    payload = JSON.parse(buffer.toString('utf8')) as AiChatRequestPayload;
  } catch (error) {
    writeJson(response, error instanceof RequestBodyTooLargeError ? 413 : 400, {
      error:
        error instanceof RequestBodyTooLargeError
          ? 'AI request body is too large.'
          : 'Invalid AI request JSON.',
    });
    return;
  }

  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  const roomId = normalizeOptionalString(payload.roomId);
  const replyToName = normalizeBotTextValue(payload.replyToName, authResult.device.deviceName);
  const historyId = normalizeOptionalString(payload.historyId) ?? randomUUID();
  const createdAt = normalizeCreatedAt(payload.createdAt);
  const kind = payload.kind === 'quota' ? 'quota' : 'chat';
  const modelSelection = resolveAiModel(payload.model);
  if (!modelSelection.ok) {
    writeJson(response, 400, { error: modelSelection.message });
    return;
  }

  let model = modelSelection.model;

  if (roomId) {
    const roomAccess = authorizeRoomMember(authResult.device, roomId);
    if (!roomAccess.ok) {
      writeJson(response, roomAccess.statusCode, { error: roomAccess.message });
      return;
    }
  }

  if (kind === 'quota') {
    const quotaText = config.aiProvider === 'openrouter'
      ? formatOpenRouterStatus(model)
      : formatAiQuotaStatus(
          cloudflareAiQuota.getStatus(config.cloudflareAi.dailyNeuronBudget),
        );
    const saved = roomId
      ? await saveAiBotHistoryText({
          requester: authResult.device,
          roomId,
          historyId,
          createdAt,
          replyToName,
          responseText: quotaText,
        })
      : undefined;

    if (saved && !saved.ok) {
      writeJson(response, saved.statusCode, { error: saved.message });
      return;
    }

    writeJson(response, 200, {
      response: quotaText,
      provider: config.aiProvider,
      model,
      quota: buildAiQuotaPayload(model),
      historyText: saved?.ok ? saved.text : undefined,
    });
    return;
  }

  if (!prompt) {
    writeJson(response, 400, { error: 'Missing prompt.' });
    return;
  }

  if (Buffer.byteLength(prompt, 'utf8') > aiPromptMaxBytes) {
    writeJson(response, 413, {
      error: 'Prompt exceeds the AI request byte limit.',
    });
    return;
  }

  if (prompt.length > activeAi.maxPromptChars) {
    writeJson(response, 413, {
      error: `Prompt exceeds the ${activeAi.maxPromptChars.toString()} character limit.`,
    });
    return;
  }

  const aiPrompt = buildAiPrompt({
    prompt,
    roomId,
    maxPromptChars: activeAi.maxPromptChars,
  });

  if (Buffer.byteLength(aiPrompt, 'utf8') > aiPromptMaxBytes) {
    writeJson(response, 413, {
      error: 'Prompt plus room context exceeds the AI request byte limit.',
    });
    return;
  }

  if (aiPrompt.length > activeAi.maxPromptChars) {
    writeJson(response, 413, {
      error: `Prompt plus room context exceeds the ${activeAi.maxPromptChars.toString()} character limit.`,
    });
    return;
  }

  let quotaReservation: AiQuotaReservation | undefined;
  if (config.aiProvider === 'cloudflare' && config.cloudflareAi.freeOnly) {
    const quota = cloudflareAiQuota.reserve(
      estimateCloudflareAiNeurons(aiPrompt),
      config.cloudflareAi.dailyNeuronBudget,
    );

    if (!quota.ok) {
        aiUsage.record({
          provider: config.aiProvider,
          modelId: model,
          modelLabel: getAiModelLabel(config.aiProvider, model),
          outcome: 'quota_rejected',
          promptChars: aiPrompt.length,
        });
        writeAiQuotaExhausted(response);
        return;
    }

    quotaReservation = quota.reservation;
  }

  try {
    let answer = '';
    let promptTokens = 0;
    let completionTokens = 0;

    if (config.aiProvider === 'cloudflare') {
      const endpoint = new URL(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.cloudflareAi.accountId ?? '')}/ai/run/${model}`,
      );
      const aiResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.cloudflareAi.apiToken ?? ''}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messages: buildAiMessages(aiPrompt),
          max_tokens: activeAi.maxOutputTokens,
        }),
      });

      const aiPayload = await aiResponse.json().catch(() => null) as
        | CloudflareAiRunResponse
        | null;

      if (!aiResponse.ok || !aiPayload || aiPayload.success === false) {
        console.error('Cloudflare AI request failed', {
          status: aiResponse.status,
          model,
          message: aiPayload ? formatCloudflareAiError(aiPayload) : undefined,
        });
        if (quotaReservation) {
          if (isCloudflareAiQuotaError(aiResponse.status, aiPayload)) {
            cloudflareAiQuota.markExhausted(config.cloudflareAi.dailyNeuronBudget);
            writeAiQuotaExhausted(response);
            return;
          }

          cloudflareAiQuota.release(quotaReservation);
        }

        aiUsage.record({
          provider: config.aiProvider,
          modelId: model,
          modelLabel: getAiModelLabel(config.aiProvider, model),
          outcome: 'failed',
          promptChars: aiPrompt.length,
        });
        writeJson(response, 502, { error: 'Cloudflare AI request failed.' });
        return;
      }

      answer = extractCloudflareAiText(aiPayload);
    } else {
      let lastFailure: OpenRouterChatFailure | undefined;
      for (const candidateModel of getOpenRouterChatCandidates(model)) {
        const result = await requestOpenRouterChat(candidateModel, aiPrompt, activeAi.maxOutputTokens);
        if (result.ok) {
          if (candidateModel !== model) {
            console.warn('OpenRouter fallback model succeeded', {
              requestedModel: model,
              fallbackModel: candidateModel,
            });
          }

          model = result.model;
          answer = result.answer;
          promptTokens = result.promptTokens;
          completionTokens = result.completionTokens;
          break;
        }

        lastFailure = result;
        console.warn('OpenRouter model attempt failed', {
          status: result.status,
          model: result.model,
          message: result.message,
        });
        aiUsage.record({
          provider: config.aiProvider,
          modelId: candidateModel,
          modelLabel: getAiModelLabel(config.aiProvider, candidateModel),
          outcome: 'failed',
          promptChars: aiPrompt.length,
        });
      }

      if (!answer) {
        console.error('OpenRouter request failed', {
          status: lastFailure?.status,
          model: lastFailure?.model ?? model,
          message: lastFailure?.message,
        });
        writeJson(response, 502, { error: 'OpenAI-compatible API request failed.' });
        return;
      }
    }

    if (!answer) {
      if (quotaReservation) {
        cloudflareAiQuota.release(quotaReservation);
      }

      aiUsage.record({
        provider: config.aiProvider,
        modelId: model,
        modelLabel: getAiModelLabel(config.aiProvider, model),
        outcome: 'failed',
        promptChars: aiPrompt.length,
      });
      writeJson(response, 502, { error: `${activeAi.label} returned an empty response.` });
      return;
    }

    const saved = roomId
      ? await saveAiBotHistoryText({
          requester: authResult.device,
          roomId,
          historyId,
          createdAt,
          replyToName,
          responseText: answer,
        })
      : undefined;

    if (saved && !saved.ok) {
      writeJson(response, saved.statusCode, { error: saved.message });
      return;
    }

    aiUsage.record({
      provider: config.aiProvider,
      modelId: model,
      modelLabel: getAiModelLabel(config.aiProvider, model),
      outcome: 'success',
      promptChars: aiPrompt.length,
      responseChars: answer.length,
      promptTokens,
      completionTokens,
    });

    writeJson(response, 200, {
      response: answer,
      provider: config.aiProvider,
      model,
      quota: buildAiQuotaPayload(model),
      historyText: saved?.ok ? saved.text : undefined,
    });
  } catch (error) {
    if (quotaReservation) {
      cloudflareAiQuota.release(quotaReservation);
    }

    console.error(`${activeAi.label} request errored`, {
      model,
      message: error instanceof Error ? error.message : String(error),
    });
    aiUsage.record({
      provider: config.aiProvider,
      modelId: model,
      modelLabel: getAiModelLabel(config.aiProvider, model),
      outcome: 'failed',
      promptChars: aiPrompt.length,
    });
    writeJson(response, 502, { error: `${activeAi.label} request failed.` });
  }
}

function authorizeRoomMember(
  device: ConnectedDevice,
  roomId: string,
) {
  const room = rooms.getById(roomId);

  if (!room) {
    return {
      ok: false as const,
      statusCode: 404,
      message: 'Room not found.',
    };
  }

  if (!room.memberIds.includes(device.deviceId)) {
    if (room.isPublic) {
      rooms.addMember(room.roomId, device.deviceId);
      return {
        ok: true as const,
        room,
      };
    }

    return {
      ok: false as const,
      statusCode: 403,
      message: 'The current device is not a member of that room.',
    };
  }

  return {
    ok: true as const,
    room,
  };
}

function isPublicHistoryRoom(roomId: string) {
  return rooms.getById(roomId)?.isPublic ?? false;
}

function isPublicHistoryRecord(record: { roomId: string; isPublic: boolean }) {
  return record.isPublic || isPublicHistoryRoom(record.roomId);
}

function getRestoredPublicRoomId() {
  return history.getLatestPublicRoomId();
}

function authorizeSessionMember(
  device: ConnectedDevice,
  roomId: string,
  sessionId: string | undefined,
) {
  if (!sessionId) {
    return {
      ok: true as const,
    };
  }

  const session = sessions.getById(sessionId);

  if (
    !session ||
    session.roomId !== roomId ||
    (session.initiatorId !== device.deviceId &&
      session.responderId !== device.deviceId)
  ) {
    return {
      ok: false as const,
      statusCode: 403,
      message: 'The requested session is not accessible to the current device.',
    };
  }

  return {
    ok: true as const,
  };
}

const httpServer = createServer((request, response) => {
  if (!request.url) {
    response.writeHead(404).end();
    return;
  }

  const corsAllowed = setCorsHeaders(request, response);

  if (!corsAllowed) {
    writeJson(response, 403, { error: 'Origin not allowed.' });
    return;
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);

  if (url.pathname === '/api/admin/login' && request.method === 'POST') {
    void handleAdminLoginRequest(request, response);
    return;
  }

  if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
    handleAdminLogoutRequest(request, response);
    return;
  }

  if (url.pathname === '/api/admin/session' && request.method === 'GET') {
    handleAdminSessionRequest(request, response);
    return;
  }

  if (url.pathname === '/api/admin/state' && request.method === 'GET') {
    handleAdminStateRequest(request, response);
    return;
  }

  if (url.pathname === '/api/admin/ai-config' && request.method === 'POST') {
    void handleAdminAiConfigUpdate(request, response);
    return;
  }

  if (url.pathname === '/api/admin/history/clear' && request.method === 'POST') {
    handleAdminHistoryClear(request, response);
    return;
  }

  if (url.pathname === '/api/ai/quota' && request.method === 'GET') {
    handleAiQuotaRequest(request, response);
    return;
  }

  if (url.pathname === '/api/ai/chat' && request.method === 'POST') {
    void handleAiChatRequest(request, response);
    return;
  }

  if (url.pathname === '/api/history/upload' && request.method === 'POST') {
    const roomId = url.searchParams.get('roomId')?.trim();
    const historyId = url.searchParams.get('historyId')?.trim();
    const sessionId = url.searchParams.get('sessionId')?.trim() || undefined;
    const fileName = decodeHeaderValue(request.headers['x-file-name']);
    const createdAt =
      decodeHeaderValue(request.headers['x-file-created-at']) ??
      new Date().toISOString();
    const contentRange = parseContentRangeHeader(request.headers['content-range']);
    if (!roomId || !historyId || !fileName) {
      writeJson(response, 400, {
        error: 'Missing roomId, historyId, or fileName.',
      });
      return;
    }

    const authResult = authenticateHistoryRequest(request);
    if (!authResult.ok) {
      writeJson(response, authResult.statusCode, { error: authResult.message });
      return;
    }

    const roomAccess = authorizeRoomMember(authResult.device, roomId);
    if (!roomAccess.ok) {
      writeJson(response, roomAccess.statusCode, { error: roomAccess.message });
      return;
    }

    const sessionAccess = authorizeSessionMember(
      authResult.device,
      roomId,
      sessionId,
    );
    if (!sessionAccess.ok) {
      writeJson(response, sessionAccess.statusCode, {
        error: sessionAccess.message,
      });
      return;
    }

    if (contentRange === null) {
      writeJson(response, 400, { error: 'Invalid Content-Range header.' });
      return;
    }

    if (contentRange) {
      void readRequestBuffer(request)
        .then((buffer) =>
          history.saveFileChunk({
            historyId,
            roomId,
            sessionId,
            isPublic: roomAccess.room.isPublic,
            sourceDeviceId: authResult.device.deviceId,
            sourceDeviceName: authResult.device.deviceName,
            fileName,
            mimeType: request.headers['content-type']?.toString(),
            createdAt,
            start: contentRange.start,
            end: contentRange.end,
            total: contentRange.total,
            data: buffer,
          }),
        )
        .then((result) => {
          if (!result.complete) {
            writeJson(response, result.accepted ? 200 : 409, {
              ok: result.accepted,
              offset: result.offset,
              complete: false,
            });
            return;
          }

          writeJson(response, 200, {
            ok: true,
            offset: result.offset,
            complete: true,
            file: history.toSummary(result.record),
          });
          broadcastSnapshots();
        })
        .catch((error) => {
          writeJson(response, 500, {
            error: error instanceof Error ? error.message : 'History chunk upload failed.',
          });
        });
      return;
    }

    void history
      .saveFileStream({
        historyId,
        roomId,
        sessionId,
        isPublic: roomAccess.room.isPublic,
        sourceDeviceId: authResult.device.deviceId,
        sourceDeviceName: authResult.device.deviceName,
        fileName,
        mimeType: request.headers['content-type']?.toString(),
        createdAt,
        stream: request,
      })
      .then((record) => {
        writeJson(response, 200, { ok: true, file: history.toSummary(record) });
        broadcastSnapshots();
      })
      .catch((error) => {
        writeJson(response, 500, {
          error: error instanceof Error ? error.message : 'History upload failed.',
        });
      });
    return;
  }

  if (url.pathname === '/api/history/text' && request.method === 'GET') {
    const roomId = url.searchParams.get('roomId')?.trim();
    const limit = Math.max(
      1,
      Math.min(
        config.historyPageSize,
        Number(url.searchParams.get('limit')?.trim() || config.historyPageSize),
      ),
    );
    const beforeCreatedAt = url.searchParams.get('beforeCreatedAt')?.trim();
    const beforeHistoryId = url.searchParams.get('beforeHistoryId')?.trim();
    if (!roomId) {
      writeJson(response, 400, { error: 'Missing roomId.' });
      return;
    }

    const authResult = authenticateHistoryRequest(request);
    if (!authResult.ok) {
      writeJson(response, authResult.statusCode, { error: authResult.message });
      return;
    }

    const roomAccess = authorizeRoomMember(authResult.device, roomId);
    if (!roomAccess.ok) {
      writeJson(response, roomAccess.statusCode, { error: roomAccess.message });
      return;
    }

    const page = history.listTextPageForRoom(
      roomId,
      limit,
      beforeCreatedAt && beforeHistoryId
        ? {
            createdAt: beforeCreatedAt,
            historyId: beforeHistoryId,
          }
        : undefined,
    );

    writeJson(response, 200, {
      ok: true,
      texts: page.texts
        .map((record) => history.toTextSummary(record, roomAccess.room.isPublic || record.isPublic)),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    });
    return;
  }

  if (url.pathname === '/api/history/text' && request.method === 'POST') {
    void readRequestBuffer(request)
      .then((buffer) => {
        const payload = JSON.parse(buffer.toString('utf8')) as {
          historyId?: string;
          roomId?: string;
          sessionId?: string;
          text?: string;
          createdAt?: string;
        };

        if (!payload.historyId || !payload.roomId || !payload.text) {
          writeJson(response, 400, {
            error: 'Missing historyId, roomId, or text.',
          });
          return;
        }

        const authResult = authenticateHistoryRequest(request);
        if (!authResult.ok) {
          writeJson(response, authResult.statusCode, { error: authResult.message });
          return;
        }

        const roomAccess = authorizeRoomMember(authResult.device, payload.roomId);
        if (!roomAccess.ok) {
          writeJson(response, roomAccess.statusCode, { error: roomAccess.message });
          return;
        }

        const sessionAccess = authorizeSessionMember(
          authResult.device,
          payload.roomId,
          payload.sessionId,
        );
        if (!sessionAccess.ok) {
          writeJson(response, sessionAccess.statusCode, {
            error: sessionAccess.message,
          });
          return;
        }

        void history.saveText({
          historyId: payload.historyId,
          roomId: payload.roomId,
          sessionId: payload.sessionId,
          isPublic: roomAccess.room.isPublic,
          sourceDeviceId: authResult.device.deviceId,
          sourceDeviceName: authResult.device.deviceName,
          text: payload.text,
          createdAt: payload.createdAt ?? new Date().toISOString(),
        }).then((record) => {
          writeJson(response, 200, { ok: true, text: history.toTextSummary(record) });
          broadcastSnapshots();
        }).catch((error) => {
          writeJson(response, 500, {
            error: error instanceof Error ? error.message : 'History text upload failed.',
          });
        });
      })
      .catch((error) => {
        writeJson(response, 500, {
          error: error instanceof Error ? error.message : 'History text upload failed.',
        });
      });
    return;
  }

  if (url.pathname.startsWith('/api/history/text/') && request.method === 'DELETE') {
    const historyId = decodeURIComponent(
      url.pathname.slice('/api/history/text/'.length),
    );
    const authResult = authenticateHistoryRequest(request);
    if (!authResult.ok) {
      writeJson(response, authResult.statusCode, { error: authResult.message });
      return;
    }

    const record = history.getTextById(historyId);
    if (!record) {
      writeJson(response, 200, { ok: true, deleted: false });
      return;
    }

    if (record.sourceDeviceId !== authResult.device.deviceId) {
      writeJson(response, 403, { error: 'Only the source device can recall this text.' });
      return;
    }

    const roomAccess = authorizeRoomMember(authResult.device, record.roomId);
    if (!roomAccess.ok) {
      writeJson(response, roomAccess.statusCode, { error: roomAccess.message });
      return;
    }

    void history.deleteText(historyId)
      .then((deleted) => {
        writeJson(response, 200, { ok: true, deleted });
        if (deleted) {
          broadcastSnapshots();
        }
      })
      .catch((error) => {
        writeJson(response, 500, {
          error: error instanceof Error ? error.message : 'History text recall failed.',
        });
      });
    return;
  }

  if (url.pathname.startsWith('/api/history/download/') && request.method === 'GET') {
    const historyId = decodeURIComponent(
      url.pathname.slice('/api/history/download/'.length),
    );
    const record = history.getById(historyId);

    if (!record) {
      writeJson(response, 404, { error: 'History file not found.' });
      return;
    }

    const isPublicRecord = isPublicHistoryRecord(record);
    if (!isPublicRecord) {
      const authResult = authenticateHistoryRequest(request);
      if (!authResult.ok) {
        writeJson(response, authResult.statusCode, { error: authResult.message });
        return;
      }

      if (!rooms.getById(record.roomId)?.memberIds.includes(authResult.device.deviceId)) {
        writeJson(response, 404, { error: 'History file not found.' });
        return;
      }
    }

    const range = parseRangeHeader(request.headers.range, record.size);
    const baseHeaders = {
      'content-type': record.mimeType || 'application/octet-stream',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
      'accept-ranges': 'bytes',
      'cache-control': isPublicRecord ? 'public, max-age=3600' : 'private, max-age=3600',
    };

    if (range === null) {
      response.writeHead(416, {
        ...baseHeaders,
        'content-range': `bytes */${record.size.toString()}`,
      });
      response.end();
      return;
    }

    if (range) {
      response.writeHead(206, {
        ...baseHeaders,
        'content-length': (range.end - range.start + 1).toString(),
        'content-range': `bytes ${range.start.toString()}-${range.end.toString()}/${record.size.toString()}`,
      });
      createReadStream(record.storagePath, {
        start: range.start,
        end: range.end,
      }).pipe(response);
      return;
    }

    response.writeHead(200, {
      ...baseHeaders,
      'content-length': record.size.toString(),
    });
    createReadStream(record.storagePath).pipe(response);
    return;
  }

  if (url.pathname === '/health') {
    const openSessionIds = new Set<string>();
    const openRoomIds = new Set<string>();

    for (const device of devices.list()) {
      for (const session of sessions.listForDevice(device.deviceId)) {
        openSessionIds.add(session.sessionId);
      }

      for (const room of rooms.listForDevice(device.deviceId)) {
        openRoomIds.add(room.roomId);
      }
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        ok: true,
        onlineDevices: devices.list().length,
        openRooms: openRoomIds.size,
        openSessions: openSessionIds.size,
        serverTime: new Date().toISOString(),
      }),
    );
    return;
  }

  if (url.pathname === '/api/debug/state') {
    if (!config.debugStateApiEnabled || !config.debugStateApiToken) {
      writeJson(response, 404, { error: 'Not found' });
      return;
    }

    if (readBearerToken(request.headers.authorization) !== config.debugStateApiToken) {
      writeJson(response, 404, { error: 'Not found' });
      return;
    }

    const uniqueSessions = devices
      .list()
      .flatMap((device) => sessions.listForDevice(device.deviceId))
      .filter(
        (session, index, collection) =>
          collection.findIndex((entry) => entry.sessionId === session.sessionId) === index,
      );

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        devices: devices.list().map((device) => ({
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          accountId: device.accountId,
          shortCode: device.shortCode,
          pairToken: device.pairToken,
          nativeLan: device.nativeLan,
          network: device.network,
        })),
        sessions: uniqueSessions.map((session) => ({
          sessionId: session.sessionId,
          roomId: session.roomId,
          initiatorId: session.initiatorId,
          responderId: session.responderId,
          state: session.state,
          reason: session.reason,
          transportMode: session.transportMode,
          updatedAt: session.updatedAt,
        })),
        rooms: devices.list().flatMap((device) => rooms.listForDevice(device.deviceId)).filter(
          (room, index, collection) =>
            collection.findIndex((entry) => entry.roomId === room.roomId) === index,
        ),
        historyFiles: devices
          .list()
          .flatMap((device) => rooms.listForDevice(device.deviceId))
          .filter(
            (room, index, collection) =>
              collection.findIndex((entry) => entry.roomId === room.roomId) === index,
          )
          .flatMap((room) => history.listForRoom(room.roomId))
          .map((record) => history.toSummary(record)),
        historyTexts: devices
          .list()
          .flatMap((device) => rooms.listForDevice(device.deviceId))
          .filter(
            (room, index, collection) =>
              collection.findIndex((entry) => entry.roomId === room.roomId) === index,
          )
          .flatMap((room) => history.listTextsForRoom(room.roomId))
          .map((record) => history.toTextSummary(record)),
        serverTime: new Date().toISOString(),
      }),
    );
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'Not found' }));
});

const wsServer = new WebSocketServer({ server: httpServer, path: '/ws' });

function send(socket: WebSocket, event: ServerEvent) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(event));
}

function emitError(socket: WebSocket, payload: ErrorPayload) {
  send(socket, {
    type: 'error',
    payload,
  });
}

function broadcastSnapshots() {
  for (const device of devices.list()) {
    const snapshot = devices.buildSnapshot(
      device.deviceId,
      sessions,
      rooms,
      history,
      uiState,
      config.rtcConfig,
      config.publicWsUrl,
    );

    if (snapshot) {
      send(device.socket, {
        type: 'directory-snapshot',
        payload: snapshot,
      });
    }
  }
}

const historyMaintenanceInterval = setInterval(() => {
  if (history.prune()) {
    broadcastSnapshots();
  }
}, config.pingIntervalMs);
historyMaintenanceInterval.unref();

function cancelPendingRoomExit(deviceId: string) {
  const timer = pendingRoomExitTimers.get(deviceId);
  if (!timer) {
    return;
  }

  clearTimeout(timer);
  pendingRoomExitTimers.delete(deviceId);
}

function scheduleRoomExit(deviceId: string) {
  cancelPendingRoomExit(deviceId);

  if (config.roomExitGraceMs <= 0) {
    rooms.removeDevice(deviceId);
    broadcastSnapshots();
    return;
  }

  const timer = setTimeout(() => {
    pendingRoomExitTimers.delete(deviceId);
    rooms.removeDevice(deviceId);
    broadcastSnapshots();
  }, config.roomExitGraceMs);

  pendingRoomExitTimers.set(deviceId, timer);
}

function emitSessionCreated(sessionId: string) {
  const session = sessions.getById(sessionId);

  if (!session) {
    return;
  }

  const initiator = devices.getById(session.initiatorId);
  const responder = devices.getById(session.responderId);

  if (!initiator || !responder) {
    return;
  }

  send(initiator.socket, {
    type: 'session-created',
    payload: {
      sessionId: session.sessionId,
      roomId: session.roomId,
      peer: devices.toPeerSummary(initiator, responder),
      reason: session.reason,
      transportMode: session.transportMode,
      initiator: true,
    },
  });

  send(responder.socket, {
    type: 'session-created',
    payload: {
      sessionId: session.sessionId,
      roomId: session.roomId,
      peer: devices.toPeerSummary(responder, initiator),
      reason: session.reason,
      transportMode: session.transportMode,
      initiator: false,
    },
  });
}

function deriveTransportMode(
  requesterId: string,
  targetId: string,
): TransportMode {
  const requester = devices.getById(requesterId);
  const target = devices.getById(targetId);

  if (
    requester?.network.lanKey &&
    requester.network.lanKey === target?.network.lanKey
  ) {
    return 'lan-webrtc';
  }

  return 'remote-webrtc';
}

function createSession(input: {
  roomId: string;
  requesterId: string;
  targetId: string;
  reason: PairReason;
  initiatorId?: string;
}) {
  if (input.requesterId === input.targetId) {
    return {
      ok: false as const,
      code: 'DEVICE_NOT_FOUND' as const,
      message: 'A device cannot connect to itself.',
    };
  }

  const requester = devices.getById(input.requesterId);
  const target = devices.getById(input.targetId);

  if (!requester || !target) {
    return {
      ok: false as const,
      code: 'DEVICE_NOT_FOUND' as const,
      message: 'The target device is not online.',
    };
  }

  const result = sessions.ensureSession({
    roomId: input.roomId,
    initiatorId: input.initiatorId ?? input.requesterId,
    responderId:
      input.initiatorId === input.targetId ? input.requesterId : input.targetId,
    reason: input.reason,
    transportMode: deriveTransportMode(input.requesterId, input.targetId),
  });

  if (result.created) {
    emitSessionCreated(result.session.sessionId);
    rooms.touch(input.roomId);
    broadcastSnapshots();
  }

  return {
    ok: true as const,
    session: result.session,
  };
}

function extractClientAddress(
  socket: SocketWithAddress,
  forwardedFor: string | string[] | undefined,
) {
  const headerValue = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor;
  const forwardedAddress = headerValue?.split(',')[0]?.trim();

  return forwardedAddress || socket._socket?.remoteAddress;
}

function connectDeviceToRoom(
  deviceId: string,
  roomId: string,
  reason: PairReason,
  existingMemberIds: string[],
) {
  for (const memberId of existingMemberIds) {
    const initiatorId =
      deviceId < memberId ? deviceId : memberId;

    createSession({
      roomId,
      requesterId: deviceId,
      targetId: memberId,
      initiatorId,
      reason,
    });
  }
}

function connectDeviceToExistingRooms(deviceId: string) {
  for (const room of rooms.listForDevice(deviceId)) {
    if (room.isPublic) {
      continue;
    }

    connectDeviceToRoom(
      deviceId,
      room.roomId,
      room.reason,
      room.memberIds.filter((memberId) => memberId !== deviceId),
    );
  }
}

function selectPreferredRoomForConnection(requesterId: string, targetId: string) {
  const roomById = new Map(
    [
      ...rooms.listForDevice(requesterId),
      ...rooms.listForDevice(targetId),
    ]
      .filter((room) => !room.isPublic)
      .map((room) => [room.roomId, room] as const),
  );

  return [...roomById.values()].sort((left, right) => {
    if (right.memberIds.length !== left.memberIds.length) {
      return right.memberIds.length - left.memberIds.length;
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  })[0];
}

function joinRoomViaTarget(input: {
  requesterId: string;
  targetId: string;
  reason: PairReason;
  createNewRoom?: boolean;
}) {
  if (input.requesterId === input.targetId) {
    return {
      ok: false as const,
      code: 'DEVICE_NOT_FOUND' as const,
      message: 'A device cannot connect to itself.',
    };
  }

  const requester = devices.getById(input.requesterId);
  const target = devices.getById(input.targetId);

  if (!requester || !target) {
    return {
      ok: false as const,
      code: 'DEVICE_NOT_FOUND' as const,
      message: 'The target device is not online.',
    };
  }

  const preferredRoom = input.createNewRoom
    ? undefined
    : selectPreferredRoomForConnection(requester.deviceId, target.deviceId);

  if (!preferredRoom) {
    const room = rooms.createRoom({
      memberIds: [requester.deviceId, target.deviceId],
      reason: input.reason,
      lanKey:
        requester.network.lanKey &&
        requester.network.lanKey === target.network.lanKey
          ? requester.network.lanKey
          : undefined,
    });

    connectDeviceToRoom(requester.deviceId, room.roomId, input.reason, [
      target.deviceId,
    ]);
    broadcastSnapshots();

    return {
      ok: true as const,
      room,
    };
  }

  const requesterInRoom = preferredRoom.memberIds.includes(requester.deviceId);
  const targetInRoom = preferredRoom.memberIds.includes(target.deviceId);
  const joiningDeviceId = requesterInRoom && !targetInRoom
    ? target.deviceId
    : requester.deviceId;
  const existingMemberIds = preferredRoom.memberIds.filter(
    (memberId) => memberId !== joiningDeviceId,
  );

  rooms.addMember(preferredRoom.roomId, joiningDeviceId);
  connectDeviceToRoom(
    joiningDeviceId,
    preferredRoom.roomId,
    input.reason,
    existingMemberIds,
  );
  broadcastSnapshots();

  return {
    ok: true as const,
    room: preferredRoom,
  };
}

function joinRoomById(input: {
  requesterId: string;
  roomId: string;
  reason: PairReason;
}) {
  const requester = devices.getById(input.requesterId);
  const room = rooms.getById(input.roomId);

  if (!requester) {
    return {
      ok: false as const,
      code: 'DEVICE_NOT_FOUND' as const,
      message: 'The current device is no longer registered.',
    };
  }

  if (!room) {
    return {
      ok: false as const,
      code: 'ROOM_NOT_FOUND' as const,
      message: 'No active room matches that room ID.',
    };
  }

  const existingMemberIds = room.memberIds.filter(
    (memberId) => memberId !== requester.deviceId,
  );

  rooms.addMember(room.roomId, requester.deviceId);
  if (!room.isPublic) {
    connectDeviceToRoom(
      requester.deviceId,
      room.roomId,
      input.reason,
      existingMemberIds,
    );
  }
  broadcastSnapshots();

  return {
    ok: true as const,
    room,
  };
}

function createPublicRoom(deviceId: string) {
  const device = devices.getById(deviceId);

  if (!device) {
    return {
      ok: false as const,
      code: 'DEVICE_NOT_FOUND' as const,
      message: 'The current device is no longer registered.',
    };
  }

  const { room } = rooms.ensurePublicRoom(device.deviceId, getRestoredPublicRoomId());

  broadcastSnapshots();

  return {
    ok: true as const,
    room,
  };
}

function autoJoinLanRoom(deviceId: string) {
  const device = devices.getById(deviceId);

  if (!device?.discoverable || !device.network.lanKey) {
    return;
  }

  const roomJoin = rooms.ensureLanRoom(device.deviceId, device.network.lanKey);
  if (roomJoin.existingMemberIds.length === 0) {
    broadcastSnapshots();
    return;
  }

  connectDeviceToRoom(
    device.deviceId,
    roomJoin.room.roomId,
    'lan-discovery',
    roomJoin.existingMemberIds.filter((memberId) => memberId !== device.deviceId),
  );
  broadcastSnapshots();
}

function handleAutoConnect(deviceId: string) {
  const device = devices.getById(deviceId);

  if (!device) {
    return;
  }

  autoJoinLanRoom(deviceId);

  for (const candidate of devices.findAutoConnectTargets(deviceId)) {
    if (rooms.shareRoom(deviceId, candidate.deviceId)) {
      continue;
    }

    joinRoomViaTarget({
      requesterId: deviceId,
      targetId: candidate.deviceId,
      reason: 'account-auto',
    });
  }
}

function validateSessionOwnership(
  currentDeviceId: string,
  sessionId: string,
  targetDeviceId: string,
) {
  const session = sessions.getById(sessionId);

  if (!session) {
    return {
      ok: false as const,
      code: 'SESSION_NOT_FOUND' as const,
      message: 'The requested session does not exist.',
    };
  }

  const belongsToSession =
    (session.initiatorId === currentDeviceId &&
      session.responderId === targetDeviceId) ||
    (session.initiatorId === targetDeviceId &&
      session.responderId === currentDeviceId);

  if (!belongsToSession) {
    return {
      ok: false as const,
      code: 'SESSION_FORBIDDEN' as const,
      message: 'This session does not belong to the current device pair.',
    };
  }

  return {
    ok: true as const,
    session,
  };
}

function handleEvent(
  socket: SocketWithAddress,
  deviceId: string | undefined,
  event: ClientEvent,
) {
  if (event.type !== 'hello' && !deviceId) {
    emitError(socket, {
      code: 'DEVICE_NOT_READY',
      message: 'Send a hello event before using the signaling API.',
    });
    return deviceId;
  }

  const activeDeviceId = deviceId as string;

  switch (event.type) {
    case 'hello': {
      const device = devices.register(
        socket,
        event.payload,
        buildNetworkContext(socket.clientAddress ?? socket._socket?.remoteAddress),
      );
      cancelPendingRoomExit(device.deviceId);
      rooms.ensurePublicRoom(device.deviceId, getRestoredPublicRoomId());

      const snapshot = devices.buildSnapshot(
        device.deviceId,
        sessions,
        rooms,
        history,
        uiState,
        config.rtcConfig,
        config.publicWsUrl,
      );

      if (snapshot) {
        send(socket, {
          type: 'welcome',
          payload: snapshot,
        });
      }

      if (event.payload.requestedPairToken) {
        const target = devices.getByPairToken(event.payload.requestedPairToken);

        if (target) {
          joinRoomViaTarget({
            requesterId: device.deviceId,
            targetId: target.deviceId,
            reason: 'pair-link',
          });
        }
      }

      connectDeviceToExistingRooms(device.deviceId);

      handleAutoConnect(device.deviceId);
      broadcastSnapshots();

      return device.deviceId;
    }

    case 'update-settings': {
      const updated = devices.update(activeDeviceId, event.payload);

      if (!updated) {
        emitError(socket, {
          code: 'DEVICE_NOT_FOUND',
          message: 'The current device is no longer registered.',
        });
        return deviceId;
      }

      handleAutoConnect(updated.deviceId);
      broadcastSnapshots();

      return deviceId;
    }

    case 'update-room-state': {
      const room = rooms.getById(event.payload.roomId);
      if (!room || !room.memberIds.includes(activeDeviceId)) {
        emitError(socket, {
          code: 'ROOM_NOT_FOUND',
          message: 'No active room matches that room ID.',
        });
        return deviceId;
      }

      uiState.updateRoomState(activeDeviceId, event.payload);
      broadcastSnapshots();
      return deviceId;
    }

    case 'update-preferences': {
      uiState.updatePreferences(activeDeviceId, event.payload);
      broadcastSnapshots();
      return deviceId;
    }

    case 'request-snapshot': {
      const snapshot = devices.buildSnapshot(
        activeDeviceId,
        sessions,
        rooms,
        history,
        uiState,
        config.rtcConfig,
        config.publicWsUrl,
      );

      if (snapshot) {
        send(socket, {
          type: 'directory-snapshot',
          payload: snapshot,
        });
      }

      return deviceId;
    }

    case 'pair-by-short-code': {
      const target = devices.getByShortCode(event.payload.shortCode);

      if (!target) {
        emitError(socket, {
          code: 'DEVICE_NOT_FOUND',
          message: 'No online device matches that short code.',
        });
        return deviceId;
      }

      if (!target.allowShortCode) {
        emitError(socket, {
          code: 'SHORT_CODE_BLOCKED',
          message: 'That device currently does not accept short-code pairing.',
        });
        return deviceId;
      }

      const result = joinRoomViaTarget({
        requesterId: activeDeviceId,
        targetId: target.deviceId,
        reason: 'short-code',
      });

      if (!result.ok) {
        emitError(socket, result);
      }

      return deviceId;
    }

    case 'pair-by-token': {
      const target = devices.getByPairToken(event.payload.pairToken);

      if (!target) {
        emitError(socket, {
          code: 'PAIR_TOKEN_NOT_FOUND',
          message: 'No online device matches that pairing token.',
        });
        return deviceId;
      }

      const result = joinRoomViaTarget({
        requesterId: activeDeviceId,
        targetId: target.deviceId,
        reason: 'pair-link',
      });

      if (!result.ok) {
        emitError(socket, result);
      }

      return deviceId;
    }

    case 'join-room': {
      const result = joinRoomById({
        requesterId: activeDeviceId,
        roomId: event.payload.roomId,
        reason: 'manual',
      });

      if (!result.ok) {
        emitError(socket, result);
      }

      return deviceId;
    }

    case 'create-public-room': {
      const result = createPublicRoom(activeDeviceId);

      if (!result.ok) {
        emitError(socket, result);
        return deviceId;
      }

      send(socket, {
        type: 'public-room-created',
        payload: {
          roomId: result.room.roomId,
        },
      });

      return deviceId;
    }

    case 'request-connect': {
      const result = joinRoomViaTarget({
        requesterId: activeDeviceId,
        targetId: event.payload.targetDeviceId,
        reason: event.payload.reason ?? 'manual',
        createNewRoom: event.payload.createNewRoom,
      });

      if (!result.ok) {
        emitError(socket, result);
      }

      return deviceId;
    }

    case 'signal': {
      const validation = validateSessionOwnership(
        activeDeviceId,
        event.payload.sessionId,
        event.payload.targetDeviceId,
      );

      if (!validation.ok) {
        emitError(socket, validation);
        return deviceId;
      }

      const target = devices.getById(event.payload.targetDeviceId);

      if (!target) {
        emitError(socket, {
          code: 'DEVICE_NOT_FOUND',
          message: 'The target device is no longer online.',
        });
        return deviceId;
      }

      send(target.socket, {
        type: 'signal',
        payload: {
          sessionId: event.payload.sessionId,
          fromDeviceId: activeDeviceId,
          signal: event.payload.signal,
        },
      });

      sessions.updateState(event.payload.sessionId, 'connecting');
      return deviceId;
    }

    case 'session-state': {
      const validation = validateSessionOwnership(
        activeDeviceId,
        event.payload.sessionId,
        event.payload.targetDeviceId,
      );

      if (!validation.ok) {
        emitError(socket, validation);
        return deviceId;
      }

      const target = devices.getById(event.payload.targetDeviceId);
      const session = sessions.updateState(
        event.payload.sessionId,
        event.payload.state,
      );

      if (!session || !target) {
        return deviceId;
      }

      send(target.socket, {
        type: 'peer-state',
        payload: {
          sessionId: session.sessionId,
          peerId: activeDeviceId,
          state: session.state,
        },
      });

      broadcastSnapshots();
      return deviceId;
    }
  }
}

wsServer.on('connection', (socket: SocketWithAddress, request) => {
  let currentDeviceId: string | undefined;
  let isAlive = true;

  socket.clientAddress = extractClientAddress(
    socket,
    request.headers['x-forwarded-for'],
  );

  socket.on('pong', () => {
    isAlive = true;
  });

  socket.on('message', (raw) => {
    const event = parseClientEvent(raw.toString());

    if (!event) {
      emitError(socket, {
        code: 'BAD_EVENT',
        message: 'Unsupported websocket event payload.',
      });
      return;
    }

    currentDeviceId = handleEvent(socket, currentDeviceId, event);

    if (currentDeviceId) {
      devices.touch(currentDeviceId);
    }
  });

  socket.on('close', () => {
    if (!currentDeviceId) {
      return;
    }

    const removedDevice = devices.removeSocket(currentDeviceId, socket);
    if (!removedDevice) {
      return;
    }

    scheduleRoomExit(currentDeviceId);
    const closedSessions = sessions.closeSessionsForDevice(currentDeviceId);

    for (const session of closedSessions) {
      const peerId =
        session.initiatorId === currentDeviceId
          ? session.responderId
          : session.initiatorId;
      const peer = devices.getById(peerId);

      if (peer) {
        send(peer.socket, {
          type: 'peer-state',
          payload: {
            sessionId: session.sessionId,
            peerId: currentDeviceId,
            state: 'closed',
          },
        });
      }
    }

    broadcastSnapshots();
  });

  const interval = setInterval(() => {
    if (!isAlive) {
      socket.terminate();
      clearInterval(interval);
      return;
    }

    isAlive = false;
    sessions.prune(config.sessionIdleMs);
    if (history.prune()) {
      broadcastSnapshots();
    }
    socket.ping();
  }, config.pingIntervalMs);

  socket.on('close', () => {
    clearInterval(interval);
  });
});

httpServer.listen(config.port, config.host, () => {
  console.log(
    `ddzhilian signaling server listening on http://${config.host}:${config.port.toString()}`,
  );
  console.log(`WebSocket endpoint: ${config.publicWsUrl}`);
});
