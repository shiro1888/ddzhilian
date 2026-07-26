/**
 * Image asset naming and binary dimension parsing.
 *
 * Pure helpers with no dependency on config or any registry, extracted from
 * index.ts so they can be unit tested against crafted buffers.
 */

export function safeImageAssetSegment(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

  // Dots survive the filter, so '.' and '..' would pass through intact and be
  // joined into a path. No caller can reach this with attacker input today,
  // but the guard costs nothing.
  if (!normalized || /^\.+$/.test(normalized)) {
    return 'asset';
  }

  return normalized;
}

export function imageAssetExtension(mimeType: string) {
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

export type ImageDimensions = {
  width: number;
  height: number;
};

export function isImageDimensionValue(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

export function normalizeImageDimensions(dimensions: ImageDimensions | null) {
  return dimensions &&
    isImageDimensionValue(dimensions.width) &&
    isImageDimensionValue(dimensions.height)
    ? dimensions
    : null;
}

export function readPngDimensions(bytes: Buffer): ImageDimensions | null {
  if (
    bytes.byteLength < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    return null;
  }

  return normalizeImageDimensions({
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  });
}

function isJpegStartOfFrameMarker(marker: number) {
  return marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc;
}

function isJpegStandaloneMarker(marker: number) {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

export function readJpegDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < bytes.byteLength && bytes[offset] === 0xff) {
      offset += 1;
    }

    if (offset >= bytes.byteLength) {
      return null;
    }

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }

    if (isJpegStandaloneMarker(marker)) {
      continue;
    }

    if (offset + 2 > bytes.byteLength) {
      return null;
    }

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      return null;
    }

    if (isJpegStartOfFrameMarker(marker)) {
      if (offset + 7 > bytes.byteLength) {
        return null;
      }

      return normalizeImageDimensions({
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      });
    }

    offset += segmentLength;
  }

  return null;
}

function readUInt24LE(bytes: Buffer, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

export function readWebpDimensions(bytes: Buffer): ImageDimensions | null {
  if (
    bytes.byteLength < 20 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunkType = bytes.toString('ascii', offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > bytes.byteLength) {
      return null;
    }

    if (chunkType === 'VP8X' && chunkSize >= 10) {
      return normalizeImageDimensions({
        width: readUInt24LE(bytes, dataOffset + 4) + 1,
        height: readUInt24LE(bytes, dataOffset + 7) + 1,
      });
    }

    if (chunkType === 'VP8L' && chunkSize >= 5 && bytes[dataOffset] === 0x2f) {
      const byte1 = bytes[dataOffset + 1];
      const byte2 = bytes[dataOffset + 2];
      const byte3 = bytes[dataOffset + 3];
      const byte4 = bytes[dataOffset + 4];
      return normalizeImageDimensions({
        width: ((byte2 & 0x3f) << 8) + byte1 + 1,
        height: ((byte4 & 0x0f) << 10) + (byte3 << 2) + ((byte2 & 0xc0) >> 6) + 1,
      });
    }

    if (
      chunkType === 'VP8 ' &&
      chunkSize >= 10 &&
      bytes[dataOffset + 3] === 0x9d &&
      bytes[dataOffset + 4] === 0x01 &&
      bytes[dataOffset + 5] === 0x2a
    ) {
      return normalizeImageDimensions({
        width: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
      });
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  return null;
}

export function readImageDimensions(bytes: Buffer, mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case 'image/png':
      return readPngDimensions(bytes);
    case 'image/jpeg':
    case 'image/jpg':
      return readJpegDimensions(bytes);
    case 'image/webp':
      return readWebpDimensions(bytes);
    default:
      return readPngDimensions(bytes) ?? readJpegDimensions(bytes) ?? readWebpDimensions(bytes);
  }
}

export function imageAssetFilename(index: number, mimeType: string) {
  return `${index.toString()}.${imageAssetExtension(mimeType)}`;
}

