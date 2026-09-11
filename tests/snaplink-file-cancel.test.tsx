import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FileActions } from '@/app/components/FileActions'
import type { FileConversationEntry } from '@/app/types'

function createCancellableFile(overrides: Partial<FileConversationEntry> = {}): FileConversationEntry {
  return {
    id: 'transfer-primary',
    fileName: 'archive.zip',
    fileSize: 1024,
    subtitle: '2 台设备',
    kind: 'outgoing',
    createdAt: '2026-09-11T08:00:00.000Z',
    detail: '512 B / 1 KB',
    statusLabel: '传输中',
    fromSelf: true,
    progress: 0.5,
    tone: 'active',
    transferStatus: 'transferring',
    action: 'cancel',
    ...overrides,
  }
}

afterEach(cleanup)

describe('FileActions transfer cancellation', () => {
  it('cancels every active transfer represented by a grouped file card', () => {
    const onCancelTransfer = vi.fn()

    render(
      <FileActions
        file={createCancellableFile({
          cancelTransferIds: ['transfer-a', 'transfer-b', 'transfer-b'],
        })}
        isLoadingPreview={false}
        onOpenDocumentPreview={vi.fn()}
        onRetryTransfer={vi.fn()}
        onCancelTransfer={onCancelTransfer}
        onRecallFile={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(onCancelTransfer).toHaveBeenCalledTimes(2)
    expect(onCancelTransfer).toHaveBeenNthCalledWith(1, 'transfer-a')
    expect(onCancelTransfer).toHaveBeenNthCalledWith(2, 'transfer-b')
  })

  it('falls back to the card id for a single transfer', () => {
    const onCancelTransfer = vi.fn()

    render(
      <FileActions
        file={createCancellableFile()}
        isLoadingPreview={false}
        onOpenDocumentPreview={vi.fn()}
        onRetryTransfer={vi.fn()}
        onCancelTransfer={onCancelTransfer}
        onRecallFile={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(onCancelTransfer).toHaveBeenCalledOnce()
    expect(onCancelTransfer).toHaveBeenCalledWith('transfer-primary')
  })
})
