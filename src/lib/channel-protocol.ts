import type { ChannelMessage } from './ddzhilian-types'

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

/** A peer's frames are input, not trusted TypeScript values. */
export function parseChannelMessage(raw: string): ChannelMessage | null {
  try {
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const value = data as Record<string, unknown>
    const date = () => typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    if (value.type === 'heartbeat') return date() ? data as ChannelMessage : null
    if (typeof value.id !== 'string' || !value.id.trim()) return null
    let valid = false
    switch (value.type) {
      case 'text': valid = typeof value.text === 'string' && date(); break
      case 'text-recall': valid = date(); break
      case 'file-meta':
        valid = typeof value.name === 'string' && isCount(value.size) &&
          isCount(value.chunkSize) && value.chunkSize > 0 && date() &&
          (value.historyId === undefined || typeof value.historyId === 'string') &&
          (value.mimeType === undefined || typeof value.mimeType === 'string') &&
          (value.requiresAcceptance === undefined || typeof value.requiresAcceptance === 'boolean')
        break
      case 'file-chunk':
      case 'file-chunk-binary':
        valid = isCount(value.index) && isCount(value.total) && value.index < value.total &&
          (value.type === 'file-chunk-binary' || typeof value.data === 'string')
        break
      case 'file-resume': valid = isCount(value.receivedBytes) && isCount(value.nextIndex); break
      case 'file-ack': valid = isCount(value.receivedBytes) && typeof value.completed === 'boolean'; break
      case 'file-cancel':
      case 'file-reject': valid = value.reason === undefined || typeof value.reason === 'string'; break
      case 'file-complete': valid = true; break
    }
    return valid ? data as ChannelMessage : null
  } catch {
    return null
  }
}
