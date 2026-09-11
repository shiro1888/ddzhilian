import type { TransferItem } from './ddzhilian-types'

export const transferCancelledMessage = '传输已取消。'

export function createTransferCancelledError() {
  const error = new Error(transferCancelledMessage)
  error.name = 'AbortError'
  return error
}

export function throwIfTransferAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createTransferCancelledError()
  }
}

export function isTransferCancellation(error: unknown, signal?: AbortSignal) {
  return (
    Boolean(signal?.aborted) ||
    (error instanceof Error &&
      (error.name === 'AbortError' || error.message === transferCancelledMessage))
  )
}

export function applyTransferPatch(
  item: TransferItem,
  transferId: string,
  patch: Partial<TransferItem>,
): TransferItem {
  if (item.id !== transferId) {
    return item
  }

  // Once cancellation wins the race, late progress/ack callbacks must never
  // resurrect the transfer as active or completed.
  if (item.status === 'cancelled' && patch.status !== 'cancelled') {
    return item
  }

  return {
    ...item,
    ...patch,
  }
}

type TransferBufferWaitOptions = {
  signal?: AbortSignal
  highWaterMark?: number
  lowWaterMark?: number
  timeoutMs?: number
}

const defaultHighWaterMark = 4 * 1024 * 1024
const defaultLowWaterMark = 1 * 1024 * 1024
const defaultTimeoutMs = 60_000

export async function waitForTransferBuffer(
  channel: RTCDataChannel,
  options: TransferBufferWaitOptions = {},
) {
  const {
    signal,
    highWaterMark = defaultHighWaterMark,
    lowWaterMark = defaultLowWaterMark,
    timeoutMs = defaultTimeoutMs,
  } = options

  throwIfTransferAborted(signal)

  if (channel.readyState !== 'open') {
    throw new Error('数据通道已断开，传输中止。')
  }

  if (channel.bufferedAmount < highWaterMark) {
    return
  }

  // A channel that dies while its buffer is full never fires
  // 'bufferedamountlow', so settle on every terminal condition. The abort
  // listener also lets a user cancellation interrupt this wait immediately.
  await new Promise<void>((resolve, reject) => {
    channel.bufferedAmountLowThreshold = lowWaterMark

    const cleanup = () => {
      channel.removeEventListener('bufferedamountlow', onFlush)
      channel.removeEventListener('close', onDead)
      channel.removeEventListener('error', onDead)
      signal?.removeEventListener('abort', onAbort)
      window.clearTimeout(timeoutId)
    }

    const onFlush = () => {
      cleanup()
      resolve()
    }

    const onDead = () => {
      cleanup()
      reject(new Error('数据通道已断开，传输中止。'))
    }

    const onAbort = () => {
      cleanup()
      reject(createTransferCancelledError())
    }

    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('等待通道缓冲区释放超时。'))
    }, timeoutMs)

    channel.addEventListener('bufferedamountlow', onFlush)
    channel.addEventListener('close', onDead)
    channel.addEventListener('error', onDead)
    signal?.addEventListener('abort', onAbort, { once: true })

    // Covers an abort that happened between the initial check and listener
    // registration without waiting for the timeout.
    if (signal?.aborted) {
      onAbort()
    }
  })
}
