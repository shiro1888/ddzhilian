// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  imageAssetExtension,
  imageAssetFilename,
  normalizeImageDimensions,
  readImageDimensions,
  readJpegDimensions,
  readPngDimensions,
  readWebpDimensions,
  safeImageAssetSegment,
} from '../server/src/media/image-metadata'

function createPng(width: number, height: number) {
  const bytes = Buffer.alloc(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

function createJpeg(width: number, height: number, marker = 0xc0) {
  // SOI, then one SOF segment carrying the dimensions.
  const segment = Buffer.alloc(11)
  segment.writeUInt16BE(0xff00 | marker, 0)
  segment.writeUInt16BE(8, 2) // segment length
  segment.writeUInt8(8, 4) // precision
  segment.writeUInt16BE(height, 5)
  segment.writeUInt16BE(width, 7)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), segment])
}

function createLossyWebp(width: number, height: number) {
  const bytes = Buffer.alloc(30)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(22, 4)
  bytes.write('WEBP', 8, 'ascii')
  bytes.write('VP8 ', 12, 'ascii')
  bytes.writeUInt32LE(10, 16)
  bytes.writeUInt8(0x9d, 23)
  bytes.writeUInt8(0x01, 24)
  bytes.writeUInt8(0x2a, 25)
  bytes.writeUInt16LE(width, 26)
  bytes.writeUInt16LE(height, 28)
  return bytes
}

describe('safeImageAssetSegment', () => {
  it('replaces unsafe characters', () => {
    expect(safeImageAssetSegment('a/b\\c')).toBe('a_b_c')
    expect(safeImageAssetSegment('user id!')).toBe('user_id_')
  })

  it('never returns a dot-only segment', () => {
    // '.' and '..' survive the character filter and would be joined as a path.
    expect(safeImageAssetSegment('..')).toBe('asset')
    expect(safeImageAssetSegment('.')).toBe('asset')
    expect(safeImageAssetSegment('....')).toBe('asset')
    expect(safeImageAssetSegment('')).toBe('asset')
  })

  it('keeps a normal id and caps the length', () => {
    expect(safeImageAssetSegment('gen_abc-123.png')).toBe('gen_abc-123.png')
    expect(safeImageAssetSegment('x'.repeat(200))).toHaveLength(120)
  })
})

describe('image asset naming', () => {
  it('maps mime types to extensions', () => {
    expect(imageAssetExtension('image/jpeg')).toBe('jpg')
    expect(imageAssetExtension('IMAGE/JPG')).toBe('jpg')
    expect(imageAssetExtension('image/webp')).toBe('webp')
    expect(imageAssetExtension('image/png')).toBe('png')
    expect(imageAssetExtension('application/octet-stream')).toBe('png')
  })

  it('builds an indexed filename', () => {
    expect(imageAssetFilename(0, 'image/png')).toBe('0.png')
    expect(imageAssetFilename(3, 'image/webp')).toBe('3.webp')
  })
})

describe('normalizeImageDimensions', () => {
  it('rejects non-positive and non-integer values', () => {
    expect(normalizeImageDimensions({ width: 10, height: 20 })).toEqual({ width: 10, height: 20 })
    expect(normalizeImageDimensions({ width: 0, height: 20 })).toBeNull()
    expect(normalizeImageDimensions({ width: -1, height: 20 })).toBeNull()
    expect(normalizeImageDimensions({ width: 1.5, height: 20 })).toBeNull()
    expect(normalizeImageDimensions(null)).toBeNull()
  })
})

describe('readPngDimensions', () => {
  it('reads dimensions from a valid header', () => {
    expect(readPngDimensions(createPng(1920, 1080))).toEqual({ width: 1920, height: 1080 })
  })

  it('rejects a truncated buffer', () => {
    expect(readPngDimensions(createPng(10, 10).subarray(0, 20))).toBeNull()
    expect(readPngDimensions(Buffer.alloc(0))).toBeNull()
  })

  it('rejects a wrong signature or missing IHDR', () => {
    const wrongSignature = createPng(10, 10)
    wrongSignature[0] = 0x00
    expect(readPngDimensions(wrongSignature)).toBeNull()

    const wrongChunk = createPng(10, 10)
    wrongChunk.write('IDAT', 12, 'ascii')
    expect(readPngDimensions(wrongChunk)).toBeNull()
  })

  it('rejects a zero dimension', () => {
    expect(readPngDimensions(createPng(0, 100))).toBeNull()
  })
})

describe('readJpegDimensions', () => {
  it('reads dimensions from a baseline SOF0 marker', () => {
    expect(readJpegDimensions(createJpeg(800, 600))).toEqual({ width: 800, height: 600 })
  })

  it('reads dimensions from a progressive SOF2 marker', () => {
    expect(readJpegDimensions(createJpeg(640, 480, 0xc2))).toEqual({ width: 640, height: 480 })
  })

  it('rejects buffers without a JPEG start marker', () => {
    expect(readJpegDimensions(Buffer.from([0x00, 0x00, 0x00]))).toBeNull()
    expect(readJpegDimensions(Buffer.alloc(0))).toBeNull()
  })

  it('rejects a header that is truncated mid-segment', () => {
    expect(readJpegDimensions(createJpeg(800, 600).subarray(0, 6))).toBeNull()
  })
})

describe('readWebpDimensions', () => {
  it('reads dimensions from a lossy VP8 chunk', () => {
    expect(readWebpDimensions(createLossyWebp(320, 240))).toEqual({ width: 320, height: 240 })
  })

  it('rejects a non-WEBP RIFF container', () => {
    const bytes = createLossyWebp(320, 240)
    bytes.write('WAVE', 8, 'ascii')
    expect(readWebpDimensions(bytes)).toBeNull()
  })

  it('rejects a truncated buffer', () => {
    expect(readWebpDimensions(Buffer.alloc(8))).toBeNull()
  })
})

describe('readImageDimensions', () => {
  it('dispatches on mime type', () => {
    expect(readImageDimensions(createPng(4, 5), 'image/png')).toEqual({ width: 4, height: 5 })
    expect(readImageDimensions(createJpeg(6, 7), 'image/jpeg')).toEqual({ width: 6, height: 7 })
    expect(readImageDimensions(createLossyWebp(8, 9), 'image/webp')).toEqual({ width: 8, height: 9 })
  })

  it('returns null when the payload does not match its declared type', () => {
    expect(readImageDimensions(createPng(4, 5), 'image/jpeg')).toBeNull()
  })
})
