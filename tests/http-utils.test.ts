import { describe, expect, it } from 'vitest'
import {
  RequestBodyTooLargeError,
  isLoopbackOrigin,
  isSameHostOrigin,
  parseContentDisposition,
  parseCookies,
  parseRequestUrl,
  readBearerToken,
  readMultipartBoundary,
  readRequestBuffer,
  resolveRequestBaseUrl,
  shouldServeHistoryFileInline,
} from '../server/src/http/utils'

async function* streamOf(...chunks: (Buffer | string)[]) {
  for (const chunk of chunks) {
    yield chunk
  }
}

describe('request URL validation', () => {
  it.each(['%', '%GG', '%E0%A4%A', '%FF'])('rejects malformed path escaping %s before routing', (value) => {
    expect(parseRequestUrl(`/api/history/download/${value}`)).toBeNull()
  })

  it('preserves encoded ids and query strings for the router', () => {
    const url = parseRequestUrl('/api/history/download/a%252Fb?room=ROOM01')
    expect(url?.pathname).toBe('/api/history/download/a%252Fb')
    expect(url?.searchParams.get('room')).toBe('ROOM01')
  })
})

describe('download content handling', () => {
  it('does not treat active HTML or SVG as inline PDF based on the filename', () => {
    expect(shouldServeHistoryFileInline({ fileName: 'document.pdf', mimeType: 'text/html' })).toBe(false)
    expect(shouldServeHistoryFileInline({ fileName: 'document.pdf', mimeType: 'image/svg+xml' })).toBe(false)
    expect(shouldServeHistoryFileInline({ fileName: 'document.pdf', mimeType: 'application/octet-stream' })).toBe(true)
    expect(shouldServeHistoryFileInline({ fileName: 'document', mimeType: 'application/pdf' })).toBe(true)
  })
})

describe('readRequestBuffer', () => {
  it('concatenates chunks into one buffer', async () => {
    const buffer = await readRequestBuffer(streamOf('he', Buffer.from('llo')))

    expect(buffer.toString()).toBe('hello')
  })

  it('throws once the accumulated body exceeds maxBytes', async () => {
    await expect(
      readRequestBuffer(streamOf('a'.repeat(10), 'b'.repeat(10)), { maxBytes: 15 }),
    ).rejects.toBeInstanceOf(RequestBodyTooLargeError)
  })

  it('accepts a body exactly at the limit', async () => {
    const buffer = await readRequestBuffer(streamOf('12345'), { maxBytes: 5 })

    expect(buffer.byteLength).toBe(5)
  })

  it('stops reading as soon as the limit is passed', async () => {
    let consumed = 0
    async function* counted() {
      for (let index = 0; index < 100; index += 1) {
        consumed += 1
        yield 'x'.repeat(10)
      }
    }

    await expect(readRequestBuffer(counted(), { maxBytes: 25 })).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    )
    expect(consumed).toBe(3)
  })
})

describe('parseCookies', () => {
  it('parses and decodes cookie pairs', () => {
    const cookies = parseCookies('a=1; b=hello%20world')

    expect(cookies.get('a')).toBe('1')
    expect(cookies.get('b')).toBe('hello world')
  })

  it('does not throw on a malformed percent escape', () => {
    // An unguarded decodeURIComponent here took the whole process down,
    // because the admin logout route parses cookies before authenticating.
    expect(() => parseCookies('a=%')).not.toThrow()
    expect(parseCookies('a=%').get('a')).toBe('%')
    expect(parseCookies('a=%E0%A4%A; b=2').get('b')).toBe('2')
  })

  it('returns an empty map for a missing header', () => {
    expect(parseCookies(undefined).size).toBe(0)
    expect(parseCookies('').size).toBe(0)
  })

  it('uses the first value of a repeated header', () => {
    expect(parseCookies(['a=1', 'a=2']).get('a')).toBe('1')
  })
})

describe('readBearerToken', () => {
  it('extracts a bearer token case-insensitively', () => {
    expect(readBearerToken('Bearer abc123')).toBe('abc123')
    expect(readBearerToken('bearer abc123')).toBe('abc123')
  })

  it('rejects other schemes and empty values', () => {
    expect(readBearerToken('Basic abc123')).toBeUndefined()
    expect(readBearerToken(undefined)).toBeUndefined()
  })
})

describe('origin checks', () => {
  it('recognizes loopback origins', () => {
    expect(isLoopbackOrigin('http://localhost:3000')).toBe(true)
    expect(isLoopbackOrigin('https://127.0.0.1')).toBe(true)
    expect(isLoopbackOrigin('http://example.com')).toBe(false)
    expect(isLoopbackOrigin('not a url')).toBe(false)
  })

  it('rejects non-http schemes that would otherwise look local', () => {
    expect(isLoopbackOrigin('file://localhost')).toBe(false)
    expect(isLoopbackOrigin('javascript://localhost')).toBe(false)
  })

  it('matches same-host origins including port', () => {
    expect(isSameHostOrigin('https://app.example.com', 'app.example.com')).toBe(true)
    expect(isSameHostOrigin('https://app.example.com:8443', 'app.example.com:8443')).toBe(true)
    expect(isSameHostOrigin('https://app.example.com', 'evil.example.com')).toBe(false)
    expect(isSameHostOrigin('https://app.example.com', undefined)).toBe(false)
  })
})

describe('resolveRequestBaseUrl', () => {
  it('prefers forwarded headers and takes the first hop', () => {
    expect(
      resolveRequestBaseUrl({
        headers: {
          host: 'internal:8787',
          'x-forwarded-proto': 'https, http',
          'x-forwarded-host': 'public.example.com, internal',
        },
      }),
    ).toBe('https://public.example.com')
  })

  it('falls back to host with an http scheme', () => {
    expect(resolveRequestBaseUrl({ headers: { host: 'localhost:8787' } })).toBe(
      'http://localhost:8787',
    )
  })

  it('returns an empty string with no host at all', () => {
    expect(resolveRequestBaseUrl({ headers: {} })).toBe('')
  })
})

describe('multipart header parsing', () => {
  it('reads quoted and unquoted boundaries', () => {
    expect(readMultipartBoundary('multipart/form-data; boundary=abc123')).toBe('abc123')
    expect(readMultipartBoundary('multipart/form-data; boundary="a b c"')).toBe('a b c')
    expect(readMultipartBoundary('application/json')).toBeUndefined()
    expect(readMultipartBoundary(undefined)).toBeUndefined()
  })

  it('reads name and filename from content-disposition', () => {
    expect(parseContentDisposition('form-data; name="file"; filename="a.png"')).toEqual({
      name: 'file',
      filename: 'a.png',
    })
    expect(parseContentDisposition('form-data; name=file')).toEqual({ name: 'file' })
    expect(parseContentDisposition(undefined)).toEqual({})
  })

  it('keeps equals signs inside a quoted filename', () => {
    expect(parseContentDisposition('form-data; name="f"; filename="a=b.png"')).toEqual({
      name: 'f',
      filename: 'a=b.png',
    })
  })
})
