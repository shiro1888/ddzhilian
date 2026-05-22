import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEvent,
  ClipboardEvent,
  CompositionEvent as ReactCompositionEvent,
  CSSProperties,
  DragEvent,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type {
  ComposerImageDraft,
  FileConversationEntry,
  RoomListItem,
  SharedContentTab,
  UnifiedConversationEntry,
} from '../types'
import type { AiModelOption } from '../../lib/ddzhilian-types'
import {
  extractPlainTextFromRichText,
  formatFileSize,
  openHtmlDocumentFullscreenPreview,
  sanitizeBotReplyHtml,
  sanitizeRichTextHtml,
  shouldInsertDivider,
} from '../utils'

type SnapLinkFileEntry = Extract<UnifiedConversationEntry, { entryType: 'file' }>['file']
type SnapLinkSharedTab = Exclude<SharedContentTab, 'chat'>
type SnapLinkSharedLinkEntry = {
  id: string
  url: string
  label: string
  sourceName: string
  createdAt: string
}
type SnapLinkActiveView = 'conversation' | 'ai-chat' | 'image' | 'admin'

type BotMentionTriggerRange = {
  start: number
  end: number
}

type SnapLinkMessageContextMenuState = {
  entryId: string
  text: string
  senderName: string
  fromSelf: boolean
  isBotMessage: boolean
  left: number
  top: number
}

type SnapLinkQuoteDraftState = {
  senderName: string
  text: string
  html: string
}

type SnapLinkImagePreviewState = {
  src: string
  alt: string
}

const snapLinkQuickEmojis = [
  '😀', '😄', '😁', '😂', '🤣', '😊', '🙂', '😉', '😍', '🥰', '😘', '😎',
  '🤔', '🫠', '😴', '😭', '😡', '🥳', '🤯', '😇', '🤖', '👀', '🙌', '👏',
  '👍', '👎', '🙏', '💪', '👋', '🤝', '🎉', '🎊', '✨', '🔥', '⭐', '🌈',
  '☀️', '🌙', '⚡', '🍀', '🍎', '🍕', '☕', '🎵', '🎮', '🏀', '🚀', '❤️',
]

const snapLinkAiChatSelectionValue = '__snaplink_ai_chat__'
const snapLinkImageSelectionValue = '__snaplink_image__'
const snapLinkComposerMaxHeight = 120
const snapLinkThemeStorageKey = 'ddzhilian:snaplink-theme-colors'
const snapLinkThemeColorPattern = /^#[0-9A-Fa-f]{6}$/
const snapLinkThemeSubmitDebounceMs = 700

type SnapLinkThemeColorTarget = 'self' | 'peer' | 'ai'
type SnapLinkThemeColors = Record<SnapLinkThemeColorTarget, string>
type SnapLinkThemeStyle = CSSProperties & {
  '--snap-theme-self': string
  '--snap-theme-self-text': string
  '--snap-theme-peer': string
  '--snap-theme-peer-text': string
  '--snap-theme-ai': string
  '--snap-theme-ai-text': string
}

const snapLinkDefaultThemeColors: SnapLinkThemeColors = {
  self: '#F9887F',
  peer: '#F5F4F1',
  ai: '#EFF6FF',
}
const snapLinkThemeColorOptions: Array<{ label: string; colors: SnapLinkThemeColors }> = [
  { label: '珊瑚', colors: { self: '#F9887F', peer: '#FFF4F2', ai: '#FFE8E5' } },
  { label: '微信绿', colors: { self: '#95EC69', peer: '#F2F8ED', ai: '#EAF7E1' } },
  { label: '天空蓝', colors: { self: '#6EA8FE', peer: '#F3F7FF', ai: '#EAF2FF' } },
  { label: '青柠', colors: { self: '#B7E36D', peer: '#F6FAEE', ai: '#EEF8D8' } },
  { label: '暖橙', colors: { self: '#F6B35D', peer: '#FFF7ED', ai: '#FFEED8' } },
]

function syncSnapLinkComposerTextAreaHeight(textarea: HTMLTextAreaElement | null) {
  if (!textarea) {
    return
  }

  textarea.style.height = 'auto'
  const nextHeight = Math.min(textarea.scrollHeight, snapLinkComposerMaxHeight)
  textarea.style.height = `${nextHeight.toString()}px`
  textarea.style.overflowY = textarea.scrollHeight > snapLinkComposerMaxHeight ? 'auto' : 'hidden'
}

function normalizeSnapLinkThemeColor(value: string, fallback: string) {
  const normalizedValue = value.trim()
  return snapLinkThemeColorPattern.test(normalizedValue)
    ? normalizedValue.toUpperCase()
    : fallback
}

function normalizeSnapLinkThemeColors(value: Partial<Record<SnapLinkThemeColorTarget, string>>) {
  return {
    self: normalizeSnapLinkThemeColor(value.self ?? '', snapLinkDefaultThemeColors.self),
    peer: normalizeSnapLinkThemeColor(value.peer ?? '', snapLinkDefaultThemeColors.peer),
    ai: normalizeSnapLinkThemeColor(value.ai ?? '', snapLinkDefaultThemeColors.ai),
  }
}

function readStoredSnapLinkThemeColors() {
  if (typeof window === 'undefined') {
    return snapLinkDefaultThemeColors
  }

  try {
    const storedValue = window.localStorage.getItem(snapLinkThemeStorageKey)
    if (!storedValue) {
      return snapLinkDefaultThemeColors
    }

    const parsedValue: unknown = JSON.parse(storedValue)
    if (typeof parsedValue === 'string') {
      return normalizeSnapLinkThemeColors({ self: parsedValue })
    }

    if (parsedValue && typeof parsedValue === 'object') {
      return normalizeSnapLinkThemeColors(parsedValue as Partial<Record<SnapLinkThemeColorTarget, string>>)
    }
  } catch {
    return snapLinkDefaultThemeColors
  }

  return snapLinkDefaultThemeColors
}

function getSnapLinkThemeContrastColor(color: string) {
  const normalizedColor = normalizeSnapLinkThemeColor(color, snapLinkDefaultThemeColors.self)
  const red = Number.parseInt(normalizedColor.slice(1, 3), 16)
  const green = Number.parseInt(normalizedColor.slice(3, 5), 16)
  const blue = Number.parseInt(normalizedColor.slice(5, 7), 16)
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000

  return brightness >= 150 ? '#18181B' : '#FFFFFF'
}

function resolveSnapLinkApiBaseUrl() {
  const env = process.env as Record<string, string | undefined>
  const configuredUrl = env.NEXT_PUBLIC_SIGNALING_HTTP_URL?.trim() || ''

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  if (typeof window === 'undefined') {
    return ''
  }

  const { protocol, hostname, host } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8787'
  }

  return `${protocol}//${host}`
}

