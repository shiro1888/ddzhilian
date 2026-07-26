import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import WebSocket, { WebSocketServer } from 'ws';

import {
  RequestBodyTooLargeError,
  createCorsHeaderSetter,
  decodeHeaderValue,
  firstHeaderValue,
  isObjectRecord,
  parseContentDisposition,
  parseCookies,
  parseMultipartHeaders,
  pipeStorageFileResponse,
  readBearerToken,
  readHeaderString,
  readMultipartBoundary,
  readRequestBuffer,
  resolveRequestBaseUrl,
  shouldServeHistoryFileInline,
  writeJson,
  writeRedirect,
} from './http/utils.js';
import {
  parseContentRangeHeader,
  parseRangeHeader,
} from './http/range.js';
import {
  imageAssetFilename,
  readImageDimensions,
  safeImageAssetSegment,
} from './media/image-metadata.js';
import {
  handleWebCommandJavaRunRequest,
  handleWebCommandPlantUmlRunRequest,
} from './web-command/handlers.js';
import {
  loadConfig,
  type AnthropicProviderConfig,
  type FeedbackAiProviderConfig,
  type OpenAiCompatibleProviderConfig,
  type OpenAiCompatibleReasoningEffort,
  type OpenAiCompatibleWireApi,
} from './config.js';
import {
  buildRefreshedOpenAiCompatibleModelConfig,
  type OpenAiCompatibleModelOption,
} from './openai-compatible-model-refresh.js';
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
  type AccountImageQuotaReservation,
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
import { AiChatConversationRegistry } from './registry/ai-chat-conversation-registry.js';
import { AiUsageRegistry } from './registry/ai-usage-registry.js';
import { HistoryRegistry } from './registry/history-registry.js';
import {
  type ImageGenerationCursor,
  ImageGenerationHistoryRegistry,
  type ImageGenerationImage,
  type ImageGenerationRecord,
} from './registry/image-generation-history-registry.js';
import {
  type OcrJobRecord,
  type OcrJobResult,
  type OcrLine,
  OcrJobRegistry,
} from './registry/ocr-job-registry.js';
import {
  type ThemeSubmissionColors,
  type ThemeSubmissionInput,
  ThemeSubmissionRegistry,
} from './registry/theme-submission-registry.js';
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
      reasoning_content?: unknown;
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
type AnthropicMessagesResponse = {
  content?: Array<{
    type?: unknown;
    text?: unknown;
  }>;
  error?: {
    message?: string;
  };
  usage?: {
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
type OpenAiCompatibleModelsResponse = {
  data?: Array<{
    id?: unknown;
    name?: unknown;
  }>;
  models?: Array<{
    id?: unknown;
    name?: unknown;
  }>;
  error?: {
    code?: unknown;
    message?: string;
  };
};
type AdminOpenAiCompatibleDetectPayload = {
  baseUrl?: unknown;
  apiKey?: unknown;
  modelId?: unknown;
  wireApi?: unknown;
  reasoningEffort?: unknown;
};
type AnthropicModelsResponse = {
  data?: Array<{
    id?: unknown;
    display_name?: unknown;
    name?: unknown;
  }>;
  models?: Array<{
    id?: unknown;
    display_name?: unknown;
    name?: unknown;
  }>;
  error?: {
    message?: string;
  };
};
type AdminAnthropicDetectPayload = {
  baseUrl?: unknown;
  authToken?: unknown;
  modelId?: unknown;
};
type OpenAiCompatibleClientOptions = {
  baseUrl: string;
  apiKey: string;
  wireApi: OpenAiCompatibleWireApi;
  reasoningEffort?: OpenAiCompatibleReasoningEffort;
  siteUrl?: string;
  siteName?: string;
  systemPrompt?: string;
};
type OpenAiCompatibleModelRefreshResult = {
  refreshed: boolean;
  baseUrl: string;
  selectedModelId?: string;
  models: OpenAiCompatibleModelOption[];
  checkedModelCount: number;
  failedModelCount: number;
  refreshedAt: string;
  skippedReason?: string;
};
type AiChatRequestPayload = {
  prompt?: unknown;
  roomId?: unknown;
  historyId?: unknown;
  createdAt?: unknown;
  replyToName?: unknown;
  kind?: unknown;
  provider?: unknown;
  model?: unknown;
  images?: unknown;
  webSearch?: unknown;
};
type AiChatImageInput = {
  url: string;
  mimeType?: string;
  alt?: string;
};
type AiWebSearchSource = {
  title: string;
  url: string;
  snippet?: string;
  engine?: string;
  publishedAt?: string;
};
type AiWebSearchContext = {
  query: string;
  sources: AiWebSearchSource[];
};
type SearxngSearchResponse = {
  results?: Array<{
    title?: unknown;
    url?: unknown;
    content?: unknown;
    engine?: unknown;
    publishedDate?: unknown;
    published_date?: unknown;
  }>;
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
type OcrImageUpload = AiImageUpload;
type AiImagePreparedRequest = {
  payload: AiImageRequestPayload;
  uploadedImages: AiImageUpload[];
};
type AiImageUpstreamRequest = {
  endpointKind: 'generation' | 'edit';
  model: string;
  headers: Record<string, string>;
  createBody: () => string | FormData;
};
type CodexImageUpstreamResult = {
  response: Response;
  payload: CodexImageGenerationResponse | null;
  attempts: number;
};
type CodexImageUpstreamAttemptResult = CodexImageUpstreamResult & {
  attempt: number;
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
    code?: unknown;
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
  modelCandidates: string[];
  size: string;
  quality: string;
  sourceImageCount: number;
  quotaReservation?: AccountImageQuotaReservation;
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
      authKey: config.supabase.authKey,
      userProfilesTable: config.supabase.userProfilesTable,
      adminRolesTable: config.supabase.adminRolesTable,
      emailRedirectTo: config.supabase.authEmailRedirectUrl,
    })
  : undefined;
const imageGenerationHistory = config.supabase
  ? new ImageGenerationHistoryRegistry({
      url: config.supabase.url,
      serviceRoleKey: config.supabase.serviceRoleKey,
      imageGenerationsTable: config.supabase.imageGenerationsTable,
    })
  : undefined;
const ocrJobs = await OcrJobRegistry.create({
  filePath: fileURLToPath(new URL('../data/ocr/jobs.json', import.meta.url)),
  retentionMs: config.ocr.historyRetentionMs,
  maxJobs: config.ocr.maxJobs,
});
const themeSubmissions = await ThemeSubmissionRegistry.create({
  localFilePath: fileURLToPath(new URL('../data/admin/theme-submissions.json', import.meta.url)),
  supabase: config.supabase
    ? {
        url: config.supabase.url,
        serviceRoleKey: config.supabase.serviceRoleKey,
        themeSubmissionsTable: config.supabase.themeSubmissionsTable,
      }
    : undefined,
});
const adminConfig = new AdminConfigRegistry(config);
const adminSessions = new AdminSessionRegistry();
const aiUsage = new AiUsageRegistry(
  fileURLToPath(new URL('../data/admin/ai-usage.json', import.meta.url)),
);
const aiChatConversations = new AiChatConversationRegistry(
  fileURLToPath(new URL('../data/ai-chat/conversations.json', import.meta.url)),
);
await aiChatConversations.load();
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
const historyTextRequestMaxBytes = 2 * 1024 * 1024;
// The client uploads fixed 2 MiB chunks (SERVER_UPLOAD_CHUNK_SIZE in
// src/lib/use-ddzhilian.ts). Anything larger is buffered in memory before the
// registry ever sees it, so cap it from the Content-Range header alone.
const historyUploadChunkMaxBytes = 8 * 1024 * 1024;
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
const aiImageMaxDimensionPx = 2000;
const aiImageDimensionStepPx = 16;
const imageAssetRoutePrefix = '/api/ai/image/assets/';
const imageGenerationJobRetentionMs = 30 * 60 * 1000;
const imageGenerationJobMaxCount = 200;
const codexImageRetryStatusCodes = new Set([502, 504, 524]);
const ocrAllowedUploadTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ocrMaxActiveJobs = 4;
/** Slots claimed by in-flight OCR handlers that have not yet created a job. */
let pendingOcrJobReservations = 0;
const ocrHistoryListLimit = 20;
const ocrUnavailableMessage = 'OCR 模型服务暂不可用';
const ocrReachabilityTimeoutMs = 2_000;
const ocrRawStringMaxChars = 12_000;
const ocrRawArrayMaxItems = 200;
const ocrImagePayloadReplacement = '[omitted image payload]';
const aiRoomContextWindowMs = 24 * 60 * 60 * 1000;
const aiRoomContextMaxChars = 12_000;
const aiBotDeviceId = 'bot_cloudflare_ai';
const aiBotDeviceName = 'bot';
const adminSessionCookieName = 'ddzhilian_admin_session';
const userSessionCookieName = 'ddzhilian_user_session';
const isProductionRuntime = process.env.NODE_ENV === 'production';
const isDevelopmentRuntime =
  process.env.NODE_ENV === 'development' ||
  process.env.npm_lifecycle_event === 'dev';
const isDevAdminEntryEnabled = isDevelopmentRuntime && !isProductionRuntime;
const devAdminSession: AdminAccountSession = {
  userId: 'dev-admin-local',
  email: 'dev-admin@localhost',
  role: 'super_admin',
  isSuperAdmin: true,
};
const accountAuthConfirmDefaultPath = '/image';
const accountAuthConfirmErrorPath = '/auth/confirm';
const openRouterFallbackModelIds = [
  'openai/gpt-oss-20b:free',
  'openrouter/free',
  'liquid/lfm-2.5-1.2b-instruct:free',
];
const openAiCompatibleModelRefreshIntervalMs = 60 * 60 * 1000;
const openAiCompatibleModelListTimeoutMs = 12_000;
const openAiCompatibleModelProbeTimeoutMs = 10_000;
const openAiCompatibleModelProbeMaxOutputTokens = 256;
const openAiCompatibleModelProbeConcurrency = 3;
const openAiCompatibleNonChatModelPattern =
  /\b(audio|clip|dall-e|embedding|image|moderation|ocr|realtime|speech|tts|transcribe|translation|whisper)\b/i;

class OcrProxyError extends Error {
  constructor(message: string, readonly statusCode = 503) {
    super(message);
  }
}

const setCorsHeaders = createCorsHeaderSetter({
  allowedOrigins: config.allowedOrigins,
  allowDevLoopback: isDevelopmentRuntime,
});

const snapLinkThemeColorPattern = /^#[0-9A-Fa-f]{6}$/;

function normalizeThemeSubmissionColor(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const color = value.trim();
  return snapLinkThemeColorPattern.test(color) ? color.toUpperCase() : undefined;
}

function normalizeThemeSubmissionString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim().slice(0, maxLength);
  return normalizedValue || undefined;
}

function parseThemeSubmissionInput(payload: unknown): ThemeSubmissionInput | null {
  if (!isObjectRecord(payload) || !isObjectRecord(payload.colors)) {
    return null;
  }

  const colors: ThemeSubmissionColors = {
    self: normalizeThemeSubmissionColor(payload.colors.self) ?? '',
    peer: normalizeThemeSubmissionColor(payload.colors.peer) ?? '',
    ai: normalizeThemeSubmissionColor(payload.colors.ai) ?? '',
  };

  if (!colors.self || !colors.peer || !colors.ai) {
    return null;
  }

  return {
    source: 'snaplink-beta',
    colors,
    deviceId: normalizeThemeSubmissionString(payload.deviceId, 120),
    deviceName: normalizeThemeSubmissionString(payload.deviceName, 120),
    accountId: normalizeThemeSubmissionString(payload.accountId, 120),
  };
}

function normalizeLocalRedirectTarget(
  value: string | null | undefined,
  request: IncomingMessage,
  fallbackPath = accountAuthConfirmDefaultPath,
) {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return fallbackPath;
  }

  if (trimmedValue.startsWith('/') && !trimmedValue.startsWith('//')) {
    return trimmedValue;
  }

  try {
    const requestBaseUrl = resolveRequestBaseUrl(request);
    if (!requestBaseUrl) {
      return fallbackPath;
    }

    const requestOrigin = new URL(requestBaseUrl).origin;
    const candidate = new URL(trimmedValue);
    if (candidate.origin !== requestOrigin) {
      return fallbackPath;
    }

    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallbackPath;
  }
}

function buildAccountConfirmErrorRedirect(message: string) {
  const url = new URL(accountAuthConfirmErrorPath, 'http://localhost');
  url.searchParams.set('error_description', message);
  return `${url.pathname}${url.search}`;
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

function validateOcrUpload(image: OcrImageUpload | undefined) {
  if (!image) {
    throw new AccountAuthError('请选择要识别的图片。', 400);
  }

  if (!ocrAllowedUploadTypes.has(image.mimeType)) {
    throw new AccountAuthError('只支持 PNG、JPEG 或 WebP 图片。', 400);
  }

  if (image.buffer.byteLength <= 0) {
    throw new AccountAuthError('上传的图片不能为空。', 400);
  }

  if (image.buffer.byteLength > config.ocr.maxUploadBytes) {
    throw new AccountAuthError('图片不能超过 OCR 上传大小限制。', 413);
  }
}

function parseOcrMultipartRequest(buffer: Buffer, boundary: string): OcrImageUpload {
  const delimiter = Buffer.from(`--${boundary}`);
  const headerSeparator = Buffer.from('\r\n\r\n');
  const uploads: OcrImageUpload[] = [];

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
    if (contentDisposition.name === 'image' && contentDisposition.filename !== undefined) {
      uploads.push({
        filename: sanitizeUploadedImageFilename(contentDisposition.filename, uploads.length + 1),
        mimeType: headers.get('content-type')?.toLowerCase() || 'application/octet-stream',
        buffer: buffer.subarray(bodyStart, bodyEnd),
      });
    }

    cursor = nextDelimiter;
  }

  if (uploads.length > 1) {
    throw new AccountAuthError('OCR 一次只支持识别一张图片。', 400);
  }

  const image = uploads[0];
  validateOcrUpload(image);
  return image;
}

