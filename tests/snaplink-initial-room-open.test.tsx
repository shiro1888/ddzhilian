import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

describe('SnapLinkStage initial room opening', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('leaves the lobby once a default room becomes available on /text', async () => {
    const { rerender } = render(<SnapLinkStage {...createBaseProps()} />)

    expect(screen.getByText('会话列表')).toBeInTheDocument()

    rerender(
      <SnapLinkStage
        {...createBaseProps({
          selectedRoomId: 'ROOM123',
          selectedConversationName: '世界对话 1',
          activeTransferLabel: '世界对话 1 · 等待连接',
          roomListItems: [
            {
              roomId: 'ROOM123',
              title: '世界对话 1',
              previewText: '[文本] 空消息',
              updatedAt: '2026-06-16T10:00:00.000Z',
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
          unifiedConversationEntries: [
            {
              id: 'entry-1',
              entryType: 'text',
              sessionId: 'session-1',
              fromSelf: false,
              senderName: 'windows-PEER',
              createdAt: '2026-06-16T10:00:00.000Z',
              text: '你好，房间已经打开了',
            },
          ],
        })}
      />,
    )

    await waitFor(() => {
      expect(screen.queryByText('会话列表')).not.toBeInTheDocument()
      expect(screen.getByText('历史内容')).toBeInTheDocument()
      expect(screen.getByText('你好，房间已经打开了')).toBeInTheDocument()
    })
  })
})