type SnapLinkStageProps = {
  isDragging: boolean
  activeView: SnapLinkActiveView
  deviceId?: string
  deviceName: string
  accountId?: string
  selectedRoomId: string | null
  selectedConversationName: string
  activeTransferLabel: string
  roomJoinDraft: string
  roomListItems: RoomListItem[]
  chatDraft: string
  composerImageDrafts: ComposerImageDraft[]
  fileInputId: string
  isSendDisabled: boolean
  isAiGenerating: boolean
  aiQuotaLabel: string
  aiModelOptions: AiModelOption[]
  selectedAiModel: string
  selectedAiModelLabel: string
  unifiedConversationEntries: UnifiedConversationEntry[]
  fileConversationEmptyState: string
  sharedMediaEntries: FileConversationEntry[]
  sharedFileEntries: FileConversationEntry[]
  sharedLinkEntries: SnapLinkSharedLinkEntry[]
  localError: string | null
  errorMessage: string | null
  aiChatElement: ReactNode
  imageElement: ReactNode
  adminElement: ReactNode
  onRoomJoinDraftChange: (value: string) => void
  onJoinRoomById: (roomId: string) => void
  onCreatePublicRoom: () => void
  onOpenRoomConversation: (roomId: string) => void
  onDeviceNameChange: (deviceName: string) => void
  onOpenRoomHome: () => void
  onOpenAiChatView: () => void
  onOpenImageView: () => void
  onChatDraftChange: (value: string) => void
  onAiModelChange: (modelId: string) => void
  onPastedImageSelection: (files: File[]) => void
  onComposerImageRemove: (id: string) => void
  onDirectFileSelection: (files: File[]) => void
  onSendText: (quoteHtml?: string) => void
  onRecallText: (entryId: string) => Promise<void> | void
  onRecallFile: (historyId: string) => Promise<void> | void
  canRecallAnyMessage: boolean
  onRetryTransfer: (id: string) => void
  onCancelTransfer: (id: string) => void
  onDragEnter: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

function normalizeRoomDraft(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function escapeInlineHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function getRichTextPreviewText(value: string) {
  const text = extractPlainTextFromRichText(value)
  if (text) {
    return text
  }

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser()
    const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
    const image = documentFragment.body.querySelector('img[src]')
    if (image) {
      return image.getAttribute('alt')?.trim() || '图片'
    }
  }

  return ''
}

const clipboardBlockTags = new Set(['blockquote', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ol', 'p', 'ul'])

function normalizeClipboardPlainText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u200B/g, '')
    .replace(/\u00a0/g, ' ')
}

function extractClipboardPlainTextFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }

  const element = node as HTMLElement
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'br') {
    return '\n'
  }

  if (tagName === 'img') {
    return element.getAttribute('alt')?.trim() || '图片'
  }

  if (tagName === 'pre') {
    return element.querySelector('code')?.textContent ?? element.textContent ?? ''
  }

  const childText = Array.from(element.childNodes)
    .map((child) => extractClipboardPlainTextFromNode(child))
    .join('')

  if (tagName === 'td' || tagName === 'th') {
    return `${childText}\t`
  }

  if (tagName === 'tr') {
    return `${childText.replace(/\t$/, '')}\n`
  }

  if (clipboardBlockTags.has(tagName)) {
    return `${childText}\n`
  }

  return childText
}

function getRichTextClipboardText(value: string) {
  const fallbackText = normalizeClipboardPlainText(value)
  if (!/[<>]/.test(value) || typeof DOMParser === 'undefined') {
    return fallbackText
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const root = documentFragment.body.firstElementChild
  if (!root) {
    return fallbackText
  }

  return normalizeClipboardPlainText(extractClipboardPlainTextFromNode(root))
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall back to a temporary textarea when clipboard permissions are unavailable.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.setAttribute('readonly', '')
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

async function copyRichTextToClipboard(value: string) {
  const sanitizedHtml = sanitizeRichTextHtml(value)
  const plainText = getRichTextClipboardText(value)

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined' && sanitizedHtml) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([sanitizedHtml], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ])
      return
    } catch {
      // Fall back to text-only clipboard behavior below.
    }
  }

  await copyTextToClipboard(plainText || sanitizedHtml || value)
}

function renderQuoteDraftHtml(quoteDraft: SnapLinkQuoteDraftState) {
  return [
    '<blockquote class="dd-chatbox__quote">',
    `<strong>${escapeInlineHtml(quoteDraft.senderName)}：</strong>`,
    quoteDraft.html,
    '</blockquote>',
  ].join('')
}

function normalizePlainComposerDraft(value: string) {
  if (!/[<>]/.test(value)) {
    return value.replace(/\r\n?/g, '\n')
  }

  return extractPlainTextFromRichText(value).replace(/\s*\n+\s*/g, ' ')
}

function startsWithBotMention(value: string) {
  return /^@(?:ai|bot)(?:$|[\s:：,，])/i.test(value.trimStart())
}

function createBotMentionDraft(value: string) {
  if (startsWithBotMention(value)) {
    return value
  }

  const normalizedDraft = value.trimStart()
  return normalizedDraft ? `@ai ${normalizedDraft}` : '@DD直连小助手 '
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

function isImageFileEntry(file: SnapLinkFileEntry) {
  return Boolean(
    file.mimeType?.toLowerCase().startsWith('image/') ||
    /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(file.fileName),
  )
}

function resolveMediaFileEntryKind(file: FileConversationEntry) {
  const normalizedMimeType = file.mimeType?.toLowerCase() ?? ''
  const normalizedFileName = file.fileName.toLowerCase()

  if (normalizedMimeType.startsWith('image/') || /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(normalizedFileName)) {
    return 'image' as const
  }

  if (normalizedMimeType.startsWith('video/') || /\.(m4v|mov|mp4|ogv|webm)$/i.test(normalizedFileName)) {
    return 'video' as const
  }

  return null
}

function getImageExtensionFromMimeType(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/avif':
      return 'avif'
    case 'image/svg+xml':
      return 'svg'
    default:
      return 'png'
  }
}

function normalizePastedImageFile(file: File, index: number) {
  if (file.name.trim()) {
    return file
  }

  const extension = getImageExtensionFromMimeType(file.type || 'image/png')
  return new File([file], `snaplink-paste-${Date.now().toString()}-${(index + 1).toString()}.${extension}`, {
    type: file.type || 'image/png',
    lastModified: file.lastModified || Date.now(),
  })
}