async function readOcrImageUpload(request: IncomingMessage) {
  const contentType = readHeaderString(request.headers['content-type']);
  if (!contentType?.toLowerCase().startsWith('multipart/form-data')) {
    throw new AccountAuthError('OCR 请求必须使用 multipart/form-data。', 400);
  }

  const boundary = readMultipartBoundary(contentType);
  if (!boundary) {
    throw new AccountAuthError('OCR 上传请求缺少 multipart boundary。', 400);
  }

  const buffer = await readRequestBuffer(request, { maxBytes: config.ocr.maxUploadBytes + 16 * 1024 });
  return parseOcrMultipartRequest(buffer, boundary);
}

function isOcrImagePayloadKey(key: string) {
  const normalizedKey = key.toLowerCase();
  return (
    normalizedKey === 'ocrimage' ||
    normalizedKey === 'ocr_image' ||
    normalizedKey === 'outputimages' ||
    normalizedKey === 'output_images' ||
    normalizedKey === 'inputimage' ||
    normalizedKey === 'input_image' ||
    normalizedKey === 'imagebase64' ||
    normalizedKey === 'image_base64' ||
    normalizedKey === 'b64json' ||
    normalizedKey === 'b64_json'
  );
}

function isLikelyBase64ImagePayload(value: string) {
  const normalizedValue = value.trim();
  if (/^data:image\//i.test(normalizedValue)) {
    return true;
  }

  if (normalizedValue.length < 1024) {
    return false;
  }

  return /^[A-Za-z0-9+/=\s]+$/.test(normalizedValue) && normalizedValue.length % 4 === 0;
}

function sanitizeOcrRawPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return '[omitted nested payload]';
  }

  if (typeof value === 'string') {
    if (isLikelyBase64ImagePayload(value)) {
      return ocrImagePayloadReplacement;
    }

    return value.length > ocrRawStringMaxChars
      ? `${value.slice(0, ocrRawStringMaxChars)}...[truncated]`
      : value;
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const sanitizedItems = value
      .slice(0, ocrRawArrayMaxItems)
      .map((item) => sanitizeOcrRawPayload(item, depth + 1));
    if (value.length > ocrRawArrayMaxItems) {
      sanitizedItems.push({
        omittedItems: value.length - ocrRawArrayMaxItems,
      });
    }

    return sanitizedItems;
  }

  if (!isObjectRecord(value)) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (isOcrImagePayloadKey(key)) {
      sanitized[key] = ocrImagePayloadReplacement;
      continue;
    }

    sanitized[key] = sanitizeOcrRawPayload(entryValue, depth + 1);
  }

  return sanitized;
}

function readFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readOcrBox(value: unknown): number[][] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  if (value.every((item) => readFiniteNumber(item) !== undefined) && value.length >= 4) {
    const points: number[][] = [];
    for (let index = 0; index < value.length - 1; index += 2) {
      const x = readFiniteNumber(value[index]);
      const y = readFiniteNumber(value[index + 1]);
      if (x === undefined || y === undefined) {
        return undefined;
      }

      points.push([x, y]);
    }

    return points;
  }

  const points = value.map((point) => {
    if (!Array.isArray(point) || point.length < 2) {
      return undefined;
    }

    const x = readFiniteNumber(point[0]);
    const y = readFiniteNumber(point[1]);
    return x !== undefined && y !== undefined ? [x, y] : undefined;
  });

  return points.every((point): point is number[] => Boolean(point)) ? points : undefined;
}

function readStringArrayField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const strings = value
        .map((item) => typeof item === 'string' ? item.trim() : '')
        .filter(Boolean);
      if (strings.length > 0) {
        return strings;
      }
    }
  }

  return undefined;
}

function readArrayField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function readDirectOcrLines(record: Record<string, unknown>) {
  const directText = typeof record.text === 'string'
    ? record.text
    : typeof record.transcription === 'string'
      ? record.transcription
      : typeof record.recognizedText === 'string'
        ? record.recognizedText
        : typeof record.recognized_text === 'string'
          ? record.recognized_text
          : undefined;

  if (directText) {
    const confidence = readFiniteNumber(record.confidence)
      ?? readFiniteNumber(record.score)
      ?? readFiniteNumber(record.rec_score)
      ?? readFiniteNumber(record.recScore);
    const box = readOcrBox(record.box)
      ?? readOcrBox(record.poly)
      ?? readOcrBox(record.polygon)
      ?? readOcrBox(record.points);

    return [{
      text: directText,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(box ? { box } : {}),
    }];
  }

  const texts = readStringArrayField(record, [
    'rec_texts',
    'recTexts',
    'texts',
    'textLines',
    'transcriptions',
    'words',
  ]);

  if (!texts) {
    return [];
  }

  const scores = readArrayField(record, [
    'rec_scores',
    'recScores',
    'scores',
    'confidences',
  ]);
  const boxes = readArrayField(record, [
    'rec_polys',
    'recPolys',
    'dt_polys',
    'dtPolys',
    'boxes',
    'polygons',
  ]);

  return texts.map((text, index): OcrLine => {
    const confidence = scores ? readFiniteNumber(scores[index]) : undefined;
    const box = boxes ? readOcrBox(boxes[index]) : undefined;
    return {
      text,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(box ? { box } : {}),
    };
  });
}

function appendOcrLine(
  lines: OcrLine[],
  seenTexts: Set<string>,
  line: OcrLine,
) {
  const normalizedText = line.text.trim();
  if (!normalizedText || seenTexts.has(normalizedText)) {
    return;
  }

  seenTexts.add(normalizedText);
  lines.push({
    ...line,
    text: normalizedText,
  });
}

function collectOcrLinesFromValue(
  value: unknown,
  lines: OcrLine[],
  seenTexts: Set<string>,
  depth = 0,
) {
  if (depth > 8 || value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    if (!isLikelyBase64ImagePayload(value)) {
      appendOcrLine(lines, seenTexts, { text: value });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectOcrLinesFromValue(item, lines, seenTexts, depth + 1);
    }
    return;
  }

  if (!isObjectRecord(value)) {
    return;
  }

  const directLines = readDirectOcrLines(value);
  if (directLines.length > 0) {
    for (const line of directLines) {
      appendOcrLine(lines, seenTexts, line);
    }
    return;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (isOcrImagePayloadKey(key)) {
      continue;
    }

    const normalizedKey = key.toLowerCase();
    if (
      typeof entryValue === 'string' &&
      ['text', 'transcription', 'label', 'content', 'recognizedtext', 'recognized_text'].includes(normalizedKey)
    ) {
      appendOcrLine(lines, seenTexts, { text: entryValue });
      continue;
    }

    collectOcrLinesFromValue(entryValue, lines, seenTexts, depth + 1);
  }
}

function collectPaddleOcrCandidateValues(value: unknown) {
  const candidates: unknown[] = [];

  if (isObjectRecord(value)) {
    const result = value.result;
    if (isObjectRecord(result)) {
      const ocrResults = result.ocrResults;
      if (Array.isArray(ocrResults)) {
        for (const item of ocrResults) {
          candidates.push(isObjectRecord(item) && 'prunedResult' in item ? item.prunedResult : item);
        }
      }

      if ('prunedResult' in result) {
        candidates.push(result.prunedResult);
      }
    }

    if ('prunedResult' in value) {
      candidates.push(value.prunedResult);
    }
  }

  candidates.push(value);
  return candidates;
}

function extractOcrLines(rawPayload: unknown) {
  const lines: OcrLine[] = [];
  const seenTexts = new Set<string>();

  for (const candidate of collectPaddleOcrCandidateValues(rawPayload)) {
    collectOcrLinesFromValue(candidate, lines, seenTexts);
  }

  return lines;
}

