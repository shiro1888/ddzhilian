import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SnapLinkStage } from '@/app/components/SnapLinkStage'
import type { SnapLinkStageProps } from '@/app/components/SnapLinkStage'
import { resolveDocumentPreviewKind } from '@/lib/document-preview'

const noop = vi.fn()

function createBaseProps(overrides: Partial<SnapLinkStageProps> = {}): SnapLinkStageProps {
  return {
    isDragging: false,
    activeView: 'conversation',
    deviceId: 'device-self',
    deviceName: 'windows-SELF',
    selectedRoomId: 'ROOM123',
    selectedConversationName: '世界对话 1',
    activeTransferLabel: '世界对话 1 · 已连接',
    roomListItems: [
      {
        roomId: 'ROOM123',
        title: '世界对话 1',
        previewText: '[文件] report.docx',
        updatedAt: '2026-06-22T08:00:00.000Z',
        updatedAtLabel: '刚刚',
        isPublic: true,
        publicIndex: 1,
        memberCount: 1,
        onlineCount: 0,
        status: 'history',
        pinned: false,
        unreadCount: 0,
      },
    ],
    onlineDeviceItems: [],
    chatDraft: '',
    composerImageDrafts: [],
    fileInputId: 'file-input',
    isSendDisabled: true,
    isAiGenerating: false,
    aiGeneratingRoomId: null,
    aiQuotaLabel: '',
    aiModelOptions: [],
    selectedAiModel: '',
    selectedAiModelLabel: '默认模型',
    unifiedConversationEntries: [],
    fileConversationEmptyState: '暂无内容',
    sharedMediaEntries: [],
    sharedFileEntries: [],
    sharedLinkEntries: [],
    localError: null,
    errorMessage: null,
    aiChatElement: <div>AI</div>,
    imageElement: <div>Image</div>,
    adminElement: <div>Admin</div>,
    commandElement: <div>Command</div>,
    onOpenRoomConversation: noop,
    onStartPrivateChat: noop,
    onDeviceNameChange: noop,
    onOpenRoomHome: noop,
    onOpenAiChatView: noop,
    onOpenCommandView: noop,
    onChatDraftChange: noop,
    onAiModelChange: noop,
    onPastedImageSelection: noop,
    onComposerImageRemove: noop,
    onDirectFileSelection: noop,
    onStartOcrJob: vi.fn(),
    onListOcrHistory: vi.fn(),
    onDeleteOcrHistory: vi.fn(),
    onSendText: noop,
    onRecallText: noop,
    onRecallFile: noop,
    onLoadOlderRoomHistory: noop,
    canRecallAnyMessage: false,
    onRetryTransfer: noop,
    onCancelTransfer: noop,
    onDragEnter: noop,
    onDragOver: noop,
    onDragLeave: noop,
    onDrop: noop,
    ...overrides,
  }
}

function openSelectedConversation() {
  fireEvent.click(screen.getByRole('button', { name: /世界对话 1/ }))
}

describe('SnapLinkStage document preview', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('detects supported document preview kinds from file names and mime types', () => {
    expect(resolveDocumentPreviewKind('application/pdf', 'report')).toBe('pdf')
    expect(resolveDocumentPreviewKind(undefined, 'report.docx')).toBe('docx')
    expect(resolveDocumentPreviewKind(undefined, 'budget.xlsx')).toBe('excel')
    expect(resolveDocumentPreviewKind(undefined, 'deck.pptx')).toBe('pptx')
    expect(resolveDocumentPreviewKind('application/msword', 'legacy.doc')).toBeNull()
  })

  it('opens the document preview flow from a file bubble and shows missing-file errors', async () => {
    const onOpenDocumentPreview = vi.fn().mockRejectedValue(
      new Error('历史文件实体不存在或已被清理，无法预览/下载。'),
    )

    render(
      <SnapLinkStage
        {...createBaseProps({
          unifiedConversationEntries: [
            {
              id: 'file-entry-1',
              entryType: 'file',
              sessionId: 'session-1',
              fromSelf: false,
              senderName: 'Alice',
              createdAt: '2026-06-22T08:00:00.000Z',
              file: {
                id: 'file-1',
                kind: 'incoming',
                fromSelf: false,
                createdAt: '2026-06-22T08:00:00.000Z',
                fileName: 'report.docx',
                fileSize: 1024,
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                subtitle: 'Alice',
                detail: '1 KB · 已接收',
                statusLabel: '已接收',
                tone: 'completed',
                progress: 1,
                documentPreviewKind: 'docx',
                onOpenDocumentPreview,
              },
            },
          ],
        })}
      />,
    )

    openSelectedConversation()
    fireEvent.click(screen.getByRole('button', { name: '预览 report.docx' }))

    expect(onOpenDocumentPreview).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('dialog', { name: 'Word 预览' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('历史文件实体不存在或已被清理，无法预览/下载。')
  })

  it('opens PDF previews with the browser viewer instead of the document dialog', async () => {
    const onOpenDocumentPreview = vi.fn().mockReturnValue({
      kind: 'pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      source: 'blob:http://127.0.0.1:3000/report-pdf',
    })

    render(
      <SnapLinkStage
        {...createBaseProps({
          unifiedConversationEntries: [
            {
              id: 'file-entry-pdf',
              entryType: 'file',
              sessionId: 'session-1',
              fromSelf: false,
              senderName: 'Alice',
              createdAt: '2026-06-22T08:00:00.000Z',
              file: {
                id: 'file-pdf',
                kind: 'incoming',
                fromSelf: false,
                createdAt: '2026-06-22T08:00:00.000Z',
                fileName: 'report.pdf',
                fileSize: 2048,
                mimeType: 'application/pdf',
                subtitle: 'Alice',
                detail: '2 KB · 已接收',
                statusLabel: '已接收',
                tone: 'completed',
                progress: 1,
                documentPreviewKind: 'pdf',
                documentPreviewHref: 'http://127.0.0.1:8787/api/history/download/report',
                onOpenDocumentPreview,
              },
            },
          ],
        })}
      />,
    )

    openSelectedConversation()
    const previewLink = screen.getByRole('link', { name: '预览 report.pdf' })
    expect(previewLink).toHaveAttribute('href', 'http://127.0.0.1:8787/api/history/download/report')
    expect(onOpenDocumentPreview).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'PDF 预览' })).not.toBeInTheDocument()
  })
})
