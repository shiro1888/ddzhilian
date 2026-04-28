import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import type { RoomListItem, UnifiedConversationEntry } from '../types'
import type { AiModelOption } from '../../lib/ddzhilian-types'
import {
  extractPlainTextFromRichText,
  formatFileSize,
  sanitizeBotReplyHtml,
  sanitizeRichTextHtml,
  shouldInsertDivider,
} from '../utils'

type SnapLinkFileEntry = Extract<UnifiedConversationEntry, { entryType: 'file' }>['file']

type BotMentionTriggerRange = {
  start: number
  end: number
}

const snapLinkQuickEmojis = [
  '😀', '😄', '😁', '😂', '🤣', '😊', '🙂', '😉', '😍', '🥰', '😘', '😎',
  '🤔', '🫠', '😴', '😭', '😡', '🥳', '🤯', '😇', '🤖', '👀', '🙌', '👏',
  '👍', '👎', '🙏', '💪', '👋', '🤝', '🎉', '🎊', '✨', '🔥', '⭐', '🌈',
  '☀️', '🌙', '⚡', '🍀', '🍎', '🍕', '☕', '🎵', '🎮', '🏀', '🚀', '❤️',
]

type SnapLinkStageProps = {
  isDragging: boolean
  selectedRoomId: string | null
  selectedConversationName: string
  activeTransferLabel: string
  roomJoinDraft: string
  roomListItems: RoomListItem[]
  chatDraft: string
  fileInputId: string
  isSendDisabled: boolean
  isAiGenerating: boolean
  aiQuotaLabel: string
  aiModelOptions: AiModelOption[]
  selectedAiModel: string
  selectedAiModelLabel: string
  unifiedConversationEntries: UnifiedConversationEntry[]
  fileConversationEmptyState: string
  localError: string | null
  errorMessage: string | null
  onRoomJoinDraftChange: (value: string) => void
  onJoinRoomById: (roomId: string) => void
  onCreatePublicRoom: () => void
  onOpenRoomConversation: (roomId: string) => void
  onCopyPublicRoomLink: (roomId: string) => void
  onChatDraftChange: (value: string) => void
  onAiModelChange: (modelId: string) => void
  onDirectFileSelection: (files: File[]) => void
  onSendText: () => void
  onRetryTransfer: (id: string) => void
  onCancelTransfer: (id: string) => void
  onUseClassicInterface: () => void
  onDragEnter: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

function normalizeRoomDraft(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function normalizePlainComposerDraft(value: string) {
  if (!/[<>]/.test(value)) {
    return value.replace(/\s*\n+\s*/g, ' ')
  }

  return extractPlainTextFromRichText(value).replace(/\s*\n+\s*/g, ' ')
}

function startsWithBotMention(value: string) {
  return /^@bot(?:$|[\s:：,，])/i.test(value.trimStart())
}

function createBotMentionDraft(value: string) {
  if (startsWithBotMention(value)) {
    return value
  }

  const normalizedDraft = value.trimStart()
  return normalizedDraft ? `@bot ${normalizedDraft}` : '@bot '
}

function findBotMentionTriggerStart(value: string, caretPosition: number) {
  const beforeCaret = value.slice(0, caretPosition)
  if (!/(^|\s)@$/.test(beforeCaret)) {
    return null
  }

  return beforeCaret.length - 1
}

function createBotMentionDraftFromTrigger(value: string, triggerRange: BotMentionTriggerRange | null) {
  if (!triggerRange || value.charAt(triggerRange.start) !== '@') {
    return createBotMentionDraft(value)
  }

  const triggerEnd = Math.max(triggerRange.end, triggerRange.start + 1)
  const valueWithoutTrigger = `${value.slice(0, triggerRange.start)}${value.slice(triggerEnd)}`
  return createBotMentionDraft(valueWithoutTrigger)
}

function getFileExtension(fileName: string) {
  const extension = fileName.split('.').pop()
  if (!extension || extension === fileName) {
    return 'FILE'
  }

  return extension.slice(0, 4).toUpperCase()
}

function clampProgress(progress: number) {
  if (!Number.isFinite(progress)) {
    return 0
  }

  return Math.min(Math.max(progress, 0), 1)
}

function formatMessageClock(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

function resolveRoomLabel(room: RoomListItem | undefined, fallbackName: string) {
  if (!room) {
    return fallbackName
  }

  if (room.status === 'connected') {
    return `${room.title} · 已连接`
  }

  if (room.onlineCount > 0) {
    return `${room.title} · ${room.onlineCount} 在线`
  }

  return `${room.title} · 等待连接`
}

function resolveAvatarLabel(senderName: string, fromSelf: boolean) {
  if (fromSelf) {
    return '我'
  }

  const compactName = senderName.replace(/\s+/g, '').trim()
  if (!compactName) {
    return 'TA'
  }

  return Array.from(compactName)[0]?.toUpperCase() ?? 'TA'
}

function isConversationMessageEntry(
  entry: UnifiedConversationEntry | undefined,
): entry is Exclude<UnifiedConversationEntry, { entryType: 'notice' }> {
  return Boolean(entry && entry.entryType !== 'notice')
}

function isBotConversationEntry(entry: Exclude<UnifiedConversationEntry, { entryType: 'notice' }>) {
  return entry.entryType === 'text' && entry.sourceDeviceId === 'bot_cloudflare_ai'
}

function resolveMessageActorKey(entry: Exclude<UnifiedConversationEntry, { entryType: 'notice' }>) {
  if (entry.fromSelf) {
    return 'self'
  }

  if (isBotConversationEntry(entry)) {
    return 'bot'
  }

  return `peer:${entry.senderName.trim() || 'unknown'}`
}

export function SnapLinkStage({
  isDragging,
  selectedRoomId,
  selectedConversationName,
  activeTransferLabel,
  roomJoinDraft,
  roomListItems,
  chatDraft,
  fileInputId,
  isSendDisabled,
  isAiGenerating,
  aiQuotaLabel,
  aiModelOptions,
  selectedAiModel,
  selectedAiModelLabel,
  unifiedConversationEntries,
  fileConversationEmptyState,
  localError,
  errorMessage,
  onRoomJoinDraftChange,
  onJoinRoomById,
  onCreatePublicRoom,
  onOpenRoomConversation,
  onCopyPublicRoomLink,
  onChatDraftChange,
  onAiModelChange,
  onDirectFileSelection,
  onSendText,
  onRetryTransfer,
  onCancelTransfer,
  onUseClassicInterface,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: SnapLinkStageProps) {
  const [isLobbyOpen, setIsLobbyOpen] = useState(false)
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null)
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
  const [isBotPanelOpen, setIsBotPanelOpen] = useState(false)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const botTriggerRef = useRef<HTMLButtonElement | null>(null)
  const botPanelRef = useRef<HTMLDivElement | null>(null)
  const botMentionTriggerRangeRef = useRef<BotMentionTriggerRange | null>(null)
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null)
  const emojiPickerRef = useRef<HTMLDivElement | null>(null)
  const selectedRoom = useMemo(
    () => roomListItems.find((room) => room.roomId === selectedRoomId),
    [roomListItems, selectedRoomId],
  )
  const lobbyRoomListItems = useMemo(
    () =>
      [...roomListItems].sort((left, right) => {
        if (left.isPublic !== right.isPublic) {
          return left.isPublic ? -1 : 1
        }

        if (left.pinned !== right.pinned) {
          return left.pinned ? -1 : 1
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      }),
    [roomListItems],
  )
  const hasActiveRoom = Boolean(selectedRoomId) && !isLobbyOpen
  const plainDraft = normalizePlainComposerDraft(chatDraft)
  const roomStatusLabel = resolveRoomLabel(selectedRoom, activeTransferLabel)
  const isBotDraft = startsWithBotMention(plainDraft)

  useEffect(() => {
    const messages = messagesRef.current
    if (!messages || !hasActiveRoom) {
      return
    }

    messages.scrollTop = messages.scrollHeight
  }, [hasActiveRoom, unifiedConversationEntries.length])

  useEffect(() => {
    if (!isEmojiPickerOpen) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (emojiPickerRef.current?.contains(target) || emojiTriggerRef.current?.contains(target)) {
        return
      }

      setIsEmojiPickerOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsEmojiPickerOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isEmojiPickerOpen])

  useEffect(() => {
    if (!isBotPanelOpen) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (
        botPanelRef.current?.contains(target) ||
        botTriggerRef.current?.contains(target) ||
        inputRef.current?.contains(target)
      ) {
        return
      }

      botMentionTriggerRangeRef.current = null
      setIsBotPanelOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        botMentionTriggerRangeRef.current = null
        setIsBotPanelOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isBotPanelOpen])

  const handleCreateRoom = () => {
    setIsLobbyOpen(false)
    onCreatePublicRoom()
  }

  const handleJoinRoom = () => {
    const nextRoomId = normalizeRoomDraft(roomJoinDraft.trim())
    if (!nextRoomId) {
      onJoinRoomById(nextRoomId)
      return
    }

    setIsLobbyOpen(false)
    onJoinRoomById(nextRoomId)
  }

  const handleRoomSelection = (roomId: string) => {
    if (!roomId) {
      setIsLobbyOpen(true)
      return
    }

    setIsLobbyOpen(false)
    onOpenRoomConversation(roomId)
  }

  const handleCopyRoomId = () => {
    if (!selectedRoomId) {
      return
    }

    setCopiedRoomId(selectedRoomId)
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(selectedRoomId)
    }
    window.setTimeout(() => setCopiedRoomId(null), 1000)
  }

  const handleCopyPublicLink = () => {
    if (!selectedRoomId) {
      return
    }

    onCopyPublicRoomLink(selectedRoomId)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isSendDisabled) {
      setIsEmojiPickerOpen(false)
      setIsBotPanelOpen(false)
      botMentionTriggerRangeRef.current = null
      onSendText()
    }
  }

  const focusComposerInput = (caretPosition: number) => {
    window.requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) {
        return
      }

      input.focus()
      input.setSelectionRange(caretPosition, caretPosition)
    })
  }

  const handleBotTriggerClick = () => {
    botMentionTriggerRangeRef.current = null
    setIsEmojiPickerOpen(false)
    setIsBotPanelOpen(true)
    focusComposerInput(plainDraft.length)
  }

  const handleBotMentionSelect = () => {
    const nextDraft = createBotMentionDraftFromTrigger(plainDraft, botMentionTriggerRangeRef.current)
    onChatDraftChange(nextDraft)
    setIsEmojiPickerOpen(false)
    setIsBotPanelOpen(false)
    botMentionTriggerRangeRef.current = null
    focusComposerInput(nextDraft.length)
  }

  const handleEmojiInsert = (emoji: string) => {
    const input = inputRef.current
    const selectionStart = input?.selectionStart ?? plainDraft.length
    const selectionEnd = input?.selectionEnd ?? plainDraft.length
    const nextDraft = `${plainDraft.slice(0, selectionStart)}${emoji}${plainDraft.slice(selectionEnd)}`
    const nextCaretPosition = selectionStart + emoji.length

    onChatDraftChange(nextDraft)
    setIsEmojiPickerOpen(false)
    setIsBotPanelOpen(false)
    botMentionTriggerRangeRef.current = null
    focusComposerInput(nextCaretPosition)
  }

  const handleDraftChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = event.target.value
    const caretPosition = event.target.selectionStart ?? nextDraft.length
    const triggerStart = findBotMentionTriggerStart(nextDraft, caretPosition)

    onChatDraftChange(nextDraft)

    if (triggerStart !== null) {
      botMentionTriggerRangeRef.current = {
        start: triggerStart,
        end: caretPosition,
      }
      setIsEmojiPickerOpen(false)
      setIsBotPanelOpen(true)
      return
    }

    if (isBotPanelOpen && !startsWithBotMention(nextDraft)) {
      botMentionTriggerRangeRef.current = null
      setIsBotPanelOpen(false)
    }
  }

  const renderFileActions = (file: SnapLinkFileEntry) => {
    if (!file.downloadUrl && !file.onDownload && !file.action) {
      return null
    }

    return (
      <div className="dd-snaplink__file-actions">
        {file.onDownload ? (
          <button type="button" onClick={file.onDownload} disabled={file.isDownloadDisabled}>
            {file.isDownloadDisabled ? '下载中' : '下载'}
          </button>
        ) : null}
        {file.downloadUrl ? (
          <a href={file.downloadUrl} download={file.downloadName}>
            下载
          </a>
        ) : null}
        {file.action === 'retry' ? (
          <button type="button" onClick={() => onRetryTransfer(file.id)}>
            继续
          </button>
        ) : null}
        {file.action === 'cancel' ? (
          <button type="button" onClick={() => onCancelTransfer(file.id)}>
            取消
          </button>
        ) : null}
      </div>
    )
  }

  const renderFileCard = (file: SnapLinkFileEntry) => {
    const progress = clampProgress(file.progress)
    const progressPercent = Math.round(progress * 100)

    return (
      <div className="dd-snaplink__file-card">
        <div className="dd-snaplink__file-top">
          <span className="dd-snaplink__file-ext">{getFileExtension(file.fileName)}</span>
          <div>
            <strong title={file.fileName}>{file.fileName}</strong>
            <span>
              {formatFileSize(file.fileSize)} · {file.statusLabel}
            </span>
          </div>
        </div>
        <div
          className="dd-snaplink__file-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
        >
          <div style={{ width: `${progressPercent}%` }} />
        </div>
        {renderFileActions(file)}
      </div>
    )
  }

  return (
    <section
      className={`dd-snaplink${isDragging ? ' is-dragging' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="dd-snaplink__topbar">
        <div className="dd-snaplink__brand">
          <i aria-hidden="true" />
          <span>ddzhilian</span>
        </div>
        <div className="dd-snaplink__top-actions">
          {roomListItems.length > 0 ? (
            <select
              aria-label="选择对话"
              value={hasActiveRoom ? selectedRoomId ?? '' : ''}
              onChange={(event) => handleRoomSelection(event.target.value)}
            >
              <option value="">大厅</option>
              {roomListItems.map((room) => (
                <option key={room.roomId} value={room.roomId}>
                  {room.title} · {room.roomId}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" onClick={onUseClassicInterface}>
            原界面
          </button>
        </div>
      </header>

      <main className={`dd-snaplink__canvas ${hasActiveRoom ? 'is-room' : 'is-lobby'}`}>
        <div className={`dd-snaplink__app ${hasActiveRoom ? 'is-room' : 'is-lobby'}`}>
          {!hasActiveRoom ? (
            <section className="dd-snaplink__lobby" aria-label="ddzhilian 大厅">
              <h1>ddzhilian</h1>
              <p>创建房间或输入连接码加入</p>
              <button type="button" className="dd-snaplink__create" onClick={handleCreateRoom}>
                创建房间
              </button>
              <div className="dd-snaplink__separator">或输入连接码</div>
              <div className="dd-snaplink__join">
                <input
                  type="text"
                  inputMode="text"
                  placeholder="6 位连接码"
                  value={roomJoinDraft}
                  maxLength={12}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => onRoomJoinDraftChange(normalizeRoomDraft(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleJoinRoom()
                    }
                  }}
                />
                <button type="button" onClick={handleJoinRoom}>
                  加入
                </button>
              </div>
              {(localError || errorMessage) && (
                <div className="dd-snaplink__note is-error">{localError ?? errorMessage}</div>
              )}
              <div className="dd-snaplink__room-list" aria-label="会话列表">
                <div className="dd-snaplink__room-list-head">
                  <span>会话列表</span>
                  <small>{lobbyRoomListItems.length} 个</small>
                </div>
                {lobbyRoomListItems.length > 0 ? (
                  <div className="dd-snaplink__room-list-items">
                    {lobbyRoomListItems.map((room) => (
                      <button
                        key={room.roomId}
                        type="button"
                        className={`dd-snaplink__room-item${room.isPublic ? ' is-public' : ''}`}
                        onClick={() => handleRoomSelection(room.roomId)}
                      >
                        <span className="dd-snaplink__room-item-main">
                          <span className="dd-snaplink__room-item-title">
                            {room.title}
                            {room.isPublic ? <em>公共</em> : null}
                          </span>
                          <span className="dd-snaplink__room-item-preview">{room.previewText}</span>
                        </span>
                        <span className="dd-snaplink__room-item-side">
                          <span>{room.updatedAtLabel}</span>
                          {room.unreadCount > 0 ? (
                            <strong>{room.unreadCount > 99 ? '99+' : room.unreadCount}</strong>
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="dd-snaplink__room-empty">暂无会话</div>
                )}
              </div>
            </section>
          ) : (
            <section className="dd-snaplink__room" aria-label="ddzhilian 对话">
              <div className="dd-snaplink__room-head">
                <div className="dd-snaplink__room-left">
                  <button
                    type="button"
                    className="dd-snaplink__room-code"
                    title="点击复制 roomId"
                    onClick={handleCopyRoomId}
                  >
                    {copiedRoomId === selectedRoomId ? '已复制' : selectedRoomId}
                  </button>
                  <span className="dd-snaplink__status-dot" aria-hidden="true" />
                  <span className="dd-snaplink__peer" title={activeTransferLabel}>
                    {roomStatusLabel || selectedConversationName}
                  </span>
                </div>
                <div className="dd-snaplink__room-actions">
                  {selectedRoom?.isPublic ? (
                    <button type="button" onClick={handleCopyPublicLink}>
                      链接
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setIsLobbyOpen(true)}>
                    离开
                  </button>
                </div>
              </div>

              <div ref={messagesRef} className="dd-snaplink__messages">
                {unifiedConversationEntries.length > 0 ? (
                  unifiedConversationEntries.map((entry, index) => {
                    const previousIso = index > 0 ? unifiedConversationEntries[index - 1].createdAt : null
                    const showDivider = shouldInsertDivider(previousIso, entry.createdAt)

                    if (entry.entryType === 'notice') {
                      return (
                        <div key={entry.id} className="dd-snaplink__system">
                          {entry.text}
                        </div>
                      )
                    }

                    const previousEntry = unifiedConversationEntries[index - 1]
                    const nextEntry = unifiedConversationEntries[index + 1]
                    const isGroupedWithPrevious =
                      isConversationMessageEntry(previousEntry) &&
                      resolveMessageActorKey(previousEntry) === resolveMessageActorKey(entry) &&
                      !showDivider
                    const isGroupedWithNext =
                      isConversationMessageEntry(nextEntry) &&
                      resolveMessageActorKey(nextEntry) === resolveMessageActorKey(entry) &&
                      !shouldInsertDivider(entry.createdAt, nextEntry.createdAt)
                    const isBotMessage = isBotConversationEntry(entry)
                    const rowClassName = [
                      'dd-snaplink__row',
                      entry.fromSelf ? 'is-self' : 'is-peer',
                      isBotMessage ? 'is-bot' : '',
                      isGroupedWithPrevious ? 'is-grouped-with-previous' : '',
                      isGroupedWithNext ? 'is-grouped-with-next' : '',
                    ].filter(Boolean).join(' ')
                    const senderName = entry.senderName.trim() || (entry.fromSelf ? '我' : '对方设备')
                    const displaySenderName = entry.fromSelf ? '我' : isBotMessage ? 'AI' : senderName
                    const avatarLabel = isBotMessage ? 'AI' : resolveAvatarLabel(displaySenderName, entry.fromSelf)
                    const showSenderIdentity = !isGroupedWithPrevious
                    const showMessageTime = !isGroupedWithNext
                    const avatarClassName = [
                      'dd-snaplink__avatar',
                      showSenderIdentity ? '' : 'is-placeholder',
                    ].filter(Boolean).join(' ')

                    return (
                      <div key={entry.id} className="dd-snaplink__entry">
                        <div className={rowClassName}>
                          {!entry.fromSelf ? (
                            <span className={avatarClassName} aria-hidden="true">
                              {avatarLabel}
                            </span>
                          ) : null}
                          <div className="dd-snaplink__message-main">
                            {showSenderIdentity ? (
                              <div className="dd-snaplink__sender-meta">
                                <span className="dd-snaplink__sender-name" title={displaySenderName}>
                                  {displaySenderName}
                                </span>
                                {isBotMessage ? (
                                  <span className="dd-snaplink__sender-tag">AI</span>
                                ) : null}
                              </div>
                            ) : null}
                            {entry.entryType === 'text' ? (
                              <div
                                className="dd-snaplink__bubble"
                                dangerouslySetInnerHTML={{
                                  __html: isBotMessage
                                    ? sanitizeBotReplyHtml(entry.text)
                                    : sanitizeRichTextHtml(entry.text),
                                }}
                              />
                            ) : (
                              renderFileCard(entry.file)
                            )}
                            {showMessageTime ? (
                              <span className="dd-snaplink__message-time">
                                {formatMessageClock(entry.createdAt)}
                              </span>
                            ) : null}
                          </div>
                          {entry.fromSelf ? (
                            <span className={avatarClassName} aria-hidden="true">
                              {avatarLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="dd-snaplink__empty">{fileConversationEmptyState}</div>
                )}
              </div>

              {(localError || errorMessage) && (
                <div className="dd-snaplink__note is-error">{localError ?? errorMessage}</div>
              )}

              <form className="dd-snaplink__compose" onSubmit={handleSubmit}>
                <label className="dd-snaplink__attach" htmlFor={fileInputId} title="发送文件">
                  +
                  <input
                    id={fileInputId}
                    type="file"
                    multiple
                    hidden
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? [])
                      event.target.value = ''
                      onDirectFileSelection(files)
                    }}
                  />
                </label>
                <button
                  ref={botTriggerRef}
                  type="button"
                  className={`dd-snaplink__bot${isBotDraft || isBotPanelOpen ? ' is-active' : ''}`}
                  aria-label="询问 bot"
                  aria-expanded={isBotPanelOpen}
                  aria-haspopup="dialog"
                  title="询问 bot"
                  disabled={isAiGenerating}
                  onClick={handleBotTriggerClick}
                >
                  {isAiGenerating ? '...' : '@'}
                </button>
                {isBotPanelOpen ? (
                  <div
                    ref={botPanelRef}
                    className="dd-snaplink__bot-panel"
                    role="dialog"
                    aria-label="@bot 模型选择"
                  >
                    <button
                      type="button"
                      className="dd-snaplink__bot-option"
                      onClick={handleBotMentionSelect}
                    >
                      <strong>@bot</strong>
                      <span>{selectedAiModelLabel} · {aiQuotaLabel}</span>
                    </button>
                    <label className="dd-snaplink__bot-model">
                      <span>模型</span>
                      <select
                        value={selectedAiModel}
                        disabled={isAiGenerating || aiModelOptions.length === 0}
                        onChange={(event) => onAiModelChange(event.target.value)}
                      >
                        {aiModelOptions.length > 0 ? (
                          aiModelOptions.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}
                            </option>
                          ))
                        ) : (
                          <option value={selectedAiModel}>{selectedAiModelLabel}</option>
                        )}
                      </select>
                    </label>
                  </div>
                ) : null}
                <div className="dd-snaplink__input-wrap">
                  <input
                    ref={inputRef}
                    type="text"
                    value={plainDraft}
                    placeholder="输入消息..."
                    autoComplete="off"
                    onChange={handleDraftChange}
                  />
                  <button
                    ref={emojiTriggerRef}
                    type="button"
                    className={`dd-snaplink__emoji-trigger${isEmojiPickerOpen ? ' is-open' : ''}`}
                    aria-label="选择 emoji"
                    aria-expanded={isEmojiPickerOpen}
                    aria-haspopup="dialog"
                    title="选择 emoji"
                    onClick={() => {
                      setIsBotPanelOpen(false)
                      botMentionTriggerRangeRef.current = null
                      setIsEmojiPickerOpen((previous) => !previous)
                    }}
                  >
                    🙂
                  </button>
                  {isEmojiPickerOpen ? (
                    <div
                      ref={emojiPickerRef}
                      className="dd-snaplink__emoji-picker"
                      role="dialog"
                      aria-label="Emoji 选择器"
                    >
                      {snapLinkQuickEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="dd-snaplink__emoji-item"
                          onClick={() => handleEmojiInsert(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button type="submit" className="dd-snaplink__send" disabled={isSendDisabled} title="发送">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              </form>
            </section>
          )}
        </div>
      </main>
    </section>
  )
}
