import { cleanup, render, screen } from '@testing-library/react'
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
    onStartOcrJob: vi.fn(async () => ({ jobId: 'ocr-job', status: 'complete' })),
    onListOcrHistory: vi.fn(async () => ({ items: [] })),
    onDeleteOcrHistory: vi.fn(async () => undefined),
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

describe('SnapLinkStage lobby greeting', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the greeting through EncryptedText without changing the accessible heading', () => {
    const { container } = render(<SnapLinkStage {...createBaseProps()} />)
    const greetingText = '你好，我是ddzhilian'

    const heading = screen.getByRole('heading', { name: greetingText })
    expect(heading).toBeInTheDocument()

    const encryptedText = container.querySelector('.dd-snaplink__lobby-type')
    expect(encryptedText).toHaveAttribute('aria-label', greetingText)
    expect(encryptedText).toHaveAttribute('role', 'text')

    const characterSpans = container.querySelectorAll(
      '.dd-snaplink__lobby-encrypted, .dd-snaplink__lobby-revealed',
    )

    expect(characterSpans).toHaveLength(greetingText.length)
    expect(container.querySelector('.dd-snaplink__lobby-cursor')).toHaveAttribute('aria-hidden', 'true')
  })
})
