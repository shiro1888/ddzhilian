import { describe, expect, it, vi } from 'vitest'

import type { TransferItem } from '../src/lib/ddzhilian-types'
import {
  applyTransferPatch,
  waitForTransferBuffer,
} from '../src/lib/transfer-control'

function createTransfer(overrides: Partial<TransferItem> = {}): TransferItem {
  return {
    id: 'transfer-1',
    historyId: 'history-1',
    fileName: 'archive.zip',
    fileSize: 1024,
    status: 'transferring',
    progress: 0.5,
    sentBytes: 512,
    acknowledgedBytes: 256,
    createdAt: '2026-09-11T08:00:00.000Z',
    ...overrides,
  }
}

function createBufferedChannel() {
  const eventTarget = new EventTarget()
  Object.assign(eventTarget, {
    readyState: 'open',
    bufferedAmount: 10,
    bufferedAmountLowThreshold: 0,
  })
  return eventTarget as unknown as RTCDataChannel
}

describe('transfer cancellation control', () => {
  it('does not allow a stale async patch to revive a cancelled transfer', () => {
    const cancelled = createTransfer({ status: 'cancelled' })

    expect(applyTransferPatch(cancelled, cancelled.id, {
      status: 'transferring',
      sentBytes: 1024,
    })).toBe(cancelled)
    expect(applyTransferPatch(cancelled, cancelled.id, {
      status: 'completed',
      progress: 1,
    })).toBe(cancelled)
  })

  it('still applies normal progress patches before cancellation', () => {
    const active = createTransfer()
    const updated = applyTransferPatch(active, active.id, { sentBytes: 768 })

    expect(updated).not.toBe(active)
    expect(updated.sentBytes).toBe(768)
    expect(updated.status).toBe('transferring')
  })

  it('interrupts a full data-channel buffer as soon as cancellation is requested', async () => {
    const channel = createBufferedChannel()
    const removeEventListener = vi.spyOn(channel, 'removeEventListener')
    const controller = new AbortController()
    const pending = waitForTransferBuffer(channel, {
      signal: controller.signal,
      highWaterMark: 4,
      lowWaterMark: 1,
      timeoutMs: 10_000,
    })

    controller.abort()

    await expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      message: '传输已取消。',
    })
    expect(removeEventListener).toHaveBeenCalledWith('bufferedamountlow', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('close', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('error', expect.any(Function))
  })
})
