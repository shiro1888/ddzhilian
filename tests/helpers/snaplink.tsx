import { vi } from 'vitest'
import type { SnapLinkStageProps } from '@/app/components/SnapLinkStage'
import type { OcrJobResponse } from '@/lib/ddzhilian-types'

/**
 * Shared SnapLinkStage fixtures.
 *
 * These props were previously copy-pasted into every SnapLinkStage test, which
 * let the fixtures drift out of sync with SnapLinkStageProps unnoticed —
 * tests/ was excluded from every tsconfig. Keep this the single definition so
 * a prop change is a one-file edit.
 */
/**
 * Sets the initial workbench mode for the next render.
 *
 * SnapLinkStage reads its starting mode from sessionStorage
 * (`dd_tool_return_mode`), falling back to the transfer-first devices view.
 * Tests that exercise the messages workbench can call this in beforeEach.
 */
export function setInitialWorkbenchMode(mode: 'rooms' | 'nearby' | 'transfers' | 'files' | 'text' | 'history' | 'settings' | 'workshop') {
  sessionStorage.setItem('dd_tool_return_mode', mode)
}

export function createSnapLinkBaseProps(
  overrides: Partial<SnapLinkStageProps> = {},
): SnapLinkStageProps {
  const noop = vi.fn()

  return {
    isDragging: false,
    activeView: 'conversation',
    deviceId: 'device-self',
    deviceName: 'windows-SELF',
    devicePlatform: 'windows',
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
    onStartOcrJob: vi.fn(
      async (): Promise<OcrJobResponse> => ({ jobId: 'ocr-job', status: 'complete' }),
    ),
    onListOcrHistory: vi.fn(async () => ({ items: [] })),
    onDeleteOcrHistory: vi.fn(async () => undefined),
    onCreatePublicRoom: noop,
    onJoinRoom: noop,
    onUpdateRoomState: noop,
    onDeviceSettingsChange: noop,
    onDevicePreferencesChange: noop,
    onRequestSnapshot: noop,
    onOpenImageView: noop,
    onOpenAdminView: noop,
    onDirectFileSelectionForDevice: noop,
    onDownloadHistoryFile: noop,
    onAcceptIncomingFileOffer: noop,
    onRejectIncomingFileOffer: noop,
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

type RoomListItem = SnapLinkStageProps['roomListItems'][number]

export function createSnapLinkRoom(overrides: Partial<RoomListItem> = {}): RoomListItem {
  return {
    roomId: 'ROOM01',
    title: '公共房间',
    previewText: '',
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAtLabel: '刚刚',
    isPublic: true,
    publicIndex: 1,
    memberCount: 1,
    onlineCount: 0,
    status: 'history',
    pinned: false,
    unreadCount: 0,
    members: [],
    ...overrides,
  }
}
