// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseContentRangeHeader, parseRangeHeader } from '../server/src/http/range'

describe('parseRangeHeader', () => {
  it('returns undefined when the header is absent', () => {
    expect(parseRangeHeader(undefined, 1000)).toBeUndefined()
    expect(parseRangeHeader('', 1000)).toBeUndefined()
  })

  it('parses a closed range', () => {
    expect(parseRangeHeader('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRangeHeader('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 })
  })

  it('parses an open-ended range against the file size', () => {
    expect(parseRangeHeader('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
  })

  it('parses a suffix range', () => {
    expect(parseRangeHeader('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
  })

  it('clamps a suffix longer than the file to the whole file', () => {
    expect(parseRangeHeader('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('clamps an end past the last byte', () => {
    expect(parseRangeHeader('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('rejects malformed and unsatisfiable ranges', () => {
    expect(parseRangeHeader('bytes=-', 1000)).toBeNull()
    expect(parseRangeHeader('bytes=abc-def', 1000)).toBeNull()
    expect(parseRangeHeader('items=0-99', 1000)).toBeNull()
    expect(parseRangeHeader('bytes=-0', 1000)).toBeNull()
    // start past EOF, and an inverted range
    expect(parseRangeHeader('bytes=1000-1099', 1000)).toBeNull()
    expect(parseRangeHeader('bytes=200-100', 1000)).toBeNull()
  })

  it('takes the first value of a repeated header', () => {
    expect(parseRangeHeader(['bytes=0-9', 'bytes=50-59'], 1000)).toEqual({ start: 0, end: 9 })
  })
})

describe('parseContentRangeHeader', () => {
  it('returns undefined when the header is absent', () => {
    expect(parseContentRangeHeader(undefined)).toBeUndefined()
  })

  it('parses a well-formed chunk descriptor', () => {
    expect(parseContentRangeHeader('bytes 0-1048575/5242880')).toEqual({
      start: 0,
      end: 1048575,
      total: 5242880,
    })
  })

  it('rejects a range that does not fit its declared total', () => {
    expect(parseContentRangeHeader('bytes 0-100/50')).toBeNull()
    expect(parseContentRangeHeader('bytes 100-0/500')).toBeNull()
    expect(parseContentRangeHeader('bytes 0-0/0')).toBeNull()
  })

  it('rejects malformed descriptors', () => {
    expect(parseContentRangeHeader('bytes 0-100')).toBeNull()
    expect(parseContentRangeHeader('bytes */500')).toBeNull()
    expect(parseContentRangeHeader('0-100/500')).toBeNull()
    expect(parseContentRangeHeader('bytes -1-100/500')).toBeNull()
  })

  it('accepts an enormous but well-formed span', () => {
    // Structurally valid, so the caller — not this parser — must bound the
    // number of bytes it is willing to buffer.
    expect(parseContentRangeHeader('bytes 0-1073741823/2000000000')).toEqual({
      start: 0,
      end: 1073741823,
      total: 2000000000,
    })
  })
})