async function ensureOcrServiceReachable() {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(config.ocr.requestTimeoutMs, ocrReachabilityTimeoutMs),
  );

  try {
    const response = await fetch(`${config.ocr.baseUrl}/ocr`, {
      method: 'HEAD',
      signal: controller.signal,
    });
    if (response.status >= 500) {
      throw new OcrProxyError(ocrUnavailableMessage, 503);
    }
  } catch (error) {
    console.warn('OCR service reachability check failed', {
      baseUrl: config.ocr.baseUrl,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new OcrProxyError(ocrUnavailableMessage, 503);
  } finally {
    clearTimeout(timeout);
  }
}

async function callOcrService(image: OcrImageUpload): Promise<OcrJobResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ocr.requestTimeoutMs);
  let response: Response;

  try {
    response = await fetch(`${config.ocr.baseUrl}/ocr`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        file: image.buffer.toString('base64'),
        fileType: 1,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    console.warn('OCR model request failed', {
      baseUrl: config.ocr.baseUrl,
      fileName: image.filename,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new OcrProxyError(ocrUnavailableMessage, 503);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    console.warn('OCR model returned non-OK response', {
      status: response.status,
      statusText: response.statusText,
    });
    throw new OcrProxyError(ocrUnavailableMessage, 503);
  }

  let payload: unknown;
  try {
    payload = await response.json() as unknown;
  } catch {
    throw new OcrProxyError('OCR 模型返回结果不可解析。', 502);
  }

  if (isObjectRecord(payload) && payload.success === false) {
    throw new OcrProxyError('OCR 识别失败，请确认图片可读取。', 502);
  }

  const raw = sanitizeOcrRawPayload(payload);
  const lines = extractOcrLines(raw);

  return {
    text: lines.map((line) => line.text).join('\n'),
    lines,
    raw,
  };
}

function runOcrJob(jobId: string, image: OcrImageUpload) {
  setTimeout(() => {
    void (async () => {
      ocrJobs.updateStatus(jobId, 'running');

      try {
        const result = await callOcrService(image);
        ocrJobs.complete(jobId, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'OCR 识别失败。';
        console.error('OCR job failed', {
          jobId,
          fileName: image.filename,
          message,
        });
        ocrJobs.fail(jobId, message);
      }
    })();
  }, 0);
}

function toOcrJobPayload(job: OcrJobRecord) {
  return {
    jobId: job.jobId,
    status: job.status,
    fileName: job.fileName,
    mimeType: job.mimeType,
    byteSize: job.byteSize,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    expiresAt: job.expiresAt,
    ...(job.result
      ? {
          text: job.result.text,
          lines: job.result.lines,
          raw: job.result.raw,
        }
      : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

async function handleOcrCreateRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (!config.ocr.enabled) {
    writeJson(response, 503, { error: 'OCR 服务未启用。' });
    return;
  }

  const authResult = authenticateHistoryRequest(request);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  // The upload read and reachability probe below both await, so the slot has
  // to be claimed synchronously here or concurrent uploads all pass the gate.
  if (ocrJobs.countActive() + pendingOcrJobReservations >= ocrMaxActiveJobs) {
    writeJson(response, 429, { error: 'OCR 任务较多，请稍后重试。' });
    return;
  }

  pendingOcrJobReservations += 1;

  try {
    let image: OcrImageUpload;
    try {
      image = await readOcrImageUpload(request);
    } catch (error) {
      if (error instanceof AccountAuthError) {
        writeJson(response, error.statusCode, { error: error.message });
        return;
      }

      writeJson(response, error instanceof RequestBodyTooLargeError ? 413 : 400, {
        error:
          error instanceof RequestBodyTooLargeError
            ? 'OCR 图片上传请求体过大。'
            : 'OCR 上传请求格式无效。',
      });
      return;
    }

    try {
      await ensureOcrServiceReachable();
    } catch (error) {
      const statusCode = error instanceof OcrProxyError ? error.statusCode : 503;
      const message = error instanceof Error ? error.message : ocrUnavailableMessage;
      writeJson(response, statusCode, { error: message });
      return;
    }

    const createdAt = new Date().toISOString();
    const job = ocrJobs.create({
      jobId: randomUUID(),
      ownerKey: getAiChatConversationScope(authResult.device),
      fileName: image.filename,
      mimeType: image.mimeType,
      byteSize: image.buffer.byteLength,
      createdAt,
    });

    runOcrJob(job.jobId, image);
    writeJson(response, 202, {
      jobId: job.jobId,
      status: job.status,
      pollUrl: `/api/ocr/jobs/${encodeURIComponent(job.jobId)}`,
    });
  } finally {
    // Runs synchronously after ocrJobs.create() registered the job, so
    // countActive() takes over the slot with no gap.
    pendingOcrJobReservations -= 1;
  }
}

function handleOcrJobRequest(
  request: IncomingMessage,
  response: ServerResponse,
  jobId: string,
) {
  const authResult = authenticateHistoryRequest(request);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  const normalizedJobId = jobId.trim();
  if (!normalizedJobId) {
    writeJson(response, 400, { error: 'Missing OCR job id.' });
    return;
  }

  const job = ocrJobs.get(normalizedJobId, getAiChatConversationScope(authResult.device));
  if (!job) {
    writeJson(response, 404, { error: 'OCR 任务不存在或已过期。' });
    return;
  }

  writeJson(response, 200, toOcrJobPayload(job));
}

function handleOcrHistoryRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = authenticateHistoryRequest(request);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  writeJson(response, 200, {
    items: ocrJobs
      .list(ocrHistoryListLimit, getAiChatConversationScope(authResult.device))
      .map(toOcrJobPayload),
  });
}

function handleOcrHistoryDeleteRequest(
  request: IncomingMessage,
  response: ServerResponse,
  jobId: string,
) {
  const authResult = authenticateHistoryRequest(request);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  const deleted = ocrJobs.delete(jobId.trim(), getAiChatConversationScope(authResult.device));
  if (!deleted) {
    writeJson(response, 404, { error: 'OCR 记录不存在或已过期。' });
    return;
  }

  writeJson(response, 200, { ok: true });
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

  if (isProductionRuntime) {
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

  if (isProductionRuntime) {
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

export function authenticateHistoryRequest(request: {
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

function getAiChatConversationScope(device: ConnectedDevice) {
  return device.accountId
    ? `account:${device.accountId}`
    : `device:${device.deviceId}`;
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
  if (typeof messageContent === 'string' && messageContent.trim()) {
    return messageContent.trim();
  }

  const contentText = collectCloudflareAiText(messageContent).join('\n').trim();
  if (contentText) {
    return contentText;
  }

  const reasoningContent = choice?.message?.reasoning_content;
  if (typeof reasoningContent === 'string' && reasoningContent.trim()) {
    return reasoningContent.trim();
  }

  if (typeof choice?.text === 'string' && choice.text.trim()) {
    return choice.text.trim();
  }

  return '';
}

function buildOpenAiCompatibleRequestBody(
  options: Pick<OpenAiCompatibleClientOptions, 'wireApi' | 'reasoningEffort' | 'systemPrompt'>,
  model: string,
  prompt: string,
  maxOutputTokens: number,
  images: AiChatImageInput[] = [],
) {
  const reasoningEffort = options.reasoningEffort ?? '';
  const systemPrompt = options.systemPrompt ?? getAiSystemPrompt();

  if (options.wireApi === 'responses') {
    const input = images.length > 0
      ? [{
          role: 'user' as const,
          content: buildAiResponseInputContent(prompt, images),
        }]
      : prompt;

    return {
      model,
      ...(systemPrompt ? { instructions: systemPrompt } : {}),
      input,
      max_output_tokens: maxOutputTokens,
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    };
  }

  return {
    model,
    messages: buildAiMessagesWithSystemPrompt(prompt, images, systemPrompt),
    max_tokens: maxOutputTokens,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  };
}

function buildOpenAiCompatibleEndpoint(baseUrl: string, wireApi: OpenAiCompatibleWireApi) {
  const path = wireApi === 'responses'
    ? '/responses'
    : '/chat/completions';
  return new URL(`${baseUrl}${path}`);
}

function normalizeOpenRouterHeaderValue(value: string) {
  return value
    .replace(/[^\x20-\x7E]+/g, '')
    .trim();
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

function buildOpenAiCompatibleHeaders(options: Pick<OpenAiCompatibleClientOptions, 'baseUrl' | 'apiKey' | 'siteUrl' | 'siteName'>) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${options.apiKey}`,
    'content-type': 'application/json',
  };

  if (!isOpenRouterBaseUrl(options.baseUrl)) {
    return headers;
  }

  if (options.siteUrl) {
    headers['HTTP-Referer'] = options.siteUrl;
  }
  const safeSiteName = normalizeOpenRouterHeaderValue(options.siteName ?? '');
  if (safeSiteName) {
    headers['X-OpenRouter-Title'] = safeSiteName;
  }

  return headers;
}

function getOpenAiCompatibleChatCandidates(
  primaryModel: string,
  providerConfig: OpenAiCompatibleProviderConfig,
) {
  const configuredModels = providerConfig.models
    .filter((model) => model.enabled !== false)
    .map((model) => model.id);
  const fallbackModels = isOpenRouterBaseUrl(providerConfig.baseUrl)
    ? openRouterFallbackModelIds
    : [];
  const candidates = [
    primaryModel,
    providerConfig.model,
    ...configuredModels,
    ...fallbackModels,
  ];
  const seen = new Set<string>();

  return candidates.filter((modelId) => {
    if (
      !modelId ||
      seen.has(modelId) ||
      openAiCompatibleNonChatModelPattern.test(modelId)
    ) {
      return false;
    }

    seen.add(modelId);
    return true;
  });
}

async function requestOpenAiCompatibleChat(
  options: OpenAiCompatibleClientOptions,
  model: string,
  prompt: string,
  maxOutputTokens: number,
  images: AiChatImageInput[] = [],
  timeoutMs?: number,
): Promise<OpenRouterChatSuccess | OpenRouterChatFailure> {
  const endpoint = buildOpenAiCompatibleEndpoint(options.baseUrl, options.wireApi);
  const abort = timeoutMs ? createAbortSignal(timeoutMs) : undefined;

  try {
    const aiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: buildOpenAiCompatibleHeaders(options),
      body: JSON.stringify(buildOpenAiCompatibleRequestBody(options, model, prompt, maxOutputTokens, images)),
      signal: abort?.signal,
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
  } catch (error) {
    return {
      ok: false,
      model,
      status: 0,
      message: error instanceof Error && error.name === 'AbortError'
        ? 'OpenAI-compatible API request timed out.'
        : error instanceof Error
          ? error.message
          : 'OpenAI-compatible API request failed.',
    };
  } finally {
    abort?.clear();
  }
}

function buildAnthropicEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/g, '');
  const suffix = normalized.endsWith('/v1') ? '/messages' : '/v1/messages';
  return new URL(`${normalized}${suffix}`);
}

function buildAnthropicRequestBody(
  model: string,
  prompt: string,
  maxOutputTokens: number,
) {
  const systemPrompt = getAiSystemPrompt();
  return {
    model,
    max_tokens: maxOutputTokens,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  };
}

function extractAnthropicText(payload: AnthropicMessagesResponse) {
  return payload.content
    ?.map((part) => part.type === 'text' && typeof part.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
    .trim() ?? '';
}

function formatAnthropicError(payload: AnthropicMessagesResponse | null) {
  return payload?.error?.message?.trim();
}

async function requestAnthropicChat(
  providerConfig: AnthropicProviderConfig,
  model: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<OpenRouterChatSuccess | OpenRouterChatFailure> {
  const endpoint = buildAnthropicEndpoint(providerConfig.baseUrl);

  try {
    const aiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${providerConfig.authToken ?? ''}`,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': providerConfig.authToken ?? '',
      },
      body: JSON.stringify(buildAnthropicRequestBody(model, prompt, maxOutputTokens)),
    });
    const aiPayload = await aiResponse.json().catch(() => null) as AnthropicMessagesResponse | null;

    if (!aiResponse.ok || !aiPayload || aiPayload.error) {
      return {
        ok: false,
        model,
        status: aiResponse.status,
        message: formatAnthropicError(aiPayload),
      };
    }

    const answer = extractAnthropicText(aiPayload);
    if (!answer) {
      return {
        ok: false,
        model,
        status: 502,
        message: 'Anthropic-compatible API returned an empty response.',
      };
    }

    return {
      ok: true,
      model,
      answer,
      promptTokens: Math.max(0, Math.floor(aiPayload.usage?.input_tokens ?? 0)),
      completionTokens: Math.max(0, Math.floor(aiPayload.usage?.output_tokens ?? 0)),
    };
  } catch (error) {
    return {
      ok: false,
      model,
      status: 0,
      message: error instanceof Error ? error.message : 'Anthropic-compatible API request failed.',
    };
  }
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

function formatExternalAiStatus(label: string, model: string) {
  return `当前 AI 提供方为 ${label}，模型 ${model}。本站不统计该接口额度；实际费用和限额以你的 API 服务账户为准。`;
}

function normalizeAdminOpenAiCompatibleBaseUrl(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value
    .trim()
    .replace(/\/+$/g, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/+$/g, '');

  if (!normalized) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return normalized;
}

function normalizeAdminAnthropicBaseUrl(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value
    .trim()
    .replace(/\/+$/g, '')
    .replace(/\/v1\/messages$/i, '')
    .replace(/\/v1\/models$/i, '')
    .replace(/\/messages$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/+$/g, '');

  if (!normalized) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return normalized;
}

function normalizeAdminOpenAiCompatibleWireApi(
  value: unknown,
  fallback: OpenAiCompatibleWireApi,
): OpenAiCompatibleWireApi {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase().replace(/[-/]/g, '_');
  return normalized === 'responses' ? 'responses' : 'chat_completions';
}

function normalizeAdminOpenAiCompatibleReasoningEffort(
  value: unknown,
  fallback: OpenAiCompatibleReasoningEffort,
): OpenAiCompatibleReasoningEffort {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }

  return '';
}

function toOpenAiCompatibleModelOptions(payload: OpenAiCompatibleModelsResponse | null) {
  const source = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : [];
  const models = new Map<string, OpenAiCompatibleModelOption>();

  for (const item of source) {
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) {
      continue;
    }

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    models.set(id, {
      id,
      label: name || id,
    });
  }

  return [...models.values()];
}

function toAnthropicModelOptions(payload: AnthropicModelsResponse | null) {
  const source = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : [];
  const models = new Map<string, OpenAiCompatibleModelOption>();

  for (const item of source) {
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) {
      continue;
    }

    const displayName = typeof item.display_name === 'string' ? item.display_name.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    models.set(id, {
      id,
      label: displayName || name || id,
    });
  }

  return [...models.values()];
}

function createAbortSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
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

function normalizeImageDimensionForUpstream(value: number) {
  const roundedValue = Math.round(value / aiImageDimensionStepPx) * aiImageDimensionStepPx;
  return Math.max(
    aiImageDimensionStepPx,
    Math.min(aiImageMaxDimensionPx, roundedValue),
  );
}

function normalizeImageSizeOption(value: unknown, fallback: string) {
  const rawSize = normalizeImageOption(value, fallback);
  const normalizedSize = rawSize.trim().toLowerCase();

  if (normalizedSize === 'auto') {
    return {
      ok: true as const,
      size: 'auto',
    };
  }

  const match = normalizedSize.match(/^(\d{1,5})(?:px)?\s*[x*]\s*(\d{1,5})(?:px)?$/);
  if (!match) {
    return {
      ok: false as const,
      error: '图片尺寸必须是 auto 或 WIDTHxHEIGHT 格式。',
    };
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return {
      ok: false as const,
      error: '图片尺寸必须大于 0。',
    };
  }

  if (width > aiImageMaxDimensionPx || height > aiImageMaxDimensionPx) {
    return {
      ok: false as const,
      error: `图片最大尺寸是 ${aiImageMaxDimensionPx.toString()}x${aiImageMaxDimensionPx.toString()}。`,
    };
  }

  return {
    ok: true as const,
    size: `${normalizeImageDimensionForUpstream(width).toString()}x${normalizeImageDimensionForUpstream(height).toString()}`,
  };
}

function isChatProbeFailure(result: OpenRouterChatSuccess | OpenRouterChatFailure): result is OpenRouterChatFailure {
  return !result.ok;
}

function isLikelyOpenAiCompatibleChatModel(model: OpenAiCompatibleModelOption) {
  return !openAiCompatibleNonChatModelPattern.test(`${model.id} ${model.label}`);
}

async function mapWithConcurrency<T, Result>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<Result>,
) {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }));

  return results;
}

async function fetchOpenAiCompatibleModelOptions(
  baseUrl: string,
  apiKey: string,
) {
  const abort = createAbortSignal(openAiCompatibleModelListTimeoutMs);

  try {
    const modelsResponse = await fetch(new URL(`${baseUrl}/models`), {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      signal: abort.signal,
    });
    const modelsPayload = await modelsResponse.json().catch(() => null) as OpenAiCompatibleModelsResponse | null;

    if (!modelsResponse.ok) {
      throw new Error(
        modelsPayload?.error?.message?.trim() ||
        `模型检测失败，上游 /models 返回 ${modelsResponse.status.toString()}。`,
      );
    }

    const models = toOpenAiCompatibleModelOptions(modelsPayload);
    if (models.length === 0) {
      throw new Error('模型检测失败，上游 /models 没有返回可用模型。');
    }

    return models;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('模型检测超时，请检查 Base URL 是否可访问。');
    }

    throw error instanceof Error
      ? error
      : new Error('模型检测失败，请检查 Base URL、API Key 和网络连通性。');
  } finally {
    abort.clear();
  }
}

function buildAnthropicModelsEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/g, '');
  const suffix = normalized.endsWith('/v1') ? '/models' : '/v1/models';
  return new URL(`${normalized}${suffix}`);
}

async function fetchAnthropicModelOptions(
  baseUrl: string,
  authToken: string,
) {
  const abort = createAbortSignal(openAiCompatibleModelListTimeoutMs);

  try {
    const modelsResponse = await fetch(buildAnthropicModelsEndpoint(baseUrl), {
      headers: {
        authorization: `Bearer ${authToken}`,
        'anthropic-version': '2023-06-01',
        'x-api-key': authToken,
      },
      signal: abort.signal,
    });
    const modelsPayload = await modelsResponse.json().catch(() => null) as AnthropicModelsResponse | null;

    if (!modelsResponse.ok) {
      throw new Error(
        modelsPayload?.error?.message?.trim() ||
        `模型检测失败，上游 /models 返回 ${modelsResponse.status.toString()}。`,
      );
    }

    const models = toAnthropicModelOptions(modelsPayload);
    if (models.length === 0) {
      throw new Error('模型检测失败，上游 /models 没有返回可用模型。');
    }

    return models;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('模型检测超时，请检查 Base URL 是否可访问。');
    }

    throw error instanceof Error
      ? error
      : new Error('模型检测失败，请检查 Base URL、Token 和网络连通性。');
  } finally {
    abort.clear();
  }
}

