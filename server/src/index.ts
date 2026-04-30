import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
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
  AccountAuthError,
  type AdminAccountSession,
  type AccountImageQuotaPeriod,
  type AccountImageQuotaStatus,
  AccountRegistry,
  type AccountSession,
  type AccountUserSummary,
} from './registry/account-registry.js';
import {
  type ConnectedDevice,
  DeviceRegistry,
} from './registry/device-registry.js';
import { AdminConfigRegistry, type AdminAiSettingsSnapshot } from './registry/admin-config-registry.js';
import { AdminSessionRegistry } from './registry/admin-session-registry.js';
import { AiUsageRegistry } from './registry/ai-usage-registry.js';
import { HistoryRegistry } from './registry/history-registry.js';
import {
  type ImageGenerationCursor,
  ImageGenerationHistoryRegistry,
  type ImageGenerationImage,
  type ImageGenerationRecord,
} from './registry/image-generation-history-registry.js';
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
  images?: unknown;
};
type AiChatImageInput = {
  url: string;
  mimeType?: string;
  alt?: string;
};
type AiImageRequestPayload = {
  prompt?: unknown;
  model?: unknown;
  size?: unknown;
  quality?: unknown;
};
type AiImageUpload = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
};
type AiImagePreparedRequest = {
  payload: AiImageRequestPayload;
  uploadedImages: AiImageUpload[];
};
type AiImageUpstreamRequest = {
  endpointKind: 'generation' | 'edit';
  headers: Record<string, string>;
  createBody: () => string | FormData;
};
type CodexImageUpstreamResult = {
  response: Response;
  payload: CodexImageGenerationResponse | null;
  attempts: number;
};
type ImageGenerationJobStatus = 'queued' | 'running' | 'complete' | 'failed';
type CodexImageGenerationResponse = {
  created?: number;
  data?: Array<{
    b64_json?: unknown;
    url?: unknown;
    revised_prompt?: unknown;
  }>;
  error?: {
    message?: string;
  };
};
type CodexImageResult = ImageGenerationImage;
type ImageGenerationJobResult = {
  provider: 'codex-reverse-proxy';
  model: string;
  images: CodexImageResult[];
  createdAt: string;
  historyItem: ImageGenerationRecord;
  quota?: AccountImageQuotaStatus;
};
type ImageGenerationJob = {
  jobId: string;
  userId: string;
  user: AccountUserSummary;
  prompt: string;
  model: string;
  size: string;
  quality: string;
  sourceImageCount: number;
  status: ImageGenerationJobStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
  quota?: AccountImageQuotaStatus;
  result?: ImageGenerationJobResult;
};
type AccountSessionCookiePayload = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
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
const accounts = config.supabase
  ? new AccountRegistry({
      url: config.supabase.url,
      serviceRoleKey: config.supabase.serviceRoleKey,
      userProfilesTable: config.supabase.userProfilesTable,
      adminRolesTable: config.supabase.adminRolesTable,
    })
  : undefined;
const imageGenerationHistory = config.supabase
  ? new ImageGenerationHistoryRegistry({
      url: config.supabase.url,
      serviceRoleKey: config.supabase.serviceRoleKey,
      imageGenerationsTable: config.supabase.imageGenerationsTable,
    })
  : undefined;
const adminConfig = new AdminConfigRegistry(config);
const adminSessions = new AdminSessionRegistry();
const aiUsage = new AiUsageRegistry(
  fileURLToPath(new URL('../data/admin/ai-usage.json', import.meta.url)),
);
const imageAssetRoot = fileURLToPath(new URL('../data/image-assets', import.meta.url));
const rooms = new RoomRegistry();
const sessions = new SessionRegistry();
const uiState = new UiStateRegistry();
const pendingRoomExitTimers = new Map<string, NodeJS.Timeout>();
const imageGenerationJobs = new Map<string, ImageGenerationJob>();
const cloudflareAiQuota = new CloudflareAiQuota(
  fileURLToPath(new URL('../data/cloudflare-ai-quota.json', import.meta.url)),
);
const aiRequestMaxBytes = 24 * 1024 * 1024;
const aiPromptMaxBytes = 32 * 1024;
const aiResponseMaxChars = 12_000;
const aiChatImageMaxCount = 4;
const aiChatImageMaxDecodedBytes = 4 * 1024 * 1024;
const aiChatAllowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const aiImageJsonRequestMaxBytes = 16 * 1024;
const aiImageMultipartRequestMaxBytes = 32 * 1024 * 1024;
const aiImageUploadMaxFiles = 8;
const aiImageUploadMaxFileBytes = 8 * 1024 * 1024;
const aiImageAllowedUploadTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const imageAssetRoutePrefix = '/api/ai/image/assets/';
const imageGenerationJobRetentionMs = 30 * 60 * 1000;
const imageGenerationJobMaxCount = 200;
const codexImageRetryStatusCodes = new Set([502, 504, 524]);
const codexImageMaxAttempts = 3;
const codexImageRetryBaseDelayMs = 3_000;
const aiRoomContextWindowMs = 24 * 60 * 60 * 1000;
const aiRoomContextMaxChars = 12_000;
const aiBotDeviceId = 'bot_cloudflare_ai';
const aiBotDeviceName = 'bot';
const adminSessionCookieName = 'ddzhilian_admin_session';
const userSessionCookieName = 'ddzhilian_user_session';
const imageQuotaExhaustedMessage = '总额度已耗尽。';
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

function readHeaderString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveRequestBaseUrl(request: IncomingMessage) {
  const forwardedProto = readHeaderString(request.headers['x-forwarded-proto'])
    ?.split(',')[0]
    ?.trim();
  const protocol = forwardedProto || 'http';
  const host = readHeaderString(request.headers['x-forwarded-host'])
    ?.split(',')[0]
    ?.trim() || readHeaderString(request.headers.host)?.trim();

  return host ? `${protocol}://${host}` : '';
}

function readMultipartBoundary(contentType: string | undefined) {
  const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? '');
  return (match?.[1] ?? match?.[2])?.trim();
}

function parseContentDisposition(value: string | undefined) {
  if (!value) {
    return {};
  }

  const result: {
    name?: string;
    filename?: string;
  } = {};

  for (const part of value.split(';').map((entry) => entry.trim())) {
    const [rawKey, ...rawValueParts] = part.split('=');
    const key = rawKey?.trim().toLowerCase();
    if (!key || rawValueParts.length === 0) {
      continue;
    }

    const rawValue = rawValueParts.join('=').trim();
    const valueText = rawValue.startsWith('"') && rawValue.endsWith('"')
      ? rawValue.slice(1, -1)
      : rawValue;

    if (key === 'name') {
      result.name = valueText;
    } else if (key === 'filename') {
      result.filename = valueText;
    }
  }

  return result;
}

function parseMultipartHeaders(rawHeaders: string) {
  const headers = new Map<string, string>();

  for (const line of rawHeaders.split('\r\n')) {
    const index = line.indexOf(':');
    if (index <= 0) {
      continue;
    }

    headers.set(
      line.slice(0, index).trim().toLowerCase(),
      line.slice(index + 1).trim(),
    );
  }

  return headers;
}

function sanitizeUploadedImageFilename(value: string | undefined, index: number) {
  const fallback = `image-${index.toString()}.png`;
  if (!value) {
    return fallback;
  }

  const filename = value
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/[^\w.\-() ]/g, '_')
    .trim();

  return filename || fallback;
}

function validateUploadedImages(images: AiImageUpload[]) {
  if (images.length > aiImageUploadMaxFiles) {
    throw new AccountAuthError(`最多一次上传 ${aiImageUploadMaxFiles.toString()} 张图片。`, 413);
  }

  for (const image of images) {
    if (!aiImageAllowedUploadTypes.has(image.mimeType)) {
      throw new AccountAuthError('只支持 PNG、JPEG 或 WebP 图片。', 415);
    }

    if (image.buffer.byteLength <= 0) {
      throw new AccountAuthError('上传的图片不能为空。', 400);
    }

    if (image.buffer.byteLength > aiImageUploadMaxFileBytes) {
      throw new AccountAuthError('单张图片不能超过 8 MiB。', 413);
    }
  }
}

