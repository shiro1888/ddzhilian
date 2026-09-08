import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FileActions } from '@/app/components/FileActions'
import type { FileConversationEntry } from '@/app/types'

function createDummyFileEntry(overrides: Partial<FileConversationEntry> = {}): FileConversationEntry {
  return {
    id: 'file-1',
    fileName: 'design-spec.pdf',
    fileSize: 1024 * 1024 * 2.5,
    subtitle: '张三',
    kind: 'outgoing',
    createdAt: '2026-06-22T08:00:00.000Z',
    detail: '2.5 MB',
    statusLabel: '完成',
    historyId: 'history-123',
    canRecall: true,
    fromSelf: true,
    progress: 1,
    tone: 'completed',
    transferStatus: 'completed',
    ...overrides,
  }
}

describe('FileActions recall confirmation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('does not recall immediately when 撤回 button is clicked, requires confirmation', () => {
    const onRecallFile = vi.fn()
    const file = createDummyFileEntry()

    render(
      <FileActions
        file={file}
        isLoadingPreview={false}
        onOpenDocumentPreview={vi.fn()}
        onRetryTransfer={vi.fn()}
        onCancelTransfer={vi.fn()}
        onRecallFile={onRecallFile}
      />,
    )

    const recallBtn = screen.getByRole('button', { name: /撤回/i })
    expect(recallBtn).toBeInTheDocument()

    // 1. First click: enters confirmation mode, DOES NOT trigger onRecallFile
    fireEvent.click(recallBtn)
    expect(onRecallFile).not.toHaveBeenCalled()

    // 2. Confirm prompt and buttons are visible
    expect(screen.getByText('确定撤回？')).toBeInTheDocument()
    const confirmBtn = screen.getByRole('button', { name: '确认撤回' })
    const cancelBtn = screen.getByRole('button', { name: '取消撤回' })
    expect(confirmBtn).toBeInTheDocument()
    expect(cancelBtn).toBeInTheDocument()

    // 3. Click confirm: triggers onRecallFile
    fireEvent.click(confirmBtn)
    expect(onRecallFile).toHaveBeenCalledTimes(1)
    expect(onRecallFile).toHaveBeenCalledWith(file)

    // After confirm, exits confirmation state
    expect(screen.queryByText('确定撤回？')).not.toBeInTheDocument()
  })

  it('allows canceling recall confirmation without executing recall', () => {
    const onRecallFile = vi.fn()
    const file = createDummyFileEntry()

    render(
      <FileActions
        file={file}
        isLoadingPreview={false}
        onOpenDocumentPreview={vi.fn()}
        onRetryTransfer={vi.fn()}
        onCancelTransfer={vi.fn()}
        onRecallFile={onRecallFile}
      />,
    )

    // Click recall
    fireEvent.click(screen.getByRole('button', { name: /撤回/i }))
    expect(screen.getByText('确定撤回？')).toBeInTheDocument()

    // Click cancel
    fireEvent.click(screen.getByRole('button', { name: '取消撤回' }))
    expect(onRecallFile).not.toHaveBeenCalled()

    // Back to normal recall button
    expect(screen.queryByText('确定撤回？')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /撤回/i })).toBeInTheDocument()
  })

  it('auto-resets confirmation state after timeout', () => {
    const onRecallFile = vi.fn()
    const file = createDummyFileEntry()

    render(
      <FileActions
        file={file}
        isLoadingPreview={false}
        onOpenDocumentPreview={vi.fn()}
        onRetryTransfer={vi.fn()}
        onCancelTransfer={vi.fn()}
        onRecallFile={onRecallFile}
      />,
    )

    // Click recall
    fireEvent.click(screen.getByRole('button', { name: /撤回/i }))
    expect(screen.getByText('确定撤回？')).toBeInTheDocument()

    // Advance timers by 6 seconds with act
    act(() => {
      vi.advanceTimersByTime(6100)
    })

    // Automatically dismissed back to standard recall button
    expect(screen.queryByText('确定撤回？')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /撤回/i })).toBeInTheDocument()
    expect(onRecallFile).not.toHaveBeenCalled()
  })

  it('cancels confirmation on Escape key', () => {
    const onRecallFile = vi.fn()
    const file = createDummyFileEntry()

    render(
      <FileActions
        file={file}
        isLoadingPreview={false}
        onOpenDocumentPreview={vi.fn()}
        onRetryTransfer={vi.fn()}
        onCancelTransfer={vi.fn()}
        onRecallFile={onRecallFile}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /撤回/i }))
    expect(screen.getByText('确定撤回？')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByText('确定撤回？')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /撤回/i })).toBeInTheDocument()
    expect(onRecallFile).not.toHaveBeenCalled()
  })
})
