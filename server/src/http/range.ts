/**
 * Range and Content-Range header parsing for resumable history transfers.
 *
 * Pure helpers with no dependency on config or any registry.
 */

export function parseRangeHeader(value: string | string[] | undefined, size: number) {
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

export function parseContentRangeHeader(value: string | string[] | undefined) {
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