async function detectUsableOpenAiCompatibleModels(
  options: OpenAiCompatibleClientOptions,
) {
  const listedModels = (await fetchOpenAiCompatibleModelOptions(options.baseUrl, options.apiKey))
    .filter(isLikelyOpenAiCompatibleChatModel);
  const probeResults = await mapWithConcurrency(
    listedModels,
    openAiCompatibleModelProbeConcurrency,
    async (model) => {
      const result = await requestOpenAiCompatibleChat(
        {
          ...options,
          reasoningEffort: '',
          systemPrompt: '',
        },
        model.id,
        'Reply OK.',
        openAiCompatibleModelProbeMaxOutputTokens,
        [],
        openAiCompatibleModelProbeTimeoutMs,
      );

      if (!result.ok) {
        const failure = result;
        console.warn('OpenAI-compatible model probe failed', {
          model: model.id,
          status: failure.status,
          message: failure.message,
        });
      }

      return {
        model,
        result,
      };
    },
  );
  const models = probeResults
    .filter((entry) => entry.result.ok)
    .map((entry) => entry.model);

  const probeErrors = probeResults
    .filter((entry) => isChatProbeFailure(entry.result))
    .map((entry) => {
      const failure = entry.result as OpenRouterChatFailure;
      return {
        model: entry.model.id,
        status: failure.status,
        message: failure.message,
      };
    });

  return {
    models,
    checkedModelCount: listedModels.length,
    failedModelCount: listedModels.length - models.length,
    probeErrors,
  };
}

let openAiCompatibleModelRefreshPromise: Promise<OpenAiCompatibleModelRefreshResult> | null = null;

