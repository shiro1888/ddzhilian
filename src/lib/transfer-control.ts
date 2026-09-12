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

export type TransferReplyWaiter<T> = {
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

export function waitForTransferReply<T>(
  waiters: Map<string, TransferReplyWaiter<T>>,
  id: string,
  options: { channel: RTCDataChannel; signal: AbortSignal; send: () => void; timeoutMs: number; timeoutMessage: string },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      if (waiters.get(id) === waiter) waiters.delete(id)
      window.clearTimeout(timeoutId)
      options.signal.removeEventListener('abort', onAbort)
      options.channel.removeEventListener('close', onClose)
      options.channel.removeEventListener('error', onClose)
    }
    const waiter: TransferReplyWaiter<T> = {
      resolve(value) {
        if (settled) return
        settled = true
        cleanup()
        resolve(value)
      },
      reject(error) {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      },
    }
    const onAbort = () => waiter.reject(createTransferCancelledError())
    const onClose = () => waiter.reject(new Error('数据通道已断开，传输中止。'))
    const timeoutId = window.setTimeout(() => waiter.reject(new Error(options.timeoutMessage)), options.timeoutMs)
    waiters.get(id)?.reject(new Error('传输请求已被替换。'))
    waiters.set(id, waiter)
    options.signal.addEventListener('abort', onAbort, { once: true })
    options.channel.addEventListener('close', onClose)
    options.channel.addEventListener('error', onClose)
    if (options.signal.aborted) {
      onAbort()
      return
    }
    if (options.channel.readyState !== 'open') {
      onClose()
      return
    }
    // Register before sending so even an immediate reply cannot be missed.
    try {
      options.send()
    } catch (error) {
      waiter.reject(error)
    }
  })
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
    } else if (channel.readyState !== 'open') {
      onDead()
    } else if (channel.bufferedAmount <= lowWaterMark) {
      onFlush()
    }
  })
}