function parseMultipartImageRequest(buffer: Buffer, boundary: string): AiImagePreparedRequest {
  const delimiter = Buffer.from(`--${boundary}`);
  const headerSeparator = Buffer.from('\r\n\r\n');
  const fields = new Map<string, string>();
  const uploadedImages: AiImageUpload[] = [];

  let cursor = buffer.indexOf(delimiter);
  while (cursor >= 0) {
    cursor += delimiter.length;

    if (buffer[cursor] === 45 && buffer[cursor + 1] === 45) {
      break;
    }

    if (buffer[cursor] === 13 && buffer[cursor + 1] === 10) {
      cursor += 2;
    }

    const headerEnd = buffer.indexOf(headerSeparator, cursor);
    if (headerEnd < 0) {
      break;
    }

    const headers = parseMultipartHeaders(buffer.subarray(cursor, headerEnd).toString('utf8'));
    const bodyStart = headerEnd + headerSeparator.length;
    const nextDelimiter = buffer.indexOf(delimiter, bodyStart);
    if (nextDelimiter < 0) {
      break;
    }

    let bodyEnd = nextDelimiter;
    if (bodyEnd >= 2 && buffer[bodyEnd - 2] === 13 && buffer[bodyEnd - 1] === 10) {
      bodyEnd -= 2;
    }

    const contentDisposition = parseContentDisposition(headers.get('content-disposition'));
    const name = contentDisposition.name;
    const body = buffer.subarray(bodyStart, bodyEnd);

    if (name) {
      if (contentDisposition.filename !== undefined) {
        if (name === 'image' || name === 'image[]' || name === 'images') {
          uploadedImages.push({
            filename: sanitizeUploadedImageFilename(contentDisposition.filename, uploadedImages.length + 1),
            mimeType: headers.get('content-type')?.toLowerCase() || 'application/octet-stream',
            buffer: body,
          });
        }
      } else {
        fields.set(name, body.toString('utf8'));
      }
    }

    cursor = nextDelimiter;
  }

  validateUploadedImages(uploadedImages);

  return {
    payload: {
      prompt: fields.get('prompt'),
      model: fields.get('model'),
      size: fields.get('size'),
      quality: fields.get('quality'),
    },
    uploadedImages,
  };
}

async function readAiImageRequestPayload(request: IncomingMessage): Promise<AiImagePreparedRequest> {
  const contentType = readHeaderString(request.headers['content-type']);

  if (contentType?.toLowerCase().startsWith('multipart/form-data')) {
    const boundary = readMultipartBoundary(contentType);
    if (!boundary) {
      throw new AccountAuthError('图片上传请求缺少 multipart boundary。', 400);
    }

    const buffer = await readRequestBuffer(request, { maxBytes: aiImageMultipartRequestMaxBytes });
    return parseMultipartImageRequest(buffer, boundary);
  }

  const buffer = await readRequestBuffer(request, { maxBytes: aiImageJsonRequestMaxBytes });
  const payload = JSON.parse(buffer.toString('utf8')) as AiImageRequestPayload;

  return {
    payload,
    uploadedImages: [],
  };
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

function encodeUserSessionCookie(payload: AccountSessionCookiePayload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeUserSessionCookie(value: string | undefined): AccountSessionCookiePayload | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<AccountSessionCookiePayload>;
    if (typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string') {
      return undefined;
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : undefined,
    };
  } catch {
    return undefined;
  }
}

