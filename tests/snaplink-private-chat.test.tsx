import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

describe('SnapLinkStage private chat entry', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('starts a private chat from an online device', () => {
    const onStartPrivateChat = vi.fn()
    const onOpenRoomConversation = vi.fn()

    const { rerender } = render(
      <SnapLinkStage
        {...createBaseProps({
          onOpenRoomConversation,
          onStartPrivateChat,
          onlineDeviceItems: [
            {
              deviceId: 'device-peer',
              deviceName: 'android-PEER',
              platform: 'android',
              scopeLabel: '局域网',
              lastSeenLabel: '刚刚',
            },
          ],
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '发起私聊 · 1' }))
    fireEvent.click(screen.getByRole('button', { name: /android-PEER/ }))

    expect(onStartPrivateChat).toHaveBeenCalledWith('device-peer')
    expect(screen.getByText('会话列表')).toBeInTheDocument()
    expect(screen.queryByText('历史内容')).not.toBeInTheDocument()

    rerender(
      <SnapLinkStage
        {...createBaseProps({
          onOpenRoomConversation,
          onStartPrivateChat,
          selectedRoomId: 'PRIVATE123',
          autoOpenRoomId: 'PRIVATE123',
          selectedConversationName: 'android-PEER',
          activeTransferLabel: 'android-PEER · 正在连接',
          roomListItems: [
            {
              roomId: 'PRIVATE123',
              title: 'android-PEER',
              previewText: '[文本] 私聊已建立',
              updatedAt: '2026-06-16T10:00:00.000Z',
              updatedAtLabel: '刚刚',
              isPublic: false,
              memberCount: 2,
              onlineCount: 1,
              status: 'connecting',
              pinned: false,
              unreadCount: 0,
            },
          ],
          unifiedConversationEntries: [
            {
              id: 'entry-private',
              entryType: 'text',
              sessionId: 'session-private',
              fromSelf: false,
              senderName: 'android-PEER',
              createdAt: '2026-06-16T10:00:00.000Z',
              text: '私聊已建立',
            },
          ],
          onlineDeviceItems: [
            {
              deviceId: 'device-peer',
              deviceName: 'android-PEER',
              platform: 'android',
              scopeLabel: '局域网',
              lastSeenLabel: '刚刚',
            },
          ],
        })}
      />,
    )

    return waitFor(() => {
      expect(screen.queryByText('会话列表')).not.toBeInTheDocument()
      expect(screen.getByText('历史内容')).toBeInTheDocument()
      expect(screen.getByText('私聊已建立')).toBeInTheDocument()
      expect(onOpenRoomConversation).not.toHaveBeenCalled()
    })
  })

  it('filters online devices before starting a private chat', () => {
    const onStartPrivateChat = vi.fn()

    render(
      <SnapLinkStage
        {...createBaseProps({
          onStartPrivateChat,
          onlineDeviceItems: [
            {
              deviceId: 'device-android',
              deviceName: 'android-PEER',
              platform: 'android',
              scopeLabel: '局域网',
              lastSeenLabel: '刚刚',
            },
            {
              deviceId: 'device-windows',
              deviceName: 'windows-DESK',
              platform: 'windows',
              scopeLabel: '同账号',
              lastSeenLabel: '刚刚',
            },
          ],
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '发起私聊 · 2' }))
    fireEvent.change(screen.getByLabelText('搜索在线设备'), {
      target: { value: 'desk' },
    })

    expect(screen.queryByRole('button', { name: /android-PEER/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /windows-DESK/ }))

    expect(onStartPrivateChat).toHaveBeenCalledWith('device-windows')
  })
})
