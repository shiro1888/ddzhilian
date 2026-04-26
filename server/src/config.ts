import 'dotenv/config';

const defaultIceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];
const maxHistoryRetentionMs = 24 * 60 * 60 * 1000;
const defaultCloudflareAiModels = [
  {
    id: '@cf/google/gemma-4-26b-a4b-it',
    label: 'Gemma 4 26B A4B',
  },
  {
    id: '@cf/openai/gpt-oss-120b',
    label: 'GPT-OSS 120B',
  },
];

export type CloudflareAiModelOption = {
  id: string;
  label: string;
};

export interface ServerConfig {
  host: string;
  port: number;
  publicWsUrl: string;
  allowedOrigins: string[];
  debugStateApiEnabled: boolean;
  debugStateApiToken?: string;
  pingIntervalMs: number;
  sessionIdleMs: number;
  roomExitGraceMs: number;
  historyRetentionMs: number;
  historyTextRetentionMs: number;
  historyMaxBytes: number;
  rtcConfig: {
    iceServers: Array<{
      urls: string | string[];
      username?: string;
      credential?: string;
    }>;
  };
  cloudflareAi: {
    accountId?: string;
    apiToken?: string;
    model: string;
    models: CloudflareAiModelOption[];
    maxPromptChars: number;
    maxOutputTokens: number;
    freeOnly: boolean;
    dailyNeuronBudget: number;
    estimatedInputNeuronsPerMillionTokens: number;
    estimatedOutputNeuronsPerMillionTokens: number;
  };
}

function readNumber(name: string, fallback: number) {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function readHistoryRetentionMs(name: string, fallback: number) {
  const value = readNumber(name, fallback);

  if (value <= 0) {
    return fallback;
  }

  return Math.min(value, maxHistoryRetentionMs);
}

function readTurnUrls() {
  const rawMulti = process.env.TURN_URLS?.trim();

  if (rawMulti) {
    return rawMulti
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  const rawSingle = process.env.TURN_URL?.trim();
  return rawSingle ? [rawSingle] : [];
}

function readStringList(name: string) {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function labelFromCloudflareAiModelId(modelId: string) {
  return modelId.split('/').pop() || modelId;
}

function readCloudflareAiModels(defaultModelId: string) {
  const configuredModels = readStringList('CLOUDFLARE_AI_MODELS')
    .map((entry) => {
      const [rawId, rawLabel] = entry.split('|');
      const id = rawId?.trim();

      if (!id) {
        return undefined;
      }

      return {
        id,
        label: rawLabel?.trim() || labelFromCloudflareAiModelId(id),
      };
    })
    .filter((model): model is CloudflareAiModelOption => Boolean(model));
  const models = configuredModels.length > 0
    ? configuredModels
    : defaultCloudflareAiModels;
  const uniqueModels = new Map<string, CloudflareAiModelOption>();

  for (const model of models) {
    uniqueModels.set(model.id, model);
  }

  if (!uniqueModels.has(defaultModelId)) {
    uniqueModels.set(defaultModelId, {
      id: defaultModelId,
      label: labelFromCloudflareAiModelId(defaultModelId),
    });
  }

  return [...uniqueModels.values()];
}

function derivePublicHttpBaseUrl(publicWsUrl: string) {
  try {
    const url = new URL(publicWsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

export function loadConfig(): ServerConfig {
  const host = process.env.HOST || '0.0.0.0';
  const port = readNumber('PORT', 8787);
  const publicWsUrl =
    process.env.PUBLIC_WS_URL || `ws://localhost:${port.toString()}/ws`;
  const allowedOrigins = new Set<string>([
    ...defaultAllowedOrigins,
    ...readStringList('ALLOWED_ORIGINS'),
  ]);
  const publicHttpBaseUrl = derivePublicHttpBaseUrl(publicWsUrl);
  const turnUrls = readTurnUrls();
  const turnUsername = process.env.TURN_USERNAME?.trim();
  const turnCredential = process.env.TURN_CREDENTIAL?.trim();
  const cloudflareAiDefaultModel =
    process.env.CLOUDFLARE_AI_MODEL?.trim() ||
    defaultCloudflareAiModels[0].id;

  if (publicHttpBaseUrl) {
    allowedOrigins.add(publicHttpBaseUrl);
  }

  return {
    host,
    port,
    publicWsUrl,
    allowedOrigins: [...allowedOrigins],
    debugStateApiEnabled: process.env.ENABLE_DEBUG_STATE_API === 'true',
    debugStateApiToken: process.env.DEBUG_STATE_API_TOKEN?.trim() || undefined,
    pingIntervalMs: readNumber('PING_INTERVAL_MS', 20_000),
    sessionIdleMs: readNumber('SESSION_IDLE_MS', 120_000),
    roomExitGraceMs: readNumber('ROOM_EXIT_GRACE_MS', 30 * 60 * 1000),
    historyRetentionMs: readHistoryRetentionMs('HISTORY_RETENTION_MS', 6 * 60 * 60 * 1000),
    historyTextRetentionMs: readHistoryRetentionMs('HISTORY_TEXT_RETENTION_MS', maxHistoryRetentionMs),
    historyMaxBytes: readNumber('HISTORY_MAX_BYTES', 10 * 1024 * 1024 * 1024),
    rtcConfig: {
      iceServers: turnUrls.length > 0
        ? [
            ...defaultIceServers,
            {
              urls: turnUrls,
              username: turnUsername,
              credential: turnCredential,
            },
          ]
        : defaultIceServers,
    },
    cloudflareAi: {
      accountId: process.env.CLOUDFLARE_AI_ACCOUNT_ID?.trim() || undefined,
      apiToken: process.env.CLOUDFLARE_AI_API_TOKEN?.trim() || undefined,
      model: cloudflareAiDefaultModel,
      models: readCloudflareAiModels(cloudflareAiDefaultModel),
      maxPromptChars: Math.max(1, readNumber('CLOUDFLARE_AI_MAX_PROMPT_CHARS', 8000)),
      maxOutputTokens: Math.max(1, readNumber('CLOUDFLARE_AI_MAX_OUTPUT_TOKENS', 1000)),
      freeOnly: process.env.CLOUDFLARE_AI_FREE_ONLY !== 'false',
      dailyNeuronBudget: Math.max(0, readNumber('CLOUDFLARE_AI_DAILY_NEURON_BUDGET', 10_000)),
      estimatedInputNeuronsPerMillionTokens: Math.max(
        1,
        readNumber('CLOUDFLARE_AI_INPUT_NEURONS_PER_M_TOKENS', 4625),
      ),
      estimatedOutputNeuronsPerMillionTokens: Math.max(
        1,
        readNumber('CLOUDFLARE_AI_OUTPUT_NEURONS_PER_M_TOKENS', 30475),
      ),
    },
  };
}