function getClipboardImageFiles(dataTransfer: DataTransfer) {
  const imageFiles = Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  const files = imageFiles.length > 0
    ? imageFiles
    : Array.from(dataTransfer.files).filter((file) => file.type.startsWith('image/'))

  return files.map(normalizePastedImageFile)
}

function isImageOnlyRichText(value: string) {
  if (!value || typeof DOMParser === 'undefined') {
    return false
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const root = documentFragment.body.firstElementChild
  let imageCount = 0

  if (!root) {
    return false
  }

  const containsOnlyImages = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      return !node.textContent?.trim()
    }

    if (!(node instanceof HTMLElement)) {
      return true
    }

    const tagName = node.tagName.toLowerCase()
    if (tagName === 'img') {
      imageCount += 1
      return true
    }

    if (tagName === 'br') {
      return true
    }

    return Array.from(node.childNodes).every(containsOnlyImages)
  }

  return Array.from(root.childNodes).every(containsOnlyImages) && imageCount > 0
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

const DEVICE_SYSTEM_PREFIXES = new Set(['windows', 'android', 'ios', 'ipad', 'mac', 'linux', 'web'])

function resolveActorIdentity(
  entry: Exclude<UnifiedConversationEntry, { entryType: 'notice' }>,
  isBotMessage: boolean,
) {
  if (isBotMessage) {
    return {
      displayName: 'DD直连小助手',
      title: 'DD直连小助手',
      badgeLabel: 'AI',
      avatarLabel: 'AI',
    }
  }

  const fallbackName = entry.fromSelf ? '我' : '对方设备'
  const rawName = entry.senderName.trim() || fallbackName
  const prefixMatch = rawName.match(/^([a-z]+)-(.+)$/i)
  const systemLabel = prefixMatch?.[1]?.toLowerCase()
  const splitDisplayName =
    systemLabel && DEVICE_SYSTEM_PREFIXES.has(systemLabel)
      ? prefixMatch?.[2]?.trim()
      : undefined
  const displayName = entry.fromSelf ? '我' : splitDisplayName || rawName

  return {
    displayName,
    title: rawName,
    badgeLabel: systemLabel && DEVICE_SYSTEM_PREFIXES.has(systemLabel) ? systemLabel : undefined,
    avatarLabel: resolveAvatarLabel(displayName, entry.fromSelf),
  }
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
  activeView,
  deviceId,
  deviceName,
  accountId,
  selectedRoomId,
  selectedConversationName,
  activeTransferLabel,
  roomJoinDraft,
  roomListItems,
  chatDraft,
  composerImageDrafts,
  fileInputId,
  isSendDisabled,
  isAiGenerating,
  aiQuotaLabel,
  aiModelOptions,
  selectedAiModel,
  selectedAiModelLabel,
  unifiedConversationEntries,
  fileConversationEmptyState,
  sharedMediaEntries,
  sharedFileEntries,
  sharedLinkEntries,
  localError,
  errorMessage,
  aiChatElement,
  imageElement,
  adminElement,
  onRoomJoinDraftChange,
  onJoinRoomById,
  onCreatePublicRoom,
  onOpenRoomConversation,
  onDeviceNameChange,
  onOpenRoomHome,
  onOpenAiChatView,
  onOpenImageView,
  onChatDraftChange,
  onAiModelChange,
  onPastedImageSelection,
  onComposerImageRemove,
  onDirectFileSelection,
  onSendText,
  onRecallText,
  onRecallFile,
  canRecallAnyMessage,
  onRetryTransfer,
  onCancelTransfer,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: SnapLinkStageProps) {
  const [isLobbyOpen, setIsLobbyOpen] = useState(activeView === 'conversation')
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null)
  const [isRenamingDevice, setIsRenamingDevice] = useState(false)
  const [deviceNameDraft, setDeviceNameDraft] = useState('')
  const [deviceNameError, setDeviceNameError] = useState<string | null>(null)
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
  const [isBotPanelOpen, setIsBotPanelOpen] = useState(false)
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false)
  const [themeColors, setThemeColors] = useState<SnapLinkThemeColors>(() => readStoredSnapLinkThemeColors())
  const [messageContextMenu, setMessageContextMenu] = useState<SnapLinkMessageContextMenuState | null>(null)
  const [quoteDraft, setQuoteDraft] = useState<SnapLinkQuoteDraftState | null>(null)
  const [imagePreview, setImagePreview] = useState<SnapLinkImagePreviewState | null>(null)
  const [isImagePreviewZoomed, setIsImagePreviewZoomed] = useState(false)
  const [hiddenTextEntryIds, setHiddenTextEntryIds] = useState<Set<string>>(() => new Set())
  const [activeSharedTab, setActiveSharedTab] = useState<SnapLinkSharedTab | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const isComposerComposingRef = useRef(false)
  const draftValueRef = useRef(normalizePlainComposerDraft(chatDraft))
  const botTriggerRef = useRef<HTMLButtonElement | null>(null)
  const botPanelRef = useRef<HTMLDivElement | null>(null)
  const botMentionTriggerRangeRef = useRef<BotMentionTriggerRange | null>(null)
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null)
  const emojiPickerRef = useRef<HTMLDivElement | null>(null)
  const themeTriggerRef = useRef<HTMLButtonElement | null>(null)
  const themePanelRef = useRef<HTMLDivElement | null>(null)
  const themeSubmissionTimeoutRef = useRef<number | null>(null)
  const selectedRoom = useMemo(
    () => roomListItems.find((room) => room.roomId === selectedRoomId),
    [roomListItems, selectedRoomId],
  )
  const selectedRoomOnlineCount = selectedRoom
    ? Math.min(selectedRoom.memberCount, selectedRoom.onlineCount + 1)
    : 0
  const isAiChatOpen = activeView === 'ai-chat'
  const isImageOpen = activeView === 'image'
  const isAdminOpen = activeView === 'admin'
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
  const hasActiveRoom = Boolean(selectedRoomId) && !isLobbyOpen && !isAiChatOpen && !isImageOpen && !isAdminOpen
  const plainDraft = normalizePlainComposerDraft(chatDraft)
  const effectiveActiveSharedTab = hasActiveRoom ? activeSharedTab : null
  const sharedTabItems: Array<{ id: SnapLinkSharedTab; label: string; count: number }> = [
    { id: 'files', label: '历史文件', count: sharedFileEntries.length },
    { id: 'media', label: '媒体', count: sharedMediaEntries.length },
    { id: 'links', label: '链接', count: sharedLinkEntries.length },
  ]
  const sharedContentCount = sharedTabItems.reduce((total, item) => total + item.count, 0)
  const activeSharedTabItem = sharedTabItems.find((item) => item.id === effectiveActiveSharedTab)

  const roomStatusLabel = resolveRoomLabel(selectedRoom, activeTransferLabel)
  const isBotDraft = startsWithBotMention(plainDraft)
  const themeStyle = useMemo<SnapLinkThemeStyle>(() => ({
    '--snap-theme-self': themeColors.self,
    '--snap-theme-self-text': getSnapLinkThemeContrastColor(themeColors.self),
    '--snap-theme-peer': themeColors.peer,
    '--snap-theme-peer-text': getSnapLinkThemeContrastColor(themeColors.peer),
    '--snap-theme-ai': themeColors.ai,
    '--snap-theme-ai-text': getSnapLinkThemeContrastColor(themeColors.ai),
  }), [themeColors])
  const visibleConversationEntries = useMemo(
    () =>
      unifiedConversationEntries.filter((entry) =>
        !(entry.entryType === 'text' && hiddenTextEntryIds.has(entry.id)),
      ),
    [hiddenTextEntryIds, unifiedConversationEntries],
  )

  useEffect(() => {
    const messages = messagesRef.current
    if (!messages || !hasActiveRoom) {
      return
    }

    messages.scrollTop = messages.scrollHeight
  }, [hasActiveRoom, visibleConversationEntries.length])

  useEffect(() => {
    if (isComposerComposingRef.current) {
      return
    }

    const nextDraft = normalizePlainComposerDraft(chatDraft)
    const input = inputRef.current
    const isInputFocused = document.activeElement === input
    if (isInputFocused && nextDraft && nextDraft !== draftValueRef.current) {
      return
    }

    draftValueRef.current = nextDraft

    if (input && input.value !== nextDraft) {
      input.value = nextDraft
    }

    syncSnapLinkComposerTextAreaHeight(input)
  }, [chatDraft])

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

  useEffect(() => {
    return () => {
      if (themeSubmissionTimeoutRef.current) {
        window.clearTimeout(themeSubmissionTimeoutRef.current)
        themeSubmissionTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!isThemePanelOpen) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (themePanelRef.current?.contains(target) || themeTriggerRef.current?.contains(target)) {
        return
      }

      setIsThemePanelOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsThemePanelOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isThemePanelOpen])

  useEffect(() => {
    if (!messageContextMenu) {
      return undefined
    }

    const closeMessageContextMenu = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.dd-message-menu')) {
        return
      }

      setMessageContextMenu(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMessageContextMenu(null)
      }
    }

    const handleScroll = () => {
      setMessageContextMenu(null)
    }

    window.addEventListener('pointerdown', closeMessageContextMenu)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      window.removeEventListener('pointerdown', closeMessageContextMenu)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [messageContextMenu])

  useEffect(() => {
    if (!imagePreview) {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImagePreview(null)
        setIsImagePreviewZoomed(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [imagePreview])

  const handleCreateRoom = () => {
    setActiveSharedTab(null)
    setIsLobbyOpen(false)
    onOpenRoomHome()
    onCreatePublicRoom()
  }

  const handleOpenAiChat = () => {
    setActiveSharedTab(null)
    setIsLobbyOpen(false)
    onOpenAiChatView()
  }

  const handleOpenImage = () => {
    setActiveSharedTab(null)
    setIsLobbyOpen(false)
    onOpenImageView()
  }

  const submitThemeColors = useCallback((colors: SnapLinkThemeColors) => {
    if (typeof window === 'undefined') {
      return
    }

    if (themeSubmissionTimeoutRef.current) {
      window.clearTimeout(themeSubmissionTimeoutRef.current)
    }

    themeSubmissionTimeoutRef.current = window.setTimeout(() => {
      themeSubmissionTimeoutRef.current = null
      void fetch(`${resolveSnapLinkApiBaseUrl()}/api/snaplink/theme-submissions`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          source: 'snaplink-beta',
          colors,
          deviceId,
          deviceName,
          accountId,
        }),
      }).catch(() => {
        // 配色提交不影响主题即时预览，临时网络失败不打断用户操作。
      })
    }, snapLinkThemeSubmitDebounceMs)
  }, [accountId, deviceId, deviceName])

  const applyThemeColors = (nextColors: SnapLinkThemeColors, options?: { collect?: boolean }) => {
    const normalizedColors = normalizeSnapLinkThemeColors(nextColors)
    setThemeColors(normalizedColors)

    try {
      window.localStorage.setItem(snapLinkThemeStorageKey, JSON.stringify(normalizedColors))
    } catch {
      // Theme selection still applies for the current session when localStorage is unavailable.
    }

    if (options?.collect) {
      submitThemeColors(normalizedColors)
    }
  }

  const updateThemeColor = (target: SnapLinkThemeColorTarget, color: string) => {
    applyThemeColors({
      ...themeColors,
      [target]: normalizeSnapLinkThemeColor(color, themeColors[target]),
    }, { collect: true })
  }

  const resetThemeColors = () => {
    applyThemeColors(snapLinkDefaultThemeColors, { collect: true })
  }

  const toggleThemePanel = () => {
    setIsEmojiPickerOpen(false)
    setIsBotPanelOpen(false)
    botMentionTriggerRangeRef.current = null
    setIsThemePanelOpen((current) => !current)
  }

  const handleJoinRoom = () => {
    const nextRoomId = normalizeRoomDraft(roomJoinDraft.trim())
    if (!nextRoomId) {
      onJoinRoomById(nextRoomId)
      return
    }

    setIsLobbyOpen(false)
    setActiveSharedTab(null)
    onOpenRoomHome()
    onJoinRoomById(nextRoomId)
  }

  const handleRoomSelection = (roomId: string) => {
    if (roomId === snapLinkAiChatSelectionValue) {
      handleOpenAiChat()
      return
    }

    if (roomId === snapLinkImageSelectionValue) {
      handleOpenImage()
      return
    }

    if (!roomId) {
      setActiveSharedTab(null)
      setIsLobbyOpen(true)
      onOpenRoomHome()
      return
    }

    setIsLobbyOpen(false)
    setActiveSharedTab(null)
    onOpenRoomHome()
    onOpenRoomConversation(roomId)
  }

  const startDeviceRename = () => {
    setDeviceNameDraft(deviceName)
    setDeviceNameError(null)
    setIsRenamingDevice(true)
  }

  const cancelDeviceRename = () => {
    setIsRenamingDevice(false)
    setDeviceNameDraft('')
    setDeviceNameError(null)
  }

  const commitDeviceRename = () => {
    const normalizedName = deviceNameDraft.trim()
    if (!normalizedName) {
      setDeviceNameError('设备名不能为空')
      return
    }

    onDeviceNameChange(normalizedName.slice(0, 80))
    cancelDeviceRename()
  }

  const handleBackToLobby = () => {
    setActiveSharedTab(null)
    setIsLobbyOpen(true)
    onOpenRoomHome()
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

  const submitComposerDraft = () => {
    if (isComposerComposingRef.current) {
      return
    }

    if (!isSendDisabled) {
      const quoteHtml = quoteDraft ? renderQuoteDraftHtml(quoteDraft) : undefined
      setIsEmojiPickerOpen(false)
      setIsBotPanelOpen(false)
      setIsThemePanelOpen(false)
      botMentionTriggerRangeRef.current = null
      onSendText(quoteHtml)
      setQuoteDraft(null)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitComposerDraft()
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

  const getComposerDraft = () => inputRef.current?.value ?? draftValueRef.current

  const commitComposerDraft = (nextDraft: string, caretPosition: number) => {
    draftValueRef.current = nextDraft
    onChatDraftChange(nextDraft)

    const triggerStart = findBotMentionTriggerStart(nextDraft, caretPosition)
    if (triggerStart !== null) {
      botMentionTriggerRangeRef.current = {
        start: triggerStart,
        end: caretPosition,
      }
      setIsEmojiPickerOpen(false)
      setIsThemePanelOpen(false)
      setIsBotPanelOpen(true)
      return
    }

    if (isBotPanelOpen && !startsWithBotMention(nextDraft)) {
      botMentionTriggerRangeRef.current = null
      setIsBotPanelOpen(false)
    }
  }

  const handleBotTriggerClick = () => {
    botMentionTriggerRangeRef.current = null
    setIsEmojiPickerOpen(false)
    setIsThemePanelOpen(false)
    setIsBotPanelOpen(true)
    focusComposerInput(getComposerDraft().length)
  }

  const handleBotMentionSelect = () => {
    const nextDraft = createBotMentionDraftFromTrigger(getComposerDraft(), botMentionTriggerRangeRef.current)
    commitComposerDraft(nextDraft, nextDraft.length)
    setIsEmojiPickerOpen(false)
    setIsThemePanelOpen(false)
    setIsBotPanelOpen(false)
    botMentionTriggerRangeRef.current = null
    focusComposerInput(nextDraft.length)
  }

  const handleEmojiInsert = (emoji: string) => {
    const input = inputRef.current
    const currentDraft = getComposerDraft()
    const selectionStart = input?.selectionStart ?? currentDraft.length
    const selectionEnd = input?.selectionEnd ?? currentDraft.length
    const nextDraft = `${currentDraft.slice(0, selectionStart)}${emoji}${currentDraft.slice(selectionEnd)}`
    const nextCaretPosition = selectionStart + emoji.length

    commitComposerDraft(nextDraft, nextCaretPosition)
    setIsEmojiPickerOpen(false)
    setIsBotPanelOpen(false)
    botMentionTriggerRangeRef.current = null
    focusComposerInput(nextCaretPosition)
  }

  const handleDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextDraft = event.target.value
    const caretPosition = event.target.selectionStart ?? nextDraft.length

    draftValueRef.current = nextDraft
    syncSnapLinkComposerTextAreaHeight(event.target)

    if (isComposerComposingRef.current) {
      return
    }

    commitComposerDraft(nextDraft, caretPosition)
  }

  const handleDraftCompositionStart = (event: ReactCompositionEvent<HTMLTextAreaElement>) => {
    isComposerComposingRef.current = true
    draftValueRef.current = event.currentTarget.value
    botMentionTriggerRangeRef.current = null
    setIsBotPanelOpen(false)
  }

  const handleDraftCompositionEnd = (event: ReactCompositionEvent<HTMLTextAreaElement>) => {
    isComposerComposingRef.current = false
    const nextDraft = event.currentTarget.value
    const caretPosition = event.currentTarget.selectionStart ?? nextDraft.length
    commitComposerDraft(nextDraft, caretPosition)
    syncSnapLinkComposerTextAreaHeight(event.currentTarget)
  }

  const handleComposerPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedImageFiles = getClipboardImageFiles(event.clipboardData)
    if (pastedImageFiles.length === 0) {
      return
    }

    event.preventDefault()
    setIsEmojiPickerOpen(false)
    setIsBotPanelOpen(false)
    setIsThemePanelOpen(false)
    botMentionTriggerRangeRef.current = null
    onPastedImageSelection(pastedImageFiles)
  }

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || isComposerComposingRef.current) {
      return
    }

    if (event.key === 'Tab' && isBotPanelOpen) {
      event.preventDefault()
      handleBotMentionSelect()
      return
    }

    if (event.key !== 'Enter') {
      return
    }

    if (isBotPanelOpen) {
      event.preventDefault()
      handleBotMentionSelect()
      return
    }

    if (event.shiftKey) {
      return
    }

    event.preventDefault()
    submitComposerDraft()
  }

  const openImagePreview = (src: string, alt = '图片预览') => {
    if (!src) {
      return
    }

    setIsImagePreviewZoomed(false)
    setImagePreview({ src, alt })
  }

  const closeImagePreview = () => {
    setImagePreview(null)
    setIsImagePreviewZoomed(false)
  }

  const openInlineImageFromTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLImageElement)) {
      return false
    }

    openImagePreview(target.currentSrc || target.src, target.alt || '图片预览')
    return true
  }

  const markCodeCopyButton = (button: HTMLButtonElement) => {
    button.classList.add('is-copied')
    button.textContent = '已复制'

    window.setTimeout(() => {
      button.classList.remove('is-copied')
      button.textContent = '复制'
    }, 1600)
  }

  const handleRichBubbleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target

    if (!(target instanceof HTMLElement)) {
      return
    }

    const fullscreenButton = target.closest<HTMLElement>('.dd-html-document__fullscreen')
    if (fullscreenButton && event.currentTarget.contains(fullscreenButton)) {
      event.preventDefault()
      event.stopPropagation()
      openHtmlDocumentFullscreenPreview(fullscreenButton)
      return
    }

    const copyButton = target.closest<HTMLButtonElement>('.dd-code-copy')
    if (copyButton && event.currentTarget.contains(copyButton)) {
      event.preventDefault()
      event.stopPropagation()

      const codeText = copyButton.closest('pre')?.querySelector('code')?.textContent ?? ''
      if (codeText) {
        void copyTextToClipboard(codeText).then(() => markCodeCopyButton(copyButton))
      }
      return
    }

    if (!openInlineImageFromTarget(target)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
  }

  const openMessageContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    entry: Extract<UnifiedConversationEntry, { entryType: 'text' }>,
    senderName: string,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const menuWidth = 148
    const menuHeight = 156
    const margin = 8
    const isBotMessage = entry.sourceDeviceId === 'bot_cloudflare_ai'
    setMessageContextMenu({
      entryId: entry.id,
      text: entry.text,
      senderName,
      fromSelf: entry.fromSelf,
      isBotMessage,
      left: Math.max(margin, Math.min(event.clientX, window.innerWidth - menuWidth - margin)),
      top: Math.max(margin, Math.min(event.clientY, window.innerHeight - menuHeight - margin)),
    })
  }

  const copyContextMessage = () => {
    if (!messageContextMenu) {
      return
    }

    if (messageContextMenu.text) {
      void copyRichTextToClipboard(messageContextMenu.text)
    }
    setMessageContextMenu(null)
  }

  const quoteContextMessage = () => {
    if (!messageContextMenu) {
      return
    }

    const quoteText = getRichTextPreviewText(messageContextMenu.text)
    const quoteHtml = messageContextMenu.isBotMessage
      ? sanitizeBotReplyHtml(messageContextMenu.text)
      : sanitizeRichTextHtml(messageContextMenu.text)

    if (quoteText) {
      setQuoteDraft({
        senderName: messageContextMenu.senderName,
        text: quoteText,
        html: quoteHtml,
      })
      focusComposerInput(getComposerDraft().length)
    }
    setMessageContextMenu(null)
  }

  const deleteContextMessage = () => {
    if (!messageContextMenu) {
      return
    }

    const deletedEntryId = messageContextMenu.entryId
    setHiddenTextEntryIds((current) => {
      const next = new Set(current)
      next.add(deletedEntryId)
      return next
    })
    setMessageContextMenu(null)
  }

  const recallContextMessage = () => {
    if (!messageContextMenu || (!messageContextMenu.fromSelf && !canRecallAnyMessage)) {
      return
    }

    const recalledEntryId = messageContextMenu.entryId
    setMessageContextMenu(null)
    void Promise.resolve(onRecallText(recalledEntryId)).catch(() => {
      // The parent surface reports the recall failure.
    })
  }

  const recallFileEntry = (file: FileConversationEntry) => {
    if (!file.historyId || !file.canRecall) {
      return
    }

    void Promise.resolve(onRecallFile(file.historyId)).catch(() => {
      // The parent surface reports the recall failure.
    })
  }

  const renderFileActions = (file: SnapLinkFileEntry) => {
    if (!file.downloadUrl && !file.onDownload && !file.action && !file.canRecall) {
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
        {file.historyId && file.canRecall ? (
          <button type="button" className="is-danger" onClick={() => recallFileEntry(file)}>
            撤回
          </button>
        ) : null}
      </div>
    )
  }

  const renderSharedFileActions = (file: FileConversationEntry) => {
    if (!file.downloadUrl && !file.onDownload && !file.canRecall) {
      return null
    }

    return (
      <div className="dd-snaplink__shared-actions">
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
        {file.historyId && file.canRecall ? (
          <button type="button" className="is-danger" onClick={() => recallFileEntry(file)}>
            撤回
          </button>
        ) : null}
      </div>
    )
  }

  const renderSharedFileRow = (file: FileConversationEntry, variant: 'media' | 'file') => {
    const mediaKind = resolveMediaFileEntryKind(file)

    return (
      <article key={file.id} className={`dd-snaplink__shared-row is-${variant}`}>
        {variant === 'media' ? (
          <div className="dd-snaplink__shared-preview">
            {file.previewUrl && mediaKind === 'image' ? (
              <button
                type="button"
                aria-label={`预览图片 ${file.fileName}`}
                onClick={() => openImagePreview(file.previewUrl ?? '', file.fileName)}
              >
                <img src={file.previewUrl} alt={file.fileName} loading="lazy" />
              </button>
            ) : file.previewUrl && mediaKind === 'video' ? (
              <video src={file.previewUrl} controls preload="metadata" />
            ) : (
              <span>{getFileExtension(file.fileName)}</span>
            )}
          </div>
        ) : (
          <span className="dd-snaplink__shared-ext">{getFileExtension(file.fileName)}</span>
        )}
        <div className="dd-snaplink__shared-main">
          <strong title={file.fileName}>{file.fileName}</strong>
          <span>
            {formatFileSize(file.fileSize)} · {file.statusLabel} · {formatMessageClock(file.createdAt)}
          </span>
        </div>
        {renderSharedFileActions(file)}
      </article>
    )
  }

  const renderSharedPanelContent = () => {
    if (effectiveActiveSharedTab === 'files') {
      return sharedFileEntries.length > 0 ? (
        sharedFileEntries.map((file) => renderSharedFileRow(file, 'file'))
      ) : (
        <div className="dd-snaplink__shared-empty">暂无历史文件</div>
      )
    }

    if (effectiveActiveSharedTab === 'media') {
      return sharedMediaEntries.length > 0 ? (
        sharedMediaEntries.map((file) => renderSharedFileRow(file, 'media'))
      ) : (
        <div className="dd-snaplink__shared-empty">暂无媒体</div>
      )
    }

    if (effectiveActiveSharedTab === 'links') {
      return sharedLinkEntries.length > 0 ? (
        sharedLinkEntries.map((entry) => (
          <article key={entry.id} className="dd-snaplink__shared-row is-link">
            <div className="dd-snaplink__shared-main">
              <strong title={entry.label}>{entry.label}</strong>
              <span>{entry.sourceName} · {formatMessageClock(entry.createdAt)}</span>
            </div>
            <a href={entry.url} target="_blank" rel="noreferrer">
              打开
            </a>
          </article>
        ))
      ) : (
        <div className="dd-snaplink__shared-empty">暂无链接</div>
      )
    }

    return null
  }

  const renderThemeColorField = (
    target: SnapLinkThemeColorTarget,
    label: string,
    description: string,
  ) => (
    <label className="dd-snaplink__theme-field">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="color"
        value={themeColors[target]}
        aria-label={`${label}颜色`}
        onChange={(event) => updateThemeColor(target, event.target.value)}
      />
    </label>
  )

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
        {file.previewUrl && isImageFileEntry(file) ? (
          <div className="dd-snaplink__file-preview">
            <img src={file.previewUrl} alt={file.fileName} loading="lazy" />
          </div>
        ) : null}
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
    <>
      <section
        className={`dd-snaplink${isDragging ? ' is-dragging' : ''}`}
        style={themeStyle}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
      <header className="dd-snaplink__topbar">
        <div className="dd-snaplink__top-left">
          <div className="dd-snaplink__brand">
            <i aria-hidden="true" />
            <span>ddzhilian</span>
          </div>
          {isRenamingDevice ? (
            <form
              className="dd-snaplink__device-name-form"
              onSubmit={(event) => {
                event.preventDefault()
                commitDeviceRename()
              }}
            >
              <input
                value={deviceNameDraft}
                autoFocus
                maxLength={80}
                aria-label="设备名"
                onChange={(event) => {
                  setDeviceNameDraft(event.target.value)
                  setDeviceNameError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    cancelDeviceRename()
                  }
                }}
              />
              <button type="submit">保存</button>
              <button type="button" onClick={cancelDeviceRename}>
                取消
              </button>
              {deviceNameError ? <span>{deviceNameError}</span> : null}
            </form>
          ) : (
            <button
              type="button"
              className="dd-snaplink__device-name"
              title="修改设备名"
              onClick={startDeviceRename}
            >
              设备：{deviceName}
            </button>
          )}
        </div>
        <div className="dd-snaplink__top-actions">
          {roomListItems.length > 0 ? (
            <select
              aria-label="选择对话"
              value={
                isImageOpen
                  ? snapLinkImageSelectionValue
                  : isAiChatOpen
                    ? snapLinkAiChatSelectionValue
                      : hasActiveRoom ? selectedRoomId ?? '' : ''
              }
              onChange={(event) => handleRoomSelection(event.target.value)}
            >
              <option value="">大厅</option>
              <option value={snapLinkAiChatSelectionValue}>AI 聊天</option>
              <option value={snapLinkImageSelectionValue}>生图</option>
              {roomListItems.map((room) => (
                <option key={room.roomId} value={room.roomId}>
                  {room.title} · {room.roomId}
                </option>
              ))}
            </select>
          ) : null}
          {hasActiveRoom && selectedRoom ? (
            <span
              className="dd-snaplink__online-count"
              aria-label={`${selectedRoomOnlineCount.toString()} 人在线`}
              title={`${selectedRoomOnlineCount.toString()} 人在线`}
            >
              <span>{selectedRoomOnlineCount}</span>
            </span>
          ) : null}
          <div className="dd-snaplink__theme">
            <button
              ref={themeTriggerRef}
              type="button"
              className={`dd-snaplink__theme-trigger${isThemePanelOpen ? ' is-active' : ''}`}
              aria-label="自定义主题 Beta"
              aria-expanded={isThemePanelOpen}
              aria-haspopup="dialog"
              title="自定义主题 Beta"
              onClick={toggleThemePanel}
            >
              主题
              <span>Beta</span>
            </button>
            {isThemePanelOpen ? (
              <div
                ref={themePanelRef}
                className="dd-snaplink__theme-panel"
                role="dialog"
                aria-label="自定义主题 Beta"
              >
                <div className="dd-snaplink__theme-head">
                  <strong>自定义主题</strong>
                  <span>Beta</span>
                </div>
                <p className="dd-snaplink__theme-notice">
                  Beta 功能：你填写的配色将会被收集，用于改进主题体验。
                </p>
                <div className="dd-snaplink__theme-fields">
                  {renderThemeColorField('self', '发送的信息框', '自己发送的消息气泡')}
                  {renderThemeColorField('peer', '接收的信息框', '其他成员发送的消息气泡')}
                  {renderThemeColorField('ai', 'AI 的信息框', 'DD直连小助手回复气泡')}
                </div>
                <div className="dd-snaplink__theme-presets" aria-label="主题预设">
                  {snapLinkThemeColorOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      className="dd-snaplink__theme-preset"
                      onClick={() => applyThemeColors(option.colors, { collect: true })}
                    >
                      <span className="dd-snaplink__theme-preset-swatches" aria-hidden="true">
                        <i style={{ background: option.colors.self }} />
                        <i style={{ background: option.colors.peer }} />
                        <i style={{ background: option.colors.ai }} />
                      </span>
                      {option.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="dd-snaplink__theme-reset" onClick={resetThemeColors}>
                  恢复默认
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={!isAiChatOpen && !isImageOpen && !isAdminOpen ? 'is-active' : ''}
            onClick={handleBackToLobby}
          >
            对话
          </button>
          <button
            type="button"
            className={isAiChatOpen ? 'is-active' : ''}
            onClick={handleOpenAiChat}
          >
            AI 聊天
          </button>
          <button
            type="button"
            className={isImageOpen ? 'is-active' : ''}
            onClick={handleOpenImage}
          >
            生图
          </button>
        </div>
      </header>

      <main className={`dd-snaplink__canvas ${hasActiveRoom ? 'is-room' : isAiChatOpen ? 'is-ai-chat' : isImageOpen ? 'is-image' : isAdminOpen ? 'is-admin' : 'is-lobby'}`}>
        <div
          className={`dd-snaplink__app ${hasActiveRoom ? 'is-room' : isAiChatOpen ? 'is-ai-chat' : isImageOpen ? 'is-image' : isAdminOpen ? 'is-admin' : 'is-lobby'}`}
          style={isAdminOpen ? { border: 0, borderRadius: 0, background: 'transparent' } : undefined}
        >
          {isAdminOpen ? (
            adminElement
          ) : isImageOpen ? (
            imageElement
          ) : isAiChatOpen ? (
            aiChatElement
          ) : !hasActiveRoom ? (
            <section className="dd-snaplink__lobby" aria-label="ddzhilian 大厅">
              <h1>ddzhilian</h1>
              <p>创建房间或输入连接码加入</p>
              <button type="button" className="dd-snaplink__create" onClick={handleCreateRoom}>
                创建房间
              </button>
              <button
                type="button"
                className="dd-snaplink__create dd-snaplink__create--ai"
                onClick={handleOpenAiChat}
              >
                Chat with AI
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
                  <button
                    type="button"
                    className={effectiveActiveSharedTab ? 'is-active' : ''}
                    aria-expanded={Boolean(effectiveActiveSharedTab)}
                    aria-label="查看历史文件、媒体和链接"
                    onClick={() => setActiveSharedTab((current) => (current ? null : 'files'))}
                  >
                    历史内容
                    {sharedContentCount > 0 ? ` ${sharedContentCount.toString()}` : ''}
                  </button>
                  <button type="button" onClick={() => {
                    setActiveSharedTab(null)
                    setIsLobbyOpen(true)
                  }}>
                    离开
                  </button>
                </div>
              </div>

              {effectiveActiveSharedTab ? (
                <div className="dd-snaplink__shared-panel" aria-label={activeSharedTabItem?.label ?? '历史内容'}>
                  <div className="dd-snaplink__shared-head">
                    <strong>历史内容</strong>
                    <button type="button" onClick={() => setActiveSharedTab(null)}>
                      关闭
                    </button>
                  </div>
                  <div className="dd-snaplink__shared-tabs" role="tablist" aria-label="历史内容分类">
                    {sharedTabItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={effectiveActiveSharedTab === item.id}
                        className={effectiveActiveSharedTab === item.id ? 'is-active' : ''}
                        onClick={() => setActiveSharedTab(item.id)}
                      >
                        {item.label}
                        {item.count > 0 ? ` ${item.count.toString()}` : ''}
                      </button>
                    ))}
                  </div>
                  <div className="dd-snaplink__shared-list">
                    {renderSharedPanelContent()}
                  </div>
                </div>
              ) : null}

              <div ref={messagesRef} className="dd-snaplink__messages">
                {visibleConversationEntries.length > 0 ? (
                  visibleConversationEntries.map((entry, index) => {
                    const previousIso = index > 0 ? visibleConversationEntries[index - 1].createdAt : null
                    const showDivider = shouldInsertDivider(previousIso, entry.createdAt)

                    if (entry.entryType === 'notice') {
                      return (
                        <div key={entry.id} className="dd-snaplink__system">
                          {entry.text}
                        </div>
                      )
                    }

                    const previousEntry = visibleConversationEntries[index - 1]
                    const nextEntry = visibleConversationEntries[index + 1]
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
                    const actorIdentity = resolveActorIdentity(entry, isBotMessage)
                    const showSenderIdentity = !isGroupedWithPrevious
                    const showMessageTime = !isGroupedWithNext
                    const avatarClassName = [
                      'dd-snaplink__avatar',
                      showSenderIdentity ? '' : 'is-placeholder',
                    ].filter(Boolean).join(' ')
                    const isImageOnlyMessage =
                      entry.entryType === 'text' && isImageOnlyRichText(entry.text)

                    return (
                      <div key={entry.id} className="dd-snaplink__entry">
                        <div className={rowClassName}>
                          {!entry.fromSelf ? (
                            <span className={avatarClassName} aria-hidden="true">
                              {actorIdentity.avatarLabel}
                            </span>
                          ) : null}
                          <div className="dd-snaplink__message-main">
                            {showSenderIdentity ? (
                              <div className="dd-snaplink__sender-meta">
                                <span className="dd-snaplink__sender-name" title={actorIdentity.title}>
                                  {actorIdentity.displayName}
                                </span>
                                {actorIdentity.badgeLabel ? (
                                  <span
                                    className={[
                                      'dd-snaplink__sender-badge',
                                      isBotMessage ? 'is-ai' : '',
                                    ].filter(Boolean).join(' ')}
                                  >
                                    {actorIdentity.badgeLabel}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                            {entry.entryType === 'text' ? (
                              <div
                                className={`dd-snaplink__bubble dd-chatbox__bubble--rich${isImageOnlyMessage ? ' is-image-only' : ''}`}
                                onClick={handleRichBubbleClick}
                                onContextMenu={(event) => openMessageContextMenu(event, entry, actorIdentity.displayName)}
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
                              {actorIdentity.avatarLabel}
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

              {quoteDraft ? (
                <div className="dd-snaplink__quote-preview">
                  <div className="dd-snaplink__quote-preview-body">
                    <div className="dd-snaplink__quote-preview-copy">
                      <strong>{quoteDraft.senderName}</strong>
                      <span>{quoteDraft.text}</span>
                    </div>
                    <button
                      type="button"
                      aria-label="取消引用"
                      onClick={() => setQuoteDraft(null)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ) : null}

              {composerImageDrafts.length > 0 ? (
                <div className="dd-snaplink__image-drafts" aria-label="待发送图片">
                  {composerImageDrafts.map((image) => (
                    <figure key={image.id} className="dd-snaplink__image-draft">
                      <img src={image.dataUrl} alt={image.name} />
                      <button
                        type="button"
                        aria-label={`移除 ${image.name}`}
                        onClick={() => onComposerImageRemove(image.id)}
                      >
                        ×
                      </button>
                    </figure>
                  ))}
                </div>
              ) : null}

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
                  aria-label="询问 DD直连小助手"
                  aria-expanded={isBotPanelOpen}
                  aria-haspopup="dialog"
                  title="询问 DD直连小助手"
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
                    aria-label="@Ai 模型选择"
                  >
                    <button
                      type="button"
                      className="dd-snaplink__bot-option"
                      onClick={handleBotMentionSelect}
                    >
                      <strong>@Ai</strong>
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
                  <textarea
                    ref={inputRef}
                    defaultValue={plainDraft}
                    placeholder="输入消息..."
                    autoComplete="off"
                    rows={1}
                    onChange={handleDraftChange}
                    onCompositionStart={handleDraftCompositionStart}
                    onCompositionEnd={handleDraftCompositionEnd}
                    onPaste={handleComposerPaste}
                    onKeyDown={handleComposerKeyDown}
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
                      setIsThemePanelOpen(false)
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
      {imagePreview && createPortal(
        <div
          className={`dd-image-preview-dialog${isImagePreviewZoomed ? ' is-zoomed' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
        >
          <button
            type="button"
            className="dd-image-preview-dialog__backdrop"
            aria-label="关闭图片预览"
            onClick={closeImagePreview}
          />
          <div className="dd-image-preview-dialog__panel">
            <div className="dd-image-preview-dialog__titlebar">
              <span>{imagePreview.alt}</span>
              <button
                type="button"
                className="dd-image-preview-dialog__close"
                aria-label="关闭图片预览"
                onClick={closeImagePreview}
              >
                ×
              </button>
            </div>
            <div className="dd-image-preview-dialog__body">
              <button
                type="button"
                className="dd-image-preview-dialog__image-button"
                aria-label={isImagePreviewZoomed ? '缩小图片' : '放大图片'}
                onClick={() => setIsImagePreviewZoomed((current) => !current)}
              >
                <img src={imagePreview.src} alt={imagePreview.alt} />
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {messageContextMenu && createPortal(
        <div
          className="dd-message-menu"
          role="menu"
          aria-label="消息操作"
          style={{
            left: `${messageContextMenu.left.toString()}px`,
            top: `${messageContextMenu.top.toString()}px`,
          }}
        >
          <button type="button" role="menuitem" onClick={copyContextMessage}>
            复制
          </button>
          <button type="button" role="menuitem" onClick={quoteContextMessage}>
            引用
          </button>
          <button type="button" role="menuitem" className="is-danger" onClick={deleteContextMessage}>
            删除
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!messageContextMenu.fromSelf && !canRecallAnyMessage}
            title={messageContextMenu.fromSelf || canRecallAnyMessage ? '撤回这条消息' : '只能撤回自己发送的消息'}
            onClick={recallContextMessage}
          >
            撤回
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}
