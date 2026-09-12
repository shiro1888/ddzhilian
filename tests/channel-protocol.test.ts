import { describe, expect, it } from 'vitest'
import { parseChannelMessage } from '../src/lib/channel-protocol'

describe('data channel input validation', () => {
  it.each(['null', '[]', '{}', 'false', '{', JSON.stringify({ type: 'file-meta', id: 'x', size: -1 }),
    JSON.stringify({ type: 'file-ack', id: 'x', receivedBytes: '100', completed: true }),
    JSON.stringify({ type: 'file-resume', id: 'x', receivedBytes: 1, nextIndex: 0.5 })])('rejects malformed frame %s', (raw) => {
    expect(parseChannelMessage(raw)).toBeNull()
  })

  it('accepts valid metadata for large files without imposing a product size limit', () => {
    const frame = { type: 'file-meta', id: 'large', name: 'large.bin', size: 25 * 1024 ** 3,
      chunkSize: 64 * 1024, createdAt: new Date().toISOString(), requiresAcceptance: true }
    expect(parseChannelMessage(JSON.stringify(frame))).toEqual(frame)
  })
})
