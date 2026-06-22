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
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { ScanText } from 'lucide-react'
import gsap from 'gsap'
import type {
  ComposerImageDraft,
  FileConversationEntry,
  OnlineDeviceListItem,
  RoomListItem,
  SharedContentTab,
  UnifiedConversationEntry,
} from '../types'
import type { AiModelOption, OcrHistoryResponse, OcrJobResponse } from '../../lib/ddzhilian-types'
import { DocumentPreviewDialog } from './DocumentPreviewDialog'
import type { DocumentPreviewDialogState } from './DocumentPreviewDialog'
import type { DocumentPreviewPayload } from '../../lib/document-preview'
import {
  collectDroppedFiles,
  extractPlainTextFromRichText,
  formatFileSize,
  openHtmlDocumentFullscreenPreview,
  sanitizeBotReplyHtml,
  sanitizeRichTextHtml,
  shouldInsertDivider,
} from '../utils'
import { TextThinkingMatrixLoader } from './TextThinkingMatrixLoader'

type SnapLinkFileEntry = Extract<UnifiedConversationEntry, { entryType: 'file' }>['file']
type SnapLinkTextEntry = Extract<UnifiedConversationEntry, { entryType: 'text' }>
type SnapLinkSharedTab = Exclude<SharedContentTab, 'chat'>
type SnapLinkSharedLinkEntry = {
  id: string
  url: string
  label: string
  sourceName: string
  createdAt: string
}
type SnapLinkActiveView = 'conversation' | 'ai-chat' | 'image' | 'admin' | 'command'

type BotMentionTriggerRange = {
  start: number
  end: number
}

const AI_BOT_MENTION_LABEL = '@DD直连小助手'

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
  originRect?: SnapLinkPreviewOriginRect
}

type SnapLinkPreviewOriginRect = {
  left: number
  top: number
  width: number
  height: number
}

type SnapLinkImagePreviewPan = {
  x: number
  y: number
}

type SnapLinkImagePreviewDragState = {
  pointerId: number
  startClientX: number
  startClientY: number
  startX: number
  startY: number
}

type SnapLinkOcrStatus = 'idle' | 'running' | 'complete' | 'failed'

type SnapLinkOcrImageState = {
  file: File
  name: string
  previewUrl: string
}

const snapLinkQuickEmojis = [
  '😀', '😄', '😁', '😂', '🤣', '😊', '🙂', '😉', '😍', '🥰', '😘', '😎',
  '🤔', '🫠', '😴', '😭', '😡', '🥳', '🤯', '😇', '🤖', '👀', '🙌', '👏',
  '👍', '👎', '🙏', '💪', '👋', '🤝', '🎉', '🎊', '✨', '🔥', '⭐', '🌈',
  '☀️', '🌙', '⚡', '🍀', '🍎', '🍕', '☕', '🎵', '🎮', '🏀', '🚀', '❤️',
]

const snapLinkAiChatSelectionValue = '__snaplink_ai_chat__'
const snapLinkCommandSelectionValue = '__snaplink_command__'
const snapLinkComposerMaxHeight = 120
const snapLinkInitialMessageRenderCount = 80
const snapLinkMessageRenderStep = 80
const snapLinkHistoryLoadThreshold = 72
const snapLinkNewOutgoingEntryAnimationMs = 500
const snapLinkNewOutgoingEntryAnimationCleanupMs = snapLinkNewOutgoingEntryAnimationMs + 150
const snapLinkPendingOutgoingEntryAnimationMs = 12_000
const snapLinkThemeStorageKey = 'ddzhilian:snaplink-theme-colors'
const snapLinkThemeColorPattern = /^#[0-9A-Fa-f]{6}$/
const snapLinkThemeSubmitDebounceMs = 700
const snapLinkLobbyGreetingText = '你好，我是ddzhilian'
const snapLinkImagePreviewOpenDuration = 1
const snapLinkImagePreviewOriginFeedbackDuration = 0.18
const snapLinkImagePreviewCloseDuration = 0.34
const snapLinkImagePreviewZoomScale = 1.85
const snapLinkRecallBurstAnimationMs = 720
const snapLinkRecallBurstAnimationCleanupMs = snapLinkRecallBurstAnimationMs + 120
const snapLinkRecallParticleColumnCount = 18
const snapLinkRecallParticleRowCount = 10
const snapLinkRecallParticleIndexes = Array.from(
  { length: snapLinkRecallParticleColumnCount * snapLinkRecallParticleRowCount },
  (_, index) => index,
)

type SnapLinkRecallingTextEntryState = {
  entry: SnapLinkTextEntry
  phase: 'animating'
}

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

