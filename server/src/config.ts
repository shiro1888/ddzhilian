import 'dotenv/config';

const defaultIceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];

export interface ServerConfig {
  host: string;
  port: number;
  publicWsUrl: string;
  pingIntervalMs: number;
  sessionIdleMs: number;
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

export function loadConfig(): ServerConfig {
  const host = process.env.HOST || '0.0.0.0';
  const port = readNumber('PORT', 8787);
  const publicWsUrl =
    process.env.PUBLIC_WS_URL || `ws://localhost:${port.toString()}/ws`;
  const turnUrls = readTurnUrls();
  const turnUsername = process.env.TURN_USERNAME?.trim();
  const turnCredential = process.env.TURN_CREDENTIAL?.trim();

  return {
    host,
    port,
    publicWsUrl,
    pingIntervalMs: readNumber('PING_INTERVAL_MS', 20_000),
    sessionIdleMs: readNumber('SESSION_IDLE_MS', 120_000),
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
