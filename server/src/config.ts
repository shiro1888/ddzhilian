import 'dotenv/config';

const defaultIceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

export interface ServerConfig {
  host: string;
  port: number;
  publicWsUrl: string;
  allowedOrigins: string[];
  debugStateApiEnabled: boolean;
  debugStateApiToken?: string;
  pingIntervalMs: number;
  sessionIdleMs: number;
  historyRetentionMs: number;
  rtcConfig: {
    iceServers: Array<{
      urls: string | string[];
      username?: string;
      credential?: string;
    }>;
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
    historyRetentionMs: readNumber('HISTORY_RETENTION_MS', 6 * 60 * 60 * 1000),
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
  };
}
