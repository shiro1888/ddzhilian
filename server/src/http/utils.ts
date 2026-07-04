import { createReadStream } from 'node:fs';
import type { ServerResponse } from 'node:http';

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large.');
  }
}

export function isLoopbackOrigin(origin: string) {
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

export function isSameHostOrigin(origin: string, host: string | string[] | undefined) {
  const normalizedHost = firstHeaderValue(host)?.trim().toLowerCase();
  if (!normalizedHost) {
    return false;
  }

  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.host.toLowerCase() === normalizedHost
    );
  } catch {
    return false;
  }
}

export async function readRequestBuffer(
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

export function decodeHeaderValue(value: string | string[] | undefined) {
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

export function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function readHeaderString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function writeJson(
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

export function writeRedirect(
  response: ServerResponse,
  location: string,
  statusCode = 303,
) {
  response.writeHead(statusCode, {
    location,
    'cache-control': 'no-store',
  });
  response.end();
}

export function pipeStorageFileResponse(
  response: ServerResponse,
  storagePath: string,
  options?: {
    start?: number;
    end?: number;
    context?: Record<string, unknown>;
  },
) {
  const hasRange = options?.start !== undefined || options?.end !== undefined;
  const stream = hasRange
    ? createReadStream(storagePath, {
        start: options?.start,
        end: options?.end,
      })
    : createReadStream(storagePath);

  stream.on('error', (error) => {
    console.warn('Storage file stream failed', {
      ...options?.context,
      storagePath,
      message: error instanceof Error ? error.message : String(error),
    });

    if (!response.headersSent) {
      writeJson(response, 404, { error: 'File not found.' });
      return;
    }

    if (!response.destroyed) {
      response.destroy(error instanceof Error ? error : undefined);
    }
  });

  stream.pipe(response);
}

export function shouldServeHistoryFileInline(record: { mimeType?: string; fileName: string }) {
  return record.mimeType?.toLowerCase() === 'application/pdf' || record.fileName.toLowerCase().endsWith('.pdf');
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readBearerToken(value: string | string[] | undefined) {
  const headerValue = Array.isArray(value) ? value[0] : value;
  const trimmedValue = headerValue?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(trimmedValue);
  return match?.[1]?.trim();
}

export function parseCookies(value: string | string[] | undefined) {
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

export function resolveRequestBaseUrl(request: {
  headers: {
    host?: string | string[];
    'x-forwarded-proto'?: string | string[];
    'x-forwarded-host'?: string | string[];
  };
}) {
  const forwardedProto = readHeaderString(request.headers['x-forwarded-proto'])
    ?.split(',')[0]
    ?.trim();
  const protocol = forwardedProto || 'http';
  const host = readHeaderString(request.headers['x-forwarded-host'])
    ?.split(',')[0]
    ?.trim() || readHeaderString(request.headers.host)?.trim();

  return host ? `${protocol}://${host}` : '';
}

export function readMultipartBoundary(contentType: string | undefined) {
  const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? '');
  return (match?.[1] ?? match?.[2])?.trim();
}

export function parseContentDisposition(value: string | undefined) {
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

export function parseMultipartHeaders(rawHeaders: string) {
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

export function createCorsHeaderSetter(options: {
  allowedOrigins: readonly string[];
  allowDevLoopback: boolean;
}) {
  return function setCorsHeaders(
    request: {
      headers: {
        host?: string | string[];
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

    if (
      !options.allowedOrigins.includes(origin) &&
      !isSameHostOrigin(origin, request.headers.host) &&
      !(options.allowDevLoopback && isLoopbackOrigin(origin))
    ) {
      return false;
    }

    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization,Content-Range,Content-Type,Range,X-File-Name,X-File-Created-At,X-Session-Id',
    );
    response.setHeader(
      'Access-Control-Expose-Headers',
      'Accept-Ranges,Content-Disposition,Content-Length,Content-Range',
    );

    return true;
  };
}