function buildUserSessionCookie(session: AccountSession) {
  const parts = [
    `${userSessionCookieName}=${encodeURIComponent(encodeUserSessionCookie({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
    }))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${(30 * 24 * 60 * 60).toString()}`,
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function buildUserSessionClearCookie() {
  const parts = [
    `${userSessionCookieName}=`,
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
  images: AiChatImageInput[] = [],
) {
  const reasoningEffort = config.openrouterAi.reasoningEffort;

  if (config.openrouterAi.wireApi === 'responses') {
    const instructions = getAiSystemPrompt();
    const input = images.length > 0
      ? [{
          role: 'user' as const,
          content: buildAiResponseInputContent(prompt, images),
        }]
      : prompt;

    return {
      model,
      ...(instructions ? { instructions } : {}),
      input,
      max_output_tokens: maxOutputTokens,
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    };
  }

  return {
    model,
    messages: buildAiMessages(prompt, images),
    max_tokens: maxOutputTokens,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
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
  images: AiChatImageInput[] = [],
): Promise<OpenRouterChatSuccess | OpenRouterChatFailure> {
  const endpoint = buildOpenAiCompatibleEndpoint();
  const aiResponse = await fetch(endpoint, {
    method: 'POST',
    headers: buildOpenRouterChatHeaders(),
    body: JSON.stringify(buildOpenAiCompatibleRequestBody(model, prompt, maxOutputTokens, images)),
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

function normalizeImageOption(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getImageQuotaPeriod(now = new Date()): AccountImageQuotaPeriod {
  const timezoneOffsetMs = config.codexImageAi.quotaTimezoneOffsetMinutes * 60 * 1000;
  const shiftedNow = new Date(now.getTime() + timezoneOffsetMs);
  let periodStartedAtShiftedMs = Date.UTC(
    shiftedNow.getUTCFullYear(),
    shiftedNow.getUTCMonth(),
    shiftedNow.getUTCDate(),
    config.codexImageAi.quotaResetHour,
  );

  if (shiftedNow.getTime() < periodStartedAtShiftedMs) {
    periodStartedAtShiftedMs -= 24 * 60 * 60 * 1000;
  }

  const periodEndsAtShiftedMs = periodStartedAtShiftedMs + 24 * 60 * 60 * 1000;

  return {
    date: new Date(periodStartedAtShiftedMs).toISOString().slice(0, 10),
    periodStartedAt: new Date(periodStartedAtShiftedMs - timezoneOffsetMs).toISOString(),
    resetAt: new Date(periodEndsAtShiftedMs - timezoneOffsetMs).toISOString(),
    resetHour: config.codexImageAi.quotaResetHour,
    timezoneOffsetMinutes: config.codexImageAi.quotaTimezoneOffsetMinutes,
  };
}

async function getImageQuotaStatus(user: AccountUserSummary): Promise<AccountImageQuotaStatus> {
  if (!accounts) {
    throw new Error('Account registry is not configured.');
  }

  const period = getImageQuotaPeriod();
  return accounts.getImageQuotaStatus({
    user,
    period,
    limit: config.codexImageAi.dailyFreeQuota,
  });
}

function safeImageAssetSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'asset';
}

function imageAssetExtension(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/png':
    default:
      return 'png';
  }
}

function imageAssetFilename(index: number, mimeType: string) {
  return `${index.toString()}.${imageAssetExtension(mimeType)}`;
}

function buildImageAssetPath(userId: string, generationId: string, index: number, mimeType: string) {
  return join(
    imageAssetRoot,
    safeImageAssetSegment(userId),
    safeImageAssetSegment(generationId),
    imageAssetFilename(index, mimeType),
  );
}

function buildImageAssetRoute(generationId: string, index: number, mimeType: string) {
  return `${imageAssetRoutePrefix}${encodeURIComponent(generationId)}/${imageAssetFilename(index, mimeType)}`;
}

function parseImageAssetRoute(pathname: string) {
  if (!pathname.startsWith(imageAssetRoutePrefix)) {
    return null;
  }

  const [encodedGenerationId, fileName, ...extraSegments] = pathname
    .slice(imageAssetRoutePrefix.length)
    .split('/');
  if (!encodedGenerationId || !fileName || extraSegments.length > 0) {
    return null;
  }

  const match = /^(\d+)\.(?:png|jpe?g|webp)$/i.exec(fileName);
  if (!match) {
    return null;
  }

  try {
    const index = Number(match[1]);
    return Number.isSafeInteger(index) && index >= 0
      ? {
          generationId: decodeURIComponent(encodedGenerationId),
          index,
        }
      : null;
  } catch {
    return null;
  }
}

function normalizeImageBase64(value: string) {
  const commaIndex = value.indexOf(',');
  return value.startsWith('data:') && commaIndex >= 0
    ? value.slice(commaIndex + 1)
    : value;
}

function toPublicImageUrl(url: string | undefined, requestBaseUrl: string) {
  if (!url) {
    return undefined;
  }

  if (/^https?:\/\//i.test(url) || !requestBaseUrl) {
    return url;
  }

  return url.startsWith('/')
    ? `${requestBaseUrl}${url}`
    : `${requestBaseUrl}/${url}`;
}

function toPublicImagePayload(image: ImageGenerationImage, requestBaseUrl: string) {
  return {
    url: toPublicImageUrl(image.url, requestBaseUrl),
    mimeType: image.mimeType,
    revisedPrompt: image.revisedPrompt,
  };
}

async function saveBase64ImageAsset(input: {
  userId: string;
  generationId: string;
  index: number;
  image: ImageGenerationImage;
}) {
  if (!input.image.b64Json) {
    return input.image;
  }

  const mimeType = input.image.mimeType || 'image/png';
  const storagePath = buildImageAssetPath(input.userId, input.generationId, input.index, mimeType);
  const bytes = Buffer.from(normalizeImageBase64(input.image.b64Json), 'base64');
  if (bytes.byteLength === 0) {
    throw new Error('Generated image base64 payload is empty.');
  }

  await fs.mkdir(join(imageAssetRoot, safeImageAssetSegment(input.userId), safeImageAssetSegment(input.generationId)), {
    recursive: true,
  });
  await fs.writeFile(storagePath, bytes);

  return {
    url: buildImageAssetRoute(input.generationId, input.index, mimeType),
    mimeType,
    revisedPrompt: input.image.revisedPrompt,
  };
}

async function materializeImageRecordAssets(record: ImageGenerationRecord) {
  let changed = false;
  const images = await Promise.all(record.images.map(async (image, index) => {
    if (image.url && !image.b64Json) {
      return image;
    }

    changed = true;
    if (image.b64Json) {
      return saveBase64ImageAsset({
        userId: record.userId,
        generationId: record.generationId,
        index,
        image,
      });
    }

    return {
      url: image.url,
      mimeType: image.mimeType,
      revisedPrompt: image.revisedPrompt,
    };
  }));

  if (!changed || !imageGenerationHistory) {
    return {
      ...record,
      images,
    };
  }

  return imageGenerationHistory.save({
    ...record,
    images,
  });
}

function getCodexImageConfigurationError() {
  if (!config.codexImageAi.baseUrl) {
    return 'Codex image reverse proxy base URL is not configured on this server.';
  }

  if (!config.codexImageAi.model) {
    return 'Codex image model is not configured on this server.';
  }

  return undefined;
}

function buildCodexImageEndpoint(kind: 'generation' | 'edit') {
  return new URL(
    `${config.codexImageAi.baseUrl}/images/${kind === 'edit' ? 'edits' : 'generations'}`,
  );
}

function buildCodexImageHeaders(contentType?: string) {
  const headers: Record<string, string> = {};

  if (contentType) {
    headers['content-type'] = contentType;
  }

  if (config.codexImageAi.apiKey) {
    headers.authorization = `Bearer ${config.codexImageAi.apiKey}`;
  }

  return headers;
}

function toArrayBufferBackedBytes(buffer: Buffer) {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildCodexImageRequest(input: {
  model: string;
  prompt: string;
  size: string;
  quality: string;
  uploadedImages: AiImageUpload[];
}): AiImageUpstreamRequest {
  if (input.uploadedImages.length === 0) {
    const requestBody: Record<string, unknown> = {
      model: input.model,
      prompt: input.prompt,
      size: input.size,
    };

    if (input.quality && input.quality !== 'auto') {
      requestBody.quality = input.quality;
    }

    return {
      endpointKind: 'generation',
      headers: buildCodexImageHeaders('application/json'),
      createBody: () => JSON.stringify(requestBody),
    };
  }

  return {
    endpointKind: 'edit',
    headers: buildCodexImageHeaders(),
    createBody: () => {
      const formData = new FormData();
      formData.append('model', input.model);
      formData.append('prompt', input.prompt);
      formData.append('size', input.size);

      if (input.quality && input.quality !== 'auto') {
        formData.append('quality', input.quality);
      }

      for (const image of input.uploadedImages) {
        formData.append(
          'image[]',
          new Blob([toArrayBufferBackedBytes(image.buffer)], { type: image.mimeType }),
          image.filename,
        );
      }

      return formData;
    },
  };
}

function shouldRetryCodexImageStatus(status: number) {
  return codexImageRetryStatusCodes.has(status);
}

function getCodexImageRetryDelayMs(attempt: number) {
  return codexImageRetryBaseDelayMs * attempt;
}

async function requestCodexImageWithRetry(
  job: ImageGenerationJob,
  upstreamRequest: AiImageUpstreamRequest,
): Promise<CodexImageUpstreamResult> {
  const endpoint = buildCodexImageEndpoint(upstreamRequest.endpointKind);
  const baseUrl = config.codexImageAi.baseUrl;
  let lastResponse: Response | undefined;
  let lastPayload: CodexImageGenerationResponse | null = null;

  for (let attempt = 1; attempt <= codexImageMaxAttempts; attempt += 1) {
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: upstreamRequest.headers,
        body: upstreamRequest.createBody(),
      });
    } catch (error) {
      console.error('Codex image reverse proxy request threw', {
        jobId: job.jobId,
        baseUrl,
        endpointKind: upstreamRequest.endpointKind,
        model: job.model,
        attempt,
        maxAttempts: codexImageMaxAttempts,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const payload = await response.json().catch(() => null) as
      | CodexImageGenerationResponse
      | null;
    const durationMs = Date.now() - startedAt;

    lastResponse = response;
    lastPayload = payload;

    console.info('Codex image reverse proxy request completed', {
      jobId: job.jobId,
      baseUrl,
      endpointKind: upstreamRequest.endpointKind,
      status: response.status,
      ok: response.ok,
      model: job.model,
      attempt,
      maxAttempts: codexImageMaxAttempts,
      durationMs,
    });

    if (response.ok || !shouldRetryCodexImageStatus(response.status) || attempt >= codexImageMaxAttempts) {
      return {
        response,
        payload,
        attempts: attempt,
      };
    }

    console.warn('Codex image reverse proxy request will retry', {
      jobId: job.jobId,
      baseUrl,
      endpointKind: upstreamRequest.endpointKind,
      status: response.status,
      model: job.model,
      attempt,
      maxAttempts: codexImageMaxAttempts,
      durationMs,
    });
    await wait(getCodexImageRetryDelayMs(attempt));
  }

  if (!lastResponse) {
    throw new Error('Codex image reverse proxy request did not run.');
  }

  return {
    response: lastResponse,
    payload: lastPayload,
    attempts: codexImageMaxAttempts,
  };
}

function formatCodexImageError(payload: CodexImageGenerationResponse | null) {
  return payload?.error?.message?.trim();
}

function formatCodexImageFailureMessage(
  status: number,
  payload: CodexImageGenerationResponse | null,
) {
  const message = formatCodexImageError(payload);
  if (message) {
    return message;
  }

  if (status === 524 || status === 504) {
    return '图片反代请求超时，上游服务没有及时返回结果，请稍后重试。';
  }

  if (status === 401 || status === 403) {
    return '图片反代鉴权失败，请检查 CODEX_IMAGE_API_KEY 配置。';
  }

  return `图片反代请求失败，上游状态码 ${status.toString()}。`;
}

function extractCodexImageResults(payload: CodexImageGenerationResponse): CodexImageResult[] {
  const images: CodexImageResult[] = [];

  for (const item of payload.data ?? []) {
    const b64Json = typeof item.b64_json === 'string' && item.b64_json.trim()
      ? item.b64_json.trim()
      : undefined;
    const url = typeof item.url === 'string' && item.url.trim()
      ? item.url.trim()
      : undefined;

    if (!b64Json && !url) {
      continue;
    }

    images.push({
      b64Json,
      url,
      mimeType: 'image/png',
      revisedPrompt:
        typeof item.revised_prompt === 'string' && item.revised_prompt.trim()
          ? item.revised_prompt.trim()
          : undefined,
    });
  }

  return images;
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

type AdminAuthResult =
  | {
      ok: true;
      sessionId: string;
      admin: AdminAccountSession;
    }
  | {
      ok: false;
      statusCode: number;
      message: string;
    };

async function authenticateAdminRequest(
  request: {
  headers: {
    authorization?: string | string[];
    cookie?: string | string[];
  };
  },
  response?: ServerResponse,
): Promise<AdminAuthResult> {
  if (!accounts) {
    return {
      ok: false as const,
      statusCode: 503,
      message: '管理员账号登录未配置，请先配置 Supabase。',
    };
  }

  const cookies = parseCookies(request.headers.cookie);
  const sessionId = cookies.get(adminSessionCookieName);
  if (sessionId) {
    const session = adminSessions.get(sessionId);
    if (session) {
      try {
        const admin = await accounts.getAdminUserById(session.userId, config.adminSuperEmails);
        if (admin) {
          return {
            ok: true as const,
            sessionId: session.sessionId,
            admin,
          };
        }
      } catch (error) {
        if (error instanceof AccountAuthError && error.statusCode === 503) {
          throw error;
        }
      }

      adminSessions.delete(sessionId);
      if (response) {
        appendResponseCookie(response, buildAdminSessionClearCookie());
      }
    }
  }

  if (!sessionId) {
    return {
      ok: false as const,
      statusCode: 401,
      message: '管理员账号未登录。',
    };
  }

  return {
    ok: false as const,
    statusCode: 401,
    message: '管理员账号会话已失效。',
  };
}

function requireSuperAdmin(authResult: AdminAuthResult) {
  if (!authResult.ok) {
    return authResult;
  }

  if (!authResult.admin.isSuperAdmin) {
    return {
      ok: false as const,
      statusCode: 403,
      message: '仅超级管理员可以执行该操作。',
    };
  }

  return authResult;
}

function toAdminSessionPayload(admin: AdminAccountSession) {
  return {
    userId: admin.userId,
    email: admin.email,
    role: admin.role,
    isSuperAdmin: admin.isSuperAdmin,
  };
}

function sanitizeAdminAiSettingsSnapshot(snapshot: AdminAiSettingsSnapshot): AdminAiSettingsSnapshot {
  return {
    ...snapshot,
    cloudflare: {
      ...snapshot.cloudflare,
      apiToken: '',
    },
    openrouter: {
      ...snapshot.openrouter,
      apiKey: '',
    },
  };
}

function toAccountUserPayload(user: AccountUserSummary) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  };
}

function toImageGenerationPayload(record: ImageGenerationRecord, requestBaseUrl = '') {
  return {
    generationId: record.generationId,
    prompt: record.prompt,
    provider: record.provider,
    model: record.model,
    size: record.size,
    quality: record.quality,
    images: record.images.map((image) => toPublicImagePayload(image, requestBaseUrl)),
    createdAt: record.createdAt,
  };
}

function toImageGenerationJobPayload(job: ImageGenerationJob, requestBaseUrl = '') {
  return {
    jobId: job.jobId,
    status: job.status,
    sourceImageCount: job.sourceImageCount,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error,
    quota: job.result?.quota ?? job.quota,
    result: job.result
      ? {
          provider: job.result.provider,
          model: job.result.model,
          images: job.result.images.map((image) => toPublicImagePayload(image, requestBaseUrl)),
          createdAt: job.result.createdAt,
          historyItem: toImageGenerationPayload(job.result.historyItem, requestBaseUrl),
          quota: job.result.quota,
        }
      : undefined,
  };
}

function touchImageGenerationJob(
  job: ImageGenerationJob,
  status: ImageGenerationJobStatus,
) {
  job.status = status;
  job.updatedAt = new Date().toISOString();
}

function cleanupImageGenerationJobs() {
  const now = Date.now();
  for (const [jobId, job] of imageGenerationJobs) {
    if (job.status !== 'complete' && job.status !== 'failed') {
      continue;
    }

    const updatedAtMs = Date.parse(job.updatedAt);
    if (Number.isFinite(updatedAtMs) && now - updatedAtMs > imageGenerationJobRetentionMs) {
      imageGenerationJobs.delete(jobId);
    }
  }

  if (imageGenerationJobs.size <= imageGenerationJobMaxCount) {
    return;
  }

  const removableJobs = [...imageGenerationJobs.values()]
    .filter((job) => job.status === 'complete' || job.status === 'failed')
    .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt));

  for (const job of removableJobs) {
    if (imageGenerationJobs.size <= imageGenerationJobMaxCount) {
      return;
    }

    imageGenerationJobs.delete(job.jobId);
  }
}

async function refreshAccountSessionCookie(
  sessionCookie: AccountSessionCookiePayload,
  response: ServerResponse,
) {
  if (!accounts) {
    return undefined;
  }

  const refreshedSession = await accounts.refreshSession(sessionCookie.refreshToken);
  appendResponseCookie(response, buildUserSessionCookie(refreshedSession));
  return refreshedSession;
}

async function authenticateAccountRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (!accounts) {
    return {
      ok: false as const,
      statusCode: 503,
      message: '账号登录未配置，请先配置 Supabase。',
    };
  }

  const cookieValue = parseCookies(request.headers.cookie).get(userSessionCookieName);
  const sessionCookie = decodeUserSessionCookie(cookieValue);
  if (!sessionCookie) {
    appendResponseCookie(response, buildUserSessionClearCookie());
    return {
      ok: false as const,
      statusCode: 401,
      message: '请先登录账号后再使用生图功能。',
    };
  }

  try {
    const shouldRefresh = typeof sessionCookie.expiresAt === 'number' && sessionCookie.expiresAt - Date.now() < 60_000;
    const activeSession = shouldRefresh
      ? await refreshAccountSessionCookie(sessionCookie, response)
      : undefined;
    const user = activeSession?.user ?? await accounts.getUser(sessionCookie.accessToken);

    return {
      ok: true as const,
      user,
    };
  } catch (error) {
    if (sessionCookie.refreshToken) {
      try {
        const refreshedSession = await refreshAccountSessionCookie(sessionCookie, response);
        if (refreshedSession) {
          return {
            ok: true as const,
            user: refreshedSession.user,
          };
        }
      } catch {
        // Fall through and clear the invalid app session cookie.
      }
    }

    appendResponseCookie(response, buildUserSessionClearCookie());
    return {
      ok: false as const,
      statusCode: error instanceof AccountAuthError ? error.statusCode : 401,
      message: '账号会话已失效，请重新登录。',
    };
  }
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

type AiChatMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'auto' } };

type AiChatMessage = {
  role: 'system' | 'user';
  content: string | AiChatMessageContentPart[];
};

type AiResponseInputContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' };

function normalizeAiChatImageMimeType(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

function estimateBase64DecodedBytes(value: string) {
  const normalized = value.replace(/\s/g, '');
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function normalizeAiChatImageInput(value: unknown): AiChatImageInput {
  if (!value || typeof value !== 'object') {
    throw new AccountAuthError('Invalid AI image input.', 400);
  }

  const record = value as Record<string, unknown>;
  const url = normalizeOptionalString(record.url);
  if (!url) {
    throw new AccountAuthError('AI image input is missing url.', 400);
  }

  const alt = normalizeOptionalString(record.alt)?.slice(0, 120);

  if (url.toLowerCase().startsWith('data:')) {
    const match = /^data:([^;,]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=\s]+)$/i.exec(url);
    const mimeType = normalizeAiChatImageMimeType(match?.[1]);
    if (!match || !mimeType || !aiChatAllowedImageTypes.has(mimeType)) {
      throw new AccountAuthError('AI image must be PNG, JPEG, WebP, or GIF.', 415);
    }

    if (estimateBase64DecodedBytes(match[2]) > aiChatImageMaxDecodedBytes) {
      throw new AccountAuthError('单张读图图片不能超过 4 MiB。', 413);
    }

    return {
      url,
      mimeType,
      ...(alt ? { alt } : {}),
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new AccountAuthError('AI image url is invalid.', 400);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new AccountAuthError('AI image url must use http or https.', 400);
  }

  const mimeType = normalizeAiChatImageMimeType(record.mimeType);
  if (mimeType && !aiChatAllowedImageTypes.has(mimeType)) {
    throw new AccountAuthError('AI image must be PNG, JPEG, WebP, or GIF.', 415);
  }

  return {
    url: parsedUrl.toString(),
    ...(mimeType ? { mimeType } : {}),
    ...(alt ? { alt } : {}),
  };
}

function normalizeAiChatImages(value: unknown): AiChatImageInput[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new AccountAuthError('AI images must be an array.', 400);
  }

  if (value.length > aiChatImageMaxCount) {
    throw new AccountAuthError(`一次最多发送 ${aiChatImageMaxCount.toString()} 张图片给 bot。`, 413);
  }

  const images: AiChatImageInput[] = [];
  const seenUrls = new Set<string>();
  for (const item of value) {
    const image = normalizeAiChatImageInput(item);
    if (seenUrls.has(image.url)) {
      continue;
    }

    seenUrls.add(image.url);
    images.push(image);
  }

  return images;
}

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

function buildAiChatContent(prompt: string, images: AiChatImageInput[]): AiChatMessage['content'] {
  if (images.length === 0) {
    return prompt;
  }

  return [
    { type: 'text' as const, text: prompt },
    ...images.map((image) => ({
      type: 'image_url' as const,
      image_url: {
        url: image.url,
        detail: 'auto' as const,
      },
    })),
  ];
}

function buildAiResponseInputContent(prompt: string, images: AiChatImageInput[]): AiResponseInputContentPart[] {
  return [
    { type: 'input_text', text: prompt },
    ...images.map((image) => ({
      type: 'input_image' as const,
      image_url: image.url,
      detail: 'auto' as const,
    })),
  ];
}

function buildAiMessages(prompt: string, images: AiChatImageInput[] = []): AiChatMessage[] {
  const systemPrompt = getAiSystemPrompt();
  return [
    ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
    {
      role: 'user',
      content: buildAiChatContent(prompt, images),
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

async function buildAdminStatePayload(admin: AdminAccountSession) {
  const aiSnapshot = adminConfig.getAiSettingsSnapshot();
  const modelUsage = aiUsage.list();
  const cloudflareBudget = cloudflareAiQuota.getStatus(config.cloudflareAi.dailyNeuronBudget);
  const openrouterBalance = await fetchOpenRouterBalanceSnapshot();
  const users = await buildAdminUsersPayload();
  const roles = admin.isSuperAdmin ? await buildAdminRolesPayload() : undefined;

  return {
    history: history.getStats(),
    ai: admin.isSuperAdmin ? aiSnapshot : sanitizeAdminAiSettingsSnapshot(aiSnapshot),
    usage: {
      models: modelUsage,
      trendBuckets: aiUsage.listTrendBuckets(24),
      cloudflareBudget: {
        ...cloudflareBudget,
        freeOnly: config.cloudflareAi.freeOnly,
      },
      openrouterBalance,
    },
    users,
    roles,
    admin: toAdminSessionPayload(admin),
    serverTime: new Date().toISOString(),
  };
}

async function buildAdminUsersPayload() {
  const loadedAt = new Date().toISOString();
  if (!accounts) {
    return {
      configured: false,
      users: [],
      loadedAt,
    };
  }

  try {
    return {
      configured: true,
      users: await accounts.listUsers(),
      loadedAt,
    };
  } catch (error) {
    return {
      configured: true,
      users: [],
      error: error instanceof Error ? error.message : '用户列表读取失败。',
      loadedAt,
    };
  }
}

async function buildAdminRolesPayload() {
  const loadedAt = new Date().toISOString();
  if (!accounts) {
    return {
      configured: false,
      roles: [],
      loadedAt,
    };
  }

  try {
    return {
      configured: true,
      roles: await accounts.listAdminRoles(config.adminSuperEmails),
      loadedAt,
    };
  } catch (error) {
    return {
      configured: true,
      roles: [],
      error: error instanceof Error ? error.message : '管理员角色列表读取失败。',
      loadedAt,
    };
  }
}

async function handleAdminLoginRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (!accounts) {
    writeJson(response, 503, { error: '管理员账号登录未配置，请先配置 Supabase。' });
    return;
  }

  let payload: { email?: unknown; password?: unknown };
  try {
    const buffer = await readRequestBuffer(request, { maxBytes: 16 * 1024 });
    payload = JSON.parse(buffer.toString('utf8')) as typeof payload;
  } catch {
    writeJson(response, 400, { error: 'Invalid admin login payload.' });
    return;
  }

  try {
    const accountSession = await accounts.signIn({
      email: payload.email,
      password: payload.password,
    });
    const admin = await accounts.getAdminUserForAccount(accountSession.user, config.adminSuperEmails);
    if (!admin) {
      writeJson(response, 403, { error: '该账号不是管理员账号。' });
      return;
    }

    const session = adminSessions.create(admin);
    appendResponseCookie(response, buildAdminSessionCookie(session.sessionId));
    appendResponseCookie(response, buildUserSessionCookie(accountSession));
    const dashboard = await buildAdminStatePayload(admin);
    writeJson(response, 200, {
      ok: true,
      authenticated: true,
      ...dashboard,
    });
  } catch (error) {
    if (error instanceof AccountAuthError) {
      writeJson(response, error.statusCode, { error: error.message });
      return;
    }

    writeJson(response, 500, {
      error: error instanceof Error ? error.message : '管理员登录失败。',
    });
  }
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
  void authenticateAdminRequest(request, response)
    .then((authResult) => {
      if (!authResult.ok) {
        writeJson(response, 200, { authenticated: false });
        return undefined;
      }

      return buildAdminStatePayload(authResult.admin)
        .then((payload) => {
          writeJson(response, 200, {
            authenticated: true,
            ...payload,
          });
        });
    })
    .catch((error) => {
      const statusCode = error instanceof AccountAuthError ? error.statusCode : 500;
      writeJson(response, statusCode, {
        error: error instanceof Error ? error.message : 'Failed to load admin session.',
      });
    });
}

async function readAccountAuthPayload(request: IncomingMessage) {
  const buffer = await readRequestBuffer(request, { maxBytes: 16 * 1024 });
  const payload = JSON.parse(buffer.toString('utf8')) as {
    email?: unknown;
    password?: unknown;
    inviteCode?: unknown;
  };

  return {
    email: payload.email,
    password: payload.password,
    inviteCode: payload.inviteCode,
  };
}

function normalizeInviteCode(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function inviteCodesMatch(input: string, expected: string) {
  const inputBuffer = Buffer.from(input, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  return (
    inputBuffer.byteLength === expectedBuffer.byteLength &&
    timingSafeEqual(inputBuffer, expectedBuffer)
  );
}

async function handleAccountLoginRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (!accounts) {
    writeJson(response, 503, { error: '账号登录未配置，请先配置 Supabase。' });
    return;
  }

  try {
    const payload = await readAccountAuthPayload(request);
    const session = await accounts.signIn(payload);
    appendResponseCookie(response, buildUserSessionCookie(session));
    writeJson(response, 200, {
      ok: true,
      authenticated: true,
      user: toAccountUserPayload(session.user),
    });
  } catch (error) {
    if (error instanceof AccountAuthError) {
      writeJson(response, error.statusCode, { error: error.message });
      return;
    }

    writeJson(response, 400, { error: '账号登录请求无效。' });
  }
}

async function handleAccountRegisterRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (!accounts) {
    writeJson(response, 503, { error: '账号注册未配置，请先配置 Supabase。' });
    return;
  }

  try {
    const payload = await readAccountAuthPayload(request);
    const expectedInviteCode = config.accountInviteCode;
    if (!expectedInviteCode) {
      writeJson(response, 503, { error: '注册邀请码未配置，请联系管理员。' });
      return;
    }

    const inviteCode = normalizeInviteCode(payload.inviteCode);
    if (!inviteCode || !inviteCodesMatch(inviteCode, expectedInviteCode)) {
      writeJson(response, 403, { error: '邀请码不正确。' });
      return;
    }

    const session = await accounts.register(payload);
    appendResponseCookie(response, buildUserSessionCookie(session));
    writeJson(response, 200, {
      ok: true,
      authenticated: true,
      user: toAccountUserPayload(session.user),
    });
  } catch (error) {
    if (error instanceof AccountAuthError) {
      writeJson(response, error.statusCode, { error: error.message });
      return;
    }

    writeJson(response, 400, { error: '账号注册请求无效。' });
  }
}

function handleAccountLogoutRequest(
  response: ServerResponse,
) {
  appendResponseCookie(response, buildUserSessionClearCookie());
  writeJson(response, 200, { ok: true });
}

async function handleAccountSessionRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (!accounts) {
    writeJson(response, 200, { authenticated: false, configured: false });
    return;
  }

  const authResult = await authenticateAccountRequest(request, response);
  if (!authResult.ok) {
    writeJson(response, 200, { authenticated: false, configured: true });
    return;
  }

  writeJson(response, 200, {
    authenticated: true,
    configured: true,
    user: toAccountUserPayload(authResult.user),
  });
}

async function handleImageQuotaRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = await authenticateAccountRequest(request, response);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  try {
    const quota = await getImageQuotaStatus(authResult.user);
    writeJson(response, 200, { quota });
  } catch (error) {
    console.error('Image generation quota request failed', {
      userId: authResult.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    writeJson(response, 503, { error: '生图额度数据库不可用，请先执行 Supabase 迁移。' });
  }
}

async function handleImageHistoryRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) {
  if (!imageGenerationHistory) {
    writeJson(response, 503, { error: '生图历史未配置，请先配置 Supabase。' });
    return;
  }

  const authResult = await authenticateAccountRequest(request, response);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '12', 10);
  const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 12, 50));
  const beforeCreatedAt = url.searchParams.get('beforeCreatedAt')?.trim();
  const beforeGenerationId = url.searchParams.get('beforeGenerationId')?.trim();
  const cursor: ImageGenerationCursor | undefined = beforeCreatedAt && beforeGenerationId
    ? {
        createdAt: beforeCreatedAt,
        generationId: beforeGenerationId,
      }
    : undefined;

  try {
    const page = await imageGenerationHistory.listForUser(authResult.user.id, limit, cursor);
    const quota = await getImageQuotaStatus(authResult.user);
    const requestBaseUrl = resolveRequestBaseUrl(request);
    const items = await Promise.all(page.items.map(materializeImageRecordAssets));
    writeJson(response, 200, {
      items: items.map((item) => toImageGenerationPayload(item, requestBaseUrl)),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      quota,
    });
  } catch (error) {
    console.error('Image generation history request failed', {
      userId: authResult.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    writeJson(response, 500, { error: '生图历史加载失败。' });
  }
}

async function handleAiImageAssetRequest(
  request: IncomingMessage,
  response: ServerResponse,
  assetRoute: { generationId: string; index: number },
) {
  if (!imageGenerationHistory) {
    writeJson(response, 503, { error: '生图历史未配置，请先配置 Supabase。' });
    return;
  }

  const authResult = await authenticateAccountRequest(request, response);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  try {
    const record = await imageGenerationHistory.getForUser(
      authResult.user.id,
      assetRoute.generationId,
    );
    if (!record) {
      writeJson(response, 404, { error: 'Image asset not found.' });
      return;
    }

    const linkedRecord = await materializeImageRecordAssets(record);
    const image = linkedRecord.images[assetRoute.index];
    const expectedImageUrl = buildImageAssetRoute(
      linkedRecord.generationId,
      assetRoute.index,
      image?.mimeType ?? 'image/png',
    );
    if (!image?.url || image.url !== expectedImageUrl) {
      writeJson(response, 404, { error: 'Image asset not found.' });
      return;
    }

    const storagePath = buildImageAssetPath(
      authResult.user.id,
      linkedRecord.generationId,
      assetRoute.index,
      image.mimeType,
    );
    let fileStat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      fileStat = await fs.stat(storagePath);
    } catch {
      writeJson(response, 404, { error: 'Image asset not found.' });
      return;
    }

    response.writeHead(200, {
      'content-type': image.mimeType || 'image/png',
      'content-length': fileStat.size.toString(),
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(imageAssetFilename(assetRoute.index, image.mimeType))}`,
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
    });
    createReadStream(storagePath).pipe(response);
  } catch (error) {
    console.error('Image asset request failed', {
      generationId: assetRoute.generationId,
      index: assetRoute.index,
      userId: authResult.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    writeJson(response, 500, { error: '图片文件加载失败。' });
  }
}

function handleAdminStateRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  void authenticateAdminRequest(request, response).then((authResult) => {
    if (!authResult.ok) {
      writeJson(response, authResult.statusCode, { error: authResult.message });
      return undefined;
    }

    return buildAdminStatePayload(authResult.admin).then((payload) => {
      writeJson(response, 200, payload);
    });
  }).catch((error) => {
    const statusCode = error instanceof AccountAuthError ? error.statusCode : 500;
    writeJson(response, statusCode, {
      error: error instanceof Error ? error.message : 'Failed to build admin dashboard.',
    });
  });
}

async function handleAdminAiConfigUpdate(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = requireSuperAdmin(await authenticateAdminRequest(request, response));
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

  const dashboard = await buildAdminStatePayload(authResult.admin);
  writeJson(response, 200, {
    ok: true,
    ...dashboard,
  });
}

async function handleAdminHistoryClear(
  request: IncomingMessage,
  response: ServerResponse,
) {
  try {
    const authResult = await authenticateAdminRequest(request, response);
    if (!authResult.ok) {
      writeJson(response, authResult.statusCode, { error: authResult.message });
      return;
    }

    await history.clearAll();
    broadcastSnapshots();
    const dashboard = await buildAdminStatePayload(authResult.admin);
    writeJson(response, 200, {
      ok: true,
      ...dashboard,
    });
  } catch (error) {
    const statusCode = error instanceof AccountAuthError ? error.statusCode : 500;
    writeJson(response, statusCode, {
      error: error instanceof Error ? error.message : 'Failed to rebuild admin dashboard.',
    });
  }
}

function normalizeAdminQuotaInput(value: unknown, fieldLabel: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new AccountAuthError(`${fieldLabel}必须是非负整数。`, 400);
  }

  return Math.trunc(value);
}

async function handleAdminUserQuotaUpdate(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = await authenticateAdminRequest(request, response);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  if (!accounts) {
    writeJson(response, 503, { error: '账号系统未配置，请先配置 Supabase。' });
    return;
  }

  let payload: {
    userId?: unknown;
    imageQuotaUsed?: unknown;
    imagePaidQuotaRemaining?: unknown;
    imagePaidQuotaUsed?: unknown;
  };

  try {
    const buffer = await readRequestBuffer(request, { maxBytes: 16 * 1024 });
    payload = JSON.parse(buffer.toString('utf8')) as typeof payload;
  } catch {
    writeJson(response, 400, { error: 'Invalid admin user quota JSON.' });
    return;
  }

  const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
  if (!userId) {
    writeJson(response, 400, { error: '用户 ID 不能为空。' });
    return;
  }

  try {
    const updatedUser = await accounts.updateUserQuota({
      userId,
      periodStartedAt: getImageQuotaPeriod().periodStartedAt,
      imageQuotaUsed: normalizeAdminQuotaInput(payload.imageQuotaUsed, '免费额度已用'),
      imagePaidQuotaRemaining: normalizeAdminQuotaInput(payload.imagePaidQuotaRemaining, '付费剩余额度'),
      imagePaidQuotaUsed: normalizeAdminQuotaInput(payload.imagePaidQuotaUsed, '付费已用额度'),
    });
    const users = await buildAdminUsersPayload();

    writeJson(response, 200, {
      ok: true,
      user: updatedUser,
      users,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AccountAuthError) {
      writeJson(response, error.statusCode, { error: error.message });
      return;
    }

    writeJson(response, 500, {
      error: error instanceof Error ? error.message : '用户额度保存失败。',
    });
  }
}

async function handleAdminRoleCreate(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = requireSuperAdmin(await authenticateAdminRequest(request, response));
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  if (!accounts) {
    writeJson(response, 503, { error: '账号系统未配置，请先配置 Supabase。' });
    return;
  }

  let payload: { email?: unknown };
  try {
    const buffer = await readRequestBuffer(request, { maxBytes: 16 * 1024 });
    payload = JSON.parse(buffer.toString('utf8')) as typeof payload;
  } catch {
    writeJson(response, 400, { error: 'Invalid admin role JSON.' });
    return;
  }

  try {
    const role = await accounts.addAdminRole({
      email: payload.email,
      superAdminEmails: config.adminSuperEmails,
    });
    const roles = await buildAdminRolesPayload();
    writeJson(response, 200, {
      ok: true,
      role,
      roles,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AccountAuthError) {
      writeJson(response, error.statusCode, { error: error.message });
      return;
    }

    writeJson(response, 500, {
      error: error instanceof Error ? error.message : '管理员添加失败。',
    });
  }
}

async function handleAdminRoleDelete(
  request: IncomingMessage,
  response: ServerResponse,
  userId: string,
) {
  const authResult = requireSuperAdmin(await authenticateAdminRequest(request, response));
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  if (!accounts) {
    writeJson(response, 503, { error: '账号系统未配置，请先配置 Supabase。' });
    return;
  }

  try {
    await accounts.removeAdminRole({
      userId,
      superAdminEmails: config.adminSuperEmails,
    });
    const roles = await buildAdminRolesPayload();
    writeJson(response, 200, {
      ok: true,
      roles,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AccountAuthError) {
      writeJson(response, error.statusCode, { error: error.message });
      return;
    }

    writeJson(response, 500, {
      error: error instanceof Error ? error.message : '管理员删除失败。',
    });
  }
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

  let images: AiChatImageInput[];
  try {
    images = normalizeAiChatImages(payload.images);
  } catch (error) {
    if (error instanceof AccountAuthError) {
      writeJson(response, error.statusCode, { error: error.message });
      return;
    }

    writeJson(response, 400, { error: 'Invalid AI image input.' });
    return;
  }

  const effectivePrompt = prompt || (images.length > 0 ? '请阅读这些图片并说明你看到的内容。' : '');

  if (!effectivePrompt) {
    writeJson(response, 400, { error: 'Missing prompt.' });
    return;
  }

  if (images.length > 0 && config.aiProvider === 'cloudflare') {
    writeJson(response, 400, {
      error: '当前 Cloudflare AI 文本通道不支持读图，请在后台切换到 OpenAI 兼容的多模态模型。',
    });
    return;
  }

  if (Buffer.byteLength(effectivePrompt, 'utf8') > aiPromptMaxBytes) {
    writeJson(response, 413, {
      error: 'Prompt exceeds the AI request byte limit.',
    });
    return;
  }

  if (effectivePrompt.length > activeAi.maxPromptChars) {
    writeJson(response, 413, {
      error: `Prompt exceeds the ${activeAi.maxPromptChars.toString()} character limit.`,
    });
    return;
  }

  const aiPrompt = buildAiPrompt({
    prompt: effectivePrompt,
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
        const result = await requestOpenRouterChat(candidateModel, aiPrompt, activeAi.maxOutputTokens, images);
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

async function runImageGenerationJob(
  job: ImageGenerationJob,
  upstreamRequest: AiImageUpstreamRequest,
) {
  touchImageGenerationJob(job, 'running');

  if (!imageGenerationHistory) {
    job.error = '生图历史未配置，请先配置 Supabase。';
    touchImageGenerationJob(job, 'failed');
    return;
  }

  if (!accounts) {
    job.error = '账号登录未配置，请先配置 Supabase。';
    touchImageGenerationJob(job, 'failed');
    return;
  }

  try {
    let preflightQuota: AccountImageQuotaStatus;
    try {
      preflightQuota = await getImageQuotaStatus(job.user);
    } catch (error) {
      console.error('Image generation quota preflight failed', {
        jobId: job.jobId,
        userId: job.userId,
        message: error instanceof Error ? error.message : String(error),
      });
      job.error = '生图额度数据库不可用，请先执行 Supabase 迁移。';
      touchImageGenerationJob(job, 'failed');
      return;
    }

    job.quota = preflightQuota;
    if (preflightQuota.remaining <= 0) {
      job.error = imageQuotaExhaustedMessage;
      touchImageGenerationJob(job, 'failed');
      return;
    }

    const {
      response: imageResponse,
      payload: imagePayload,
      attempts: imageAttempts,
    } = await requestCodexImageWithRetry(job, upstreamRequest);

    if (!imageResponse.ok || !imagePayload || imagePayload.error) {
      const message = formatCodexImageFailureMessage(imageResponse.status, imagePayload);
      console.error('Codex image reverse proxy job failed', {
        jobId: job.jobId,
        status: imageResponse.status,
        model: job.model,
        attempts: imageAttempts,
        message,
      });
      job.error = message;
      touchImageGenerationJob(job, 'failed');
      return;
    }

    if (imageAttempts > 1) {
      console.warn('Codex image reverse proxy retry succeeded', {
        jobId: job.jobId,
        model: job.model,
        attempts: imageAttempts,
      });
    }

    const extractedImages = extractCodexImageResults(imagePayload);
    if (extractedImages.length === 0) {
      console.error('Codex image reverse proxy job returned no image data', {
        jobId: job.jobId,
        model: job.model,
      });
      job.error = 'Codex image reverse proxy returned no image data.';
      touchImageGenerationJob(job, 'failed');
      return;
    }

    const createdAt = new Date().toISOString();
    let images: CodexImageResult[];
    try {
      images = await Promise.all(extractedImages.map((image, index) =>
        image.b64Json
          ? saveBase64ImageAsset({
              userId: job.userId,
              generationId: job.jobId,
              index,
              image,
            })
          : image,
      ));
    } catch (error) {
      console.error('Generated image asset persistence failed', {
        jobId: job.jobId,
        userId: job.userId,
        model: job.model,
        message: error instanceof Error ? error.message : String(error),
      });
      job.error = '图片已生成，但图片文件保存失败。';
      touchImageGenerationJob(job, 'failed');
      return;
    }

    let historyItem: ImageGenerationRecord;
    try {
      historyItem = await imageGenerationHistory.save({
        generationId: job.jobId,
        userId: job.userId,
        prompt: job.prompt,
        provider: 'codex-reverse-proxy',
        model: job.model,
        size: job.size,
        quality: job.quality,
        images,
        createdAt,
      });
    } catch (error) {
      console.error('Image generation history job persistence failed', {
        jobId: job.jobId,
        userId: job.userId,
        model: job.model,
        message: error instanceof Error ? error.message : String(error),
      });
      job.error = '图片已生成，但生图历史保存失败。';
      touchImageGenerationJob(job, 'failed');
      return;
    }

    let quota: AccountImageQuotaStatus | undefined;
    try {
      quota = await accounts.addImageQuotaUsage({
        user: job.user,
        period: getImageQuotaPeriod(),
        limit: config.codexImageAi.dailyFreeQuota,
        imageCount: images.length,
      });
      job.quota = quota;
    } catch (error) {
      console.error('Image generation quota refresh failed after success', {
        jobId: job.jobId,
        userId: job.userId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    job.result = {
      provider: 'codex-reverse-proxy',
      model: job.model,
      images,
      createdAt,
      historyItem,
      quota,
    };
    touchImageGenerationJob(job, 'complete');
  } catch (error) {
    console.error('Codex image reverse proxy job errored', {
      jobId: job.jobId,
      model: job.model,
      message: error instanceof Error ? error.message : String(error),
    });
    job.error = 'Codex image reverse proxy request failed.';
    touchImageGenerationJob(job, 'failed');
  } finally {
    cleanupImageGenerationJobs();
  }
}

function startImageGenerationJob(
  job: ImageGenerationJob,
  upstreamRequest: AiImageUpstreamRequest,
) {
  setTimeout(() => {
    void runImageGenerationJob(job, upstreamRequest);
  }, 0);
}

async function handleAiImageJobRequest(
  request: IncomingMessage,
  response: ServerResponse,
  jobId: string,
) {
  const normalizedJobId = jobId.trim();
  if (!normalizedJobId) {
    writeJson(response, 400, { error: 'Missing image generation job id.' });
    return;
  }

  const authResult = await authenticateAccountRequest(request, response);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  cleanupImageGenerationJobs();
  const job = imageGenerationJobs.get(normalizedJobId);
  if (!job || job.userId !== authResult.user.id) {
    writeJson(response, 404, { error: '生图任务不存在或已过期。' });
    return;
  }

  writeJson(response, 200, toImageGenerationJobPayload(job, resolveRequestBaseUrl(request)));
}

async function handleAiImageRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (!imageGenerationHistory) {
    writeJson(response, 503, { error: '生图历史未配置，请先配置 Supabase。' });
    return;
  }

  const authResult = await authenticateAccountRequest(request, response);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  const configurationError = getCodexImageConfigurationError();
  if (configurationError) {
    writeJson(response, 503, { error: configurationError });
    return;
  }

  let preparedRequest: AiImagePreparedRequest;
  try {
    preparedRequest = await readAiImageRequestPayload(request);
  } catch (error) {
    if (error instanceof AccountAuthError) {
      writeJson(response, error.statusCode, { error: error.message });
      return;
    }

    writeJson(response, error instanceof RequestBodyTooLargeError ? 413 : 400, {
      error:
        error instanceof RequestBodyTooLargeError
          ? '图片上传请求体过大。'
          : 'Invalid AI image request JSON.',
    });
    return;
  }

  const { payload, uploadedImages } = preparedRequest;
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  if (!prompt) {
    writeJson(response, 400, { error: 'Missing image prompt.' });
    return;
  }

  if (Buffer.byteLength(prompt, 'utf8') > aiPromptMaxBytes) {
    writeJson(response, 413, { error: 'Image prompt exceeds the AI request byte limit.' });
    return;
  }

  if (prompt.length > config.codexImageAi.maxPromptChars) {
    writeJson(response, 413, {
      error: `Image prompt exceeds the ${config.codexImageAi.maxPromptChars.toString()} character limit.`,
    });
    return;
  }

  const model = normalizeImageOption(payload.model, config.codexImageAi.model);
  const size = normalizeImageOption(payload.size, config.codexImageAi.size);
  const quality = normalizeImageOption(payload.quality, config.codexImageAi.quality);

  try {
    await imageGenerationHistory.assertReady();
  } catch (error) {
    console.error('Image generation history storage is not ready', {
      userId: authResult.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    writeJson(response, 503, { error: '生图历史数据库不可用，请先执行 Supabase 迁移。' });
    return;
  }

  let quota: AccountImageQuotaStatus;
  try {
    quota = await getImageQuotaStatus(authResult.user);
  } catch (error) {
    console.error('Image generation quota precheck failed', {
      userId: authResult.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    writeJson(response, 503, { error: '生图额度数据库不可用，请先执行 Supabase 迁移。' });
    return;
  }

  if (quota.remaining <= 0) {
    writeJson(response, 429, {
      error: imageQuotaExhaustedMessage,
      quota,
    });
    return;
  }

  const upstreamRequest = buildCodexImageRequest({
    model,
    prompt,
    size,
    quality,
    uploadedImages,
  });

  cleanupImageGenerationJobs();
  const createdAt = new Date().toISOString();
  const job: ImageGenerationJob = {
    jobId: randomUUID(),
    userId: authResult.user.id,
    user: authResult.user,
    prompt,
    model,
    size,
    quality,
    sourceImageCount: uploadedImages.length,
    status: 'queued',
    createdAt,
    updatedAt: createdAt,
    quota,
  };

  imageGenerationJobs.set(job.jobId, job);
  startImageGenerationJob(job, upstreamRequest);
  writeJson(response, 202, {
    ...toImageGenerationJobPayload(job, resolveRequestBaseUrl(request)),
    pollUrl: `/api/ai/image/jobs/${encodeURIComponent(job.jobId)}`,
  });
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
    void handleAdminHistoryClear(request, response);
    return;
  }

  if (url.pathname === '/api/admin/users/quota' && request.method === 'POST') {
    void handleAdminUserQuotaUpdate(request, response);
    return;
  }

  if (url.pathname === '/api/admin/roles' && request.method === 'POST') {
    void handleAdminRoleCreate(request, response);
    return;
  }

  const adminRoleDeleteMatch = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)$/);
  if (adminRoleDeleteMatch && request.method === 'DELETE') {
    void handleAdminRoleDelete(request, response, decodeURIComponent(adminRoleDeleteMatch[1]));
    return;
  }

  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    void handleAccountLoginRequest(request, response);
    return;
  }

  if (url.pathname === '/api/auth/register' && request.method === 'POST') {
    void handleAccountRegisterRequest(request, response);
    return;
  }

  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    handleAccountLogoutRequest(response);
    return;
  }

  if (url.pathname === '/api/auth/session' && request.method === 'GET') {
    void handleAccountSessionRequest(request, response);
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

  if (url.pathname === '/api/ai/image/quota' && request.method === 'GET') {
    void handleImageQuotaRequest(request, response);
    return;
  }

  if (url.pathname.startsWith(imageAssetRoutePrefix) && request.method === 'GET') {
    const assetRoute = parseImageAssetRoute(url.pathname);
    if (!assetRoute) {
      writeJson(response, 404, { error: 'Image asset not found.' });
      return;
    }

    void handleAiImageAssetRequest(request, response, assetRoute);
    return;
  }

  if (url.pathname.startsWith('/api/ai/image/jobs/') && request.method === 'GET') {
    const jobId = decodeURIComponent(url.pathname.slice('/api/ai/image/jobs/'.length));
    void handleAiImageJobRequest(request, response, jobId);
    return;
  }

  if (url.pathname === '/api/ai/image' && request.method === 'POST') {
    void handleAiImageRequest(request, response);
    return;
  }

  if (url.pathname === '/api/ai/image/history' && request.method === 'GET') {
    void handleImageHistoryRequest(request, response, url);
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