function toSnapLinkPreviewOriginRect(rect: DOMRect): SnapLinkPreviewOriginRect | undefined {
  if (rect.width <= 0 || rect.height <= 0) {
    return undefined
  }

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
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

function formatSnapLinkOcrTime(value: string | undefined) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getSnapLinkOcrStatusLabel(status: SnapLinkOcrStatus) {
  switch (status) {
    case 'running':
      return '识别中'
    case 'complete':
      return '识别完成'
    case 'failed':
      return '识别失败'
    case 'idle':
      return '待识别'
  }
}

function getSnapLinkOcrText(job: OcrJobResponse | null) {
  return job?.text?.trim() ?? ''
}

function isSupportedSnapLinkOcrFile(file: Pick<File, 'name' | 'type'>) {
  const normalizedType = file.type.toLowerCase()
  return (
    ['image/png', 'image/jpeg', 'image/webp'].includes(normalizedType) ||
    /\.(png|jpe?g|webp)$/i.test(file.name)
  )
}

function hasSnapLinkDraggedFiles(event: DragEvent<HTMLElement>) {
  return event.dataTransfer.files.length > 0 || Array.from(event.dataTransfer.types).includes('Files')
}

function getSnapLinkOcrHistorySummary(job: OcrJobResponse) {
  const text = getSnapLinkOcrText(job) || job.error || '无文字结果'
  return text.replace(/\s+/g, ' ').slice(0, 80)
}

export type SnapLinkStageProps = {
  isDragging: boolean
  activeView: SnapLinkActiveView
  deviceId?: string
  deviceName: string
  accountId?: string
  selectedRoomId: string | null
  autoOpenRoomId?: string | null
  selectedConversationName: string
  activeTransferLabel: string
  roomListItems: RoomListItem[]
  onlineDeviceItems: OnlineDeviceListItem[]
  chatDraft: string
  composerImageDrafts: ComposerImageDraft[]
  fileInputId: string
  isSendDisabled: boolean
  isAiGenerating: boolean
  aiGeneratingRoomId: string | null
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
  commandElement: ReactNode
  onOpenRoomConversation: (roomId: string) => void
  onStartPrivateChat: (deviceId: string) => void
  onDeviceNameChange: (deviceName: string) => void
  onOpenRoomHome: () => void
  onOpenAiChatView: () => void
  onOpenCommandView: () => void
  onChatDraftChange: (value: string) => void
  onAiModelChange: (modelId: string) => void
  onPastedImageSelection: (files: File[]) => void
  onComposerImageRemove: (id: string) => void
  onDirectFileSelection: (files: File[]) => void
  onStartOcrJob: (file: File) => Promise<OcrJobResponse>
  onListOcrHistory: () => Promise<OcrHistoryResponse>
  onDeleteOcrHistory: (jobId: string) => Promise<void>
  onSendText: (quoteHtml?: string) => void
  onRecallText: (entryId: string) => Promise<void> | void
  onRecallFile: (historyId: string) => Promise<void> | void
  onLoadOlderRoomHistory: (roomId: string) => void
  canRecallAnyMessage: boolean
  onRetryTransfer: (id: string) => void
  onCancelTransfer: (id: string) => void
  onDragEnter: (event: DragEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
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

function createNativePdfPreviewUrl(payload: DocumentPreviewPayload) {
  if (typeof payload.source === 'string') {
    return payload.source
  }

  const blob = payload.source instanceof Blob
    ? payload.source
    : new Blob([payload.source], { type: payload.mimeType || 'application/pdf' })
  return URL.createObjectURL(blob)
}

function normalizePlainComposerDraft(value: string) {
  if (!/[<>]/.test(value)) {
    return value.replace(/\r\n?/g, '\n')
  }

  return extractPlainTextFromRichText(value).replace(/\s*\n+\s*/g, ' ')
}

function startsWithBotMention(value: string) {
  return /^@(?:DD直连小助手|ai|bot)(?:$|[\s:：,，])/i.test(value.trimStart())
}

function createBotMentionDraft(value: string) {
  if (startsWithBotMention(value)) {
    return value
  }

  const normalizedDraft = value.trimStart()
  return normalizedDraft ? `${AI_BOT_MENTION_LABEL} ${normalizedDraft}` : `${AI_BOT_MENTION_LABEL} `
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

function isClipboardImageFile(file: File) {
  const normalizedMimeType = file.type.toLowerCase()
  const normalizedName = file.name.toLowerCase()

  return normalizedMimeType.startsWith('image/') || /\.(avif|bmp|gif|heic|jpe?g|png|svg|tiff?|webp)$/i.test(normalizedName)
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

function normalizePastedClipboardFile(file: File, index: number) {
  return isClipboardImageFile(file) ? normalizePastedImageFile(file, index) : file
}

function getClipboardFiles(dataTransfer: DataTransfer) {
  const itemFiles = Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  const files = itemFiles.length > 0
    ? itemFiles
    : Array.from(dataTransfer.files)

  return files.map(normalizePastedClipboardFile)
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

function getAiModelOptionValue(option: AiModelOption) {
  return option.value ?? (option.provider ? `${option.provider}::${option.id}` : option.id)
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

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function getSnapLinkRecallParticleStyle(index: number): CSSProperties {
  const column = index % snapLinkRecallParticleColumnCount
  const row = Math.floor(index / snapLinkRecallParticleColumnCount)
  const columnProgress = column / Math.max(1, snapLinkRecallParticleColumnCount - 1)
  const rowProgress = row / Math.max(1, snapLinkRecallParticleRowCount - 1)
  const seedA = ((index * 37) % 101) / 100
  const seedB = ((index * 53 + 17) % 97) / 96
  const seedC = ((index * 29 + 41) % 89) / 88
  const left = Math.min(95, Math.max(5, 4.5 + columnProgress * 91 + (seedA - 0.5) * 3.2))
  const top = Math.min(92, Math.max(8, 8 + rowProgress * 84 + (seedB - 0.5) * 4.8))
  const dx = 24 + columnProgress * 88 + seedA * 30
  const dy = (rowProgress - 0.5) * 52 + (seedB - 0.5) * 22
  const size = 1.8 + seedC * 3.6
  const delay = columnProgress * 72 + seedB * 38

  return {
    '--recall-particle-left': `${left.toFixed(2)}%`,
    '--recall-particle-top': `${top.toFixed(2)}%`,
    '--recall-particle-dx': `${dx.toFixed(2)}px`,
    '--recall-particle-dy': `${dy.toFixed(2)}px`,
    '--recall-particle-size': `${size.toFixed(2)}px`,
    '--recall-particle-delay': `${delay.toFixed(2)}ms`,
  } as CSSProperties
}

function escapeSnapLinkEntryIdSelector(value: string) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }

  return value.replace(/["\\]/g, '\\$&')
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

function getSnapLinkEntryCreatedAtMs(entry: UnifiedConversationEntry) {
  const createdAtMs = Date.parse(entry.createdAt)
  return Number.isNaN(createdAtMs) ? 0 : createdAtMs
}

function getLatestSnapLinkEntryCreatedAtMs(entries: UnifiedConversationEntry[]) {
  return entries.reduce(
    (latestCreatedAtMs, entry) => Math.max(latestCreatedAtMs, getSnapLinkEntryCreatedAtMs(entry)),
    Number.NEGATIVE_INFINITY,
  )
}

const SNAPLINK_IMAGE_COMET_ROTATE_DEGREES = 7
const SNAPLINK_IMAGE_COMET_TRANSLATE_PX = 5

function clampSnapLinkImageCometOffset(value: number) {
  return Math.min(0.5, Math.max(-0.5, value))
}

function setSnapLinkImageCometCssValue(
  element: HTMLElement,
  propertyName: string,
  value: number,
  unit: 'deg' | 'px' | '%',
) {
  element.style.setProperty(propertyName, `${value.toFixed(2)}${unit}`)
}

function setSnapLinkImageCometPointerState(element: HTMLElement, xOffset: number, yOffset: number) {
  setSnapLinkImageCometCssValue(
    element,
    '--snaplink-image-comet-rotate-x',
    yOffset * SNAPLINK_IMAGE_COMET_ROTATE_DEGREES * 2,
    'deg',
  )
  setSnapLinkImageCometCssValue(
    element,
    '--snaplink-image-comet-rotate-y',
    xOffset * SNAPLINK_IMAGE_COMET_ROTATE_DEGREES * -2,
    'deg',
  )
  setSnapLinkImageCometCssValue(
    element,
    '--snaplink-image-comet-translate-x',
    xOffset * SNAPLINK_IMAGE_COMET_TRANSLATE_PX * 2,
    'px',
  )
  setSnapLinkImageCometCssValue(
    element,
    '--snaplink-image-comet-translate-y',
    yOffset * SNAPLINK_IMAGE_COMET_TRANSLATE_PX * -2,
    'px',
  )
  setSnapLinkImageCometCssValue(element, '--snaplink-image-comet-glare-x', (xOffset + 0.5) * 100, '%')
  setSnapLinkImageCometCssValue(element, '--snaplink-image-comet-glare-y', (yOffset + 0.5) * 100, '%')
}

function resetSnapLinkImageCometPointerState(element: HTMLElement) {
  element.style.setProperty('--snaplink-image-comet-rotate-x', '0deg')
  element.style.setProperty('--snaplink-image-comet-rotate-y', '0deg')
  element.style.setProperty('--snaplink-image-comet-translate-x', '0px')
  element.style.setProperty('--snaplink-image-comet-translate-y', '0px')
  element.style.setProperty('--snaplink-image-comet-glare-x', '50%')
  element.style.setProperty('--snaplink-image-comet-glare-y', '50%')
}

export function SnapLinkStage({
  isDragging,
  activeView,
  deviceId,
  deviceName,
  accountId,
  selectedRoomId,
  autoOpenRoomId,
  selectedConversationName,
  activeTransferLabel,
  roomListItems,
  chatDraft,
  composerImageDrafts,
  fileInputId,
  isSendDisabled,
  isAiGenerating,
  aiGeneratingRoomId,
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
  commandElement,
  onOpenRoomConversation,
  onDeviceNameChange,
  onOpenRoomHome,
  onOpenAiChatView,
  onOpenCommandView,
  onChatDraftChange,
  onAiModelChange,
  onPastedImageSelection,
  onComposerImageRemove,
  onDirectFileSelection,
  onStartOcrJob,
  onListOcrHistory,
  onDeleteOcrHistory,
  onSendText,
  onRecallText,
  onRecallFile,
  onLoadOlderRoomHistory,
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
  const [isOcrPanelOpen, setIsOcrPanelOpen] = useState(false)
  const [ocrStatus, setOcrStatus] = useState<SnapLinkOcrStatus>('idle')
  const [ocrImage, setOcrImage] = useState<SnapLinkOcrImageState | null>(null)
  const [ocrJob, setOcrJob] = useState<OcrJobResponse | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [ocrHistory, setOcrHistory] = useState<OcrJobResponse[]>([])
  const [ocrHistoryError, setOcrHistoryError] = useState<string | null>(null)
  const [isOcrHistoryLoading, setIsOcrHistoryLoading] = useState(false)
  const [deletingOcrJobId, setDeletingOcrJobId] = useState<string | null>(null)
  const [isOcrDropTarget, setIsOcrDropTarget] = useState(false)
  const [themeColors, setThemeColors] = useState<SnapLinkThemeColors>(() => readStoredSnapLinkThemeColors())
  const [messageContextMenu, setMessageContextMenu] = useState<SnapLinkMessageContextMenuState | null>(null)
  const [quoteDraft, setQuoteDraft] = useState<SnapLinkQuoteDraftState | null>(null)
  const [imagePreview, setImagePreview] = useState<SnapLinkImagePreviewState | null>(null)
  const [documentPreview, setDocumentPreview] = useState<DocumentPreviewDialogState | null>(null)
  const [loadingDocumentPreviewFileId, setLoadingDocumentPreviewFileId] = useState<string | null>(null)
  const [isImagePreviewZoomed, setIsImagePreviewZoomed] = useState(false)
  const [isImagePreviewReady, setIsImagePreviewReady] = useState(false)
  const [isImagePreviewDragging, setIsImagePreviewDragging] = useState(false)
  const [imagePreviewPan, setImagePreviewPan] = useState<SnapLinkImagePreviewPan>({ x: 0, y: 0 })
  const [isImagePreviewClosing, setIsImagePreviewClosing] = useState(false)
  const [hiddenTextEntryIds, setHiddenTextEntryIds] = useState<Set<string>>(() => new Set())
  const [animatedOutgoingEntryIds, setAnimatedOutgoingEntryIds] = useState<Set<string>>(() => new Set())
  const [recallingTextEntries, setRecallingTextEntries] = useState<Record<string, SnapLinkRecallingTextEntryState>>({})
  const [messageRenderState, setMessageRenderState] = useState<{ roomId: string | null; count: number }>(() => ({
    roomId: null,
    count: snapLinkInitialMessageRenderCount,
  }))
  const imagePreviewDialogRef = useRef<HTMLDivElement | null>(null)
  const imagePreviewBackdropRef = useRef<HTMLButtonElement | null>(null)
  const imagePreviewPanelRef = useRef<HTMLDivElement | null>(null)
  const imagePreviewImageButtonRef = useRef<HTMLButtonElement | null>(null)
  const imagePreviewImageRef = useRef<HTMLImageElement | null>(null)
  const imagePreviewDragStateRef = useRef<SnapLinkImagePreviewDragState | null>(null)
  const imagePreviewDidDragRef = useRef(false)
  const isImagePreviewZoomedRef = useRef(false)
  const documentPreviewRequestSeqRef = useRef(0)
  const [activeSharedTab, setActiveSharedTab] = useState<SnapLinkSharedTab | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const messageScrollRestoreRef = useRef<{ previousScrollHeight: number; previousScrollTop: number } | null>(null)
  const outgoingEntryAnimationStateRef = useRef<{
    roomId: string | null
    ids: Set<string>
    latestCreatedAtMs: number
    initialized: boolean
  }>({
    roomId: null,
    ids: new Set(),
    latestCreatedAtMs: Number.NEGATIVE_INFINITY,
    initialized: false,
  })
  const outgoingEntryAnimationTimeoutsRef = useRef<Map<string, number>>(new Map())
  const recallAnimationTimeoutsRef = useRef<Map<string, number>>(new Map())
  const shouldAnimateNextOutgoingEntryRef = useRef(false)
  const pendingOutgoingEntryAnimationTimeoutRef = useRef<number | null>(null)
  const handledAutoOpenRoomIdRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const isComposerComposingRef = useRef(false)
  const draftValueRef = useRef(normalizePlainComposerDraft(chatDraft))
  const botTriggerRef = useRef<HTMLButtonElement | null>(null)
  const botPanelRef = useRef<HTMLDivElement | null>(null)
  const botMentionTriggerRangeRef = useRef<BotMentionTriggerRange | null>(null)
  const ocrTriggerRef = useRef<HTMLButtonElement | null>(null)
  const ocrPanelRef = useRef<HTMLDivElement | null>(null)
  const ocrFileInputRef = useRef<HTMLInputElement | null>(null)
  const ocrImagePreviewUrlRef = useRef<string | null>(null)
  const ocrRequestSeqRef = useRef(0)
  const ocrDropDepthRef = useRef(0)
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
  const isCommandOpen = activeView === 'command'

  useEffect(() => {
    if (
      activeView !== 'conversation' ||
      !autoOpenRoomId ||
      autoOpenRoomId !== selectedRoomId ||
      handledAutoOpenRoomIdRef.current === autoOpenRoomId
    ) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      handledAutoOpenRoomIdRef.current = autoOpenRoomId
      setActiveSharedTab(null)
      setIsLobbyOpen(false)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [activeView, autoOpenRoomId, selectedRoomId])

  const lobbyRoomListItems = useMemo(
    () =>
      [...roomListItems].sort((left, right) => {
        if (left.isPublic && right.isPublic) {
          return (left.publicIndex ?? Number.MAX_SAFE_INTEGER) - (right.publicIndex ?? Number.MAX_SAFE_INTEGER)
        }

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
  const hasActiveRoom =
    Boolean(selectedRoomId) && !isLobbyOpen && !isAiChatOpen && !isImageOpen && !isAdminOpen && !isCommandOpen

  if (messageRenderState.roomId !== selectedRoomId) {
    setMessageRenderState({
      roomId: selectedRoomId,
      count: snapLinkInitialMessageRenderCount,
    })
  }
  const messageRenderCount = messageRenderState.roomId === selectedRoomId
    ? messageRenderState.count
    : snapLinkInitialMessageRenderCount
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
  const shouldShowAiThinking = hasActiveRoom && isAiGenerating && aiGeneratingRoomId === selectedRoomId
  const themeStyle = useMemo<SnapLinkThemeStyle>(() => ({
    '--snap-theme-self': themeColors.self,
    '--snap-theme-self-text': getSnapLinkThemeContrastColor(themeColors.self),
    '--snap-theme-peer': themeColors.peer,
    '--snap-theme-peer-text': getSnapLinkThemeContrastColor(themeColors.peer),
    '--snap-theme-ai': themeColors.ai,
    '--snap-theme-ai-text': getSnapLinkThemeContrastColor(themeColors.ai),
  }), [themeColors])
  const filteredConversationEntries = useMemo(
    () =>
      unifiedConversationEntries.filter((entry) =>
        !(entry.entryType === 'text' && hiddenTextEntryIds.has(entry.id)),
      ),
    [hiddenTextEntryIds, unifiedConversationEntries],
  )
  const conversationEntriesWithRecallGhosts = useMemo(() => {
    if (Object.keys(recallingTextEntries).length === 0) {
      return filteredConversationEntries
    }

    const entryIds = new Set(filteredConversationEntries.map((entry) => entry.id))
    const mergedEntries = [...filteredConversationEntries]

    for (const recallState of Object.values(recallingTextEntries)) {
      if (!entryIds.has(recallState.entry.id)) {
        mergedEntries.push(recallState.entry)
      }
    }

    mergedEntries.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    return mergedEntries
  }, [filteredConversationEntries, recallingTextEntries])
  const visibleConversationEntries = useMemo(
    () => conversationEntriesWithRecallGhosts.slice(
      Math.max(0, conversationEntriesWithRecallGhosts.length - messageRenderCount),
    ),
    [conversationEntriesWithRecallGhosts, messageRenderCount],
  )
  const ocrPanelId = `${fileInputId}-ocr-panel`
  const ocrResultText = getSnapLinkOcrText(ocrJob)
  const hasOcrResultText = ocrResultText.length > 0
  const canRetryOcr = Boolean(ocrImage) && ocrStatus !== 'running'
  const refreshOcrHistory = useCallback(async () => {
    setIsOcrHistoryLoading(true)
    setOcrHistoryError(null)

    try {
      const payload = await onListOcrHistory()
      setOcrHistory(payload.items)
    } catch (error) {
      setOcrHistoryError(error instanceof Error ? error.message : 'OCR 历史加载失败。')
    } finally {
      setIsOcrHistoryLoading(false)
    }
  }, [onListOcrHistory])

  useEffect(() => {
    messageScrollRestoreRef.current = null
  }, [selectedRoomId])

  useEffect(() => {
    const nextEntryIds = new Set(unifiedConversationEntries.map((entry) => entry.id))
    const nextLatestCreatedAtMs = getLatestSnapLinkEntryCreatedAtMs(unifiedConversationEntries)
    const previousState = outgoingEntryAnimationStateRef.current
    const isSameRoom = previousState.initialized && previousState.roomId === selectedRoomId

    if (!isSameRoom) {
      for (const timeoutId of outgoingEntryAnimationTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId)
      }
      if (pendingOutgoingEntryAnimationTimeoutRef.current !== null) {
        window.clearTimeout(pendingOutgoingEntryAnimationTimeoutRef.current)
        pendingOutgoingEntryAnimationTimeoutRef.current = null
      }
      outgoingEntryAnimationTimeoutsRef.current.clear()
      shouldAnimateNextOutgoingEntryRef.current = false
      window.requestAnimationFrame(() => {
        setAnimatedOutgoingEntryIds((current) => (current.size > 0 ? new Set() : current))
      })
      outgoingEntryAnimationStateRef.current = {
        roomId: selectedRoomId,
        ids: nextEntryIds,
        latestCreatedAtMs: nextLatestCreatedAtMs,
        initialized: true,
      }
      return
    }

    const newOutgoingEntryIds = shouldAnimateNextOutgoingEntryRef.current
      ? unifiedConversationEntries
          .filter((entry) =>
            entry.entryType !== 'notice' &&
            entry.fromSelf &&
            !previousState.ids.has(entry.id) &&
            getSnapLinkEntryCreatedAtMs(entry) >= previousState.latestCreatedAtMs,
          )
          .map((entry) => entry.id)
      : []

    outgoingEntryAnimationStateRef.current = {
      roomId: selectedRoomId,
      ids: nextEntryIds,
      latestCreatedAtMs: nextLatestCreatedAtMs,
      initialized: true,
    }

    if (newOutgoingEntryIds.length === 0) {
      return
    }

    window.requestAnimationFrame(() => {
      setAnimatedOutgoingEntryIds((current) => {
        const nextIds = new Set(current)
        for (const entryId of newOutgoingEntryIds) {
          nextIds.add(entryId)
        }
        return nextIds
      })
    })

    for (const entryId of newOutgoingEntryIds) {
      const previousTimeoutId = outgoingEntryAnimationTimeoutsRef.current.get(entryId)
      if (previousTimeoutId !== undefined) {
        window.clearTimeout(previousTimeoutId)
      }

      const timeoutId = window.setTimeout(() => {
        outgoingEntryAnimationTimeoutsRef.current.delete(entryId)
        setAnimatedOutgoingEntryIds((current) => {
          if (!current.has(entryId)) {
            return current
          }

          const nextIds = new Set(current)
          nextIds.delete(entryId)
          return nextIds
        })
      }, snapLinkNewOutgoingEntryAnimationCleanupMs)

      outgoingEntryAnimationTimeoutsRef.current.set(entryId, timeoutId)
    }
  }, [selectedRoomId, unifiedConversationEntries])

  useEffect(() => {
    const animationTimeouts = outgoingEntryAnimationTimeoutsRef.current
    const pendingAnimationTimeoutRef = pendingOutgoingEntryAnimationTimeoutRef
    const recallAnimationTimeouts = recallAnimationTimeoutsRef.current

    return () => {
      for (const timeoutId of animationTimeouts.values()) {
        window.clearTimeout(timeoutId)
      }
      for (const timeoutId of recallAnimationTimeouts.values()) {
        window.clearTimeout(timeoutId)
      }
      if (pendingAnimationTimeoutRef.current !== null) {
        window.clearTimeout(pendingAnimationTimeoutRef.current)
        pendingAnimationTimeoutRef.current = null
      }
      animationTimeouts.clear()
      recallAnimationTimeouts.clear()
    }
  }, [])

  useEffect(() => {
    const messagesRoot = messagesRef.current
    const recallingEntries = Object.values(recallingTextEntries)
    if (!messagesRoot || recallingEntries.length === 0) {
      return undefined
    }

    const ctx = gsap.context(() => {
      for (const recallState of recallingEntries) {
        const selectorId = escapeSnapLinkEntryIdSelector(recallState.entry.id)
        const row = messagesRoot.querySelector<HTMLElement>(`[data-snaplink-entry-id="${selectorId}"]`)
        const bubble = row?.querySelector<HTMLElement>('.dd-snaplink__bubble')
        const senderMeta = row?.querySelector<HTMLElement>('.dd-snaplink__sender-meta')
        const messageTime = row?.querySelector<HTMLElement>('.dd-snaplink__message-time')
        const avatar = row?.querySelector<HTMLElement>('.dd-snaplink__avatar')
        const rowChromeTargets = [senderMeta, messageTime, avatar].filter(
          (target): target is HTMLElement => Boolean(target),
        )
        const particles = Array.from(
          row?.querySelectorAll<HTMLElement>('.dd-snaplink__recall-particles span') ?? [],
        )

        if (!bubble) {
          continue
        }

        gsap.killTweensOf([row, bubble, ...rowChromeTargets, ...particles])

        if (prefersReducedMotion()) {
          gsap.set([bubble, ...rowChromeTargets], { opacity: 0, x: 24, filter: 'blur(4px)' })
          if (row) {
            gsap.set(row, { opacity: 0 })
          }
          gsap.set(particles, { opacity: 0 })
          continue
        }

        gsap.set(bubble, {
          x: 0,
          opacity: 1,
          scale: 1,
          filter: 'blur(0px)',
          clipPath: 'inset(0 0 0 0 round 18px)',
          transformOrigin: 'center right',
          willChange: 'transform, opacity, filter, clip-path',
        })

        gsap.set(rowChromeTargets, {
          x: 0,
          opacity: 1,
          filter: 'blur(0px)',
          willChange: 'transform, opacity, filter',
        })

        gsap.to(bubble, {
          x: 24,
          opacity: 0,
          scale: 0.96,
          filter: 'blur(5px)',
          clipPath: 'inset(0 0 0 98% round 18px)',
          duration: 0.18,
          ease: 'power2.out',
        })

        gsap.to(rowChromeTargets, {
          x: 26,
          opacity: 0,
          filter: 'blur(4px)',
          duration: 0.24,
          ease: 'power2.out',
          stagger: 0.025,
        })

        if (row) {
          gsap.to(row, {
            opacity: 0,
            duration: 0.14,
            delay: snapLinkRecallBurstAnimationMs / 1000,
            ease: 'power1.out',
          })
        }

        particles.forEach((particle, index) => {
          const particleStyle = window.getComputedStyle(particle)
          const dx = Number.parseFloat(particleStyle.getPropertyValue('--recall-particle-dx')) || 72
          const dy = Number.parseFloat(particleStyle.getPropertyValue('--recall-particle-dy')) || 0
          const delay = (Number.parseFloat(particleStyle.getPropertyValue('--recall-particle-delay')) || index * 8) / 1000

          gsap.fromTo(particle, {
            x: 0,
            y: 0,
            opacity: 1,
            rotate: 0,
            scale: 1,
            transformOrigin: 'center center',
            willChange: 'transform, opacity',
          }, {
            keyframes: [
              {
                x: dx * 0.16,
                y: dy * 0.16,
                opacity: 1,
                rotate: (index % 2 === 0 ? 12 : -12),
                scale: 1.08,
                duration: 0.08,
                ease: 'power2.out',
              },
              {
                x: dx,
                y: dy,
                opacity: 0,
                rotate: (index % 2 === 0 ? 46 : -46),
                scale: 0.12,
                duration: 0.64,
                ease: 'power3.out',
              },
            ],
            delay,
          })
        })
      }
    }, messagesRoot)

    return () => {
      ctx.revert()
    }
  }, [recallingTextEntries])

  const handleMessagesScroll = useCallback(() => {
    const messages = messagesRef.current
    if (!messages || !selectedRoomId || !hasActiveRoom || messages.scrollTop > snapLinkHistoryLoadThreshold) {
      return
    }

    if (visibleConversationEntries.length < filteredConversationEntries.length) {
      messageScrollRestoreRef.current = {
        previousScrollHeight: messages.scrollHeight,
        previousScrollTop: messages.scrollTop,
      }
      setMessageRenderState((current) => {
        const currentCount = current.roomId === selectedRoomId
          ? current.count
          : snapLinkInitialMessageRenderCount

        return {
          roomId: selectedRoomId,
          count: Math.min(filteredConversationEntries.length, currentCount + snapLinkMessageRenderStep),
        }
      })
      return
    }

    messageScrollRestoreRef.current = {
      previousScrollHeight: messages.scrollHeight,
      previousScrollTop: messages.scrollTop,
    }
    setMessageRenderState((current) => {
      const currentCount = current.roomId === selectedRoomId
        ? current.count
        : snapLinkInitialMessageRenderCount

      return {
        roomId: selectedRoomId,
        count: currentCount + snapLinkMessageRenderStep,
      }
    })
    onLoadOlderRoomHistory(selectedRoomId)
  }, [
    filteredConversationEntries.length,
    hasActiveRoom,
    onLoadOlderRoomHistory,
    selectedRoomId,
    visibleConversationEntries.length,
  ])

  useEffect(() => {
    const messages = messagesRef.current
    if (!messages || !hasActiveRoom) {
      return
    }

    const restore = messageScrollRestoreRef.current
    if (restore) {
      messageScrollRestoreRef.current = null
      messages.scrollTop = Math.max(
        0,
        messages.scrollHeight - restore.previousScrollHeight + restore.previousScrollTop,
      )
      return
    }

    messages.scrollTop = messages.scrollHeight
  }, [hasActiveRoom, selectedRoomId, shouldShowAiThinking, visibleConversationEntries.length])

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
    if (isOcrPanelOpen) {
      void refreshOcrHistory()
    }
  }, [isOcrPanelOpen, refreshOcrHistory])

  useEffect(() => {
    if (!isOcrPanelOpen) {
      ocrDropDepthRef.current = 0
      setIsOcrDropTarget(false)
    }
  }, [isOcrPanelOpen])

  useEffect(() => {
    return () => {
      if (ocrImagePreviewUrlRef.current) {
        URL.revokeObjectURL(ocrImagePreviewUrlRef.current)
        ocrImagePreviewUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!isOcrPanelOpen) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (
        ocrPanelRef.current?.contains(target) ||
        ocrTriggerRef.current?.contains(target) ||
        ocrFileInputRef.current?.contains(target)
      ) {
        return
      }

      setIsOcrPanelOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOcrPanelOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOcrPanelOpen])

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
        setIsImagePreviewClosing(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [imagePreview])

  useEffect(() => {
    const backdrop = imagePreviewBackdropRef.current
    const panel = imagePreviewPanelRef.current
    const imageButton = imagePreviewImageButtonRef.current
    const previewImage = imagePreviewImageRef.current
    if (!imagePreview || !backdrop || !panel || !imageButton || !previewImage) {
      return undefined
    }

    const ctx = gsap.context(() => {
      if (isImagePreviewClosing) {
        const finalizeClose = () => {
          setImagePreview(null)
          setIsImagePreviewZoomed(false)
          isImagePreviewZoomedRef.current = false
          setIsImagePreviewReady(false)
          setIsImagePreviewDragging(false)
          setImagePreviewPan({ x: 0, y: 0 })
          setIsImagePreviewClosing(false)
          imagePreviewDragStateRef.current = null
          imagePreviewDidDragRef.current = false
        }

        const panelRect = panel.getBoundingClientRect()
        const originRect = !isImagePreviewZoomedRef.current ? imagePreview.originRect : undefined
        const closeAnimation =
          originRect && panelRect.width > 0 && panelRect.height > 0
            ? {
                x: originRect.left + originRect.width - (panelRect.left + panelRect.width),
                y: originRect.top + originRect.height / 2 - (panelRect.top + panelRect.height / 2),
                scaleX: originRect.width / panelRect.width,
                scaleY: originRect.height / panelRect.height,
                opacity: 0.14,
                filter: 'blur(12px)',
              }
            : {
                x: 0,
                y: 28,
                scaleX: 0.84,
                scaleY: 0.84,
                opacity: 0.08,
                filter: 'blur(10px)',
              }

        const closeTimeline = gsap.timeline({
          defaults: {
            duration: snapLinkImagePreviewCloseDuration,
            ease: 'power3.inOut',
          },
          onComplete: finalizeClose,
        })

        closeTimeline.to(backdrop, {
          opacity: 0,
          duration: snapLinkImagePreviewCloseDuration * 0.82,
          ease: 'power2.out',
        }, 0)
        gsap.set([imageButton, previewImage], {
          clearProps: 'perspective,transformStyle,rotationY,skewY,transformOrigin,willChange',
        })
        closeTimeline.to(panel, {
          ...closeAnimation,
          rotationY: 10,
          skewY: -2.2,
          transformOrigin: 'right center',
          transformPerspective: 1100,
        }, 0)
        return
      }

      const panelRect = panel.getBoundingClientRect()
      const originRect = !isImagePreviewZoomedRef.current ? imagePreview.originRect : undefined
      const openAnimation =
        originRect && panelRect.width > 0 && panelRect.height > 0
          ? {
              x: originRect.left + originRect.width - (panelRect.left + panelRect.width),
              y: originRect.top + originRect.height / 2 - (panelRect.top + panelRect.height / 2),
              scaleX: originRect.width / panelRect.width,
              scaleY: originRect.height / panelRect.height,
              opacity: 0.12,
              filter: 'blur(14px)',
            }
          : {
              x: 0,
              y: 34,
              scaleX: 0.82,
              scaleY: 0.82,
              opacity: 0.04,
              filter: 'blur(12px)',
            }

      gsap.set(backdrop, { opacity: 0 })
      gsap.set(panel, {
        ...openAnimation,
        rotationY: 14,
        skewY: -3,
        transformOrigin: 'right center',
        transformStyle: 'preserve-3d',
        transformPerspective: 1100,
        force3D: true,
        willChange: 'transform, opacity, filter',
      })
      gsap.set([imageButton, previewImage], {
        clearProps: 'perspective,transformStyle,rotationY,skewY,transformOrigin,willChange',
      })

      const openTimeline = gsap.timeline({
        onComplete: () => {
          setIsImagePreviewReady(true)
        },
      })

      openTimeline.to(backdrop, {
        opacity: 1,
        duration: snapLinkImagePreviewOpenDuration * 0.64,
        ease: 'power2.out',
      }, 0)
      openTimeline.to(panel, {
        opacity: 1,
        y: 0,
        scaleY: 1,
        filter: 'blur(0px)',
        duration: snapLinkImagePreviewOpenDuration,
        ease: 'expo.out',
      }, 0)
      openTimeline.to(panel, {
        x: 0,
        duration: snapLinkImagePreviewOpenDuration * 0.42,
        ease: 'power3.out',
      }, 0)
      openTimeline.to(panel, {
        scaleX: 1,
        duration: snapLinkImagePreviewOpenDuration,
        ease: 'expo.out',
      }, snapLinkImagePreviewOpenDuration * 0.04)
      openTimeline.to(panel, {
        rotationY: 0,
        skewY: 0,
        duration: snapLinkImagePreviewOpenDuration * 0.72,
        ease: 'expo.out',
        clearProps: 'filter,willChange,transform,transformOrigin,transformStyle,transformPerspective',
      }, snapLinkImagePreviewOpenDuration * 0.18)
    }, imagePreviewDialogRef)

    return () => {
      ctx.revert()
    }
  }, [imagePreview, isImagePreviewClosing])

  const handleOpenAiChat = () => {
    setActiveSharedTab(null)
    setIsLobbyOpen(false)
    onOpenAiChatView()
  }

  const handleOpenCommand = () => {
    setActiveSharedTab(null)
    setIsLobbyOpen(false)
    onOpenCommandView()
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
    applyThemeColors(snapLinkDefaultThemeColors)
  }

  const toggleThemePanel = () => {
    setIsEmojiPickerOpen(false)
    setIsBotPanelOpen(false)
    botMentionTriggerRangeRef.current = null
    setIsThemePanelOpen((current) => !current)
  }

  const handleRoomSelection = (roomId: string) => {
    if (roomId === snapLinkAiChatSelectionValue) {
      handleOpenAiChat()
      return
    }

    if (roomId === snapLinkCommandSelectionValue) {
      handleOpenCommand()
      return
    }

    if (!roomId) {
      setActiveSharedTab(null)
      setIsLobbyOpen(true)
      onOpenRoomHome()
      return
    }

    setActiveSharedTab(null)
    setIsLobbyOpen(false)
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

  const armOutgoingEntryAnimation = () => {
    shouldAnimateNextOutgoingEntryRef.current = true
    if (pendingOutgoingEntryAnimationTimeoutRef.current !== null) {
      window.clearTimeout(pendingOutgoingEntryAnimationTimeoutRef.current)
    }

    pendingOutgoingEntryAnimationTimeoutRef.current = window.setTimeout(() => {
      shouldAnimateNextOutgoingEntryRef.current = false
      pendingOutgoingEntryAnimationTimeoutRef.current = null
    }, snapLinkPendingOutgoingEntryAnimationMs)
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
      armOutgoingEntryAnimation()
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
    const input = inputRef.current
    if (input && input.value !== nextDraft) {
      input.value = nextDraft
      syncSnapLinkComposerTextAreaHeight(input)
    }
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
    const currentDraft = getComposerDraft()
    const caretPosition = inputRef.current?.selectionStart ?? currentDraft.length

    draftValueRef.current = currentDraft
    onChatDraftChange(currentDraft)
    botMentionTriggerRangeRef.current = null
    setIsEmojiPickerOpen(false)
    setIsThemePanelOpen(false)
    setIsBotPanelOpen(true)
    focusComposerInput(caretPosition)
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
    const pastedFiles = getClipboardFiles(event.clipboardData)
    if (pastedFiles.length === 0) {
      return
    }

    event.preventDefault()
    setIsEmojiPickerOpen(false)
    setIsBotPanelOpen(false)
    setIsThemePanelOpen(false)
    botMentionTriggerRangeRef.current = null
    armOutgoingEntryAnimation()

    if (pastedFiles.every(isClipboardImageFile)) {
      onPastedImageSelection(pastedFiles)
      return
    }

    onDirectFileSelection(pastedFiles)
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

  const clearOcrImagePreview = () => {
    if (ocrImagePreviewUrlRef.current) {
      URL.revokeObjectURL(ocrImagePreviewUrlRef.current)
      ocrImagePreviewUrlRef.current = null
    }

    setOcrImage(null)
  }

  const prepareOcrImagePreview = (file: File) => {
    clearOcrImagePreview()
    const previewUrl = URL.createObjectURL(file)
    ocrImagePreviewUrlRef.current = previewUrl
    setOcrImage({
      file,
      name: file.name || '待识别图片',
      previewUrl,
    })
  }

  const runOcrRecognition = async (file: File) => {
    const requestSeq = ocrRequestSeqRef.current + 1
    ocrRequestSeqRef.current = requestSeq
    setOcrStatus('running')
    setOcrJob(null)
    setOcrError(null)

    try {
      const job = await onStartOcrJob(file)
      if (ocrRequestSeqRef.current !== requestSeq) {
        return
      }

      setOcrJob(job)
      setOcrStatus(job.status === 'failed' ? 'failed' : job.status === 'complete' ? 'complete' : 'running')
      setOcrError(job.status === 'failed' ? job.error ?? 'OCR 识别失败。' : null)
      void refreshOcrHistory()
    } catch (error) {
      if (ocrRequestSeqRef.current !== requestSeq) {
        return
      }

      setOcrStatus('failed')
      setOcrError(error instanceof Error ? error.message : 'OCR 识别失败。')
      void refreshOcrHistory()
    }
  }

  const handleOcrTriggerClick = () => {
    setIsOcrPanelOpen(true)
    setIsEmojiPickerOpen(false)
    setIsBotPanelOpen(false)
    setIsThemePanelOpen(false)
    botMentionTriggerRangeRef.current = null
    if (!ocrJob && !ocrImage) {
      setOcrStatus('idle')
    }
  }

  const openOcrFilePicker = () => {
    ocrFileInputRef.current?.click()
  }

  const handleOcrFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    setIsOcrPanelOpen(true)

    if (!file) {
      return
    }

    if (!isSupportedSnapLinkOcrFile(file)) {
      setOcrStatus('failed')
      setOcrError('只支持 PNG、JPEG 或 WebP 图片。')
      return
    }

    setIsOcrDropTarget(false)
    prepareOcrImagePreview(file)
    void runOcrRecognition(file)
  }

  const handleOcrDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!hasSnapLinkDraggedFiles(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    ocrDropDepthRef.current += 1
    setIsOcrPanelOpen(true)
    setIsOcrDropTarget(true)
  }

  const handleOcrDragOver = (event: DragEvent<HTMLElement>) => {
    if (!hasSnapLinkDraggedFiles(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    if (!isOcrDropTarget) {
      setIsOcrDropTarget(true)
    }
  }

  const handleOcrDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!hasSnapLinkDraggedFiles(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    ocrDropDepthRef.current = Math.max(0, ocrDropDepthRef.current - 1)
    if (ocrDropDepthRef.current === 0) {
      setIsOcrDropTarget(false)
    }
  }

  const handleOcrDrop = async (event: DragEvent<HTMLElement>) => {
    if (!hasSnapLinkDraggedFiles(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    ocrDropDepthRef.current = 0
    setIsOcrDropTarget(false)
    setIsOcrPanelOpen(true)

    const files = await collectDroppedFiles(event.dataTransfer)
    if (files.length === 0) {
      return
    }

    const imageFile = files.find((file) => isSupportedSnapLinkOcrFile(file))
    if (!imageFile) {
      setOcrStatus('failed')
      setOcrError('只支持 PNG、JPEG 或 WebP 图片。')
      return
    }

    prepareOcrImagePreview(imageFile)
    void runOcrRecognition(imageFile)
  }

  const insertOcrTextIntoComposer = (text: string) => {
    const currentDraft = getComposerDraft()
    const separator = currentDraft.trim() && !currentDraft.endsWith('\n') ? '\n' : ''
    const nextDraft = `${currentDraft}${separator}${text}`

    commitComposerDraft(nextDraft, nextDraft.length)
    focusComposerInput(nextDraft.length)
  }

  const handleCopyOcrText = () => {
    if (hasOcrResultText) {
      void copyTextToClipboard(ocrResultText)
    }
  }

  const handleInsertOcrText = () => {
    if (hasOcrResultText) {
      insertOcrTextIntoComposer(ocrResultText)
    }
  }

  const handleSendOcrText = () => {
    if (!hasOcrResultText) {
      return
    }

    flushSync(() => {
      commitComposerDraft(ocrResultText, ocrResultText.length)
      setQuoteDraft(null)
    })
    setIsOcrPanelOpen(false)
    window.requestAnimationFrame(() => {
      armOutgoingEntryAnimation()
      onSendText()
    })
  }

  const handleRetryOcr = () => {
    if (ocrImage?.file) {
      void runOcrRecognition(ocrImage.file)
    }
  }

  const handleClearOcr = () => {
    ocrRequestSeqRef.current += 1
    clearOcrImagePreview()
    setOcrJob(null)
    setOcrError(null)
    setOcrStatus('idle')
  }

  const handleRestoreOcrHistoryItem = (job: OcrJobResponse) => {
    ocrRequestSeqRef.current += 1
    clearOcrImagePreview()
    setOcrJob(job)
    setOcrStatus(job.status === 'failed' ? 'failed' : job.status === 'complete' ? 'complete' : 'idle')
    setOcrError(job.status === 'failed' ? job.error ?? 'OCR 识别失败。' : null)
    setIsOcrPanelOpen(true)
  }

  const handleDeleteOcrHistoryItem = async (
    event: ReactMouseEvent<HTMLButtonElement>,
    jobId: string,
  ) => {
    event.stopPropagation()
    setDeletingOcrJobId(jobId)
    setOcrHistoryError(null)

    try {
      await onDeleteOcrHistory(jobId)
      setOcrHistory((previous) => previous.filter((item) => item.jobId !== jobId))
      if (ocrJob?.jobId === jobId) {
        handleClearOcr()
      }
    } catch (error) {
      setOcrHistoryError(error instanceof Error ? error.message : 'OCR 历史删除失败。')
    } finally {
      setDeletingOcrJobId(null)
    }
  }

  const openImagePreview = (
    src: string,
    alt = '图片预览',
    originRect?: SnapLinkPreviewOriginRect,
  ) => {
    if (!src) {
      return
    }

    setIsImagePreviewClosing(false)
    setIsImagePreviewZoomed(false)
    isImagePreviewZoomedRef.current = false
    setIsImagePreviewReady(false)
    setIsImagePreviewDragging(false)
    setImagePreviewPan({ x: 0, y: 0 })
    imagePreviewDragStateRef.current = null
    imagePreviewDidDragRef.current = false
    setImagePreview({ src, alt, originRect })
  }

  const animateImagePreviewOrigin = (target: HTMLElement, onComplete: () => void) => {
    if (prefersReducedMotion()) {
      onComplete()
      return
    }

    gsap.killTweensOf(target)
    gsap.fromTo(target, {
      scale: 1,
      filter: 'brightness(1)',
      transformOrigin: 'center center',
      willChange: 'transform, filter',
    }, {
      scale: 0.94,
      filter: 'brightness(1.06)',
      duration: snapLinkImagePreviewOriginFeedbackDuration,
      ease: 'power2.out',
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        gsap.set(target, { clearProps: 'transform,filter,transformOrigin,willChange' })
        onComplete()
      },
    })
  }

  const closeImagePreview = () => {
    if (!imagePreview || isImagePreviewClosing) {
      return
    }

    setIsImagePreviewReady(false)
    setIsImagePreviewDragging(false)
    setIsImagePreviewClosing(true)
  }

  const resetImagePreviewZoom = () => {
    setIsImagePreviewZoomed(false)
    isImagePreviewZoomedRef.current = false
    setIsImagePreviewDragging(false)
    setImagePreviewPan({ x: 0, y: 0 })
    imagePreviewDragStateRef.current = null
    imagePreviewDidDragRef.current = false
  }

  const handleImagePreviewBlankClick = () => {
    if (isImagePreviewZoomed) {
      resetImagePreviewZoom()
      return
    }

    closeImagePreview()
  }

  const handleImagePreviewBodyClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return
    }

    handleImagePreviewBlankClick()
  }

  const getBoundedImagePreviewPan = (pan: SnapLinkImagePreviewPan): SnapLinkImagePreviewPan => {
    const panelRect = imagePreviewPanelRef.current?.getBoundingClientRect()
    const imageButtonRect = imagePreviewImageButtonRef.current?.getBoundingClientRect()
    if (!panelRect || !imageButtonRect || panelRect.width <= 0 || panelRect.height <= 0) {
      return pan
    }

    const maxX = Math.max(0, (imageButtonRect.width * snapLinkImagePreviewZoomScale - panelRect.width) / 2)
    const maxY = Math.max(0, (imageButtonRect.height * snapLinkImagePreviewZoomScale - panelRect.height) / 2)

    return {
      x: Math.min(maxX, Math.max(-maxX, pan.x)),
      y: Math.min(maxY, Math.max(-maxY, pan.y)),
    }
  }

  const handleImagePreviewImageClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    if (imagePreviewDidDragRef.current) {
      imagePreviewDidDragRef.current = false
      return
    }

    if (isImagePreviewZoomed) {
      resetImagePreviewZoom()
      return
    }

    setImagePreviewPan({ x: 0, y: 0 })
    isImagePreviewZoomedRef.current = true
    setIsImagePreviewZoomed(true)
  }

  const handleImagePreviewPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    if (!isImagePreviewZoomed || event.button !== 0) {
      return
    }

    event.preventDefault()
    setIsImagePreviewDragging(true)
    imagePreviewDidDragRef.current = false
    imagePreviewDragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: imagePreviewPan.x,
      startY: imagePreviewPan.y,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleImagePreviewPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = imagePreviewDragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    event.preventDefault()
    const deltaX = event.clientX - dragState.startClientX
    const deltaY = event.clientY - dragState.startClientY
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      imagePreviewDidDragRef.current = true
    }

    setImagePreviewPan(getBoundedImagePreviewPan({
      x: dragState.startX + deltaX,
      y: dragState.startY + deltaY,
    }))
  }

  const endImagePreviewDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = imagePreviewDragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    imagePreviewDragStateRef.current = null
    setIsImagePreviewDragging(false)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const openInlineImageFromTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLImageElement)) {
      return false
    }

    const previewSource = target.currentSrc || target.src
    const previewAlt = target.alt || '图片预览'
    const originRect = toSnapLinkPreviewOriginRect(target.getBoundingClientRect())

    animateImagePreviewOrigin(target, () => {
      openImagePreview(previewSource, previewAlt, originRect)
    })
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

  const handleImageBubbleCometPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      resetSnapLinkImageCometPointerState(event.currentTarget)
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }

    const xOffset = clampSnapLinkImageCometOffset((event.clientX - rect.left) / rect.width - 0.5)
    const yOffset = clampSnapLinkImageCometOffset((event.clientY - rect.top) / rect.height - 0.5)
    setSnapLinkImageCometPointerState(event.currentTarget, xOffset, yOffset)
  }, [])

  const handleImageBubbleCometPointerReset = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    resetSnapLinkImageCometPointerState(event.currentTarget)
  }, [])

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
    const recalledEntry = unifiedConversationEntries.find(
      (entry): entry is SnapLinkTextEntry => entry.id === recalledEntryId && entry.entryType === 'text',
    )
    setMessageContextMenu(null)

    if (!recalledEntry) {
      void Promise.resolve(onRecallText(recalledEntryId)).catch(() => {
        // The parent surface reports the recall failure.
      })
      return
    }

    const previousTimeoutId = recallAnimationTimeoutsRef.current.get(recalledEntryId)
    if (previousTimeoutId !== undefined) {
      window.clearTimeout(previousTimeoutId)
    }

    setRecallingTextEntries((current) => ({
      ...current,
      [recalledEntryId]: {
        entry: recalledEntry,
        phase: 'animating',
      },
    }))

    const timeoutId = window.setTimeout(() => {
      recallAnimationTimeoutsRef.current.delete(recalledEntryId)
      void Promise.resolve(onRecallText(recalledEntryId)).then(() => {
        setRecallingTextEntries((current) => {
          if (!(recalledEntryId in current)) {
            return current
          }

          const next = { ...current }
          delete next[recalledEntryId]
          return next
        })
      }).catch(() => {
        setRecallingTextEntries((current) => {
          if (!(recalledEntryId in current)) {
            return current
          }

          const next = { ...current }
          delete next[recalledEntryId]
          return next
        })
        // The parent surface reports the recall failure.
      })
    }, snapLinkRecallBurstAnimationCleanupMs)

    recallAnimationTimeoutsRef.current.set(recalledEntryId, timeoutId)
  }

  const recallFileEntry = (file: FileConversationEntry) => {
    if (!file.historyId || !file.canRecall) {
      return
    }

    void Promise.resolve(onRecallFile(file.historyId)).catch(() => {
      // The parent surface reports the recall failure.
    })
  }

  const openDocumentPreview = (file: FileConversationEntry) => {
    const documentPreviewKind = file.documentPreviewKind
    if (!documentPreviewKind || !file.onOpenDocumentPreview) {
      return
    }

    const requestSeq = documentPreviewRequestSeqRef.current + 1
    documentPreviewRequestSeqRef.current = requestSeq
    setLoadingDocumentPreviewFileId(file.id)

    if (documentPreviewKind === 'pdf') {
      setDocumentPreview(null)

      void Promise.resolve(file.onOpenDocumentPreview()).then(
        (payload) => {
          if (documentPreviewRequestSeqRef.current !== requestSeq) {
            return
          }

          const previewUrl = createNativePdfPreviewUrl(payload)
          window.location.href = previewUrl
        },
        (error) => {
          if (documentPreviewRequestSeqRef.current !== requestSeq) {
            return
          }

          setDocumentPreview({
            status: 'failed',
            kind: documentPreviewKind,
            fileName: file.fileName,
            errorMessage: error instanceof Error ? error.message : 'PDF 预览载入失败。',
          })
        },
      ).finally(() => {
        if (documentPreviewRequestSeqRef.current === requestSeq) {
          setLoadingDocumentPreviewFileId(null)
        }
      })
      return
    }

    setDocumentPreview({
      status: 'loading',
      kind: documentPreviewKind,
      fileName: file.fileName,
      mimeType: file.mimeType,
    })

    void Promise.resolve(file.onOpenDocumentPreview()).then(
      (payload) => {
        if (documentPreviewRequestSeqRef.current !== requestSeq) {
          return
        }

        setDocumentPreview({
          status: 'ready',
          payload,
        })
      },
      (error) => {
        if (documentPreviewRequestSeqRef.current !== requestSeq) {
          return
        }

        setDocumentPreview({
          status: 'failed',
          kind: documentPreviewKind,
          fileName: file.fileName,
          errorMessage: error instanceof Error ? error.message : '文档预览载入失败。',
        })
      },
    ).finally(() => {
      if (documentPreviewRequestSeqRef.current === requestSeq) {
        setLoadingDocumentPreviewFileId(null)
      }
    })
  }

  const closeDocumentPreview = () => {
    documentPreviewRequestSeqRef.current += 1
    setLoadingDocumentPreviewFileId(null)
    setDocumentPreview(null)
  }

  const renderFileActions = (file: SnapLinkFileEntry) => {
    const documentPreviewHref = file.documentPreviewKind === 'pdf' ? file.documentPreviewHref : undefined
    const canPreviewDocument = Boolean(file.documentPreviewKind && (documentPreviewHref || file.onOpenDocumentPreview))
    const isDocumentPreviewLoading = loadingDocumentPreviewFileId === file.id

    if (!canPreviewDocument && !file.downloadUrl && !file.onDownload && !file.action && !file.canRecall) {
      return null
    }

    return (
      <div className="dd-snaplink__file-actions">
        {documentPreviewHref ? (
          <a href={documentPreviewHref} aria-label={`预览 ${file.fileName}`}>
            预览
          </a>
        ) : canPreviewDocument ? (
          <button
            type="button"
            aria-label={`预览 ${file.fileName}`}
            onClick={() => openDocumentPreview(file)}
            disabled={file.isDocumentPreviewDisabled || isDocumentPreviewLoading}
          >
            {isDocumentPreviewLoading ? '载入中' : '预览'}
          </button>
        ) : null}
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
    const documentPreviewHref = file.documentPreviewKind === 'pdf' ? file.documentPreviewHref : undefined
    const canPreviewDocument = Boolean(file.documentPreviewKind && (documentPreviewHref || file.onOpenDocumentPreview))
    const isDocumentPreviewLoading = loadingDocumentPreviewFileId === file.id

    if (!canPreviewDocument && !file.downloadUrl && !file.onDownload && !file.canRecall) {
      return null
    }

    return (
      <div className="dd-snaplink__shared-actions">
        {documentPreviewHref ? (
          <a href={documentPreviewHref} aria-label={`预览 ${file.fileName}`}>
            预览
          </a>
        ) : canPreviewDocument ? (
          <button
            type="button"
            aria-label={`预览 ${file.fileName}`}
            onClick={() => openDocumentPreview(file)}
            disabled={file.isDocumentPreviewDisabled || isDocumentPreviewLoading}
          >
            {isDocumentPreviewLoading ? '载入中' : '预览'}
          </button>
        ) : null}
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
                onClick={(event) => {
                  const previewImage = event.currentTarget.querySelector('img')
                  const previewSource = file.previewUrl ?? ''
                  const previewAlt = file.fileName
                  const originRect = previewImage
                    ? toSnapLinkPreviewOriginRect(previewImage.getBoundingClientRect())
                    : toSnapLinkPreviewOriginRect(event.currentTarget.getBoundingClientRect())

                  if (previewImage instanceof HTMLImageElement) {
                    animateImagePreviewOrigin(previewImage, () => {
                      openImagePreview(previewSource, previewAlt, originRect)
                    })
                    return
                  }

                  openImagePreview(previewSource, previewAlt, originRect)
                }}
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

  const imagePreviewImageStyle: CSSProperties | undefined = isImagePreviewZoomed
    ? {
        transform: `translate3d(${imagePreviewPan.x.toFixed(1)}px, ${imagePreviewPan.y.toFixed(1)}px, 0) scale(${snapLinkImagePreviewZoomScale.toString()})`,
      }
    : undefined

  return (
    <>
      <section
        className={`dd-snaplink${isDragging ? ' is-dragging' : ''}`}
        style={themeStyle}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(event) => {
          if (event.dataTransfer.files.length > 0) {
            armOutgoingEntryAnimation()
          }
          onDrop(event)
        }}
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
                  ? ''
                  : isCommandOpen
                    ? snapLinkCommandSelectionValue
                  : isAiChatOpen
                    ? snapLinkAiChatSelectionValue
                      : hasActiveRoom ? selectedRoomId ?? '' : ''
              }
              onChange={(event) => handleRoomSelection(event.target.value)}
            >
              <option value="">大厅</option>
              <option value={snapLinkAiChatSelectionValue}>AI 聊天</option>
              <option value={snapLinkCommandSelectionValue}>命令行</option>
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
                      onClick={() => applyThemeColors(option.colors)}
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
            className={!isAiChatOpen && !isImageOpen && !isAdminOpen && !isCommandOpen ? 'is-active' : ''}
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
            className={isCommandOpen ? 'is-active' : ''}
            onClick={handleOpenCommand}
          >
            命令行
          </button>
        </div>
      </header>

      <main className={`dd-snaplink__canvas ${hasActiveRoom ? 'is-room' : isAiChatOpen ? 'is-ai-chat' : isImageOpen ? 'is-image' : isAdminOpen ? 'is-admin' : isCommandOpen ? 'is-command' : 'is-lobby'}`}>
        <div
          className={`dd-snaplink__app ${hasActiveRoom ? 'is-room' : isAiChatOpen ? 'is-ai-chat' : isImageOpen ? 'is-image' : isAdminOpen ? 'is-admin' : isCommandOpen ? 'is-command' : 'is-lobby'}`}
          style={isAdminOpen ? { border: 0, borderRadius: 0, background: 'transparent' } : undefined}
        >
          {isAdminOpen ? (
            adminElement
          ) : isImageOpen ? (
            imageElement
          ) : isCommandOpen ? (
            commandElement
          ) : isAiChatOpen ? (
            aiChatElement
          ) : !hasActiveRoom ? (
            <section className="dd-snaplink__lobby" aria-label="ddzhilian 大厅">
              <h1 className="dd-snaplink__lobby-title" aria-label={snapLinkLobbyGreetingText}>
                <span className="dd-snaplink__lobby-type" aria-hidden="true">{snapLinkLobbyGreetingText}<span className="dd-snaplink__lobby-cursor">_</span></span>
              </h1>
              <button
                type="button"
                className="dd-snaplink__create dd-snaplink__create--ai"
                onClick={handleOpenAiChat}
              >
                Chat with AI
              </button>
              {(localError || errorMessage) && (
                <div className="dd-snaplink__note is-error">{localError ?? errorMessage}</div>
              )}
              <div className="dd-snaplink__lobby-main">
                <div className="dd-snaplink__room-list" aria-label="会话列表">
                  <div className="dd-snaplink__room-list-head">
                    <span>会话列表</span>
                    <span className="dd-snaplink__room-list-actions">
                      <small>{lobbyRoomListItems.length} 个</small>
                    </span>
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

              {isDragging ? (
                <div className="dd-snaplink__drag-overlay" role="status" aria-live="polite">
                  <div className="dd-snaplink__drag-panel">
                    <span className="dd-snaplink__drag-icon" aria-hidden="true">
                      +
                    </span>
                    <strong>松开发送文件</strong>
                    <span>拖到此处即可发送到当前对话</span>
                  </div>
                </div>
              ) : null}

              <div ref={messagesRef} className="dd-snaplink__messages" onScroll={handleMessagesScroll}>
                {visibleConversationEntries.length > 0 || shouldShowAiThinking ? (
                  <>
                  {visibleConversationEntries.map((entry, index) => {
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
                    const recallState = entry.entryType === 'text' ? recallingTextEntries[entry.id] : undefined
                    const renderedEntry = recallState?.entry ?? entry
                    const isRecallingTextEntry = recallState?.phase === 'animating'
                    const isGroupedWithPrevious =
                      isConversationMessageEntry(previousEntry) &&
                      resolveMessageActorKey(previousEntry) === resolveMessageActorKey(renderedEntry) &&
                      !showDivider
                    const isGroupedWithNext =
                      isConversationMessageEntry(nextEntry) &&
                      resolveMessageActorKey(nextEntry) === resolveMessageActorKey(renderedEntry) &&
                      !shouldInsertDivider(entry.createdAt, nextEntry.createdAt)
                    const isBotMessage = isBotConversationEntry(renderedEntry)
                    const rowClassName = [
                      'dd-snaplink__row',
                      renderedEntry.fromSelf ? 'is-self' : 'is-peer',
                      isBotMessage ? 'is-bot' : '',
                      isGroupedWithPrevious ? 'is-grouped-with-previous' : '',
                      isGroupedWithNext ? 'is-grouped-with-next' : '',
                      animatedOutgoingEntryIds.has(entry.id) ? 'is-new-outgoing' : '',
                      isRecallingTextEntry ? 'is-recalling' : '',
                    ].filter(Boolean).join(' ')
                    const actorIdentity = resolveActorIdentity(renderedEntry, isBotMessage)
                    const showSenderIdentity = !isGroupedWithPrevious
                    const showMessageTime = !isGroupedWithNext
                    const avatarClassName = [
                      'dd-snaplink__avatar',
                      showSenderIdentity ? '' : 'is-placeholder',
                    ].filter(Boolean).join(' ')
                    const isImageOnlyMessage =
                      renderedEntry.entryType === 'text' && isImageOnlyRichText(renderedEntry.text)

                    return (
                      <div key={entry.id} className="dd-snaplink__entry">
                        <div className={rowClassName} data-snaplink-entry-id={entry.id}>
                          {!renderedEntry.fromSelf ? (
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
                            {renderedEntry.entryType === 'text' ? (
                              <div
                                className={[
                                  'dd-snaplink__bubble-shell',
                                  isRecallingTextEntry ? 'is-recalling' : '',
                                  isImageOnlyMessage ? 'is-image-comet' : '',
                                ].filter(Boolean).join(' ')}
                                data-recall-phase={isRecallingTextEntry ? 'animating' : recallState?.phase}
                                onPointerMove={isImageOnlyMessage ? handleImageBubbleCometPointerMove : undefined}
                                onPointerLeave={isImageOnlyMessage ? handleImageBubbleCometPointerReset : undefined}
                                onPointerCancel={isImageOnlyMessage ? handleImageBubbleCometPointerReset : undefined}
                              >
                                <div
                                  className={`dd-snaplink__bubble dd-chatbox__bubble--rich${isImageOnlyMessage ? ' is-image-only' : ''}`}
                                  onClick={handleRichBubbleClick}
                                  onContextMenu={(event) => openMessageContextMenu(event, renderedEntry, actorIdentity.displayName)}
                                  dangerouslySetInnerHTML={{
                                    __html: isBotMessage
                                      ? sanitizeBotReplyHtml(renderedEntry.text)
                                      : sanitizeRichTextHtml(renderedEntry.text),
                                  }}
                                />
                                {isRecallingTextEntry ? (
                                  <span className="dd-snaplink__recall-particles" aria-hidden="true">
                                    {snapLinkRecallParticleIndexes.map((particleIndex) => (
                                      <span
                                        key={`${entry.id}-recall-particle-${particleIndex.toString()}`}
                                        style={getSnapLinkRecallParticleStyle(particleIndex)}
                                      />
                                    ))}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              renderFileCard(renderedEntry.file)
                            )}
                            {showMessageTime ? (
                              <span className="dd-snaplink__message-time">
                                {formatMessageClock(renderedEntry.createdAt)}
                              </span>
                            ) : null}
                          </div>
                          {renderedEntry.fromSelf ? (
                            <span className={avatarClassName} aria-hidden="true">
                              {actorIdentity.avatarLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                  {shouldShowAiThinking ? (
                    <div className="dd-snaplink__entry">
                      <div className="dd-snaplink__row is-peer is-bot is-thinking">
                        <span className="dd-snaplink__avatar" aria-hidden="true">
                          AI
                        </span>
                        <div className="dd-snaplink__message-main">
                          <div className="dd-snaplink__sender-meta">
                            <span className="dd-snaplink__sender-name" title="DD直连小助手">
                              DD直连小助手
                            </span>
                            <span className="dd-snaplink__sender-badge is-ai">AI</span>
                          </div>
                          <div className="dd-snaplink__bubble dd-snaplink__thinking" role="status" aria-live="polite">
                            <TextThinkingMatrixLoader />
                            <span className="dd-snaplink__thinking-label">thinking</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  </>
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
                      if (files.length > 0) {
                        armOutgoingEntryAnimation()
                      }
                      onDirectFileSelection(files)
                    }}
                  />
                </label>
                <button
                  ref={ocrTriggerRef}
                  type="button"
                  className={`dd-snaplink__ocr${isOcrPanelOpen ? ' is-active' : ''}`}
                  aria-label="识别图片文字"
                  aria-expanded={isOcrPanelOpen}
                  aria-controls={ocrPanelId}
                  title="识别图片文字"
                  onClick={handleOcrTriggerClick}
                >
                  <ScanText size={16} strokeWidth={2.1} aria-hidden="true" />
                </button>
                <input
                  ref={ocrFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={handleOcrFileSelection}
                />
                <button
                  ref={botTriggerRef}
                  type="button"
                  className={`dd-snaplink__bot${isBotDraft || isBotPanelOpen ? ' is-active' : ''}`}
                  aria-label="输入 @DD直连小助手"
                  aria-expanded={isBotPanelOpen}
                  aria-haspopup="dialog"
                  title="输入 @DD直连小助手"
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
                    aria-label="@DD直连小助手 模型选择"
                  >
                    <button
                      type="button"
                      className="dd-snaplink__bot-option"
                      onClick={handleBotMentionSelect}
                    >
                      <strong>{AI_BOT_MENTION_LABEL}</strong>
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
                            <option key={getAiModelOptionValue(model)} value={getAiModelOptionValue(model)}>
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
      {isOcrPanelOpen && createPortal(
        <div
          id={ocrPanelId}
          ref={ocrPanelRef}
          className="dd-ocr-panel"
          role="dialog"
          aria-label="图片文字识别"
        >
          <div className="dd-ocr-panel__titlebar">
            <div>
              <strong>图片文字识别</strong>
              <span className={`dd-ocr-panel__status is-${ocrStatus}`} aria-live="polite">
                {getSnapLinkOcrStatusLabel(ocrStatus)}
              </span>
            </div>
            <button
              type="button"
              className="dd-ocr-panel__close"
              aria-label="关闭图片文字识别"
              onClick={() => setIsOcrPanelOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="dd-ocr-panel__body">
            <div
              className={`dd-ocr-panel__preview${isOcrDropTarget ? ' is-drop-target' : ''}`}
              onDragEnter={handleOcrDragEnter}
              onDragOver={handleOcrDragOver}
              onDragLeave={handleOcrDragLeave}
              onDrop={(event) => {
                void handleOcrDrop(event)
              }}
            >
              {ocrImage ? (
                <div className="dd-ocr-panel__image-stage">
                  <img src={ocrImage.previewUrl} alt={ocrImage.name} />
                </div>
              ) : (
                <button
                  type="button"
                  className="dd-ocr-panel__empty-preview"
                  onClick={openOcrFilePicker}
                >
                  待选择图片
                </button>
              )}
              {isOcrDropTarget ? (
                <div className="dd-ocr-panel__drop-hint" role="status" aria-live="polite">
                  <strong>拖动图片到这里</strong>
                  <span>松开后开始识别 PNG、JPEG、WebP</span>
                </div>
              ) : null}
            </div>
            <div className="dd-ocr-panel__result">
              <div className="dd-ocr-panel__meta">
                <span>{ocrImage?.name ?? ocrJob?.fileName ?? '未选择图片'}</span>
                {ocrJob?.updatedAt ? <time>{formatSnapLinkOcrTime(ocrJob.updatedAt)}</time> : null}
              </div>
              {ocrStatus === 'running' ? (
                <div className="dd-ocr-panel__running">
                  <span />
                  <span>识别中</span>
                </div>
              ) : null}
              {ocrError ? <p className="dd-ocr-panel__error">{ocrError}</p> : null}
              <textarea
                readOnly
                value={ocrResultText}
                placeholder={ocrStatus === 'failed' ? '识别失败' : '识别完成后显示文本'}
                aria-label="OCR 识别文本"
              />
              <div className="dd-ocr-panel__actions">
                <button type="button" disabled={!hasOcrResultText} onClick={handleCopyOcrText}>
                  复制文本
                </button>
                <button type="button" disabled={!hasOcrResultText} onClick={handleInsertOcrText}>
                  插入输入框
                </button>
                <button type="button" disabled={!hasOcrResultText} onClick={handleSendOcrText}>
                  发送到当前对话
                </button>
                <button type="button" disabled={!canRetryOcr} onClick={handleRetryOcr}>
                  重新识别
                </button>
                <button type="button" onClick={handleClearOcr}>
                  清除
                </button>
              </div>
            </div>
          </div>
          <div className="dd-ocr-panel__history">
            <div className="dd-ocr-panel__history-head">
              <span>最近识别</span>
              <button type="button" disabled={isOcrHistoryLoading} onClick={() => void refreshOcrHistory()}>
                刷新
              </button>
            </div>
            {ocrHistoryError ? <p className="dd-ocr-panel__history-error">{ocrHistoryError}</p> : null}
            {isOcrHistoryLoading ? (
              <div className="dd-ocr-panel__history-empty">加载中</div>
            ) : ocrHistory.length > 0 ? (
              <div className="dd-ocr-panel__history-list">
                {ocrHistory.map((job) => (
                  <div
                    key={job.jobId}
                    className="dd-ocr-panel__history-item"
                  >
                    <button
                      type="button"
                      className="dd-ocr-panel__history-main"
                      onClick={() => handleRestoreOcrHistoryItem(job)}
                    >
                      <span>
                        <strong>{job.fileName ?? 'OCR 记录'}</strong>
                        <small>{formatSnapLinkOcrTime(job.createdAt)}</small>
                      </span>
                      <em>{getSnapLinkOcrHistorySummary(job)}</em>
                    </button>
                    <button
                      type="button"
                      className="dd-ocr-panel__history-delete"
                      aria-label={`删除 ${job.fileName ?? 'OCR 记录'}`}
                      disabled={deletingOcrJobId === job.jobId}
                      onClick={(event) => {
                        void handleDeleteOcrHistoryItem(event, job.jobId)
                      }}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dd-ocr-panel__history-empty">暂无记录</div>
            )}
          </div>
        </div>,
        document.body,
      )}
      {documentPreview && createPortal(
        <DocumentPreviewDialog
          preview={documentPreview}
          onClose={closeDocumentPreview}
        />,
        document.body,
      )}
      {imagePreview && createPortal(
        <div
          className={[
            'dd-image-preview-dialog',
            isImagePreviewZoomed ? 'is-zoomed' : '',
            isImagePreviewReady ? 'is-ready' : '',
            isImagePreviewDragging ? 'is-panning' : '',
          ].filter(Boolean).join(' ')}
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          ref={imagePreviewDialogRef}
        >
          <button
            type="button"
            className="dd-image-preview-dialog__backdrop"
            aria-label={isImagePreviewZoomed ? '退出图片放大' : '关闭图片预览'}
            onClick={handleImagePreviewBlankClick}
            ref={imagePreviewBackdropRef}
          />
          <div className="dd-image-preview-dialog__panel" ref={imagePreviewPanelRef}>
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
            <div className="dd-image-preview-dialog__body" onClick={handleImagePreviewBodyClick}>
              <button
                type="button"
                className="dd-image-preview-dialog__image-button"
                aria-label={isImagePreviewZoomed ? '缩小图片' : '放大图片'}
                onClick={handleImagePreviewImageClick}
                onPointerDown={handleImagePreviewPointerDown}
                onPointerMove={handleImagePreviewPointerMove}
                onPointerUp={endImagePreviewDrag}
                onPointerCancel={endImagePreviewDrag}
                ref={imagePreviewImageButtonRef}
              >
                <img
                  ref={imagePreviewImageRef}
                  src={imagePreview.src}
                  alt={imagePreview.alt}
                  draggable={false}
                  style={imagePreviewImageStyle}
                />
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