function refreshConfiguredOpenAiCompatibleModels() {
  if (openAiCompatibleModelRefreshPromise) {
    return openAiCompatibleModelRefreshPromise;
  }

  openAiCompatibleModelRefreshPromise = (async () => {
    const snapshot = adminConfig.getAiSettingsSnapshot();
    const mainOpenAi = snapshot.openai[0];
    const refreshedAt = new Date().toISOString();
    const baseUrl = normalizeAdminOpenAiCompatibleBaseUrl(mainOpenAi?.baseUrl) ?? '';
    const apiKey = (mainOpenAi?.apiKey ?? '').trim();

    if (!baseUrl || !apiKey) {
      return {
        refreshed: false,
        baseUrl,
        selectedModelId: mainOpenAi?.model || undefined,
        models: (mainOpenAi?.models ?? []).map((model) => ({
          id: model.id,
          label: model.label,
        })),
        checkedModelCount: 0,
        failedModelCount: 0,
        refreshedAt,
        skippedReason: 'OpenAI 兼容接口未配置 Base URL 或 API Key。',
      };
    }

    const detected = await detectUsableOpenAiCompatibleModels({
      baseUrl,
      apiKey,
      wireApi: mainOpenAi!.wireApi,
      reasoningEffort: mainOpenAi!.reasoningEffort,
      siteUrl: mainOpenAi!.siteUrl,
      siteName: mainOpenAi!.siteName,
    });

    if (detected.models.length === 0) {
      const firstProbeError = detected.probeErrors[0];
      const probeDetail = firstProbeError
        ? ` (示例: 模型 ${firstProbeError.model} 返回 ${String(firstProbeError.status)} — ${firstProbeError.message ?? '无详细信息'})`
        : '';
      console.warn('OpenAI-compatible refresh: all probes failed', {
        baseUrl,
        checkedModelCount: detected.checkedModelCount,
        failedModelCount: detected.failedModelCount,
        probeErrors: detected.probeErrors.slice(0, 3),
      });
      throw new Error(`没有检测到可用模型，已保留原模型列表。已检测 ${String(detected.checkedModelCount)} 个模型，全部失败。${probeDetail}`);
    }

    const refreshedConfig = buildRefreshedOpenAiCompatibleModelConfig({
      currentModelId: mainOpenAi!.model,
      detectedModels: detected.models,
      previousModels: mainOpenAi?.models ?? [],
    });

    adminConfig.updateAiSettings({
      ...snapshot,
      openai: [
        ...(mainOpenAi
          ? [{ ...mainOpenAi, baseUrl, model: refreshedConfig.model, models: refreshedConfig.models }]
          : []),
        ...snapshot.openai.slice(1),
      ],
    });

    return {
      refreshed: true,
      baseUrl,
      selectedModelId: refreshedConfig.model,
      models: detected.models,
      checkedModelCount: detected.checkedModelCount,
      failedModelCount: detected.failedModelCount,
      refreshedAt,
    };
  })().finally(() => {
    openAiCompatibleModelRefreshPromise = null;
  });

  return openAiCompatibleModelRefreshPromise;
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

function getImageQuotaPeriodForReservation(reservation: AccountImageQuotaReservation) {
  return {
    ...getImageQuotaPeriod(),
    periodStartedAt: reservation.periodStartedAt,
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
    byteSize: image.byteSize,
    width: image.width,
    height: image.height,
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
  const dimensions = readImageDimensions(bytes, mimeType);
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
    byteSize: bytes.byteLength,
    width: dimensions?.width,
    height: dimensions?.height,
  };
}

async function removeImageAssetDirectory(userId: string, generationId: string) {
  const generationDirectory = join(
    imageAssetRoot,
    safeImageAssetSegment(userId),
    safeImageAssetSegment(generationId),
  );

  await fs.rm(generationDirectory, { recursive: true, force: true });
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
      byteSize: image.byteSize,
      width: image.width,
      height: image.height,
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

  if (config.codexImageAi.models.length === 0) {
    return 'Codex image model list is not configured on this server.';
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
      model: input.model,
      headers: buildCodexImageHeaders('application/json'),
      createBody: () => JSON.stringify(requestBody),
    };
  }

  return {
    endpointKind: 'edit',
    model: input.model,
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

async function requestCodexImageAttempt(
  job: ImageGenerationJob,
  upstreamRequest: AiImageUpstreamRequest,
  endpoint: URL,
  attempt: number,
  parallelRequests: number,
  controller: AbortController,
): Promise<CodexImageUpstreamAttemptResult> {
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: upstreamRequest.headers,
      body: upstreamRequest.createBody(),
      signal: controller.signal,
    });
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error('Codex image reverse proxy request threw', {
        jobId: job.jobId,
        baseUrl: config.codexImageAi.baseUrl,
        endpointKind: upstreamRequest.endpointKind,
        model: upstreamRequest.model,
        attempt,
        parallelRequests,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }

  const payload = await response.json().catch(() => null) as
    | CodexImageGenerationResponse
    | null;
  const durationMs = Date.now() - startedAt;

  console.info('Codex image reverse proxy request completed', {
    jobId: job.jobId,
    baseUrl: config.codexImageAi.baseUrl,
    endpointKind: upstreamRequest.endpointKind,
    status: response.status,
    ok: response.ok,
    model: upstreamRequest.model,
    attempt,
    parallelRequests,
    durationMs,
  });

  return {
    response,
    payload,
    attempt,
    attempts: attempt,
  };
}

async function requestCodexImageWithRace(
  job: ImageGenerationJob,
  upstreamRequest: AiImageUpstreamRequest,
): Promise<CodexImageUpstreamResult> {
  const endpoint = buildCodexImageEndpoint(upstreamRequest.endpointKind);
  const parallelRequests = config.codexImageAi.parallelRequests;
  const controllers = Array.from({ length: parallelRequests }, () => new AbortController());

  return new Promise((resolve, reject) => {
    let settled = false;
    let pendingRequests = parallelRequests;
    let lastRetryableResponse: CodexImageUpstreamAttemptResult | undefined;
    let lastError: unknown;

    const settle = (callback: () => void) => {
      settled = true;
      for (const controller of controllers) {
        if (!controller.signal.aborted) {
          controller.abort();
        }
      }
      callback();
    };

    const finishFailureIfComplete = () => {
      if (pendingRequests > 0 || settled) {
        return;
      }

      if (lastRetryableResponse) {
        resolve({
          response: lastRetryableResponse.response,
          payload: lastRetryableResponse.payload,
          attempts: parallelRequests,
        });
        return;
      }

      reject(lastError ?? new Error('Codex image reverse proxy request did not run.'));
    };

    controllers.forEach((controller, index) => {
      const attempt = index + 1;
      void requestCodexImageAttempt(
        job,
        upstreamRequest,
        endpoint,
        attempt,
        parallelRequests,
        controller,
      )
        .then((result) => {
          if (settled) {
            return;
          }

          pendingRequests -= 1;

          if (result.response.ok || !shouldRetryCodexImageStatus(result.response.status)) {
            settle(() => resolve({
              response: result.response,
              payload: result.payload,
              attempts: result.attempt,
            }));
            return;
          }

          lastRetryableResponse = result;
          console.warn('Codex image reverse proxy race attempt failed', {
            jobId: job.jobId,
            baseUrl: config.codexImageAi.baseUrl,
            endpointKind: upstreamRequest.endpointKind,
            status: result.response.status,
            model: upstreamRequest.model,
            attempt,
            parallelRequests,
          });
          finishFailureIfComplete();
        })
        .catch((error) => {
          if (settled) {
            return;
          }

          pendingRequests -= 1;
          lastError = error;
          finishFailureIfComplete();
        });
    });
  });
}

function formatCodexImageError(payload: CodexImageGenerationResponse | null) {
  const code = typeof payload?.error?.code === 'string' ? payload.error.code.trim() : '';
  const message = payload?.error?.message?.trim() ?? '';
  return [code, message].filter(Boolean).join(': ') || undefined;
}

function isCodexImageModelUnavailableFailure(payload: CodexImageGenerationResponse | null) {
  const message = formatCodexImageError(payload)?.toLowerCase() ?? '';
  return /auth_unavailable|no auth available|no available channel|model .*not available|model .*unavailable|model .*not found/.test(message);
}

function formatCodexImageFailureMessage(
  status: number,
  payload: CodexImageGenerationResponse | null,
) {
  const message = formatCodexImageError(payload);
  if (message) {
    if (/auth_unavailable|no auth available/i.test(message)) {
      return '图片模型上游认证不可用，请检查 CODEX_IMAGE_MODEL 是否仍在上游 /models 中可用，或更换为支持该模型的上游认证。';
    }

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

type ActiveAiSettings = {
  provider: string;
  kind: 'cloudflare' | 'openai-compatible' | 'anthropic';
  label: string;
  model: string;
  models: Array<{ id: string; label: string; enabled: boolean }>;
  maxPromptChars: number;
  maxOutputTokens: number;
  openai?: OpenAiCompatibleProviderConfig;
  anthropic?: AnthropicProviderConfig;
};

function getFeedbackAiProvider(providerId: string): FeedbackAiProviderConfig | undefined {
  return config.feedbackAiProviders.find((provider) => provider.id === providerId);
}

function createOpenAiSettings(
  provider: string,
  providerConfig: OpenAiCompatibleProviderConfig,
  label: string,
): ActiveAiSettings {
  const models = providerConfig.models.filter((model) => model.enabled !== false);
  const defaultModel = models.find((model) => model.id === providerConfig.model)?.id ?? models[0]?.id ?? '';
  return {
    provider,
    kind: 'openai-compatible',
    label: label.trim() || providerConfig.displayName.trim() || 'OpenAI Compatible',
    model: defaultModel,
    models,
    maxPromptChars: providerConfig.maxPromptChars,
    maxOutputTokens: providerConfig.maxOutputTokens,
    openai: providerConfig,
  };
}

function createAnthropicSettings(
  provider: FeedbackAiProviderConfig,
): ActiveAiSettings | null {
  if (!provider.anthropic) {
    return null;
  }

  const models = provider.anthropic.models.filter((model) => model.enabled !== false);
  const defaultModel = models.find((model) => model.id === provider.anthropic?.model)?.id ?? models[0]?.id ?? '';
  return {
    provider: provider.id,
    kind: 'anthropic',
    label: provider.displayName || 'Anthropic',
    model: defaultModel,
    models,
    maxPromptChars: provider.anthropic.maxPromptChars,
    maxOutputTokens: provider.anthropic.maxOutputTokens,
    anthropic: provider.anthropic,
  };
}

function createCloudflareSettings(): ActiveAiSettings {
  const models = config.cloudflareAi.models.filter((model) => model.enabled !== false);
  const defaultModel = models.find((model) => model.id === config.cloudflareAi.model)?.id ?? models[0]?.id ?? '';
  return {
    provider: 'cloudflare' as const,
    kind: 'cloudflare',
    label: 'Cloudflare AI',
    model: defaultModel,
    models,
    maxPromptChars: config.cloudflareAi.maxPromptChars,
    maxOutputTokens: config.cloudflareAi.maxOutputTokens,
  };
}

function isConfiguredAiSettings(settings: ActiveAiSettings) {
  if (settings.kind === 'openai-compatible') {
    return Boolean(settings.openai?.baseUrl && settings.openai.apiKey && settings.model && settings.models.length > 0);
  }

  if (settings.kind === 'anthropic') {
    return Boolean(settings.anthropic?.baseUrl && settings.anthropic.authToken && settings.model && settings.models.length > 0);
  }

  return Boolean(config.cloudflareAi.accountId && config.cloudflareAi.apiToken && settings.model && settings.models.length > 0);
}

function getConfiguredTextAiSettings() {
  const providers: ActiveAiSettings[] = [];
  const primaryOpenAi = createOpenAiSettings(
    'openrouter',
    config.openrouterAi,
    config.openrouterAi.displayName || 'OpenAI Compatible',
  );

  if (isConfiguredAiSettings(primaryOpenAi)) {
    providers.push(primaryOpenAi);
  }

  for (const provider of config.feedbackAiProviders) {
    const settings = provider.kind === 'openai-compatible' && provider.openai
      ? createOpenAiSettings(provider.id, provider.openai, provider.displayName)
      : provider.kind === 'anthropic'
        ? createAnthropicSettings(provider)
        : null;

    if (settings && isConfiguredAiSettings(settings)) {
      providers.push(settings);
    }
  }

  return providers;
}

function getAvailableAiSettings() {
  const configuredProviders = getConfiguredTextAiSettings();
  const cloudflare = createCloudflareSettings();

  if (isConfiguredAiSettings(cloudflare)) {
    configuredProviders.push(cloudflare);
  }

  return configuredProviders;
}

function getAiSettingsByProvider(providerId: string) {
  return getAvailableAiSettings().find((provider) => provider.provider === providerId);
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
  const cookies = parseCookies(request.headers.cookie);
  const sessionId = cookies.get(adminSessionCookieName);
  if (sessionId) {
    const session = adminSessions.get(sessionId);
    if (session) {
      if (isDevAdminEntryEnabled && session.userId === devAdminSession.userId) {
        return {
          ok: true as const,
          sessionId: session.sessionId,
          admin: devAdminSession,
        };
      }

      if (!accounts) {
        return {
          ok: false as const,
          statusCode: 503,
          message: '管理员账号登录未配置，请先配置 Supabase。',
        };
      }

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

  if (!accounts) {
    return {
      ok: false as const,
      statusCode: 503,
      message: '管理员账号登录未配置，请先配置 Supabase。',
    };
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

async function authenticateLinkedAdminRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<AdminAuthResult> {
  const adminAuth = await authenticateAdminRequest(request, response);
  if (adminAuth.ok) {
    return adminAuth;
  }

  const accountAuth = await authenticateAccountRequest(request, response);
  if (!accountAuth.ok) {
    return adminAuth;
  }

  if (!accounts) {
    return {
      ok: false as const,
      statusCode: 503,
      message: '管理员账号登录未配置，请先配置 Supabase。',
    };
  }

  const admin = await accounts.getAdminUserForAccount(accountAuth.user, config.adminSuperEmails);
  if (!admin) {
    return {
      ok: false as const,
      statusCode: 403,
      message: '该账号不是管理员账号。',
    };
  }

  return {
    ok: true as const,
    sessionId: `account:${accountAuth.user.id}`,
    admin,
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
  const mainOpenAi = snapshot.openai[0];
  return {
    ...snapshot,
    cloudflare: {
      ...snapshot.cloudflare,
      apiToken: '',
    },
    openai: [
      ...(mainOpenAi ? [{ ...mainOpenAi, apiKey: '' }] : []),
      ...snapshot.openai.slice(1).map((entry) => ({ ...entry, apiKey: '' })),
    ],
    anthropic: snapshot.anthropic.map((entry) => ({
      ...entry,
      authToken: '',
    })),
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

function parseProviderQualifiedModel(value: string) {
  const separatorIndex = value.indexOf('::');
  if (separatorIndex <= 0) {
    return null;
  }

  const provider = value.slice(0, separatorIndex).trim();
  const model = value.slice(separatorIndex + 2).trim();
  return provider && model ? { provider, model } : null;
}

function resolveAiModelSelection(providerValue: unknown, modelValue: unknown) {
  const modelText = normalizeOptionalString(modelValue) ?? '';
  const qualifiedModel = parseProviderQualifiedModel(modelText);
  const requestedProvider = normalizeOptionalString(providerValue) ?? qualifiedModel?.provider ?? '';
  const requestedModel = qualifiedModel?.model ?? modelText;
  const providers = getAvailableAiSettings();
  const activeAi = requestedProvider
    ? providers.find((provider) => provider.provider === requestedProvider)
    : providers[0];

  if (!activeAi) {
    return {
      ok: false as const,
      statusCode: 503,
      message: requestedProvider
        ? 'Requested AI provider is not configured.'
        : 'No AI provider is configured on this server.',
    };
  }

  if (!requestedModel && activeAi.model) {
    return {
      ok: true as const,
      activeAi,
      model: activeAi.model,
    };
  }

  if (!requestedModel) {
    return {
      ok: false as const,
      statusCode: 400,
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
      statusCode: 400,
      message: `Unsupported ${activeAi.label} model.`,
    };
  }

  return {
    ok: true as const,
    activeAi,
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

function normalizeAiWebSearchQuery(prompt: string) {
  return prompt
    .split(/\n\n下面是用户上传的文本附件内容，请作为上下文参考：/)[0]
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function normalizeSearchText(value: unknown, maxChars: number) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maxChars) : undefined;
}

function normalizeSearchUrl(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeSearxngResults(payload: SearxngSearchResponse | null) {
  const sources: AiWebSearchSource[] = [];
  const seenUrls = new Set<string>();

  for (const result of payload?.results ?? []) {
    const url = normalizeSearchUrl(result.url);
    if (!url || seenUrls.has(url)) {
      continue;
    }

    const title = normalizeSearchText(result.title, 120) ?? url;
    sources.push({
      title,
      url,
      snippet: normalizeSearchText(result.content, 360),
      engine: normalizeSearchText(result.engine, 60),
      publishedAt:
        normalizeSearchText(result.publishedDate, 40) ??
        normalizeSearchText(result.published_date, 40),
    });
    seenUrls.add(url);

    if (sources.length >= config.webSearch.maxResults) {
      break;
    }
  }

  return sources;
}

async function fetchSearxngWebSearch(query: string): Promise<AiWebSearchContext> {
  const endpoint = new URL(`${config.webSearch.searxngBaseUrl}/search`);
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('safesearch', config.webSearch.safeSearch.toString());

  if (config.webSearch.categories) {
    endpoint.searchParams.set('categories', config.webSearch.categories);
  }

  if (config.webSearch.language) {
    endpoint.searchParams.set('language', config.webSearch.language);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.webSearch.timeoutMs);

  try {
    const searchResponse = await fetch(endpoint, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const payload = await searchResponse.json().catch(() => null) as SearxngSearchResponse | null;

    if (!searchResponse.ok) {
      throw new Error(`SearXNG request failed with status ${searchResponse.status.toString()}.`);
    }

    return {
      query,
      sources: normalizeSearxngResults(payload),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildAiPromptWithWebSearch(
  prompt: string,
  webSearch: AiWebSearchContext,
  maxPromptChars: number,
) {
  const header = [
    '以下是服务端通过 SearXNG 返回的联网搜索结果。请把它们作为可引用资料，不要编造搜索结果中不存在的事实。',
    '如果搜索结果不足以确认问题，请明确说明无法从搜索结果确认。回答里需要尽量标明来源标题或链接。',
    '',
    '[联网搜索结果开始]',
  ].join('\n');
  const footer = [
    '[联网搜索结果结束]',
    '',
    '[当前用户问题]',
    prompt,
  ].join('\n');
  const availableChars = Math.max(0, maxPromptChars - header.length - footer.length - 4);
  let usedChars = 0;
  const sourceBlocks: string[] = [];

  for (const [index, source] of webSearch.sources.entries()) {
    const block = [
      `[${(index + 1).toString()}] ${source.title}`,
      `URL: ${source.url}`,
      source.publishedAt ? `时间: ${source.publishedAt}` : '',
      source.snippet ? `摘要: ${source.snippet}` : '',
    ].filter(Boolean).join('\n');
    const nextChars = usedChars + block.length + 2;

    if (sourceBlocks.length > 0 && nextChars > availableChars) {
      break;
    }

    if (sourceBlocks.length === 0 && block.length > availableChars) {
      continue;
    }

    sourceBlocks.push(block);
    usedChars = nextChars;
  }

  const searchText = sourceBlocks.length > 0
    ? sourceBlocks.join('\n\n')
    : '本次搜索没有返回可用结果。';

  return [
    header,
    searchText,
    footer,
  ].join('\n');
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

function buildAiMessagesWithSystemPrompt(
  prompt: string,
  images: AiChatImageInput[],
  systemPrompt: string,
): AiChatMessage[] {
  return [
    ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
    {
      role: 'user',
      content: buildAiChatContent(prompt, images),
    },
  ];
}

function buildAiMessages(prompt: string, images: AiChatImageInput[] = []): AiChatMessage[] {
  return buildAiMessagesWithSystemPrompt(prompt, images, getAiSystemPrompt());
}

function writeAiQuotaExhausted(response: ServerResponse) {
  writeJson(response, 429, {
    error: 'Cloudflare AI 免费额度已用尽，已停止请求以避免产生费用。',
  });
}

function getAiConfigurationError(activeAi: ActiveAiSettings) {
  if (activeAi.kind === 'openai-compatible') {
    if (!activeAi.openai?.apiKey) {
      return `${activeAi.label} is not configured on this server.`;
    }

    if (!activeAi.model || activeAi.models.length === 0) {
      return `${activeAi.label} model list is not configured on this server.`;
    }

    return undefined;
  }

  if (activeAi.kind === 'anthropic') {
    if (!activeAi.anthropic?.authToken) {
      return `${activeAi.label} is not configured on this server.`;
    }

    if (!activeAi.model || activeAi.models.length === 0) {
      return `${activeAi.label} model list is not configured on this server.`;
    }

    return undefined;
  }

  if (!config.cloudflareAi.accountId || !config.cloudflareAi.apiToken) {
    return 'Cloudflare AI is not configured on this server.';
  }

  return undefined;
}

function getAiModelLabel(provider: string, modelId: string) {
  const providerSettings = getAiSettingsByProvider(provider);
  const source = providerSettings?.models ?? (
    provider === 'openrouter'
      ? config.openrouterAi.models
      : provider === 'cloudflare'
        ? config.cloudflareAi.models
        : getFeedbackAiProvider(provider)?.openai?.models ?? getFeedbackAiProvider(provider)?.anthropic?.models ?? []
  );
  return source.find((entry) => entry.id === modelId)?.label ?? modelId;
}

function buildAiModelOptionsPayload(providers: ActiveAiSettings[]) {
  return providers.flatMap((provider) =>
    provider.models.map((entry) => ({
      id: entry.id,
      label: `${provider.label} · ${entry.label}`,
      provider: provider.provider,
      providerLabel: provider.label,
      value: `${provider.provider}::${entry.id}`,
    })),
  );
}

function buildAiQuotaPayload(activeAi: ActiveAiSettings, model: string) {
  const providers = getAvailableAiSettings();
  if (activeAi.kind !== 'cloudflare') {
    return {
      date: new Date().toISOString().slice(0, 10),
      usedNeurons: 0,
      dailyNeuronBudget: 0,
      remainingNeurons: 0,
      freeOnly: false,
      provider: activeAi.provider,
      limitLabel: `${activeAi.label} billing`,
      model,
      models: buildAiModelOptionsPayload(providers),
    };
  }

  const {
    freeOnly,
    dailyNeuronBudget,
  } = config.cloudflareAi;

  return {
    ...cloudflareAiQuota.getStatus(dailyNeuronBudget),
    freeOnly,
    provider: 'cloudflare',
    model,
    models: buildAiModelOptionsPayload(providers),
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
  const onlineDevices = buildAdminOnlineDevicesPayload();
  const users = await buildAdminUsersPayload();
  const roles = admin.isSuperAdmin ? await buildAdminRolesPayload() : undefined;
  const themeSubmissionsSnapshot = await themeSubmissions.getSnapshot();

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
    onlineDevices,
    users,
    roles,
    themeSubmissions: themeSubmissionsSnapshot,
    admin: toAdminSessionPayload(admin),
    serverTime: new Date().toISOString(),
  };
}

function toAdminOnlineDevicePayload(device: ConnectedDevice) {
  return {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    platform: device.platform,
    accountId: device.accountId,
    autoConnect: device.autoConnect,
    discoverable: device.discoverable,
    allowShortCode: device.allowShortCode,
    roomCount: rooms.listForDevice(device.deviceId).length,
    sessionCount: sessions.listForDevice(device.deviceId).length,
    lastSeenAt: device.lastSeenAt,
  };
}

function buildAdminOnlineDevicesPayload() {
  return {
    devices: devices
      .list()
      .map(toAdminOnlineDevicePayload)
      .sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt)),
    loadedAt: new Date().toISOString(),
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

async function handleAdminDevLoginRequest(
  response: ServerResponse,
) {
  if (!isDevAdminEntryEnabled) {
    writeJson(response, 404, { error: 'Not found.' });
    return;
  }

  try {
    const session = adminSessions.create(devAdminSession);
    appendResponseCookie(response, buildAdminSessionCookie(session.sessionId));
    const dashboard = await buildAdminStatePayload(devAdminSession);
    writeJson(response, 200, {
      ok: true,
      authenticated: true,
      ...dashboard,
    });
  } catch (error) {
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : '开发环境后台入口失败。',
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

function handleAdminOnlineDevicesRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  void authenticateAdminRequest(request, response)
    .then((authResult) => {
      if (!authResult.ok) {
        writeJson(response, authResult.statusCode, { error: authResult.message });
        return;
      }

      writeJson(response, 200, {
        onlineDevices: buildAdminOnlineDevicesPayload(),
      });
    })
    .catch((error) => {
      const statusCode = error instanceof AccountAuthError ? error.statusCode : 500;
      writeJson(response, statusCode, {
        error: error instanceof Error ? error.message : 'Failed to load online devices.',
      });
    });
}

function handleAdminPermissionsRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  void authenticateLinkedAdminRequest(request, response)
    .then((authResult) => {
      if (!authResult.ok) {
        writeJson(response, 200, {
          authenticated: false,
          canRecallAnyMessage: false,
        });
        return;
      }

      writeJson(response, 200, {
        authenticated: true,
        canRecallAnyMessage: true,
        admin: toAdminSessionPayload(authResult.admin),
      });
    })
    .catch((error) => {
      const statusCode = error instanceof AccountAuthError ? error.statusCode : 500;
      writeJson(response, statusCode, {
        error: error instanceof Error ? error.message : 'Failed to load admin permissions.',
      });
    });
}

async function readAccountAuthPayload(request: IncomingMessage) {
  const buffer = await readRequestBuffer(request, { maxBytes: 16 * 1024 });
  const payload = JSON.parse(buffer.toString('utf8')) as {
    email?: unknown;
    password?: unknown;
  };

  return {
    email: payload.email,
    password: payload.password,
  };
}

async function readAccountEmailPayload(request: IncomingMessage) {
  const buffer = await readRequestBuffer(request, { maxBytes: 8 * 1024 });
  const payload = JSON.parse(buffer.toString('utf8')) as {
    email?: unknown;
  };

  return {
    email: payload.email,
  };
}

async function handleAccountEmailCheckRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (!accounts) {
    writeJson(response, 503, { error: '账号检测未配置，请先配置 Supabase。' });
    return;
  }

  try {
    const payload = await readAccountEmailPayload(request);
    const result = await accounts.checkEmail(payload);
    writeJson(response, 200, {
      ok: true,
      configured: true,
      registered: result.registered,
    });
  } catch (error) {
    if (error instanceof AccountAuthError) {
      writeJson(response, error.statusCode, { error: error.message });
      return;
    }

    writeJson(response, 400, { error: '账号检测请求无效。' });
  }
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
    const registration = await accounts.register(payload);
    writeJson(response, 200, {
      ok: true,
      authenticated: false,
      requiresEmailConfirmation: true,
      email: registration.email,
      message: '注册请求已提交，请先打开邮箱确认链接，然后再登录。',
      user: registration.user ? toAccountUserPayload(registration.user) : undefined,
    });
  } catch (error) {
    if (error instanceof AccountAuthError) {
      writeJson(response, error.statusCode, { error: error.message });
      return;
    }

    writeJson(response, 400, { error: '账号注册请求无效。' });
  }
}

async function handleAccountConfirmRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) {
  const nextPath = normalizeLocalRedirectTarget(
    url.searchParams.get('next') || url.searchParams.get('redirect_to'),
    request,
  );

  if (!accounts) {
    writeRedirect(response, buildAccountConfirmErrorRedirect('账号确认未配置，请先配置 Supabase。'));
    return;
  }

  try {
    const session = await accounts.confirmEmail({
      tokenHash:
        url.searchParams.get('token_hash') ||
        url.searchParams.get('tokenHash') ||
        url.searchParams.get('token'),
      type: url.searchParams.get('type'),
    });

    if (session) {
      appendResponseCookie(response, buildUserSessionCookie(session));
    }

    writeRedirect(response, nextPath);
  } catch (error) {
    appendResponseCookie(response, buildUserSessionClearCookie());
    const message = error instanceof AccountAuthError
      ? error.message
      : '邮箱确认链接无效或已过期。';
    writeRedirect(response, buildAccountConfirmErrorRedirect(message));
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
    pipeStorageFileResponse(response, storagePath, {
      context: {
        route: 'ai-image-asset',
        generationId: assetRoute.generationId,
        index: assetRoute.index,
        userId: authResult.user.id,
      },
    });
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

async function handleSnapLinkThemeSubmissionRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  let input: ThemeSubmissionInput | null;
  try {
    const buffer = await readRequestBuffer(request, { maxBytes: 4 * 1024 });
    input = parseThemeSubmissionInput(JSON.parse(buffer.toString('utf8')));
  } catch (error) {
    writeJson(response, error instanceof RequestBodyTooLargeError ? 413 : 400, {
      error: error instanceof RequestBodyTooLargeError
        ? 'Theme submission payload is too large.'
        : 'Invalid theme submission payload.',
    });
    return;
  }

  if (!input) {
    writeJson(response, 400, { error: 'Invalid theme submission payload.' });
    return;
  }

  try {
    const result = await themeSubmissions.record({
      ...input,
      userAgent: normalizeThemeSubmissionString(firstHeaderValue(request.headers['user-agent']), 300),
    });

    writeJson(response, 200, {
      ok: true,
      storedIn: result.storedIn,
    });
  } catch (error) {
    console.error('Theme submission failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    writeJson(response, 500, { error: 'Theme submission failed.' });
  }
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

async function handleAdminAiConfigDetect(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = requireSuperAdmin(await authenticateAdminRequest(request, response));
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  let payload: AdminOpenAiCompatibleDetectPayload;
  try {
    const buffer = await readRequestBuffer(request, { maxBytes: 16 * 1024 });
    payload = JSON.parse(buffer.toString('utf8')) as AdminOpenAiCompatibleDetectPayload;
  } catch {
    writeJson(response, 400, { error: 'Invalid OpenAI-compatible detection JSON.' });
    return;
  }

  const baseUrl = normalizeAdminOpenAiCompatibleBaseUrl(payload.baseUrl);
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
  const requestedModelId = typeof payload.modelId === 'string' ? payload.modelId.trim() : '';
  const wireApi = normalizeAdminOpenAiCompatibleWireApi(payload.wireApi, config.openrouterAi.wireApi);
  const reasoningEffort = normalizeAdminOpenAiCompatibleReasoningEffort(
    payload.reasoningEffort,
    config.openrouterAi.reasoningEffort,
  );

  if (!baseUrl || !apiKey) {
    writeJson(response, 400, { error: 'Base URL 和 API Key 都需要填写后才能检测模型。' });
    return;
  }

  try {
    const detected = await detectUsableOpenAiCompatibleModels({
      baseUrl,
      apiKey,
      wireApi,
      reasoningEffort,
      siteUrl: config.openrouterAi.siteUrl,
      siteName: config.openrouterAi.siteName,
    });
    if (detected.models.length === 0) {
      const firstProbeError = detected.probeErrors[0];
      const probeDetail = firstProbeError
        ? ` (示例: 模型 ${firstProbeError.model} 返回 ${String(firstProbeError.status)} — ${firstProbeError.message ?? '无详细信息'})`
        : '';
      console.warn('OpenAI-compatible detect: all probes failed', {
        baseUrl,
        checkedModelCount: detected.checkedModelCount,
        failedModelCount: detected.failedModelCount,
        probeErrors: detected.probeErrors.slice(0, 3),
      });
      writeJson(response, 502, {
        error: `没有检测到可用模型，请检查 API Key、接口类型和模型权限。已检测 ${String(detected.checkedModelCount)} 个模型，全部失败。${probeDetail}`,
        checkedModelCount: detected.checkedModelCount,
        failedModelCount: detected.failedModelCount,
        probeErrors: detected.probeErrors.slice(0, 5),
      });
      return;
    }

    const selectedModelId = requestedModelId
      ? detected.models.find((model) => model.id === requestedModelId)?.id ?? detected.models[0]?.id
      : detected.models[0]?.id;

    writeJson(response, 200, {
      ok: true,
      baseUrl,
      selectedModelId,
      models: detected.models,
      checkedModelCount: detected.checkedModelCount,
      failedModelCount: detected.failedModelCount,
    });
  } catch (error) {
    writeJson(response, 502, {
      error: error instanceof Error
        ? error.message
        : '模型检测失败，请检查 Base URL、API Key 和网络连通性。',
    });
  }
}

async function handleAdminAnthropicConfigDetect(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = requireSuperAdmin(await authenticateAdminRequest(request, response));
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  let payload: AdminAnthropicDetectPayload;
  try {
    const buffer = await readRequestBuffer(request, { maxBytes: 16 * 1024 });
    payload = JSON.parse(buffer.toString('utf8')) as AdminAnthropicDetectPayload;
  } catch {
    writeJson(response, 400, { error: 'Invalid Anthropic detection JSON.' });
    return;
  }

  const baseUrl = normalizeAdminAnthropicBaseUrl(payload.baseUrl);
  const authToken = typeof payload.authToken === 'string' ? payload.authToken.trim() : '';
  const requestedModelId = typeof payload.modelId === 'string' ? payload.modelId.trim() : '';

  if (!baseUrl || !authToken) {
    writeJson(response, 400, { error: 'Base URL 和 Token 都需要填写后才能检测模型。' });
    return;
  }

  try {
    const models = await fetchAnthropicModelOptions(baseUrl, authToken);
    const selectedModelId = requestedModelId
      ? models.find((model) => model.id === requestedModelId)?.id ?? models[0]?.id
      : models[0]?.id;

    writeJson(response, 200, {
      ok: true,
      baseUrl,
      selectedModelId,
      models,
    });
  } catch (error) {
    writeJson(response, 502, {
      error: error instanceof Error
        ? error.message
        : '模型检测失败，请检查 Base URL、Token 和网络连通性。',
    });
  }
}

async function handleAdminAiConfigRefreshModels(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = requireSuperAdmin(await authenticateAdminRequest(request, response));
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  try {
    const refresh = await refreshConfiguredOpenAiCompatibleModels();
    if (!refresh.refreshed) {
      writeJson(response, 400, { error: refresh.skippedReason ?? 'OpenAI 兼容接口未配置。' });
      return;
    }

    const dashboard = await buildAdminStatePayload(authResult.admin);
    writeJson(response, 200, {
      ok: true,
      refresh,
      ...dashboard,
    });
  } catch (error) {
    writeJson(response, 502, {
      error: error instanceof Error ? error.message : '模型列表刷新失败。',
    });
  }
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

function normalizeAdminDeviceNameInput(value: unknown) {
  if (typeof value !== 'string') {
    throw new AccountAuthError('设备名称不能为空。', 400);
  }

  const deviceName = value.trim();
  if (!deviceName) {
    throw new AccountAuthError('设备名称不能为空。', 400);
  }

  return deviceName.slice(0, 80);
}

async function handleAdminOnlineDeviceRename(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const authResult = await authenticateAdminRequest(request, response);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  let payload: {
    deviceId?: unknown;
    deviceName?: unknown;
  };

  try {
    const buffer = await readRequestBuffer(request, { maxBytes: 16 * 1024 });
    payload = JSON.parse(buffer.toString('utf8')) as typeof payload;
  } catch {
    writeJson(response, 400, { error: 'Invalid admin online device JSON.' });
    return;
  }

  const deviceId = typeof payload.deviceId === 'string' ? payload.deviceId.trim() : '';
  if (!deviceId) {
    writeJson(response, 400, { error: '设备 ID 不能为空。' });
    return;
  }

  try {
    const deviceName = normalizeAdminDeviceNameInput(payload.deviceName);
    const updatedDevice = devices.update(deviceId, { deviceName });
    if (!updatedDevice) {
      writeJson(response, 404, { error: '该设备已离线，无法修改名称。' });
      return;
    }

    broadcastSnapshots();
    writeJson(response, 200, {
      ok: true,
      device: toAdminOnlineDevicePayload(updatedDevice),
      onlineDevices: buildAdminOnlineDevicesPayload(),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AccountAuthError) {
      writeJson(response, error.statusCode, { error: error.message });
      return;
    }

    writeJson(response, 500, {
      error: error instanceof Error ? error.message : '设备名称保存失败。',
    });
  }
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

  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  const modelSelection = resolveAiModelSelection(
    requestUrl.searchParams.get('provider'),
    requestUrl.searchParams.get('model'),
  );
  if (!modelSelection.ok) {
    writeJson(response, modelSelection.statusCode, { error: modelSelection.message });
    return;
  }

  const configurationError = getAiConfigurationError(modelSelection.activeAi);
  if (configurationError) {
    writeJson(response, 503, { error: configurationError });
    return;
  }

  writeJson(response, 200, buildAiQuotaPayload(modelSelection.activeAi, modelSelection.model));
}

async function handleAiChatConversationsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) {
  const authResult = authenticateHistoryRequest(request);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  const scopeKey = getAiChatConversationScope(authResult.device);

  if (request.method === 'GET') {
    writeJson(response, 200, {
      conversations: aiChatConversations.list(scopeKey),
    });
    return;
  }

  if (request.method === 'PUT') {
    let payload: { conversations?: unknown };
    try {
      const buffer = await readRequestBuffer(request, { maxBytes: 4 * 1024 * 1024 });
      payload = JSON.parse(buffer.toString('utf8')) as { conversations?: unknown };
    } catch {
      writeJson(response, 400, { error: 'Invalid AI chat conversation JSON.' });
      return;
    }

    if (!Array.isArray(payload.conversations)) {
      writeJson(response, 400, { error: 'Missing conversations.' });
      return;
    }

    const conversations = await aiChatConversations.replace(scopeKey, payload.conversations);
    writeJson(response, 200, { conversations });
    return;
  }

  if (request.method === 'DELETE') {
    const conversationId = url.searchParams.get('conversationId')?.trim() || undefined;
    const conversations = await aiChatConversations.delete(scopeKey, conversationId);
    writeJson(response, 200, { conversations });
    return;
  }

  writeJson(response, 405, { error: 'Method not allowed.' });
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
  const shouldUseWebSearch = kind === 'chat' && payload.webSearch === true;
  const modelSelection = resolveAiModelSelection(payload.provider, payload.model);
  if (!modelSelection.ok) {
    writeJson(response, modelSelection.statusCode, { error: modelSelection.message });
    return;
  }

  const activeAi = modelSelection.activeAi;
  const configurationError = getAiConfigurationError(activeAi);
  if (configurationError) {
    writeJson(response, 503, {
      error: configurationError,
    });
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
    const quotaText = activeAi.kind !== 'cloudflare'
      ? formatExternalAiStatus(activeAi.label, model)
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
      provider: activeAi.provider,
      model,
      quota: buildAiQuotaPayload(activeAi, model),
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

  if (images.length > 0 && activeAi.kind === 'cloudflare') {
    writeJson(response, 400, {
      error: '当前 Cloudflare AI 文本通道不支持读图，请在后台切换到 OpenAI 兼容的多模态模型。',
    });
    return;
  }

  if (images.length > 0 && activeAi.kind === 'anthropic') {
    writeJson(response, 400, {
      error: '当前 Anthropic 文本通道暂不支持读图，请在后台切换到 OpenAI 兼容的多模态模型。',
    });
    return;
  }

  if (shouldUseWebSearch && !config.webSearch.enabled) {
    writeJson(response, 503, {
      error: '联网搜索未启用。请先在后端配置 AI_WEB_SEARCH_ENABLED=true 和 SEARXNG_BASE_URL。',
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

  let promptForAi = effectivePrompt;
  let webSearchContext: AiWebSearchContext | undefined;
  if (shouldUseWebSearch) {
    const searchQuery = normalizeAiWebSearchQuery(effectivePrompt);
    if (!searchQuery) {
      writeJson(response, 400, { error: '联网搜索需要明确的文本问题。' });
      return;
    }

    try {
      webSearchContext = await fetchSearxngWebSearch(searchQuery);
      promptForAi = buildAiPromptWithWebSearch(
        effectivePrompt,
        webSearchContext,
        activeAi.maxPromptChars,
      );
    } catch (error) {
      console.error('SearXNG web search failed', {
        message: error instanceof Error ? error.message : undefined,
      });
      writeJson(response, 502, { error: '联网搜索请求失败，请检查 SearXNG 服务是否可用并启用了 JSON format。' });
      return;
    }
  }

  if (Buffer.byteLength(promptForAi, 'utf8') > aiPromptMaxBytes) {
    writeJson(response, 413, {
      error: 'Prompt plus web search context exceeds the AI request byte limit.',
    });
    return;
  }

  if (promptForAi.length > activeAi.maxPromptChars) {
    writeJson(response, 413, {
      error: `Prompt plus web search context exceeds the ${activeAi.maxPromptChars.toString()} character limit.`,
    });
    return;
  }

  const aiPrompt = buildAiPrompt({
    prompt: promptForAi,
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
  if (activeAi.kind === 'cloudflare' && config.cloudflareAi.freeOnly) {
    const quota = cloudflareAiQuota.reserve(
      estimateCloudflareAiNeurons(aiPrompt),
      config.cloudflareAi.dailyNeuronBudget,
    );

    if (!quota.ok) {
        aiUsage.record({
          provider: activeAi.provider,
          modelId: model,
          modelLabel: getAiModelLabel(activeAi.provider, model),
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

    if (activeAi.kind === 'cloudflare') {
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
          provider: activeAi.provider,
          modelId: model,
          modelLabel: getAiModelLabel(activeAi.provider, model),
          outcome: 'failed',
          promptChars: aiPrompt.length,
        });
        writeJson(response, 502, { error: 'Cloudflare AI request failed.' });
        return;
      }

      answer = extractCloudflareAiText(aiPayload);
    } else if (activeAi.kind === 'openai-compatible' && activeAi.openai) {
      if (!activeAi.openai.apiKey) {
        writeJson(response, 503, { error: `${activeAi.label} is not configured on this server.` });
        return;
      }

      let lastFailure: OpenRouterChatFailure | undefined;
      const openAiClientOptions: OpenAiCompatibleClientOptions = {
        ...activeAi.openai,
        apiKey: activeAi.openai.apiKey,
      };

      for (const candidateModel of getOpenAiCompatibleChatCandidates(model, activeAi.openai)) {
        const result = await requestOpenAiCompatibleChat(
          openAiClientOptions,
          candidateModel,
          aiPrompt,
          activeAi.maxOutputTokens,
          images,
        );
        if (result.ok) {
          if (candidateModel !== model) {
            console.warn('OpenAI-compatible fallback model succeeded', {
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
        const failure = result as OpenRouterChatFailure;
        console.warn('OpenAI-compatible model attempt failed', {
          status: failure.status,
          model: failure.model,
          message: failure.message,
        });
        aiUsage.record({
          provider: activeAi.provider,
          modelId: candidateModel,
          modelLabel: getAiModelLabel(activeAi.provider, candidateModel),
          outcome: 'failed',
          promptChars: aiPrompt.length,
        });
      }

      if (!answer) {
        console.error('OpenAI-compatible request failed', {
          status: lastFailure?.status,
          model: lastFailure?.model ?? model,
          message: lastFailure?.message,
        });
        const unavailableMessage = isOpenRouterBaseUrl(activeAi.openai.baseUrl)
          ? 'AI 模型暂时不可用，已尝试 OpenRouter 备用免费模型但仍失败，请稍后再试或切换模型。'
          : 'AI 模型暂时不可用，已尝试备用模型但仍失败，请稍后再试。';
        writeJson(response, 502, { error: unavailableMessage });
        return;
      }
    } else if (activeAi.kind === 'anthropic' && activeAi.anthropic) {
      const result = await requestAnthropicChat(activeAi.anthropic, model, aiPrompt, activeAi.maxOutputTokens);
      if (!result.ok) {
        const failure = result as OpenRouterChatFailure;
        console.error('Anthropic-compatible request failed', {
          status: failure.status,
          model: failure.model,
          message: failure.message,
        });
        aiUsage.record({
          provider: activeAi.provider,
          modelId: model,
          modelLabel: getAiModelLabel(activeAi.provider, model),
          outcome: 'failed',
          promptChars: aiPrompt.length,
        });
        writeJson(response, 502, { error: 'Anthropic-compatible API request failed.' });
        return;
      }

      model = result.model;
      answer = result.answer;
      promptTokens = result.promptTokens;
      completionTokens = result.completionTokens;
    }

    if (!answer) {
      if (quotaReservation) {
        cloudflareAiQuota.release(quotaReservation);
      }

      aiUsage.record({
        provider: activeAi.provider,
        modelId: model,
        modelLabel: getAiModelLabel(activeAi.provider, model),
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
      // The upstream call succeeded but the reply could not be stored, so the
      // user gets nothing — mirror the empty-answer path and hand the neurons
      // back instead of holding them until the daily reset.
      if (quotaReservation) {
        cloudflareAiQuota.release(quotaReservation);
      }

      writeJson(response, saved.statusCode, { error: saved.message });
      return;
    }

    aiUsage.record({
      provider: activeAi.provider,
      modelId: model,
      modelLabel: getAiModelLabel(activeAi.provider, model),
      outcome: 'success',
      promptChars: aiPrompt.length,
      responseChars: answer.length,
      promptTokens,
      completionTokens,
    });

    writeJson(response, 200, {
      response: answer,
      provider: activeAi.provider,
      model,
      quota: buildAiQuotaPayload(activeAi, model),
      historyText: saved?.ok ? saved.text : undefined,
      webSearch: webSearchContext,
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
      provider: activeAi.provider,
      modelId: model,
      modelLabel: getAiModelLabel(activeAi.provider, model),
      outcome: 'failed',
      promptChars: aiPrompt.length,
    });
    writeJson(response, 502, { error: `${activeAi.label} request failed.` });
  }
}

async function runImageGenerationJob(
  job: ImageGenerationJob,
  upstreamRequests: AiImageUpstreamRequest[],
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
    let imagePayload: CodexImageGenerationResponse | null = null;

    for (const [index, upstreamRequest] of upstreamRequests.entries()) {
      job.model = upstreamRequest.model;
      const {
        response: imageResponse,
        payload: candidatePayload,
        attempts: imageAttempts,
      } = await requestCodexImageWithRace(job, upstreamRequest);

      if (imageResponse.ok && candidatePayload && !candidatePayload.error) {
        imagePayload = candidatePayload;

        if (imageAttempts > 1) {
          console.warn('Codex image reverse proxy retry succeeded', {
            jobId: job.jobId,
            model: upstreamRequest.model,
            attempts: imageAttempts,
          });
        }

        break;
      }

      const message = formatCodexImageFailureMessage(imageResponse.status, candidatePayload);
      const fallbackRequest = upstreamRequests[index + 1];
      if (fallbackRequest && isCodexImageModelUnavailableFailure(candidatePayload)) {
        console.warn('Codex image reverse proxy model unavailable; falling back', {
          jobId: job.jobId,
          status: imageResponse.status,
          fromModel: upstreamRequest.model,
          toModel: fallbackRequest.model,
          attempts: imageAttempts,
          message,
        });
        continue;
      }

      console.error('Codex image reverse proxy job failed', {
        jobId: job.jobId,
        status: imageResponse.status,
        model: upstreamRequest.model,
        attempts: imageAttempts,
        message,
      });
      job.error = message;
      touchImageGenerationJob(job, 'failed');
      return;
    }

    if (!imagePayload) {
      job.error = 'Codex image reverse proxy request did not return a usable response.';
      touchImageGenerationJob(job, 'failed');
      return;
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
    let historySaved = false;
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
      historySaved = true;
    } catch (error) {
      console.error('Image generation history job persistence failed', {
        jobId: job.jobId,
        userId: job.userId,
        model: job.model,
        message: error instanceof Error ? error.message : String(error),
      });
      await removeImageAssetDirectory(job.userId, job.jobId).catch((cleanupError: unknown) => {
        console.error('Image generation asset cleanup failed after history persistence error', {
          jobId: job.jobId,
          userId: job.userId,
          message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      });
      job.error = '图片已生成，但生图历史保存失败。';
      touchImageGenerationJob(job, 'failed');
      return;
    }

    let quota: AccountImageQuotaStatus;
    try {
      quota = job.quotaReservation
        ? await accounts.confirmImageQuotaReservation({
            user: job.user,
            reservation: job.quotaReservation,
            period: getImageQuotaPeriodForReservation(job.quotaReservation),
            limit: config.codexImageAi.dailyFreeQuota,
            imageCount: images.length,
          })
        : await accounts.addImageQuotaUsage({
            user: job.user,
            period: getImageQuotaPeriod(),
            limit: config.codexImageAi.dailyFreeQuota,
            imageCount: images.length,
          });
      job.quota = quota;
    } catch (error) {
      console.error('Image generation quota refresh failed after history persistence', {
        jobId: job.jobId,
        userId: job.userId,
        message: error instanceof Error ? error.message : String(error),
      });
      if (historySaved) {
        await imageGenerationHistory.deleteForUser(job.userId, job.jobId).catch((cleanupError: unknown) => {
          console.error('Image generation history cleanup failed after quota error', {
            jobId: job.jobId,
            userId: job.userId,
            message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          });
        });
      }
      await removeImageAssetDirectory(job.userId, job.jobId).catch((cleanupError: unknown) => {
        console.error('Image generation asset cleanup failed after quota error', {
          jobId: job.jobId,
          userId: job.userId,
          message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      });
      job.error = error instanceof AccountAuthError
        ? error.message
        : '生图额度扣减失败，请稍后重试。';
      touchImageGenerationJob(job, 'failed');
      return;
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
    if (job.status === 'failed' && accounts && job.quotaReservation) {
      try {
        job.quota = await accounts.releaseImageQuotaReservation({
          user: job.user,
          reservation: job.quotaReservation,
          period: getImageQuotaPeriodForReservation(job.quotaReservation),
          limit: config.codexImageAi.dailyFreeQuota,
        });
      } catch (error) {
        console.error('Image generation quota reservation release failed', {
          jobId: job.jobId,
          userId: job.userId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    cleanupImageGenerationJobs();
  }
}

function startImageGenerationJob(
  job: ImageGenerationJob,
  upstreamRequests: AiImageUpstreamRequest[],
) {
  setTimeout(() => {
    void runImageGenerationJob(job, upstreamRequests);
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

  const accountRegistry = accounts;
  if (!accountRegistry) {
    writeJson(response, 503, { error: '账号登录未配置，请先配置 Supabase。' });
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

  const modelCandidates = config.codexImageAi.models;
  const model = modelCandidates[0] ?? config.codexImageAi.model;
  const sizeResult = normalizeImageSizeOption(payload.size, config.codexImageAi.size);
  if (!sizeResult.ok) {
    writeJson(response, 400, { error: sizeResult.error });
    return;
  }

  const size = sizeResult.size;
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

  const upstreamRequests = modelCandidates.map((candidateModel) => buildCodexImageRequest({
    model: candidateModel,
    prompt,
    size,
    quality,
    uploadedImages,
  }));

  cleanupImageGenerationJobs();
  const existingJob = [...imageGenerationJobs.values()].find((job) =>
    job.userId === authResult.user.id && (job.status === 'queued' || job.status === 'running'));
  if (existingJob) {
    writeJson(response, 202, {
      ...toImageGenerationJobPayload(existingJob, resolveRequestBaseUrl(request)),
      pollUrl: `/api/ai/image/jobs/${encodeURIComponent(existingJob.jobId)}`,
    });
    return;
  }

  const createdAtDate = new Date();
  const createdAt = createdAtDate.toISOString();
  const jobId = randomUUID();

  const job: ImageGenerationJob = {
    jobId,
    userId: authResult.user.id,
    user: authResult.user,
    prompt,
    model,
    modelCandidates,
    size,
    quality,
    sourceImageCount: uploadedImages.length,
    status: 'queued',
    createdAt,
    updatedAt: createdAt,
  };

  // Claim the per-user slot before awaiting the reservation, otherwise two
  // requests in the same tick both pass the existingJob check above and each
  // spends a quota unit on its own upstream generation.
  imageGenerationJobs.set(job.jobId, job);

  try {
    const reservationResult = await accountRegistry.reserveImageQuota({
      user: authResult.user,
      period: getImageQuotaPeriod(createdAtDate),
      limit: config.codexImageAi.dailyFreeQuota,
      imageCount: 1,
      reservationId: jobId,
      expiresAt: new Date(createdAtDate.getTime() + imageGenerationJobRetentionMs).toISOString(),
    });
    job.quota = reservationResult.quota;
    job.quotaReservation = reservationResult.reservation;
  } catch (error) {
    imageGenerationJobs.delete(job.jobId);
    const statusCode = error instanceof AccountAuthError ? error.statusCode : 503;
    const message = error instanceof AccountAuthError
      ? error.message
      : '生图额度数据库不可用，请先执行 Supabase 迁移。';
    console.error('Image generation quota reservation failed', {
      userId: authResult.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    writeJson(response, statusCode, { error: message });
    return;
  }

  startImageGenerationJob(job, upstreamRequests);
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

async function authorizeHistoryRecordRecall(
  request: IncomingMessage,
  response: ServerResponse,
  device: ConnectedDevice,
  record: { sourceDeviceId: string },
  resourceLabel: 'text' | 'file',
) {
  if (record.sourceDeviceId === device.deviceId) {
    return {
      ok: true as const,
      scope: 'source-device' as const,
    };
  }

  const adminAuth = await authenticateLinkedAdminRequest(request, response);
  if (adminAuth.ok) {
    return {
      ok: true as const,
      scope: 'admin' as const,
    };
  }

  return {
    ok: false as const,
    statusCode: 403,
    message: `Only the source device or an admin can recall this ${resourceLabel}.`,
  };
}

async function handleHistoryTextDeleteRequest(
  request: IncomingMessage,
  response: ServerResponse,
  historyId: string,
) {
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

  try {
    const recallAccess = await authorizeHistoryRecordRecall(
      request,
      response,
      authResult.device,
      record,
      'text',
    );

    if (!recallAccess.ok) {
      writeJson(response, recallAccess.statusCode, { error: recallAccess.message });
      return;
    }

    if (recallAccess.scope === 'source-device') {
      const roomAccess = authorizeRoomMember(authResult.device, record.roomId);
      if (!roomAccess.ok) {
        writeJson(response, roomAccess.statusCode, { error: roomAccess.message });
        return;
      }
    }

    const deleted = await history.deleteText(historyId);
    writeJson(response, 200, { ok: true, deleted });
    if (deleted) {
      broadcastHistoryRecalled({
        kind: 'text',
        historyId,
        roomId: record.roomId,
      });
      broadcastSnapshots();
    }
  } catch (error) {
    const statusCode = error instanceof AccountAuthError ? error.statusCode : 500;
    writeJson(response, statusCode, {
      error: error instanceof Error ? error.message : 'History text recall failed.',
    });
  }
}

async function handleHistoryFileDeleteRequest(
  request: IncomingMessage,
  response: ServerResponse,
  historyId: string,
) {
  const authResult = authenticateHistoryRequest(request);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  const record = history.getById(historyId);
  if (!record) {
    writeJson(response, 200, { ok: true, deleted: false });
    return;
  }

  try {
    const recallAccess = await authorizeHistoryRecordRecall(
      request,
      response,
      authResult.device,
      record,
      'file',
    );

    if (!recallAccess.ok) {
      writeJson(response, recallAccess.statusCode, { error: recallAccess.message });
      return;
    }

    if (recallAccess.scope === 'source-device') {
      const roomAccess = authorizeRoomMember(authResult.device, record.roomId);
      if (!roomAccess.ok) {
        writeJson(response, roomAccess.statusCode, { error: roomAccess.message });
        return;
      }
    }

    const deleted = await history.deleteFile(historyId);
    writeJson(response, 200, { ok: true, deleted });
    if (deleted) {
      broadcastHistoryRecalled({
        kind: 'file',
        historyId,
        roomId: record.roomId,
      });
      broadcastSnapshots();
    }
  } catch (error) {
    const statusCode = error instanceof AccountAuthError ? error.statusCode : 500;
    writeJson(response, statusCode, {
      error: error instanceof Error ? error.message : 'History file recall failed.',
    });
  }
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

  if (url.pathname === '/api/snaplink/theme-submissions' && request.method === 'POST') {
    void handleSnapLinkThemeSubmissionRequest(request, response);
    return;
  }

  if (url.pathname === '/api/web-command/java' && request.method === 'POST') {
    void handleWebCommandJavaRunRequest(request, response, {
      config,
      authenticateHistoryRequest,
    });
    return;
  }

  if (url.pathname === '/api/web-command/plantuml' && request.method === 'POST') {
    void handleWebCommandPlantUmlRunRequest(request, response, {
      config,
      authenticateHistoryRequest,
    });
    return;
  }

  if (url.pathname === '/api/admin/login' && request.method === 'POST') {
    void handleAdminLoginRequest(request, response);
    return;
  }

  if (url.pathname === '/api/admin/dev-login' && request.method === 'POST') {
    void handleAdminDevLoginRequest(response);
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

  if (url.pathname === '/api/admin/online-devices' && request.method === 'GET') {
    handleAdminOnlineDevicesRequest(request, response);
    return;
  }

  if (url.pathname === '/api/admin/permissions' && request.method === 'GET') {
    handleAdminPermissionsRequest(request, response);
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

  if (url.pathname === '/api/admin/ai-config/detect' && request.method === 'POST') {
    void handleAdminAiConfigDetect(request, response);
    return;
  }

  if (url.pathname === '/api/admin/ai-config/detect-anthropic' && request.method === 'POST') {
    void handleAdminAnthropicConfigDetect(request, response);
    return;
  }

  if (url.pathname === '/api/admin/ai-config/refresh-models' && request.method === 'POST') {
    void handleAdminAiConfigRefreshModels(request, response);
    return;
  }

  if (url.pathname === '/api/admin/history/clear' && request.method === 'POST') {
    void handleAdminHistoryClear(request, response);
    return;
  }

  if (url.pathname === '/api/admin/online-devices/name' && request.method === 'POST') {
    void handleAdminOnlineDeviceRename(request, response);
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

  if (url.pathname === '/api/auth/check-email' && request.method === 'POST') {
    void handleAccountEmailCheckRequest(request, response);
    return;
  }

  if (url.pathname === '/api/auth/confirm' && request.method === 'GET') {
    void handleAccountConfirmRequest(request, response, url);
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

  if (url.pathname === '/api/ai/chat/conversations') {
    void handleAiChatConversationsRequest(request, response, url);
    return;
  }

  if (url.pathname === '/api/ocr' && request.method === 'POST') {
    void handleOcrCreateRequest(request, response);
    return;
  }

  if (url.pathname.startsWith('/api/ocr/jobs/') && request.method === 'GET') {
    const jobId = decodeURIComponent(url.pathname.slice('/api/ocr/jobs/'.length));
    handleOcrJobRequest(request, response, jobId);
    return;
  }

  if (url.pathname === '/api/ocr/history' && request.method === 'GET') {
    handleOcrHistoryRequest(request, response);
    return;
  }

  if (url.pathname.startsWith('/api/ocr/history/') && request.method === 'DELETE') {
    const jobId = decodeURIComponent(url.pathname.slice('/api/ocr/history/'.length));
    handleOcrHistoryDeleteRequest(request, response, jobId);
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
      const expectedChunkBytes = contentRange.end - contentRange.start + 1;

      if (
        expectedChunkBytes > historyUploadChunkMaxBytes ||
        contentRange.total > config.historyMaxBytes
      ) {
        writeJson(response, 413, {
          error: 'Chunk exceeds maximum allowed size.',
        });
        request.resume();
        return;
      }

      void readRequestBuffer(request, { maxBytes: expectedChunkBytes })
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
          writeJson(response, error instanceof RequestBodyTooLargeError ? 413 : 500, {
            error: error instanceof RequestBodyTooLargeError
              ? 'Chunk exceeds declared Content-Range size.'
              : error instanceof Error ? error.message : 'History chunk upload failed.',
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
    const authResult = authenticateHistoryRequest(request);
    if (!authResult.ok) {
      writeJson(response, authResult.statusCode, { error: authResult.message });
      return;
    }

    void readRequestBuffer(request, { maxBytes: historyTextRequestMaxBytes })
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
        writeJson(response, error instanceof RequestBodyTooLargeError ? 413 : 500, {
          error: error instanceof RequestBodyTooLargeError
            ? '历史文本内容超过大小限制。'
            : error instanceof Error ? error.message : 'History text upload failed.',
        });
      });
    return;
  }

  if (url.pathname.startsWith('/api/history/text/') && request.method === 'DELETE') {
    const historyId = decodeURIComponent(
      url.pathname.slice('/api/history/text/'.length),
    );
    void handleHistoryTextDeleteRequest(request, response, historyId);
    return;
  }

  if (url.pathname.startsWith('/api/history/file/') && request.method === 'DELETE') {
    const historyId = decodeURIComponent(
      url.pathname.slice('/api/history/file/'.length),
    );
    void handleHistoryFileDeleteRequest(request, response, historyId);
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

    void fs.stat(record.storagePath).then((fileStat) => {
      const fileSize = fileStat.size;
      const range = parseRangeHeader(request.headers.range, fileSize);
      const contentDispositionType = shouldServeHistoryFileInline(record) ? 'inline' : 'attachment';
      const baseHeaders = {
        'content-type': record.mimeType || 'application/octet-stream',
        'content-disposition': `${contentDispositionType}; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
        'accept-ranges': 'bytes',
        'cache-control': isPublicRecord ? 'public, max-age=3600' : 'private, max-age=3600',
      };

      if (range === null) {
        response.writeHead(416, {
          ...baseHeaders,
          'content-range': `bytes */${fileSize.toString()}`,
        });
        response.end();
        return;
      }

      if (range) {
        response.writeHead(206, {
          ...baseHeaders,
          'content-length': (range.end - range.start + 1).toString(),
          'content-range': `bytes ${range.start.toString()}-${range.end.toString()}/${fileSize.toString()}`,
        });
        pipeStorageFileResponse(response, record.storagePath, {
          start: range.start,
          end: range.end,
          context: {
            route: 'history-download',
            historyId,
            roomId: record.roomId,
          },
        });
        return;
      }

      response.writeHead(200, {
        ...baseHeaders,
        'content-length': fileSize.toString(),
      });
      pipeStorageFileResponse(response, record.storagePath, {
        context: {
          route: 'history-download',
          historyId,
          roomId: record.roomId,
        },
      });
    }).catch((error) => {
      console.warn('History file storage missing', {
        historyId,
        roomId: record.roomId,
        storagePath: record.storagePath,
        message: error instanceof Error ? error.message : String(error),
      });
      writeJson(response, 404, { error: 'History file not found.' });
    });
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

function broadcastHistoryRecalled(payload: {
  kind: 'text' | 'file';
  historyId: string;
  roomId: string;
}) {
  const room = rooms.getById(payload.roomId);
  if (!room) {
    return;
  }

  const recalledAt = new Date().toISOString();
  for (const memberId of room.memberIds) {
    const device = devices.getById(memberId);
    if (!device) {
      continue;
    }

    send(device.socket, {
      type: 'history-recalled',
      payload: {
        ...payload,
        recalledAt,
      },
    });
  }
}

// Single global sweep. Per-socket timers only handle liveness, so registry
// maintenance costs one pass per tick regardless of how many clients connect.
const historyMaintenanceInterval = setInterval(() => {
  sessions.prune(config.sessionIdleMs);

  if (history.prune()) {
    broadcastSnapshots();
  }
}, config.pingIntervalMs);
historyMaintenanceInterval.unref();

const openAiCompatibleModelRefreshInterval = setInterval(() => {
  void refreshConfiguredOpenAiCompatibleModels().catch((error) => {
    console.warn('Scheduled OpenAI-compatible model refresh failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}, openAiCompatibleModelRefreshIntervalMs);
openAiCompatibleModelRefreshInterval.unref();

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

function createBotRoom(deviceId: string) {
  const device = devices.getById(deviceId);

  if (!device) {
    return {
      ok: false as const,
      code: 'DEVICE_NOT_FOUND' as const,
      message: 'The current device is no longer registered.',
    };
  }

  const room = rooms.createRoom({
    memberIds: [device.deviceId],
    reason: 'bot-chat',
    isPublic: false,
  });

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

    case 'create-bot-room': {
      const result = createBotRoom(activeDeviceId);

      if (!result.ok) {
        emitError(socket, result);
        return deviceId;
      }

      send(socket, {
        type: 'private-room-created',
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
        return deviceId;
      }

      if (event.payload.createNewRoom && !result.room.isPublic) {
        send(socket, {
          type: 'private-room-created',
          payload: {
            roomId: result.room.roomId,
          },
        });
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

    default: {
      emitError(socket, {
        code: 'BAD_EVENT',
        message: 'Unsupported websocket event payload.',
      });
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

    try {
      currentDeviceId = handleEvent(socket, currentDeviceId, event);
    } catch (error) {
      console.warn('Websocket event handling failed', {
        type: event.type,
        deviceId: currentDeviceId,
        message: error instanceof Error ? error.message : String(error),
      });

      emitError(socket, {
        code: 'BAD_EVENT',
        message: 'Unsupported websocket event payload.',
      });
      return;
    }

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
    socket.ping();
  }, config.pingIntervalMs);

  socket.on('close', () => {
    clearInterval(interval);
  });
});

// A signaling server should degrade, not die. Individual request and event
// handlers already guard their own failures; these are the last resort so one
// unhandled throw cannot disconnect every connected device.
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection', {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

httpServer.listen(config.port, config.host, () => {
  console.log(
    `ddzhilian signaling server listening on http://${config.host}:${config.port.toString()}`,
  );
  console.log(`WebSocket endpoint: ${config.publicWsUrl}`);
});
