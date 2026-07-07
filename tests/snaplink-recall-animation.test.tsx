import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SnapLinkStage } from '@/app/components/SnapLinkStage'
import type { SnapLinkStageProps } from '@/app/components/SnapLinkStage'

const noop = vi.fn()

function createBaseProps(overrides: Partial<SnapLinkStageProps> = {}): SnapLinkStageProps {
  return {
    isDragging: false,
    activeView: 'conversation',
    deviceId: 'device-self',
    deviceName: 'windows-SELF',
    selectedRoomId: null,
    selectedConversationName: '设备对话',
    activeTransferLabel: '',
    roomListItems: [],
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

describe('SnapLinkStage recall animation', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers()
    })
    vi.useRealTimers()
    cleanup()
  })

  it('keeps a recalled text bubble long enough to play the dissolve animation', async () => {
    const onRecallText = vi.fn().mockResolvedValue(undefined)
    const baseProps = createBaseProps({
      onRecallText,
      selectedRoomId: 'ROOM123',
      selectedConversationName: '世界对话 1',
      activeTransferLabel: '世界对话 1 · 已连接',
      roomListItems: [
        {
          roomId: 'ROOM123',
          title: '世界对话 1',
          previewText: '[文本] 这条消息将被撤回',
          updatedAt: '2026-06-16T10:00:00.000Z',
          updatedAtLabel: '刚刚',
          isPublic: true,
          publicIndex: 1,
          memberCount: 2,
          onlineCount: 1,
          status: 'connected',
          pinned: false,
          unreadCount: 0,
        },
      ],
      unifiedConversationEntries: [
        {
          id: 'text-1',
          entryType: 'text',
          sessionId: 'session-1',
          fromSelf: true,
          senderName: 'windows-SELF',
          createdAt: '2026-06-16T10:00:00.000Z',
          text: '这条消息将被撤回',
        },
      ],
    })

    const { rerender } = render(<SnapLinkStage {...baseProps} />)

    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })

    fireEvent.click(screen.getByRole('link', { name: /世界对话 1/ }))

    expect(screen.getByText('这条消息将被撤回')).toBeInTheDocument()

    const bubble = screen.getByText('这条消息将被撤回').closest('.dd-snaplink__bubble')
    expect(bubble).not.toBeNull()

    fireEvent.contextMenu(bubble as HTMLDivElement, {
      clientX: 24,
      clientY: 24,
    })
    fireEvent.click(screen.getByRole('menuitem', { name: '撤回' }))

    expect(onRecallText).not.toHaveBeenCalled()
    expect(screen.getByText('这条消息将被撤回').closest('.dd-snaplink__bubble-shell')).toHaveAttribute(
      'data-recall-phase',
      'animating',
    )

    await act(async () => {
      vi.advanceTimersByTime(900)
      await Promise.resolve()
    })

    expect(onRecallText).toHaveBeenCalledWith('text-1')

    rerender(
      <SnapLinkStage
        {...baseProps}
        unifiedConversationEntries={[]}
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryByText('这条消息将被撤回')).not.toBeInTheDocument()
  }, 15000)
})
