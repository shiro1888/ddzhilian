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
import {
  Bot,
  Copy,
  Command,
  FileUp,
  ImageIcon,
  Laptop,
  Maximize2,
  Minimize2,
  Monitor,
  MoonStar,
  Plus,
  Radio,
  Send,
  ShieldCheck,
  Smartphone,
  SunMedium,
  Tablet,
  Upload,
  Users,
  Wifi,
} from 'lucide-react'
import gsap from 'gsap'
import type {
  AiDraftContextPayload,
  ComposerImageDraft,
  FileConversationEntry,
  OnlineDeviceListItem,
  RoomListItem,
  SharedContentTab,
  UnifiedConversationEntry,
} from '../types'
import type {
  AiModelOption,
  DevicePreferencesPayload,
  DeviceSettingsPayload,
  HistoryFileSummary,
  HistoryTextSummary,
  IncomingFileOffer,
  OcrHistoryResponse,
  OcrJobResponse,
} from '../../lib/ddzhilian-types'
import type { ResolvedThemeMode, ThemeMode } from '../../lib/preferences/theme'
import { applyThemeMode, subscribeToSystemTheme } from '../../lib/preferences/theme-utils'
import { CommandPalette } from './CommandPalette'
import type { CommandPaletteItem } from './CommandPalette'
import { ConfirmReceiveDialog } from './ConfirmReceiveDialog'
import { DeviceRadar } from './DeviceRadar'
import { DeviceCard } from './DeviceCard'
import { DocumentPreviewDialog } from './DocumentPreviewDialog'
import type { DocumentPreviewDialogState } from './DocumentPreviewDialog'
import { DropZone } from './DropZone'
import { FileSendPage } from './FileSendPage'
import { FileMessageCard } from './FileMessageCard'
import { HistoryPage } from './HistoryPage'
import { MessageBubble } from './MessageBubble'
import { MobileWorkbenchNav } from './MobileWorkbenchNav'
import { NearbyDevicesPanel } from './NearbyDevicesPanel'
import { RoomComposer } from './RoomComposer'
import { RoomConversationStream } from './RoomConversationStream'
import { RoomDragOverlay } from './RoomDragOverlay'
import { RoomHeader } from './RoomHeader'
import { RoomsPage } from './RoomsPage'
import { SettingsPanel } from './SettingsPanel'
import { SharedContentPanel } from './SharedContentPanel'
import { SidebarNav } from './SidebarNav'
import { StatusPillsCollapsible } from './StatusPillsCollapsible'
import { TopStatusBar } from './TopStatusBar'
import { TrustDeviceDialog } from './TrustDeviceDialog'
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
import { TextSendPage } from './TextSendPage'
import { ToolContextPanel } from './ToolContextPanel'
import type { ToolContextPanelAction } from './ToolContextPanel'
import { TransferQueuePage } from './TransferQueuePage'
import type { TransferQueuePageTab } from './TransferQueuePage'
import { TransferQueuePanel } from './TransferQueuePanel'
import { TransferTaskCard } from './TransferTaskCard'

type SnapLinkFileEntry = Extract<UnifiedConversationEntry, { entryType: 'file' }>['file']
type SnapLinkTextEntry = Extract<UnifiedConversationEntry, { entryType: 'text' }>
type SnapLinkSharedTab = Exclude<SharedContentTab, 'chat'>
type SnapLinkWorkbenchMode = 'nearby' | 'rooms' | 'files' | 'transfers' | 'text' | 'history' | 'settings'
type SnapLinkWorkbenchTransferTab = TransferQueuePageTab['id']
type SnapLinkTrustActionKind = 'connect' | 'file' | 'text' | 'pick-file' | 'pick-camera'

type SnapLinkPendingTrustAction =
  | {
      deviceId: string
      kind: SnapLinkTrustActionKind
    }
  | {
      deviceId: string
      kind: 'send-files'
      files: File[]
    }

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
const ROOM_JOIN_CODE_MAX_LENGTH = 12

type SnapLinkOcrImageTarget = {
  src: string
  name: string
  mimeType?: string
}

function normalizeRoomJoinCode(value: string) {
  const trimmed = value.trim()
  const queryIndex = trimmed.indexOf('?')
  const hashIndex = trimmed.indexOf('#')
  let candidate = trimmed

  if (queryIndex >= 0 || hashIndex >= 0) {
    const searchStart = queryIndex >= 0 ? queryIndex : hashIndex
    const searchEnd = queryIndex >= 0 && hashIndex > queryIndex ? hashIndex : trimmed.length
    const search = trimmed.slice(searchStart, searchEnd).replace(/^#/, '?')
    const roomParam = new URLSearchParams(search).get('room')

    if (roomParam) {
      candidate = roomParam
    }
  }

  return candidate
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_JOIN_CODE_MAX_LENGTH)
}

type SnapLinkMessageContextMenuState = {
  entryId: string
  text: string
  senderName: string
  fromSelf: boolean
  isBotMessage: boolean
  ocrImage?: SnapLinkOcrImageTarget
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

const snapLinkAiChatSelectionValue = '__snaplink_ai_chat__'
const snapLinkImageSelectionValue = '__snaplink_image__'
const snapLinkCommandSelectionValue = '__snaplink_command__'
const snapLinkComposerMaxHeight = 120
const snapLinkInitialMessageRenderCount = 80
const snapLinkMessageRenderStep = 80
const snapLinkHistoryLoadThreshold = 72
const snapLinkNewOutgoingEntryAnimationMs = 500
const snapLinkNewOutgoingEntryAnimationCleanupMs = snapLinkNewOutgoingEntryAnimationMs + 150
const snapLinkPendingOutgoingEntryAnimationMs = 12_000
const snapLinkThemeStorageKey = 'ddzhilian:snaplink-theme-colors'
const snapLinkThemeModePreferenceKey = 'theme_mode'
const snapLinkThemeModeLocalStorageKey = 'dd_theme'
const snapLinkPreferenceCookieMaxAgeSeconds = 60 * 60 * 24 * 365
const snapLinkThemeColorPattern = /^#[0-9A-Fa-f]{6}$/
const snapLinkThemeSubmitDebounceMs = 700
const snapLinkImagePreviewOpenDuration = 1
const snapLinkImagePreviewOriginFeedbackDuration = 0.18
const snapLinkImagePreviewCloseDuration = 0.34
const snapLinkImagePreviewZoomScale = 1.85
const snapLinkRecallBurstAnimationMs = 720
const snapLinkRecallBurstAnimationCleanupMs = snapLinkRecallBurstAnimationMs + 120
const snapLinkOcrSupportedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const snapLinkOcrFileExtensionByMimeType: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

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

function isSnapLinkThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readSnapLinkCookie(name: string) {
  if (typeof document === 'undefined') {
    return null
  }

  const prefix = `${name}=`
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(prefix))

  if (!cookie) {
    return null
  }

  try {
    return decodeURIComponent(cookie.slice(prefix.length))
  } catch {
    return cookie.slice(prefix.length)
  }
}

function writeSnapLinkClientPreference(name: string, value: string) {
  if (typeof document === 'undefined') {
    return
  }

  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${snapLinkPreferenceCookieMaxAgeSeconds}; SameSite=Lax`
}

function readStoredSnapLinkThemeMode(): ThemeMode {
  if (typeof document === 'undefined') {
    return 'light'
  }

  const domThemeMode = document.documentElement.getAttribute('data-theme-mode')
  if (isSnapLinkThemeMode(domThemeMode)) {
    return domThemeMode
  }

  const cookieThemeMode = readSnapLinkCookie(snapLinkThemeModePreferenceKey)
  if (isSnapLinkThemeMode(cookieThemeMode)) {
    return cookieThemeMode
  }

  if (typeof window !== 'undefined') {
    try {
      const localThemeMode = window.localStorage.getItem(snapLinkThemeModeLocalStorageKey)
      if (isSnapLinkThemeMode(localThemeMode)) {
        return localThemeMode
      }
    } catch {
      // Ignore unavailable localStorage and fall back to light mode.
    }
  }

  return 'light'
}

function resolveInitialSnapLinkThemeMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode !== 'system') {
    return mode
  }

  if (typeof window === 'undefined') {
    return 'light'
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
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

function normalizeSnapLinkImageMimeType(value: string | null | undefined) {
  const normalizedType = value?.split(';', 1)[0]?.trim().toLowerCase()
  if (!normalizedType) {
    return null
  }

  return normalizedType === 'image/jpg' ? 'image/jpeg' : normalizedType
}

function getSupportedSnapLinkOcrMimeType(value: string | null | undefined) {
  const normalizedType = normalizeSnapLinkImageMimeType(value)
  return normalizedType && snapLinkOcrSupportedMimeTypes.has(normalizedType) ? normalizedType : null
}

function isSupportedSnapLinkOcrFile(file: Pick<File, 'name' | 'type'>) {
  const normalizedType = normalizeSnapLinkImageMimeType(file.type)
  if (normalizedType?.startsWith('image/') && !snapLinkOcrSupportedMimeTypes.has(normalizedType)) {
    return false
  }

  return (
    Boolean(normalizedType && snapLinkOcrSupportedMimeTypes.has(normalizedType)) ||
    /\.(png|jpe?g|webp)$/i.test(file.name)
  )
}

function getSnapLinkDataImageMimeType(src: string) {
  const match = /^data:(image\/[^;,]+)/i.exec(src)
  return match ? normalizeSnapLinkImageMimeType(match[1]) : null
}

function getSnapLinkOcrMimeTypeFromSource(src: string) {
  const dataMimeType = getSnapLinkDataImageMimeType(src)
  if (dataMimeType) {
    return dataMimeType
  }

  const normalizedSource = src.split(/[?#]/, 1)[0]?.toLowerCase() ?? ''
  if (/\.(?:jpe?g)$/i.test(normalizedSource)) {
    return 'image/jpeg'
  }

  if (/\.png$/i.test(normalizedSource)) {
    return 'image/png'
  }

  if (/\.webp$/i.test(normalizedSource)) {
    return 'image/webp'
  }

  return null
}

function isKnownUnsupportedSnapLinkOcrSource(src: string) {
  const dataMimeType = getSnapLinkDataImageMimeType(src)
  if (dataMimeType?.startsWith('image/')) {
    return !snapLinkOcrSupportedMimeTypes.has(dataMimeType)
  }

  const normalizedSource = src.split(/[?#]/, 1)[0]?.toLowerCase() ?? ''
  return /\.(?:avif|bmp|gif|heic|svg|tiff?)$/i.test(normalizedSource)
}

function isFetchableSnapLinkOcrImageSource(src: string) {
  const normalizedSource = src.trim()
  if (!normalizedSource) {
    return false
  }

  if (/^(?:data:image\/|blob:)/i.test(normalizedSource)) {
    return true
  }

  if (typeof window === 'undefined') {
    return false
  }

  try {
    const url = new URL(normalizedSource, window.location.href)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function getSnapLinkImageFileNameFromSource(src: string) {
  if (typeof window === 'undefined') {
    return ''
  }

  try {
    const url = new URL(src, window.location.href)
    const fileName = url.pathname.split('/').filter(Boolean).pop()
    return fileName ? decodeURIComponent(fileName) : ''
  } catch {
    return ''
  }
}

function normalizeSnapLinkOcrFileName(name: string, src: string, mimeType: string) {
  const extension = snapLinkOcrFileExtensionByMimeType[mimeType] ?? 'png'
  const rawName = name.trim() || getSnapLinkImageFileNameFromSource(src) || '待识别图片'
  const normalizedName = rawName
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || '待识别图片'

  if (/\.(?:png|jpe?g|webp)$/i.test(normalizedName)) {
    return normalizedName
  }

  const baseName = normalizedName.replace(/\.[^.]+$/, '').trim() || '待识别图片'
  return `${baseName}.${extension}`
}

function createSnapLinkOcrImageTarget(
  src: string | null | undefined,
  name: string | null | undefined,
): SnapLinkOcrImageTarget | null {
  const normalizedSrc = src?.trim()
  if (
    !normalizedSrc ||
    !isFetchableSnapLinkOcrImageSource(normalizedSrc) ||
    isKnownUnsupportedSnapLinkOcrSource(normalizedSrc)
  ) {
    return null
  }

  return {
    src: normalizedSrc,
    name: name?.trim() || getSnapLinkImageFileNameFromSource(normalizedSrc) || '待识别图片',
    mimeType: getSupportedSnapLinkOcrMimeType(getSnapLinkOcrMimeTypeFromSource(normalizedSrc)) ?? undefined,
  }
}

function resolveSnapLinkOcrTargetFromImageElement(image: HTMLImageElement) {
  return createSnapLinkOcrImageTarget(
    image.currentSrc || image.src || image.getAttribute('src'),
    image.alt,
  )
}

function resolveSnapLinkOcrTargetFromRichText(value: string) {
  if (!value || typeof DOMParser === 'undefined') {
    return null
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const images = Array.from(documentFragment.body.querySelectorAll<HTMLImageElement>('img[src]'))
  if (images.length !== 1) {
    return null
  }

  const image = images[0]
  return createSnapLinkOcrImageTarget(image.getAttribute('src'), image.getAttribute('alt'))
}

function resolveSnapLinkContextOcrTarget(
  value: string,
  target: EventTarget | null,
  container: HTMLElement,
) {
  if (target instanceof Element) {
    const image = target.closest<HTMLImageElement>('img[src]')
    if (image && container.contains(image)) {
      return resolveSnapLinkOcrTargetFromImageElement(image)
    }
  }

  return resolveSnapLinkOcrTargetFromRichText(value)
}

async function createSnapLinkOcrFileFromImageTarget(target: SnapLinkOcrImageTarget) {
  let response: Response
  try {
    const fetchImage = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : fetch
    response = await fetchImage(target.src)
  } catch {
    throw new Error('无法读取这张图片，请确认图片仍可访问。')
  }

  if (!response.ok) {
    throw new Error('无法读取这张图片，请确认图片仍可访问。')
  }

  const blob = await response.blob()
  const responseMimeType = normalizeSnapLinkImageMimeType(blob.type)
  if (responseMimeType?.startsWith('image/') && !snapLinkOcrSupportedMimeTypes.has(responseMimeType)) {
    throw new Error('只支持 PNG、JPEG 或 WebP 图片。')
  }

  const mimeType =
    getSupportedSnapLinkOcrMimeType(blob.type) ??
    getSupportedSnapLinkOcrMimeType(target.mimeType) ??
    getSupportedSnapLinkOcrMimeType(getSnapLinkOcrMimeTypeFromSource(target.src))
  if (!mimeType) {
    throw new Error('只支持 PNG、JPEG 或 WebP 图片。')
  }

  return new File(
    [blob],
    normalizeSnapLinkOcrFileName(target.name, target.src, mimeType),
    { type: mimeType, lastModified: Date.now() },
  )
}

function hasSnapLinkDraggedFiles(event: DragEvent<HTMLElement>) {
  return event.dataTransfer.files.length > 0 || Array.from(event.dataTransfer.types).includes('Files')
}

function getSnapLinkOcrHistorySummary(job: OcrJobResponse) {
  const text = getSnapLinkOcrText(job) || job.error || '无文字结果'
  return text.replace(/\s+/g, ' ').slice(0, 80)
}

const snapLinkTrustedDevicesStorageKey = 'ddzhilian:trusted-devices:v1'
const snapLinkAvatarStorageKey = 'dd_avatar'

function readStoredSnapLinkTrustedDeviceIds() {
  if (typeof window === 'undefined') {
    return new Set<string>()
  }

  try {
    const rawValue = window.localStorage.getItem(snapLinkTrustedDevicesStorageKey)
    const parsedValue = rawValue ? JSON.parse(rawValue) : []

    if (!Array.isArray(parsedValue)) {
      return new Set<string>()
    }

    return new Set(
      parsedValue.filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    )
  } catch {
    return new Set<string>()
  }
}

function writeStoredSnapLinkTrustedDeviceIds(deviceIds: Set<string>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      snapLinkTrustedDevicesStorageKey,
      JSON.stringify(Array.from(deviceIds).sort()),
    )
  } catch {
    // localStorage may be unavailable in private contexts; trust state then remains in memory for this tab.
  }
}

function readStoredSnapLinkAvatar() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage.getItem(snapLinkAvatarStorageKey)
  } catch {
    return null
  }
}

function writeStoredSnapLinkAvatar(value: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (value) {
      window.localStorage.setItem(snapLinkAvatarStorageKey, value)
    } else {
      window.localStorage.removeItem(snapLinkAvatarStorageKey)
    }
  } catch {
    // Avatar is local-only; if storage is unavailable, keep the in-memory preview for this tab.
  }
}

function createSnapLinkAvatarDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('头像读取失败'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('头像图片解析失败'))
      image.onload = () => {
        const canvas = document.createElement('canvas')
        const size = 128
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('当前浏览器不支持头像裁切'))
          return
        }

        const scale = Math.max(size / image.width, size / image.height)
        const width = image.width * scale
        const height = image.height * scale
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      image.src = String(reader.result ?? '')
    }
    reader.readAsDataURL(file)
  })
}

function resolveSnapLinkDeviceKind(platform: string) {
  const normalizedPlatform = platform.toLowerCase()

  if (/(iphone|android|phone|mobile|pixel|huawei|xiaomi|oppo|vivo)/i.test(normalizedPlatform)) {
    return 'phone'
  }

  if (/(ipad|tablet|pad)/i.test(normalizedPlatform)) {
    return 'tablet'
  }

  return 'desktop'
}

function resolveSnapLinkTransportMode(device: OnlineDeviceListItem) {
  if (device.scopeLabel.includes('同一网络')) {
    return {
      label: '同一网络',
      tone: 'lan',
    } as const
  }

  if (device.scopeLabel.includes('同一账号')) {
    return {
      label: '同一账号',
      tone: 'remote',
    } as const
  }

  return {
    label: '可互传',
    tone: 'discoverable',
  } as const
}

function resolveSnapLinkTrustLabel(device: OnlineDeviceListItem, isLocallyTrusted: boolean) {
  if (isLocallyTrusted || device.scopeLabel.includes('同一账号')) {
    return '已信任'
  }

  return '未验证'
}

function isSnapLinkDeviceTrusted(device: OnlineDeviceListItem, trustedDeviceIds: Set<string>) {
  return trustedDeviceIds.has(device.deviceId) || device.scopeLabel.includes('同一账号')
}

function formatSnapLinkDeviceFingerprint(device: OnlineDeviceListItem) {
  const source = device.pairToken || device.shortCode || device.deviceId
  const compact = source.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

  if (!compact) {
    return '未知'
  }

  return compact.slice(0, 12).replace(/(.{4})(?=.)/g, '$1 ')
}

function resolveSnapLinkTransferStatus(file: FileConversationEntry) {
  const status = file.transferStatus

  if (status) {
    return status
  }

  if (file.tone === 'completed') {
    return 'completed'
  }

  if (file.tone === 'failed') {
    return 'failed'
  }

  if (file.tone === 'active') {
    return 'transferring'
  }

  return 'queued'
}

function getSnapLinkTransferProgress(file: FileConversationEntry) {
  const status = resolveSnapLinkTransferStatus(file)

  if (status === 'completed') {
    return 1
  }

  if (status === 'transferring' || status === 'failed') {
    return clampProgress(file.progress)
  }

  return 0
}

function isSnapLinkTransferActive(status: ReturnType<typeof resolveSnapLinkTransferStatus>) {
  return (
    status === 'queued' ||
    status === 'waiting_for_target' ||
    status === 'connecting' ||
    status === 'ready' ||
    status === 'transferring'
  )
}

export type SnapLinkStageProps = {
  isDragging: boolean
  activeView: SnapLinkActiveView
  deviceId?: string
  deviceName: string
  devicePlatform: string
  deviceShortCode?: string
  deviceSettings?: Pick<DeviceSettingsPayload, 'autoConnect' | 'discoverable' | 'allowShortCode'>
  devicePreferences?: DevicePreferencesPayload
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
  globalTransferEntries?: FileConversationEntry[]
  sharedMediaEntries?: FileConversationEntry[]
  sharedFileEntries?: FileConversationEntry[]
  sharedLinkEntries?: SnapLinkSharedLinkEntry[]
  historyFiles?: HistoryFileSummary[]
  historyTexts?: HistoryTextSummary[]
  pendingIncomingFileOffers?: IncomingFileOffer[]
  localError: string | null
  errorMessage: string | null
  aiChatElement: ReactNode
  imageElement: ReactNode
  adminElement: ReactNode
  commandElement: ReactNode
  commandResultText?: string
  workbenchTextRequestId?: number
  onCreatePublicRoom: () => void
  onJoinRoom: (roomId: string) => void
  onOpenRoomConversation: (roomId: string) => void
  onUpdateRoomState: (payload: { roomId: string; pinned?: boolean; lastReadAt?: string }) => void
  onStartPrivateChat: (deviceId: string) => void
  onDeviceNameChange: (deviceName: string) => void
  onDeviceSettingsChange: (patch: Partial<Pick<DeviceSettingsPayload, 'autoConnect' | 'discoverable' | 'allowShortCode'>>) => void
  onDevicePreferencesChange: (patch: Partial<DevicePreferencesPayload>) => void
  onRequestSnapshot: () => void
  onOpenRoomHome: () => void
  onOpenAiChatView: () => void
  onOpenImageView: () => void
  onOpenAdminView: () => void
  onOpenCommandView: () => void
  onShareCommandResult?: () => void
  onPrepareAiDraft?: (text: string, context?: AiDraftContextPayload) => void
  onChatDraftChange: (value: string) => void
  onAiModelChange: (modelId: string) => void
  onPastedImageSelection: (files: File[]) => void
  onComposerImageRemove: (id: string) => void
  onDirectFileSelection: (files: File[]) => void
  onDirectFileSelectionForDevice: (deviceId: string, files: File[]) => void
  onDownloadHistoryFile: (file: HistoryFileSummary) => void
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
  onAcceptIncomingFileOffer: (id: string) => void
  onRejectIncomingFileOffer: (id: string) => void
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

  if (room.isAssistant) {
    return 'DD助手 · 随时可用'
  }

  const visibleOnlineCount = Math.min(room.memberCount, Math.max(room.onlineCount, 0) + 1)

  if (room.isPublic) {
    return `${visibleOnlineCount.toString()} 台设备在线`
  }

  if (room.memberCount > 2) {
    return `${visibleOnlineCount.toString()} 位成员在线`
  }

  if (room.status === 'connected' || room.onlineCount > 0) {
    return '对方在线 · 直连中'
  }

  return '对方离线'
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
      badgeLabel: '助手',
      avatarLabel: '助',
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
  devicePlatform,
  deviceShortCode,
  deviceSettings = { autoConnect: true, discoverable: true, allowShortCode: true },
  devicePreferences = { enterToSend: true },
  accountId,
  selectedRoomId,
  autoOpenRoomId,
  selectedConversationName,
  activeTransferLabel,
  roomListItems,
  onlineDeviceItems,
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
  globalTransferEntries = [],
  sharedMediaEntries = [],
  sharedFileEntries = [],
  sharedLinkEntries = [],
  historyFiles = [],
  historyTexts = [],
  pendingIncomingFileOffers = [],
  localError,
  errorMessage,
  aiChatElement,
  imageElement,
  adminElement,
  commandElement,
  commandResultText = '',
  workbenchTextRequestId = 0,
  onCreatePublicRoom,
  onJoinRoom,
  onOpenRoomConversation,
  onUpdateRoomState,
  onStartPrivateChat,
  onDeviceNameChange,
  onDeviceSettingsChange,
  onDevicePreferencesChange,
  onRequestSnapshot,
  onOpenRoomHome,
  onOpenAiChatView,
  onOpenImageView,
  onOpenAdminView,
  onOpenCommandView,
  onShareCommandResult,
  onPrepareAiDraft,
  onChatDraftChange,
  onAiModelChange,
  onPastedImageSelection,
  onComposerImageRemove,
  onDirectFileSelection,
  onDirectFileSelectionForDevice,
  onDownloadHistoryFile,
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
  onAcceptIncomingFileOffer,
  onRejectIncomingFileOffer,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: SnapLinkStageProps) {
  const [isLobbyOpen, setIsLobbyOpen] = useState(activeView === 'conversation')
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null)
  const [copiedHistoryActionId, setCopiedHistoryActionId] = useState<string | null>(null)
  const [settingsFeedbackMessage, setSettingsFeedbackMessage] = useState<string | null>(null)
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
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredSnapLinkThemeMode())
  const [resolvedThemeMode, setResolvedThemeMode] = useState<ResolvedThemeMode>(() =>
    resolveInitialSnapLinkThemeMode(readStoredSnapLinkThemeMode()),
  )
  const [deviceAvatarDataUrl, setDeviceAvatarDataUrl] = useState<string | null>(() => readStoredSnapLinkAvatar())
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isZenMode, setIsZenMode] = useState(false)
  const [selectedWorkbenchDeviceId, setSelectedWorkbenchDeviceId] = useState<string | null>(null)
  const [workbenchDeviceDropTargetId, setWorkbenchDeviceDropTargetId] = useState<string | null>(null)
  const [workbenchMode, setWorkbenchMode] = useState<SnapLinkWorkbenchMode>('rooms')
  const [workbenchTransferTab, setWorkbenchTransferTab] = useState<SnapLinkWorkbenchTransferTab>('active')
  const [isWorkbenchScanning, setIsWorkbenchScanning] = useState(false)
  const [isMobileQueueOpen, setIsMobileQueueOpen] = useState(false)
  const [isDesktopQueueCollapsed, setIsDesktopQueueCollapsed] = useState(true)
  const [isMobileRoomMembersOpen, setIsMobileRoomMembersOpen] = useState(false)
  const [dismissedErrorText, setDismissedErrorText] = useState<string | null>(null)
  const [trustedDeviceIds, setTrustedDeviceIds] = useState<Set<string>>(() => readStoredSnapLinkTrustedDeviceIds())
  const [trustedIncomingOfferIds, setTrustedIncomingOfferIds] = useState<Set<string>>(() => new Set())
  const [pendingTrustAction, setPendingTrustAction] = useState<SnapLinkPendingTrustAction | null>(null)
  const [trustPinDraft, setTrustPinDraft] = useState('')
  const [trustPinError, setTrustPinError] = useState<string | null>(null)
  const [trustRememberDevice, setTrustRememberDevice] = useState(true)
  const [historySearchQuery, setHistorySearchQuery] = useState('')
  const [conversationSearchQuery, setConversationSearchQuery] = useState('')
  const [roomJoinDraft, setRoomJoinDraft] = useState('')
  const [roomJoinError, setRoomJoinError] = useState<string | null>(null)
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
  const handledInitialDesktopRoomOpenRef = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null)
  const workbenchFileInputRef = useRef<HTMLInputElement | null>(null)
  const workbenchCameraInputRef = useRef<HTMLInputElement | null>(null)
  const workbenchScanResetTimeoutRef = useRef<number | null>(null)
  const settingsFeedbackTimeoutRef = useRef<number | null>(null)
  const previousWorkbenchTextRequestIdRef = useRef(workbenchTextRequestId)
  const isComposerComposingRef = useRef(false)
  const activeErrorText = localError ?? errorMessage
  const visibleErrorText = activeErrorText && dismissedErrorText !== activeErrorText ? activeErrorText : null

  useEffect(() => {
    setDismissedErrorText(null)
  }, [activeErrorText])

  useEffect(() => {
    setTrustedIncomingOfferIds((current) => {
      if (current.size === 0) {
        return current
      }

      const pendingOfferIds = new Set(pendingIncomingFileOffers.map((offer) => offer.id))
      let changed = false
      const next = new Set<string>()

      for (const offerId of current) {
        if (pendingOfferIds.has(offerId)) {
          next.add(offerId)
        } else {
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [pendingIncomingFileOffers])

  const trustDeviceLocally = useCallback((deviceId: string) => {
    if (!deviceId.trim()) {
      return
    }

    setTrustedDeviceIds((current) => {
      if (current.has(deviceId)) {
        return current
      }

      const next = new Set(current)
      next.add(deviceId)
      writeStoredSnapLinkTrustedDeviceIds(next)
      return next
    })
  }, [])
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
    setIsMobileRoomMembersOpen(false)
  }, [selectedRoomId])

  useEffect(() => () => {
    if (workbenchScanResetTimeoutRef.current !== null) {
      window.clearTimeout(workbenchScanResetTimeoutRef.current)
      workbenchScanResetTimeoutRef.current = null
    }
    if (settingsFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(settingsFeedbackTimeoutRef.current)
      settingsFeedbackTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const nextResolvedThemeMode = applyThemeMode(themeMode)
    setResolvedThemeMode(nextResolvedThemeMode)

    if (themeMode !== 'system') {
      return undefined
    }

    return subscribeToSystemTheme((nextResolvedMode) => {
      applyThemeMode('system')
      setResolvedThemeMode(nextResolvedMode)
    })
  }, [themeMode])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const handleCommandShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsCommandPaletteOpen(true)
      }
    }

    window.addEventListener('keydown', handleCommandShortcut)
    return () => window.removeEventListener('keydown', handleCommandShortcut)
  }, [])

  const showSettingsFeedback = (message: string) => {
    setSettingsFeedbackMessage(message)
    if (settingsFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(settingsFeedbackTimeoutRef.current)
    }
    settingsFeedbackTimeoutRef.current = window.setTimeout(() => {
      setSettingsFeedbackMessage(null)
      settingsFeedbackTimeoutRef.current = null
    }, 1600)
  }

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

  useEffect(() => {
    if (
      handledInitialDesktopRoomOpenRef.current ||
      activeView !== 'conversation' ||
      !isLobbyOpen ||
      !selectedRoomId ||
      typeof window === 'undefined' ||
      !window.matchMedia('(min-width: 761px)').matches
    ) {
      return
    }

    handledInitialDesktopRoomOpenRef.current = true
    setIsLobbyOpen(false)
  }, [activeView, isLobbyOpen, selectedRoomId])

  const lobbyRoomListItems = useMemo(
    () =>
      [...roomListItems].sort((left, right) => {
        if (left.pinned !== right.pinned) {
          return left.pinned ? -1 : 1
        }

        if (left.isPublic && right.isPublic) {
          return (left.publicIndex ?? Number.MAX_SAFE_INTEGER) - (right.publicIndex ?? Number.MAX_SAFE_INTEGER)
        }

        if (left.isPublic !== right.isPublic) {
          return left.isPublic ? -1 : 1
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      }),
    [roomListItems],
  )
  const workbenchRoomListItems = useMemo(() => lobbyRoomListItems.slice(0, 6), [lobbyRoomListItems])
  const workbenchPublicRoomCount = lobbyRoomListItems.filter((room) => room.isPublic).length
  const pendingIncomingOfferEntries = useMemo<FileConversationEntry[]>(
    () =>
      pendingIncomingFileOffers.map((offer) => ({
        id: `pending-offer-${offer.id}`,
        historyId: offer.historyId,
        sessionId: offer.sessionId,
        kind: 'incoming' as const,
        fromSelf: false,
        createdAt: offer.createdAt,
        fileName: offer.name,
        fileSize: offer.size,
        mimeType: offer.mimeType,
        subtitle: offer.fromDeviceName || '附近设备',
        detail: `${formatFileSize(offer.size)} · 等待确认后开始接收`,
        statusLabel: '等待接收确认',
        transferStatus: 'ready' as const,
        tone: 'pending' as const,
        progress: 0,
      })),
    [pendingIncomingFileOffers],
  )
  const workbenchTransferEntries = useMemo(
    () =>
      [...pendingIncomingOfferEntries, ...globalTransferEntries]
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 8),
    [globalTransferEntries, pendingIncomingOfferEntries],
  )
  const workbenchHistoryFileEntries = useMemo(
    () =>
      [...sharedMediaEntries, ...sharedFileEntries]
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [sharedFileEntries, sharedMediaEntries],
  )
  const workbenchGlobalHistoryFiles = useMemo(
    () => [...historyFiles].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [historyFiles],
  )
  const workbenchGlobalHistoryTexts = useMemo(
    () => [...historyTexts].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [historyTexts],
  )
  const workbenchTextEntries = useMemo(
    () =>
      unifiedConversationEntries
        .filter((entry): entry is SnapLinkTextEntry => entry.entryType === 'text')
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 12),
    [unifiedConversationEntries],
  )
  const normalizedHistorySearchQuery = historySearchQuery.trim().toLowerCase()
  const workbenchFilteredGlobalHistoryFiles = useMemo(
    () => {
      if (!normalizedHistorySearchQuery) {
        return workbenchGlobalHistoryFiles
      }

      return workbenchGlobalHistoryFiles.filter((file) =>
        [
          file.fileName,
          file.sourceDeviceName,
          file.mimeType ?? '',
          file.isPublic ? '公共房间' : '私密会话',
        ].join(' ').toLowerCase().includes(normalizedHistorySearchQuery),
      )
    },
    [normalizedHistorySearchQuery, workbenchGlobalHistoryFiles],
  )
  const workbenchFilteredHistoryFileEntries = useMemo(
    () => {
      if (!normalizedHistorySearchQuery) {
        return workbenchHistoryFileEntries
      }

      return workbenchHistoryFileEntries.filter((file) =>
        [
          file.fileName,
          file.subtitle,
          file.detail,
          file.statusLabel,
          file.mimeType ?? '',
        ].join(' ').toLowerCase().includes(normalizedHistorySearchQuery),
      )
    },
    [normalizedHistorySearchQuery, workbenchHistoryFileEntries],
  )
  const workbenchFilteredGlobalHistoryTexts = useMemo(
    () => {
      if (!normalizedHistorySearchQuery) {
        return workbenchGlobalHistoryTexts
      }

      return workbenchGlobalHistoryTexts.filter((entry) =>
        [
          entry.sourceDeviceName,
          getRichTextPreviewText(entry.text),
        ].join(' ').toLowerCase().includes(normalizedHistorySearchQuery),
      )
    },
    [normalizedHistorySearchQuery, workbenchGlobalHistoryTexts],
  )
  const workbenchFilteredTextEntries = useMemo(
    () => {
      if (!normalizedHistorySearchQuery) {
        return workbenchTextEntries
      }

      return workbenchTextEntries.filter((entry) =>
        [
          entry.senderName,
          getRichTextPreviewText(entry.text),
          entry.status ?? '',
        ].join(' ').toLowerCase().includes(normalizedHistorySearchQuery),
      )
    },
    [normalizedHistorySearchQuery, workbenchTextEntries],
  )
  const workbenchFilteredLinkEntries = useMemo(
    () => {
      if (!normalizedHistorySearchQuery) {
        return sharedLinkEntries
      }

      return sharedLinkEntries.filter((entry) =>
        [
          entry.label,
          entry.url,
          entry.sourceName,
        ].join(' ').toLowerCase().includes(normalizedHistorySearchQuery),
      )
    },
    [normalizedHistorySearchQuery, sharedLinkEntries],
  )
  const workbenchActiveTransferCount = workbenchTransferEntries.filter((file) =>
    isSnapLinkTransferActive(resolveSnapLinkTransferStatus(file)),
  ).length
  const activeTransferSpeedLabel = workbenchTransferEntries.find((file) =>
    isSnapLinkTransferActive(resolveSnapLinkTransferStatus(file)) && file.transferSpeedLabel,
  )?.transferSpeedLabel
  const workbenchCompletedTransferCount = workbenchTransferEntries.filter(
    (file) => resolveSnapLinkTransferStatus(file) === 'completed',
  ).length
  const workbenchFailedTransferCount = workbenchTransferEntries.filter(
    (file) => resolveSnapLinkTransferStatus(file) === 'failed',
  ).length
  const workbenchVisibleTransferQueueCount = workbenchTransferEntries.filter(
    (file) => file.tone !== 'completed',
  ).length
  const activeIncomingReceiveEntries = workbenchTransferEntries.filter((file) =>
    !file.fromSelf && isSnapLinkTransferActive(resolveSnapLinkTransferStatus(file)),
  )
  const latestIncomingReceiveEntry = activeIncomingReceiveEntries[0] ?? null
  const latestIncomingFileOffer = pendingIncomingFileOffers[0] ?? null
  const shouldAutoExpandDesktopQueue =
    workbenchActiveTransferCount > 0 ||
    workbenchFailedTransferCount > 0 ||
    activeIncomingReceiveEntries.length > 0 ||
    pendingIncomingFileOffers.length > 0
  const selectedWorkbenchDevice =
    onlineDeviceItems.find((device) => device.deviceId === selectedWorkbenchDeviceId) ??
    onlineDeviceItems[0] ??
    null
  const pendingTrustDevice = pendingTrustAction
    ? onlineDeviceItems.find((device) => device.deviceId === pendingTrustAction.deviceId) ?? null
    : null
  const workbenchOnlineDeviceCount = onlineDeviceItems.length
  const workbenchDiscoveryHint = workbenchOnlineDeviceCount > 0
    ? `${workbenchOnlineDeviceCount.toString()} 台设备在线 · 可互传`
    : '等待另一台设备打开 DD直连'
  const workbenchDropSubtitle = selectedWorkbenchDevice
    ? `已预选 ${selectedWorkbenchDevice.deviceName}，选择文件后会建立直连并发送`
    : activeTransferLabel || '选择附近设备后开始传输'
  const workbenchRawHistoryFileCount = Math.max(workbenchGlobalHistoryFiles.length, workbenchHistoryFileEntries.length)
  const workbenchRawHistoryTextCount = Math.max(workbenchGlobalHistoryTexts.length, workbenchTextEntries.length)
  const workbenchRawHistoryCount = workbenchRawHistoryFileCount + workbenchRawHistoryTextCount + sharedLinkEntries.length
  const workbenchHistoryFileCount = Math.max(
    workbenchFilteredGlobalHistoryFiles.length,
    workbenchFilteredHistoryFileEntries.length,
  )
  const workbenchHistoryTextCount = Math.max(
    workbenchFilteredGlobalHistoryTexts.length,
    workbenchFilteredTextEntries.length,
  )
  const workbenchHistoryCount =
    workbenchHistoryFileCount + workbenchHistoryTextCount + workbenchFilteredLinkEntries.length
  const aiTransferContextFiles = useMemo(() => {
    const byKey = new Map<
      string,
      {
        id: string
        name: string
        size: number
        mimeType?: string
        source: string
        status: string
        createdAt: string
      }
    >()

    const addFile = (file: {
      id: string
      name: string
      size: number
      mimeType?: string
      source: string
      status: string
      createdAt: string
    }) => {
      const key = `${file.name}::${file.size.toString()}::${file.createdAt}`
      if (!byKey.has(key)) {
        byKey.set(key, file)
      }
    }

    for (const file of [...globalTransferEntries, ...sharedFileEntries, ...sharedMediaEntries]) {
      addFile({
        id: file.id,
        name: file.fileName,
        size: file.fileSize,
        mimeType: file.mimeType,
        source: file.fromSelf ? `发送到 ${file.subtitle}` : `来自 ${file.subtitle}`,
        status: file.statusLabel,
        createdAt: file.createdAt,
      })
    }

    for (const file of historyFiles) {
      addFile({
        id: file.historyId,
        name: file.fileName,
        size: file.size,
        mimeType: file.mimeType,
        source: file.sourceDeviceName,
        status: file.isPublic ? '公共房间历史' : '私密会话历史',
        createdAt: file.createdAt,
      })
    }

    return Array.from(byKey.values())
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 5)
  }, [globalTransferEntries, historyFiles, sharedFileEntries, sharedMediaEntries])
  const buildAiTransferAnalysisPrompt = () => {
    if (aiTransferContextFiles.length === 0) {
      return [
        '请帮我为 DD直连文件传输生成一份简短说明。',
        '',
        '场景：我准备把文件直接发送给附近设备。',
        '请按“发送前检查 / 接收方需要做什么 / 注意事项 / 推荐文案”输出。',
      ].join('\n')
    }

    return [
      '请基于下面这些 DD直连传输文件，帮我生成一份简洁的文件说明和接收方注意事项。',
      '',
      '文件列表：',
      ...aiTransferContextFiles.map((file, index) => {
        const mimeLabel = file.mimeType ? `，类型：${file.mimeType}` : ''
        return `${(index + 1).toString()}. ${file.name}（${formatFileSize(file.size)}${mimeLabel}，来源：${file.source}，状态：${file.status}）`
      }),
      '',
      '请按“文件概览 / 可能用途 / 接收方需要做什么 / 注意事项 / 可直接发送的说明文案”输出。',
      '如果需要读取正文内容，请提醒我把对应文件拖入 AI 输入框。DD助手只读取我选择的内容。',
    ].join('\n')
  }
  const buildAiTransferAnalysisContext = (): AiDraftContextPayload | undefined => {
    if (aiTransferContextFiles.length === 0) {
      return {
        contextLabel: 'DD直连传输说明',
      }
    }

    return {
      contextLabel: `传输文件 · ${aiTransferContextFiles.length.toString()}`,
      contextItems: aiTransferContextFiles.map((file) => ({
        id: file.id,
        label: file.name,
        meta: `${formatFileSize(file.size)} · ${file.source}`,
      })),
    }
  }
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
    { id: 'files', label: '文件', count: sharedFileEntries.length },
    { id: 'media', label: '媒体', count: sharedMediaEntries.length },
    { id: 'links', label: '链接', count: sharedLinkEntries.length },
  ]
  const sharedContentCount = sharedTabItems.reduce((total, item) => total + item.count, 0)
  const activeSharedTabItem = sharedTabItems.find((item) => item.id === effectiveActiveSharedTab)

  const roomStatusLabel = resolveRoomLabel(selectedRoom, activeTransferLabel)
  const selectedRoomShareValue = useMemo(() => {
    if (!selectedRoomId) {
      return undefined
    }

    if (typeof window === 'undefined') {
      return selectedRoomId
    }

    const url = new URL(window.location.href)
    url.searchParams.set('room', selectedRoomId)
    return url.toString()
  }, [selectedRoomId])
  const isSelectedRoomPublic = Boolean(selectedRoom?.isPublic)
  const isSelectedRoomAssistant = Boolean(selectedRoom?.isAssistant)
  const isSelectedGroupRoom =
    Boolean(selectedRoom) && !isSelectedRoomPublic && !isSelectedRoomAssistant && (selectedRoom?.memberCount ?? 0) > 2
  const selectedRoomShareSubtitle = selectedRoomId
    ? isSelectedRoomPublic
      ? `房间码 ${selectedRoomId}`
      : '分享链接'
    : undefined
  const selectedRoomCopyLabel = isSelectedRoomPublic ? '复制房间码' : '复制链接'
  const selectedRoomCopiedLabel = isSelectedRoomPublic ? '已复制房间码' : '已复制链接'
  const selectedRoomMoreDetails = isSelectedRoomAssistant
    ? [
        {
          id: 'assistant',
          label: '助手',
          value: '随时可用',
          tone: 'safe' as const,
        },
        {
          id: 'model',
          label: '模型',
          value: selectedAiModelLabel || '默认模型',
        },
        {
          id: 'search',
          label: '联网搜索',
          value: '按需开启',
        },
      ]
    : isSelectedRoomPublic
      ? [
          {
            id: 'online',
            label: '在线设备',
            value: `${selectedRoomOnlineCount.toString()} 台`,
            tone: 'safe' as const,
          },
          {
            id: 'scope',
            label: '谁能看到',
            value: '同一网络内的设备',
          },
          {
            id: 'retention',
            label: '内容保留',
            value: '24 小时',
          },
        ]
      : isSelectedGroupRoom
        ? [
            {
              id: 'members',
              label: '成员',
              value: `${selectedRoomOnlineCount.toString()} / ${(selectedRoom?.memberCount ?? 1).toString()} 在线`,
              tone: selectedRoomOnlineCount > 1 ? 'safe' as const : 'default' as const,
            },
            {
              id: 'connection',
              label: '连接',
              value: selectedRoomOnlineCount > 1 ? '直连中' : '等待成员上线',
              tone: selectedRoomOnlineCount > 1 ? 'safe' as const : 'warning' as const,
            },
            {
              id: 'join',
              label: '进入方式',
              value: '扫码或输入房间码',
            },
          ]
        : [
            {
              id: 'connection',
              label: '连接',
              value: selectedRoomOnlineCount > 1 || selectedRoom?.status === 'connected' ? '直连中' : '对方离线',
              tone: selectedRoomOnlineCount > 1 || selectedRoom?.status === 'connected' ? 'safe' as const : 'warning' as const,
            },
            {
              id: 'network',
              label: '网络',
              value: '同一网络或远程可用',
            },
            {
              id: 'trust',
              label: '信任',
              value: '首次发送需确认',
              tone: 'warning' as const,
            },
          ]
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
    if (shouldAutoExpandDesktopQueue) {
      setIsDesktopQueueCollapsed(false)
      return
    }

    if (workbenchVisibleTransferQueueCount === 0) {
      setIsDesktopQueueCollapsed(true)
    }
  }, [shouldAutoExpandDesktopQueue, workbenchVisibleTransferQueueCount])

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
    setWorkbenchMode('rooms')
    onOpenAiChatView()
  }

  const handleOpenImage = () => {
    setActiveSharedTab(null)
    setIsLobbyOpen(false)
    onOpenImageView()
  }

  const handleOpenCommand = () => {
    setActiveSharedTab(null)
    setIsLobbyOpen(false)
    onOpenCommandView()
  }

  const openAvatarPicker = () => {
    avatarFileInputRef.current?.click()
  }

  const handleAvatarFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!file) {
      return
    }

    if (!file.type.toLowerCase().startsWith('image/')) {
      showSettingsFeedback('请选择图片作为头像')
      return
    }

    void createSnapLinkAvatarDataUrl(file)
      .then((dataUrl) => {
        setDeviceAvatarDataUrl(dataUrl)
        writeStoredSnapLinkAvatar(dataUrl)
        showSettingsFeedback('头像已更新')
      })
      .catch((error) => {
        showSettingsFeedback(error instanceof Error ? error.message : '头像处理失败')
      })
  }

  const updateWorkbenchThemeMode = (nextThemeMode: ThemeMode) => {
    setThemeMode(nextThemeMode)
    writeSnapLinkClientPreference(snapLinkThemeModePreferenceKey, nextThemeMode)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(snapLinkThemeModeLocalStorageKey, nextThemeMode)
      } catch {
        // Cookie persistence above is enough when localStorage is unavailable.
      }
    }

    if (typeof window !== 'undefined') {
      setResolvedThemeMode(applyThemeMode(nextThemeMode))
    }
  }

  const toggleResolvedThemeMode = () => {
    const nextThemeMode: ThemeMode = resolvedThemeMode === 'dark' ? 'light' : 'dark'
    updateWorkbenchThemeMode(nextThemeMode)
    showSettingsFeedback(nextThemeMode === 'dark' ? '已切换深色模式' : '已切换浅色模式')
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

    if (roomId === snapLinkImageSelectionValue) {
      handleOpenImage()
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

  const handleToggleWorkbenchRoomPinned = (room: RoomListItem) => {
    onUpdateRoomState({
      roomId: room.roomId,
      pinned: !room.pinned,
    })
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

  const commitWorkbenchDeviceRename = () => {
    const normalizedName = deviceNameDraft.trim()
    if (!normalizedName) {
      setDeviceNameError('设备名不能为空')
      return false
    }

    const nextName = normalizedName.slice(0, 80)
    onDeviceNameChange(nextName)
    setDeviceNameDraft(nextName)
    setDeviceNameError(null)
    setIsRenamingDevice(false)
    return true
  }

  const handleBackToLobby = () => {
    setActiveSharedTab(null)
    setIsLobbyOpen(true)
    onOpenRoomHome()
  }

  const shouldShowConversationOnDesktop = () =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 761px)').matches

  const handleShowWorkbenchNearby = () => {
    handleBackToLobby()
    setWorkbenchMode('nearby')
  }

  const handleWorkbenchRescan = () => {
    setSelectedWorkbenchDeviceId(null)
    setIsWorkbenchScanning(true)
    onRequestSnapshot()

    if (workbenchScanResetTimeoutRef.current !== null) {
      window.clearTimeout(workbenchScanResetTimeoutRef.current)
    }

    workbenchScanResetTimeoutRef.current = window.setTimeout(() => {
      setIsWorkbenchScanning(false)
      workbenchScanResetTimeoutRef.current = null
    }, 900)
  }

  const handleShowWorkbenchRooms = () => {
    setActiveSharedTab(null)
    onOpenRoomHome()
    setIsLobbyOpen(!(selectedRoomId && shouldShowConversationOnDesktop()))
    setWorkbenchMode('rooms')
  }

  const handleShowWorkbenchQueue = () => {
    handleBackToLobby()
    setWorkbenchTransferTab((current) => (current === 'history' ? 'active' : current))
    setWorkbenchMode('transfers')
  }

  const handleShowWorkbenchFiles = () => {
    handleBackToLobby()
    setWorkbenchMode('files')
  }

  const handleShowWorkbenchText = () => {
    handleBackToLobby()
    setWorkbenchMode('text')
  }

  useEffect(() => {
    if (previousWorkbenchTextRequestIdRef.current === workbenchTextRequestId) {
      return
    }

    previousWorkbenchTextRequestIdRef.current = workbenchTextRequestId
    setActiveSharedTab(null)
    setIsLobbyOpen(true)
    onOpenRoomHome()
    setWorkbenchMode('text')
  }, [onOpenRoomHome, workbenchTextRequestId])

  const handleShowWorkbenchHistory = () => {
    handleBackToLobby()
    setWorkbenchMode('history')
  }

  const handleShowWorkbenchSettings = () => {
    handleBackToLobby()
    setDeviceNameDraft(deviceName)
    setDeviceNameError(null)
    setWorkbenchMode('settings')
  }

  const handleCreatePublicRoom = () => {
    const existingPublicRoom = lobbyRoomListItems.find((room) => room.isPublic)

    setRoomJoinError(null)

    if (existingPublicRoom) {
      handleRoomSelection(existingPublicRoom.roomId)
      return
    }

    handleBackToLobby()
    setWorkbenchMode('rooms')
    onCreatePublicRoom()
  }

  const handleJoinRoomFromWorkbench = () => {
    const normalizedRoomId = normalizeRoomJoinCode(roomJoinDraft)
    if (!normalizedRoomId) {
      setRoomJoinError('请输入房间短码')
      return
    }

    setRoomJoinError(null)
    setRoomJoinDraft(normalizedRoomId)
    handleBackToLobby()
    setWorkbenchMode('rooms')
    onJoinRoom(normalizedRoomId)
  }

  const handlePrepareWorkbenchDeviceTarget = (deviceId: string) => {
    setSelectedWorkbenchDeviceId(deviceId)
    setActiveSharedTab(null)
    onStartPrivateChat(deviceId)
  }

  const executeWorkbenchDeviceAction = (action: SnapLinkPendingTrustAction) => {
    if (action.kind === 'send-files') {
      setWorkbenchMode('files')
      setSelectedWorkbenchDeviceId(action.deviceId)
      setActiveSharedTab(null)
      armOutgoingEntryAnimation()
      onDirectFileSelectionForDevice(action.deviceId, action.files)
      return
    }

    if (action.kind === 'pick-file' || action.kind === 'pick-camera') {
      setWorkbenchMode('files')
      setSelectedWorkbenchDeviceId(action.deviceId)
      setActiveSharedTab(null)
      window.requestAnimationFrame(() => {
        if (action.kind === 'pick-camera') {
          workbenchCameraInputRef.current?.click()
        } else {
          workbenchFileInputRef.current?.click()
        }
      })
      return
    }

    handlePrepareWorkbenchDeviceTarget(action.deviceId)

    if (action.kind === 'file') {
      setWorkbenchMode('files')
      return
    }

    if (action.kind === 'text') {
      setWorkbenchMode('text')
      window.requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
      return
    }
  }

  const requestTrustedWorkbenchDeviceAction = (deviceId: string, kind: SnapLinkTrustActionKind) => {
    const device = onlineDeviceItems.find((item) => item.deviceId === deviceId)
    const action: SnapLinkPendingTrustAction = { deviceId, kind }

    if (!device || isSnapLinkDeviceTrusted(device, trustedDeviceIds)) {
      executeWorkbenchDeviceAction(action)
      return
    }

    setTrustPinDraft('')
    setTrustPinError(null)
    setTrustRememberDevice(true)
    setPendingTrustAction(action)
  }

  const requestTrustedWorkbenchFileSend = (deviceId: string, files: File[]) => {
    if (files.length === 0) {
      return
    }

    const device = onlineDeviceItems.find((item) => item.deviceId === deviceId)
    const action: SnapLinkPendingTrustAction = { deviceId, kind: 'send-files', files }

    if (!device || isSnapLinkDeviceTrusted(device, trustedDeviceIds)) {
      executeWorkbenchDeviceAction(action)
      return
    }

    setTrustPinDraft('')
    setTrustPinError(null)
    setTrustRememberDevice(true)
    setPendingTrustAction(action)
  }

  const handleWorkbenchFilePick = () => {
    setWorkbenchMode('files')

    if (selectedWorkbenchDevice) {
      requestTrustedWorkbenchDeviceAction(selectedWorkbenchDevice.deviceId, 'pick-file')
      return
    }

    workbenchFileInputRef.current?.click()
  }

  const handleWorkbenchCameraPick = () => {
    setWorkbenchMode('files')

    if (selectedWorkbenchDevice) {
      requestTrustedWorkbenchDeviceAction(selectedWorkbenchDevice.deviceId, 'pick-camera')
      return
    }

    workbenchCameraInputRef.current?.click()
  }

  const handleWorkbenchDeviceSelect = (deviceId: string) => {
    setSelectedWorkbenchDeviceId(deviceId)
  }

  const handleWorkbenchDeviceListClick = (deviceId: string) => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      handleWorkbenchDeviceSendText(deviceId)
      return
    }

    setSelectedWorkbenchDeviceId(deviceId)
  }

  const handleWorkbenchDeviceSendFile = (deviceId: string) => {
    requestTrustedWorkbenchDeviceAction(deviceId, 'file')
  }

  const handleWorkbenchDeviceSendText = (deviceId: string) => {
    requestTrustedWorkbenchDeviceAction(deviceId, 'text')
  }

  const handleWorkbenchDeviceTrust = (deviceId: string) => {
    const device = onlineDeviceItems.find((item) => item.deviceId === deviceId)

    if (!device) {
      setSelectedWorkbenchDeviceId(deviceId)
      return
    }

    setSelectedWorkbenchDeviceId(deviceId)
    setTrustPinDraft('')
    setTrustPinError(null)
    setTrustRememberDevice(!isSnapLinkDeviceTrusted(device, trustedDeviceIds))
    setPendingTrustAction({ deviceId, kind: 'connect' })
  }

  const handleWorkbenchDeviceDetail = (deviceId: string) => {
    setSelectedWorkbenchDeviceId(deviceId)
  }

  const handleWorkbenchDeviceDragEnter = (deviceId: string) => {
    setWorkbenchDeviceDropTargetId(deviceId)
  }

  const handleWorkbenchDeviceDragOver = (deviceId: string) => {
    setWorkbenchDeviceDropTargetId(deviceId)
  }

  const handleWorkbenchDeviceDragLeave = (deviceId: string) => {
    setWorkbenchDeviceDropTargetId((current) => (current === deviceId ? null : current))
  }

  const handleWorkbenchDeviceDropFiles = async (deviceId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setWorkbenchDeviceDropTargetId(null)

    const files = await collectDroppedFiles(event.dataTransfer)
    if (files.length === 0) {
      return
    }

    setSelectedWorkbenchDeviceId(deviceId)
    setWorkbenchMode('files')
    requestTrustedWorkbenchFileSend(deviceId, files)
  }

  const handleCancelTrustDeviceDialog = () => {
    setPendingTrustAction(null)
    setTrustPinDraft('')
    setTrustPinError(null)
  }

  const handleConfirmTrustDeviceDialog = (rememberDevice: boolean) => {
    if (!pendingTrustAction || !pendingTrustDevice) {
      handleCancelTrustDeviceDialog()
      return
    }

    const normalizedPin = trustPinDraft.trim().toUpperCase()
    const expectedPin = pendingTrustDevice.shortCode?.trim().toUpperCase()

    if (normalizedPin && expectedPin && normalizedPin !== expectedPin) {
      setTrustPinError('短码不一致，请核对对方页面显示的短码。')
      return
    }

    if (rememberDevice) {
      trustDeviceLocally(pendingTrustDevice.deviceId)
    }

    const action = pendingTrustAction
    setPendingTrustAction(null)
    setTrustPinDraft('')
    setTrustPinError(null)
    executeWorkbenchDeviceAction(action)
  }


  const handleCopyRoomId = () => {
    if (!selectedRoomId) {
      return
    }

    const copyValue = isSelectedRoomPublic ? selectedRoomId : selectedRoomShareValue ?? selectedRoomId
    setCopiedRoomId(selectedRoomId)
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(copyValue)
    }
    window.setTimeout(() => setCopiedRoomId(null), 1600)
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

  const handleDirectFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length > 0) {
      armOutgoingEntryAnimation()
    }
    onDirectFileSelection(files)
  }

  const openCurrentFilePicker = () => {
    const roomFileInput = typeof document !== 'undefined'
      ? document.getElementById(fileInputId)
      : null

    if (roomFileInput instanceof HTMLInputElement) {
      roomFileInput.click()
      return
    }

    handleWorkbenchFilePick()
  }

  const handleWorkbenchDirectFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) {
      return
    }

    if (selectedWorkbenchDevice) {
      requestTrustedWorkbenchFileSend(selectedWorkbenchDevice.deviceId, files)
      return
    }

    armOutgoingEntryAnimation()
    onDirectFileSelection(files)
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
    setIsBotPanelOpen(false)
    botMentionTriggerRangeRef.current = null
    focusComposerInput(nextCaretPosition)
  }

  const handleEmojiBackspace = () => {
    const input = inputRef.current
    const currentDraft = getComposerDraft()
    const selectionStart = input?.selectionStart ?? currentDraft.length
    const selectionEnd = input?.selectionEnd ?? currentDraft.length

    if (selectionStart !== selectionEnd) {
      const nextDraft = `${currentDraft.slice(0, selectionStart)}${currentDraft.slice(selectionEnd)}`
      commitComposerDraft(nextDraft, selectionStart)
      focusComposerInput(selectionStart)
      return
    }

    if (selectionStart <= 0) {
      focusComposerInput(0)
      return
    }

    const beforeCaret = Array.from(currentDraft.slice(0, selectionStart))
    beforeCaret.pop()
    const nextPrefix = beforeCaret.join('')
    const nextDraft = `${nextPrefix}${currentDraft.slice(selectionStart)}`
    commitComposerDraft(nextDraft, nextPrefix.length)
    focusComposerInput(nextPrefix.length)
  }

  const handleEmojiSend = () => {
    setIsEmojiPickerOpen(false)
    submitComposerDraft()
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

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      submitComposerDraft()
      return
    }

    if (!devicePreferences.enterToSend || event.shiftKey) {
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

  const openOcrPanel = () => {
    setIsOcrPanelOpen(true)
    setIsEmojiPickerOpen(false)
    setIsBotPanelOpen(false)
    setIsThemePanelOpen(false)
    botMentionTriggerRangeRef.current = null
  }

  const handleOcrTriggerClick = () => {
    openOcrPanel()
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

    const ocrImage = resolveSnapLinkContextOcrTarget(entry.text, event.target, event.currentTarget)
    const menuWidth = 148
    const menuHeight = ocrImage ? 196 : 156
    const margin = 8
    const isBotMessage = entry.sourceDeviceId === 'bot_cloudflare_ai'
    setMessageContextMenu({
      entryId: entry.id,
      text: entry.text,
      senderName,
      fromSelf: entry.fromSelf,
      isBotMessage,
      ocrImage: ocrImage ?? undefined,
      left: Math.max(margin, Math.min(event.clientX, window.innerWidth - menuWidth - margin)),
      top: Math.max(margin, Math.min(event.clientY, window.innerHeight - menuHeight - margin)),
    })
  }

  const recognizeContextMessageImage = async () => {
    const ocrImageTarget = messageContextMenu?.ocrImage
    if (!ocrImageTarget) {
      return
    }

    setMessageContextMenu(null)
    setIsOcrDropTarget(false)
    openOcrPanel()
    setOcrStatus('running')
    setOcrJob(null)
    setOcrError(null)

    try {
      const file = await createSnapLinkOcrFileFromImageTarget(ocrImageTarget)
      prepareOcrImagePreview(file)
      void runOcrRecognition(file)
    } catch (error) {
      setOcrStatus('failed')
      setOcrError(error instanceof Error ? error.message : '图片 OCR 识别启动失败。')
    }
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
            重试
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
        <div className="dd-snaplink__shared-empty">暂无文件记录</div>
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

  const renderWorkbenchPageHeader = (
    title: string,
    description: string,
    action?: ReactNode,
  ) => (
    <div className="dd-snaplink__workbench-page-head">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      {action ? <div className="dd-snaplink__workbench-page-action">{action}</div> : null}
    </div>
  )

  const renderWorkbenchTargetSummary = (intent: 'file' | 'text' = 'file') => (
    <div className="dd-snaplink__target-summary" aria-label="当前发送目标">
      <span className="dd-snaplink__target-summary-icon">
        <Send size={18} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span>
        <strong>当前发送目标</strong>
        <small>
          {selectedWorkbenchDevice
            ? intent === 'text'
              ? '发送文本前会先确认设备，再建立直连或进入私聊房间'
              : '选择文件后会先确认设备，再建立直连发送'
            : activeTransferLabel}
        </small>
      </span>
      {selectedWorkbenchDevice ? (
        <em>预选：{selectedWorkbenchDevice.deviceName}</em>
      ) : null}
      {selectedWorkbenchDevice ? (
        <button
          type="button"
          onClick={() => requestTrustedWorkbenchDeviceAction(selectedWorkbenchDevice.deviceId, 'connect')}
        >
          建立直连
        </button>
      ) : null}
    </div>
  )

  const renderRoomConversationEmptyState = () => {
    if (!selectedRoom) {
      return (
        <div className="dd-snaplink__room-empty-card">
          <span className="dd-snaplink__room-empty-icon" aria-hidden="true">
            <Users size={24} strokeWidth={1.8} />
          </span>
          <strong>选择房间或附近设备</strong>
          <p>{fileConversationEmptyState}</p>
          <div className="dd-snaplink__room-empty-actions">
            <button type="button" onClick={handleShowWorkbenchRooms}>
              查看房间
            </button>
            <button type="button" onClick={handleShowWorkbenchNearby}>
              附近设备
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="dd-snaplink__room-empty-card">
        <span className="dd-snaplink__room-empty-icon" aria-hidden="true">
          <Send size={24} strokeWidth={1.8} />
        </span>
        <strong>这里还没有消息</strong>
        <p>{fileConversationEmptyState}</p>
        <small>发送第一条文本，或把文件拖到对话区开始协作。进度会显示在传输记录里。</small>
        <div className="dd-snaplink__room-empty-actions">
          <button type="button" onClick={() => inputRef.current?.focus()}>
            发送文本
          </button>
          <button
            type="button"
            onClick={() => document.getElementById(fileInputId)?.click()}
          >
            选择文件
          </button>
          <button type="button" onClick={handleShowWorkbenchNearby}>
            查看设备
          </button>
        </div>
      </div>
    )
  }

  const renderWorkbenchDeviceIcon = (device: OnlineDeviceListItem) => {
    const kind = resolveSnapLinkDeviceKind(device.platform)

    if (kind === 'phone') {
      return <Smartphone size={24} strokeWidth={1.8} aria-hidden="true" />
    }

    if (kind === 'tablet') {
      return <Tablet size={24} strokeWidth={1.8} aria-hidden="true" />
    }

    return <Laptop size={26} strokeWidth={1.7} aria-hidden="true" />
  }

  const renderWorkbenchDeviceCard = (device: OnlineDeviceListItem) => {
    const mode = resolveSnapLinkTransportMode(device)
    const trustLabel = resolveSnapLinkTrustLabel(device, trustedDeviceIds.has(device.deviceId))
    const isSelected = selectedWorkbenchDevice?.deviceId === device.deviceId

    return (
      <DeviceCard
        key={device.deviceId}
        device={device}
        deviceKind={resolveSnapLinkDeviceKind(device.platform)}
        icon={renderWorkbenchDeviceIcon(device)}
        transportTone={mode.tone}
        transportLabel={mode.label}
        trustLabel={trustLabel}
        isSelected={isSelected}
        isDropTarget={workbenchDeviceDropTargetId === device.deviceId}
        onSelect={handleWorkbenchDeviceSelect}
        onSendFile={handleWorkbenchDeviceSendFile}
        onSendText={handleWorkbenchDeviceSendText}
        onTrustDevice={handleWorkbenchDeviceTrust}
        onShowDetail={handleWorkbenchDeviceDetail}
        onDragEnter={handleWorkbenchDeviceDragEnter}
        onDragOver={handleWorkbenchDeviceDragOver}
        onDragLeave={handleWorkbenchDeviceDragLeave}
        onDropFiles={handleWorkbenchDeviceDropFiles}
      />
    )
  }

  const renderWorkbenchDeviceTargetButton = (device: OnlineDeviceListItem, intent: 'file' | 'text' = 'file') => {
    const isSelected = selectedWorkbenchDevice?.deviceId === device.deviceId
    const selectedLabel = intent === 'text' ? '已预选 · 发送文本到此设备' : '已预选 · 选择文件后发送'

    return (
      <button
        key={device.deviceId}
        type="button"
        className={isSelected ? 'is-selected' : ''}
        onClick={() => setSelectedWorkbenchDeviceId(device.deviceId)}
      >
        <span className={`dd-snaplink__target-device-icon is-${resolveSnapLinkDeviceKind(device.platform)}`}>
          {renderWorkbenchDeviceIcon(device)}
        </span>
        <span>
          <strong>{device.deviceName}</strong>
          <small>{isSelected ? selectedLabel : device.scopeLabel}</small>
        </span>
      </button>
    )
  }

  const renderWorkbenchRoomTargetButton = (room: RoomListItem, intent: 'file' | 'text' = 'file') => {
    const isSelected = selectedRoomId === room.roomId && !isLobbyOpen
    const onlineLabel = `${Math.max(room.onlineCount + 1, 1).toString()} 在线`
    const inactiveLabel = intent === 'text' ? `${onlineLabel} · 进入后发文本` : `${onlineLabel} · 进入后发送`

    return (
      <button
        key={room.roomId}
        type="button"
        className={isSelected ? 'is-selected' : ''}
        title={`进入${room.title}`}
        onClick={() => handleRoomSelection(room.roomId)}
      >
        <span className="dd-snaplink__target-device-icon is-room">
          <Users size={20} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span>
          <strong>{room.title}</strong>
          <small>{isSelected ? '当前房间 · 可直接发送' : inactiveLabel}</small>
        </span>
      </button>
    )
  }

  const renderWorkbenchRecentFile = (file: FileConversationEntry) => {
    const status = resolveSnapLinkTransferStatus(file)
    const progress = getSnapLinkTransferProgress(file)
    const progressPercent = Math.round(progress * 100)
    const actions = renderFileActions(file)

    return (
      <article key={file.id} className={`dd-snaplink__recent-send is-${status}`}>
        <span className="dd-snaplink__queue-ext">{getFileExtension(file.fileName)}</span>
        <div className="dd-snaplink__recent-send-body">
          <div className="dd-snaplink__recent-send-top">
            <strong title={file.fileName}>{file.fileName}</strong>
            <small>{file.statusLabel}</small>
          </div>
          <small className="dd-snaplink__recent-send-meta">
            {formatFileSize(file.fileSize)} · {file.fromSelf ? '发送到' : '来自'} {file.subtitle}
          </small>
          <div
            className="dd-snaplink__recent-send-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-label={`${file.fileName} 传输进度`}
          >
            <span style={{ width: `${progressPercent.toString()}%` }} />
          </div>
          {actions ? <div className="dd-snaplink__recent-send-actions">{actions}</div> : null}
        </div>
      </article>
    )
  }

  const renderWorkbenchTransferCard = (file: FileConversationEntry) => {
    const status = resolveSnapLinkTransferStatus(file)
    const progress = getSnapLinkTransferProgress(file)

    return (
      <TransferTaskCard
        key={file.id}
        file={file}
        status={status}
        progress={progress}
        extension={getFileExtension(file.fileName)}
        sizeLabel={formatFileSize(file.fileSize)}
        actions={renderFileActions(file)}
      />
    )
  }

  const renderIncomingReceiveNotice = (variant: 'full' | 'compact' = 'full') => {
    if (!latestIncomingReceiveEntry) {
      return null
    }

    const incomingCountLabel =
      activeIncomingReceiveEntries.length > 1
        ? `${activeIncomingReceiveEntries.length.toString()} 个文件正在接收`
        : latestIncomingReceiveEntry.fileName

    return (
      <section
        className={`dd-snaplink__receive-notice${variant === 'compact' ? ' is-compact' : ''}`}
        role="status"
        aria-live="polite"
      >
        <span className="dd-snaplink__receive-notice-icon" aria-hidden="true">
          <ShieldCheck size={18} strokeWidth={2} />
        </span>
        <span className="dd-snaplink__receive-notice-copy">
          <strong title={incomingCountLabel}>{incomingCountLabel}</strong>
          <small>
            来自 {latestIncomingReceiveEntry.subtitle || '对方设备'} · 仅在设备之间传输，文件不经过服务器
          </small>
        </span>
        <span className="dd-snaplink__receive-notice-actions">
          <button type="button" onClick={() => handleShowWorkbenchQueue()}>查看传输</button>
          <button type="button" onClick={handleShowWorkbenchSettings}>设置</button>
        </span>
      </section>
    )
  }

  const renderIncomingFileOfferDialog = () => {
    if (!latestIncomingFileOffer) {
      return null
    }

    const pendingExtraCount = Math.max(pendingIncomingFileOffers.length - 1, 0)
    const senderName = latestIncomingFileOffer.fromDeviceName || '附近设备'
    const isSenderTrusted = trustedDeviceIds.has(latestIncomingFileOffer.fromDeviceId)
    const shouldTrustSender =
      isSenderTrusted || trustedIncomingOfferIds.has(latestIncomingFileOffer.id)

    const handleTrustToggle = (checked: boolean) => {
      setTrustedIncomingOfferIds((current) => {
        const next = new Set(current)
        if (checked) {
          next.add(latestIncomingFileOffer.id)
        } else {
          next.delete(latestIncomingFileOffer.id)
        }
        return next
      })
    }

    const handleRejectOffer = () => {
      setTrustedIncomingOfferIds((current) => {
        if (!current.has(latestIncomingFileOffer.id)) {
          return current
        }

        const next = new Set(current)
        next.delete(latestIncomingFileOffer.id)
        return next
      })
      onRejectIncomingFileOffer(latestIncomingFileOffer.id)
    }

    const handleAcceptOffer = () => {
      if (shouldTrustSender) {
        trustDeviceLocally(latestIncomingFileOffer.fromDeviceId)
      }

      setTrustedIncomingOfferIds((current) => {
        if (!current.has(latestIncomingFileOffer.id)) {
          return current
        }

        const next = new Set(current)
        next.delete(latestIncomingFileOffer.id)
        return next
      })
      onAcceptIncomingFileOffer(latestIncomingFileOffer.id)
    }

    return (
      <ConfirmReceiveDialog
        offer={latestIncomingFileOffer}
        senderName={senderName}
        fileExtension={getFileExtension(latestIncomingFileOffer.name)}
        fileSizeLabel={formatFileSize(latestIncomingFileOffer.size)}
        pendingExtraCount={pendingExtraCount}
        isSenderTrusted={isSenderTrusted}
        shouldTrustSender={shouldTrustSender}
        onTrustChange={handleTrustToggle}
        onReject={handleRejectOffer}
        onAccept={handleAcceptOffer}
      />
    )
  }

  const renderTrustDeviceDialog = () => {
    if (!pendingTrustAction || !pendingTrustDevice) {
      return null
    }

    const mode = resolveSnapLinkTransportMode(pendingTrustDevice)
    const actionLabel =
      pendingTrustAction.kind === 'text'
        ? '发送文本'
        : pendingTrustAction.kind === 'connect'
          ? '建立直连'
          : pendingTrustAction.kind === 'pick-camera'
            ? '发送图片'
          : '发送文件'
    const fingerprint = formatSnapLinkDeviceFingerprint(pendingTrustDevice)

    return (
      <TrustDeviceDialog
        deviceName={pendingTrustDevice.deviceName}
        actionLabel={actionLabel}
        deviceKind={resolveSnapLinkDeviceKind(pendingTrustDevice.platform)}
        deviceIcon={renderWorkbenchDeviceIcon(pendingTrustDevice)}
        platformLabel={pendingTrustDevice.platform}
        modeLabel={mode.label}
        lastSeenLabel={pendingTrustDevice.lastSeenLabel}
        shortCode={pendingTrustDevice.shortCode}
        fingerprint={fingerprint}
        pinDraft={trustPinDraft}
        pinError={trustPinError}
        rememberDevice={trustRememberDevice}
        onPinChange={(value) => {
          setTrustPinDraft(value)
          setTrustPinError(null)
        }}
        onRememberChange={setTrustRememberDevice}
        onCancel={handleCancelTrustDeviceDialog}
        onContinueOnce={() => handleConfirmTrustDeviceDialog(false)}
        onConfirm={() => handleConfirmTrustDeviceDialog(trustRememberDevice)}
      />
    )
  }

  const renderDesktopConversationSideList = () => {
    const normalizedQuery = conversationSearchQuery.trim().toLowerCase()
    const assistantRoom = lobbyRoomListItems.find((room) => room.isAssistant)
    const shouldShowAssistant =
      normalizedQuery.length === 0 ||
      'dd助手 ai 辅助 总结 传输 说明'.includes(normalizedQuery)
    const visibleLobbyRooms = lobbyRoomListItems.filter((room) => !room.isAssistant)
    const filteredRooms = normalizedQuery.length === 0
      ? visibleLobbyRooms
      : visibleLobbyRooms.filter((room) => {
          const searchableText = [
            room.title,
            room.previewText,
            room.roomId,
            room.isPublic ? '公共 世界对话' : '房间',
          ].join(' ').toLowerCase()

          return searchableText.includes(normalizedQuery)
        })
    const filteredDevices = normalizedQuery.length === 0
      ? onlineDeviceItems
      : onlineDeviceItems.filter((device) => {
          const searchableText = [
            device.deviceName,
            device.platform,
            device.scopeLabel,
            device.shortCode,
            '设备 私聊 附近',
          ].filter(Boolean).join(' ').toLowerCase()

          return searchableText.includes(normalizedQuery)
        })
    const hasSearchResult = shouldShowAssistant || filteredRooms.length > 0 || filteredDevices.length > 0

    return (
      <aside className="dd-snaplink__conversation-side" aria-label="消息列表">
        <div className="dd-snaplink__conversation-side-head">
          <span>
            <strong>消息</strong>
            <small>世界对话、房间和 DD助手</small>
          </span>
          <button
            type="button"
            onClick={() => {
              setConversationSearchQuery('')
              handleShowWorkbenchRooms()
            }}
          >
            全部
          </button>
        </div>
        <label className="dd-snaplink__conversation-side-search">
          <span className="sr-only">搜索会话</span>
          <input
            value={conversationSearchQuery}
            placeholder="搜索会话"
            onChange={(event) => setConversationSearchQuery(event.target.value)}
          />
          {conversationSearchQuery ? (
            <button
              type="button"
              aria-label="清空会话搜索"
              onClick={() => setConversationSearchQuery('')}
            >
              ×
            </button>
          ) : null}
        </label>
        <div className="dd-snaplink__conversation-side-list">
          {shouldShowAssistant ? (
            <button
              type="button"
              className={[
                'dd-snaplink__conversation-row',
                'is-assistant',
                assistantRoom?.roomId === selectedRoomId ? 'is-active' : '',
              ].filter(Boolean).join(' ')}
              aria-current={assistantRoom?.roomId === selectedRoomId ? 'page' : undefined}
              onClick={() => {
                if (assistantRoom) {
                  handleRoomSelection(assistantRoom.roomId)
                  return
                }

                handleOpenAiChat()
              }}
              title="打开 DD助手"
            >
              <span className="dd-snaplink__conversation-avatar is-assistant" aria-hidden="true">
                <Bot size={17} strokeWidth={1.9} />
              </span>
              <span className="dd-snaplink__conversation-main">
                <span className="dd-snaplink__conversation-title">
                  <strong>DD助手</strong>
                  <em>置顶</em>
                </span>
                <small>{assistantRoom?.previewText || '总结传输记录，生成文件说明'}</small>
              </span>
              <span className="dd-snaplink__conversation-meta">
                {assistantRoom?.updatedAtLabel || '刚刚'}
              </span>
            </button>
          ) : null}
          {filteredRooms.map((room) => {
            const isActive = room.roomId === selectedRoomId

            return (
              <button
                key={room.roomId}
                type="button"
                className={[
                  'dd-snaplink__conversation-row',
                  room.isPublic ? 'is-public' : '',
                  room.pinned ? 'is-pinned' : '',
                  room.unreadCount > 0 ? 'has-unread' : '',
                  isActive ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleRoomSelection(room.roomId)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  handleToggleWorkbenchRoomPinned(room)
                }}
                title={`进入${room.title}`}
              >
                <span className="dd-snaplink__conversation-avatar" aria-hidden="true">
                  {room.isPublic ? '世' : Array.from(room.title.trim() || '房')[0]}
                  <i className={room.onlineCount > 0 ? 'is-online' : ''} />
                </span>
                <span className="dd-snaplink__conversation-main">
                  <span className="dd-snaplink__conversation-title">
                    <strong>{room.title}</strong>
                    <em>{room.isPublic ? '公共' : '房间'}</em>
                    {room.pinned ? <em>置顶</em> : null}
                  </span>
                  <small>{room.previewText || '暂无消息'}</small>
                </span>
                <span className="dd-snaplink__conversation-side-meta">
                  <small>{room.updatedAtLabel}</small>
                  {room.unreadCount > 0 ? (
                    <strong>{room.unreadCount > 99 ? '99+' : room.unreadCount}</strong>
                  ) : (
                    <em>{Math.min(room.memberCount, room.onlineCount + 1).toString()} 在线</em>
                  )}
                </span>
              </button>
            )
          })}
          {filteredDevices.map((device) => {
            const isActive = selectedWorkbenchDevice?.deviceId === device.deviceId

            return (
              <button
                key={`device-${device.deviceId}`}
                type="button"
                className={[
                  'dd-snaplink__conversation-row',
                  'is-device',
                  isActive ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleWorkbenchDeviceSendText(device.deviceId)}
                title={`打开 ${device.deviceName} 的设备会话`}
              >
                <span className="dd-snaplink__conversation-avatar is-device" aria-hidden="true">
                  {Array.from(device.deviceName.trim() || '设')[0].toUpperCase()}
                  <i className="is-online" />
                </span>
                <span className="dd-snaplink__conversation-main">
                  <span className="dd-snaplink__conversation-title">
                    <strong>{device.deviceName}</strong>
                    <em>设备</em>
                  </span>
                  <small>{device.scopeLabel || device.platform || '附近设备'} · {device.lastSeenLabel || '在线'}</small>
                </span>
                <span className="dd-snaplink__conversation-side-meta">
                  <small>在线</small>
                  <em>{device.shortCode || device.platform || '直连'}</em>
                </span>
              </button>
            )
          })}
          {!hasSearchResult ? (
            <div className="dd-snaplink__conversation-empty">
              没有找到相关会话
            </div>
          ) : null}
        </div>
      </aside>
    )
  }

  const renderWorkbenchMessagesPage = () => (
    <section className="dd-snaplink__messages-shell" aria-label="消息工作台">
      {renderDesktopConversationSideList()}
      <div className="dd-snaplink__messages-detail" aria-label="消息详情占位">
        <section className="dd-snaplink__messages-empty-chat" aria-label="空会话提示">
          <strong>选择一个会话</strong>
          <small>从左侧打开世界对话、房间、设备或 DD助手。文件、图片和工具都在会话输入栏的「＋」里。</small>
        </section>
      </div>
    </section>
  )

  const renderWorkbenchDevicesPage = () => {
    const activeDevice = selectedWorkbenchDevice
    const normalizedDeviceQuery = conversationSearchQuery.trim().toLowerCase()
    const filteredDeviceItems = onlineDeviceItems.filter((device) => {
      if (!normalizedDeviceQuery) {
        return true
      }

      return [
        device.deviceName,
        device.platform,
        device.scopeLabel,
        device.shortCode,
      ].filter(Boolean).join(' ').toLowerCase().includes(normalizedDeviceQuery)
    })

    return (
      <section className="dd-snaplink__devices-shell" aria-label="设备工作台">
        <aside className="dd-snaplink__conversation-side" aria-label="设备列表">
          <div className="dd-snaplink__conversation-side-head">
            <span>
              <strong>设备</strong>
              <small>{workbenchOnlineDeviceCount.toString()} 台设备在线 · 可互传</small>
            </span>
            <button type="button" onClick={handleWorkbenchRescan}>
              查找
            </button>
          </div>
          <label className="dd-snaplink__conversation-side-search">
            <span className="sr-only">搜索设备</span>
            <input
              value={conversationSearchQuery}
              placeholder="搜索设备"
              onChange={(event) => setConversationSearchQuery(event.target.value)}
            />
            {conversationSearchQuery ? (
              <button
                type="button"
                aria-label="清空设备搜索"
                onClick={() => setConversationSearchQuery('')}
              >
                ×
              </button>
            ) : null}
          </label>
          <div className={`dd-snaplink__conversation-side-list${isWorkbenchScanning ? ' is-scanning' : ''}`}>
            {filteredDeviceItems
              .map((device) => {
                const isActive = activeDevice?.deviceId === device.deviceId

                return (
                  <button
                    key={device.deviceId}
                    type="button"
                    className={[
                      'dd-snaplink__conversation-row',
                      'is-device',
                      isActive ? 'is-active' : '',
                    ].filter(Boolean).join(' ')}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => handleWorkbenchDeviceListClick(device.deviceId)}
                    title={`打开 ${device.deviceName}`}
                  >
                    <span className="dd-snaplink__conversation-avatar is-device" aria-hidden="true">
                      {Array.from(device.deviceName.trim() || '设')[0].toUpperCase()}
                      <i className="is-online" />
                    </span>
                    <span className="dd-snaplink__conversation-main">
                      <span className="dd-snaplink__conversation-title">
                        <strong>{device.deviceName}</strong>
                        <em>{device.platform || '设备'}</em>
                      </span>
                      <small>{device.scopeLabel || '附近设备'} · {device.lastSeenLabel || '在线'}</small>
                    </span>
                    <span className="dd-snaplink__conversation-side-meta">
                      <small>在线</small>
                      <em>{device.shortCode || '直连'}</em>
                    </span>
                  </button>
                )
              })}
            {onlineDeviceItems.length === 0 ? (
              <div className="dd-snaplink__conversation-empty">
                暂无附近设备
              </div>
            ) : filteredDeviceItems.length === 0 ? (
              <div className="dd-snaplink__conversation-empty">
                没有找到相关设备
              </div>
            ) : null}
          </div>
        </aside>

        <div className="dd-snaplink__devices-detail" aria-label="设备详情">
          <DeviceRadar
            devices={onlineDeviceItems}
            selectedDeviceId={activeDevice?.deviceId ?? null}
            renderIcon={renderWorkbenchDeviceIcon}
            onSelect={handleWorkbenchDeviceListClick}
            onOpenConversation={handleWorkbenchDeviceSendText}
          />
          {activeDevice ? (
            <section className="dd-snaplink__device-detail-card">
              <span className={`dd-snaplink__device-detail-icon is-${resolveSnapLinkDeviceKind(activeDevice.platform)}`} aria-hidden="true">
                {renderWorkbenchDeviceIcon(activeDevice)}
              </span>
              <span className="dd-snaplink__device-detail-copy">
                <strong>{activeDevice.deviceName}</strong>
                <small>{activeDevice.scopeLabel || '附近设备'} · {activeDevice.lastSeenLabel || '在线'}</small>
              </span>
              <dl className="dd-snaplink__device-detail-meta">
                <div>
                  <dt>平台</dt>
                  <dd>{activeDevice.platform || '未知'}</dd>
                </div>
                <div>
                  <dt>短码</dt>
                  <dd>{activeDevice.shortCode || '未公开'}</dd>
                </div>
                <div>
                  <dt>连接</dt>
                  <dd>{resolveSnapLinkTransportMode(activeDevice).label}</dd>
                </div>
                <div>
                  <dt>信任</dt>
                  <dd>{resolveSnapLinkTrustLabel(activeDevice, trustedDeviceIds.has(activeDevice.deviceId))}</dd>
                </div>
              </dl>
              <div className="dd-snaplink__device-detail-actions">
                <button type="button" className="is-primary" onClick={() => handleWorkbenchDeviceSendText(activeDevice.deviceId)}>
                  发消息
                </button>
                <button type="button" onClick={() => handleWorkbenchDeviceSendFile(activeDevice.deviceId)}>
                  发文件
                </button>
                <button type="button" onClick={() => handleWorkbenchDeviceTrust(activeDevice.deviceId)}>
                  校验设备
                </button>
              </div>
            </section>
          ) : (
            <section className="dd-snaplink__device-detail-card is-empty">
              <span className="dd-snaplink__device-detail-icon is-empty" aria-hidden="true">
                <Monitor size={24} strokeWidth={1.8} />
              </span>
              <span className="dd-snaplink__device-detail-copy">
                <strong>等待附近设备</strong>
                <small>让另一台设备打开 DD直连，保持在同一网络或登录同一账号。</small>
              </span>
              <div className="dd-snaplink__device-detail-actions">
                <button type="button" className="is-primary" onClick={handleWorkbenchRescan}>
                  重新查找
                </button>
              </div>
            </section>
          )}
        </div>
      </section>
    )
  }

  const renderWorkbenchRoomsSection = (variant: 'compact' | 'full' = 'compact') => (
    <RoomsPage
      variant={variant}
      rooms={variant === 'full' ? lobbyRoomListItems : workbenchRoomListItems}
      totalRoomCount={lobbyRoomListItems.length}
      publicRoomCount={workbenchPublicRoomCount}
      roomJoinDraft={roomJoinDraft}
      roomJoinError={roomJoinError}
      onCreatePublicRoom={handleCreatePublicRoom}
      onJoinDraftChange={(value) => {
        setRoomJoinDraft(normalizeRoomJoinCode(value))
        setRoomJoinError(null)
      }}
      onJoinRoomSubmit={handleJoinRoomFromWorkbench}
      onOpenRoom={handleRoomSelection}
      onToggleRoomPinned={handleToggleWorkbenchRoomPinned}
      onOpenAssistant={handleOpenAiChat}
      deviceConversations={onlineDeviceItems}
      onOpenDeviceConversation={handleWorkbenchDeviceSendText}
    />
  )

  const renderWorkbenchDropZone = (variant: 'compact' | 'full' = 'compact') => (
    <DropZone
      variant={variant}
      isActive={isDragging}
      subtitle={workbenchDropSubtitle}
      canSendText={Boolean(selectedWorkbenchDevice)}
      onPickFile={handleWorkbenchFilePick}
      onSendText={() => {
        if (selectedWorkbenchDevice) {
          handleWorkbenchDeviceSendText(selectedWorkbenchDevice.deviceId)
        }
      }}
      onPickCamera={handleWorkbenchCameraPick}
    />
  )

  const renderWorkbenchFileSendPage = () => (
    <FileSendPage
      header={renderWorkbenchPageHeader(
        '发送',
        '文件、图片、文本统一发给设备或房间，进度会显示在传输记录里。',
        <button type="button" onClick={handleWorkbenchFilePick}>
          <Upload size={14} strokeWidth={2} aria-hidden="true" />
          选择文件
        </button>,
      )}
      targetSummary={renderWorkbenchTargetSummary('file')}
      deviceTargets={onlineDeviceItems.slice(0, 4).map((device) => renderWorkbenchDeviceTargetButton(device, 'file'))}
      roomTargets={lobbyRoomListItems.slice(0, 4).map((room) => renderWorkbenchRoomTargetButton(room, 'file'))}
      dropZone={renderWorkbenchDropZone('full')}
      recentFiles={workbenchTransferEntries.filter((file) => file.fromSelf).slice(0, 4).map(renderWorkbenchRecentFile)}
    />
  )

  const renderWorkbenchTextEntry = (entry: SnapLinkTextEntry) => {
    const preview = getRichTextPreviewText(entry.text) || '空文本'

    return (
      <article key={entry.id} className={`dd-snaplink__text-history-row${entry.status ? ` is-${entry.status}` : ''}`}>
        <span>
          <strong>{entry.fromSelf ? '我' : entry.senderName}</strong>
          <small>{formatMessageClock(entry.createdAt)}{entry.status ? ` · ${entry.status === 'failed' ? '发送失败' : '发送中'}` : ''}</small>
        </span>
        <p>{preview}</p>
        <div className="dd-snaplink__text-history-actions">
          <button type="button" onClick={() => void copyRichTextToClipboard(entry.text)}>
            复制
          </button>
          <button
            type="button"
            onClick={() => {
              draftValueRef.current = preview
              onChatDraftChange(preview)
              setWorkbenchMode('text')
            }}
          >
            再发一次
          </button>
        </div>
      </article>
    )
  }

  const renderWorkbenchTextPage = () => (
    <TextSendPage
      header={renderWorkbenchPageHeader(
        '发送文本',
        '把一段文字、链接或说明发给当前设备/房间。',
      )}
      targetSummary={renderWorkbenchTargetSummary('text')}
      deviceTargets={onlineDeviceItems.slice(0, 4).map((device) => renderWorkbenchDeviceTargetButton(device, 'text'))}
      roomTargets={lobbyRoomListItems.slice(0, 4).map((room) => renderWorkbenchRoomTargetButton(room, 'text'))}
      draft={chatDraft}
      draftLength={plainDraft.length}
      enterToSend={devicePreferences.enterToSend}
      isSendDisabled={isSendDisabled}
      historyCount={workbenchTextEntries.length}
      historyList={workbenchTextEntries.map(renderWorkbenchTextEntry)}
      onDraftChange={(value) => {
        draftValueRef.current = value
        onChatDraftChange(value)
      }}
      onDraftKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault()
          submitComposerDraft()
          return
        }

        if (devicePreferences.enterToSend && event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          submitComposerDraft()
        }
      }}
      onSubmit={(event) => {
        event.preventDefault()
        submitComposerDraft()
      }}
    />
  )

  const renderWorkbenchGlobalHistoryFile = (file: HistoryFileSummary) => {
    const canRecallFile = file.sourceDeviceId === deviceId || canRecallAnyMessage

    return (
      <article key={file.historyId} className="dd-snaplink__text-history-row">
        <span>
          <strong title={file.fileName}>{file.fileName}</strong>
          <small>{file.sourceDeviceName} · {formatMessageClock(file.createdAt)}</small>
        </span>
        <p>
          {formatFileSize(file.size)} · {file.isPublic ? '公共房间' : '私密会话'}
        </p>
        <div className="dd-snaplink__text-history-actions">
          <button type="button" onClick={() => onDownloadHistoryFile(file)}>
            下载
          </button>
          {canRecallFile ? (
            <button type="button" onClick={() => void Promise.resolve(onRecallFile(file.historyId))}>
              撤回
            </button>
          ) : null}
        </div>
      </article>
    )
  }

  const markHistoryActionCopied = (actionId: string) => {
    setCopiedHistoryActionId(actionId)
    window.setTimeout(() => {
      setCopiedHistoryActionId((current) => (current === actionId ? null : current))
    }, 1200)
  }

  const handleCopyHistoryText = (entry: HistoryTextSummary) => {
    void copyRichTextToClipboard(entry.text).then(() => {
      markHistoryActionCopied(`text-${entry.historyId}`)
    })
  }

  const handleCopyHistoryLink = (entry: SnapLinkSharedLinkEntry) => {
    void copyTextToClipboard(entry.url).then(() => {
      markHistoryActionCopied(`link-${entry.id}`)
    })
  }

  const renderWorkbenchGlobalHistoryText = (entry: HistoryTextSummary) => {
    const preview = getRichTextPreviewText(entry.text) || '空文本'
    const canRecallHistoryText = entry.sourceDeviceId === deviceId || canRecallAnyMessage
    const copyActionId = `text-${entry.historyId}`

    return (
      <article key={entry.historyId} className="dd-snaplink__text-history-row">
        <span>
          <strong>{entry.sourceDeviceName}</strong>
          <small>{formatMessageClock(entry.createdAt)}</small>
        </span>
        <p>{preview}</p>
        <div className="dd-snaplink__text-history-actions">
          <button
            type="button"
            className={copiedHistoryActionId === copyActionId ? 'is-copied' : ''}
            onClick={() => handleCopyHistoryText(entry)}
          >
            {copiedHistoryActionId === copyActionId ? '已复制' : '复制'}
          </button>
          <button
            type="button"
            onClick={() => {
              draftValueRef.current = preview
              onChatDraftChange(preview)
              setWorkbenchMode('text')
            }}
          >
            再发一次
          </button>
          {canRecallHistoryText ? (
            <button type="button" onClick={() => void Promise.resolve(onRecallText(entry.historyId))}>
              撤回
            </button>
          ) : null}
        </div>
      </article>
    )
  }

  const renderWorkbenchHistoryFilePanelContent = () => {
    if (workbenchFilteredGlobalHistoryFiles.length > 0) {
      return (
        <div className="dd-snaplink__text-history-list">
          {workbenchFilteredGlobalHistoryFiles.slice(0, 10).map(renderWorkbenchGlobalHistoryFile)}
        </div>
      )
    }

    if (workbenchFilteredHistoryFileEntries.length > 0) {
      return (
        <div className="dd-snaplink__shared-list">
          {workbenchFilteredHistoryFileEntries.slice(0, 8).map((file) =>
            renderSharedFileRow(file, resolveMediaFileEntryKind(file) ? 'media' : 'file'),
          )}
        </div>
      )
    }

    return <div className="dd-snaplink__shared-empty">暂无文件记录</div>
  }

  const renderWorkbenchHistoryTextPanelContent = () => (
    <>
      {workbenchFilteredGlobalHistoryTexts.length > 0 ? (
        <div className="dd-snaplink__text-history-list">
          {workbenchFilteredGlobalHistoryTexts.slice(0, 10).map(renderWorkbenchGlobalHistoryText)}
        </div>
      ) : workbenchFilteredTextEntries.length > 0 ? (
        <div className="dd-snaplink__text-history-list">
          {workbenchFilteredTextEntries.slice(0, 6).map(renderWorkbenchTextEntry)}
        </div>
      ) : null}
      {workbenchFilteredLinkEntries.length > 0 ? (
        <div className="dd-snaplink__history-link-list">
          {workbenchFilteredLinkEntries.slice(0, 6).map((entry) => (
            <article key={entry.id} className="dd-snaplink__history-link-row">
              <span>
                <strong title={entry.label}>{entry.label}</strong>
                <small>{entry.sourceName} · {formatMessageClock(entry.createdAt)}</small>
              </span>
              <div className="dd-snaplink__text-history-actions">
                <button
                  type="button"
                  className={copiedHistoryActionId === `link-${entry.id}` ? 'is-copied' : ''}
                  onClick={() => handleCopyHistoryLink(entry)}
                >
                  {copiedHistoryActionId === `link-${entry.id}` ? '已复制' : '复制链接'}
                </button>
                <a href={entry.url} target="_blank" rel="noreferrer">打开</a>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {workbenchHistoryTextCount === 0 && workbenchFilteredLinkEntries.length === 0 ? (
        <div className="dd-snaplink__shared-empty">暂无文本和链接</div>
      ) : null}
    </>
  )

  const renderWorkbenchHistoryPage = (embedded = false) => (
    <HistoryPage
      embedded={embedded}
      header={
        embedded
          ? undefined
          : renderWorkbenchPageHeader(
              '传输记录',
              '集中查看文件、文本和链接，可下载、复制或复用。',
            )
      }
      searchQuery={historySearchQuery}
      fileCount={workbenchHistoryFileCount}
      textCount={workbenchHistoryTextCount}
      linkCount={workbenchFilteredLinkEntries.length}
      totalCount={workbenchHistoryCount}
      rawCount={workbenchRawHistoryCount}
      filePanelContent={renderWorkbenchHistoryFilePanelContent()}
      textPanelContent={renderWorkbenchHistoryTextPanelContent()}
      onSearchChange={setHistorySearchQuery}
      onClearSearch={() => setHistorySearchQuery('')}
      onShowFiles={handleShowWorkbenchFiles}
      onShowText={handleShowWorkbenchText}
      onShowRooms={handleShowWorkbenchRooms}
    />
  )

  const renderWorkbenchSettingsPage = () => (
    <SettingsPanel
      deviceName={deviceName}
      avatarDataUrl={deviceAvatarDataUrl}
      deviceNameDraft={deviceNameDraft}
      deviceNameError={deviceNameError}
      devicePlatform={devicePlatform}
      deviceShortCode={deviceShortCode}
      deviceId={deviceId}
      accountId={accountId}
      discoverable={deviceSettings.discoverable !== false}
      allowShortCode={deviceSettings.allowShortCode !== false}
      autoConnect={deviceSettings.autoConnect !== false}
      enterToSend={devicePreferences.enterToSend}
      themeMode={themeMode}
      resolvedThemeMode={resolvedThemeMode}
      themeColors={themeColors}
      themeOptions={snapLinkThemeColorOptions}
      feedbackMessage={settingsFeedbackMessage}
      canOpenAdmin={canRecallAnyMessage}
      onAvatarClick={openAvatarPicker}
      onDeviceNameDraftChange={(value) => {
        setDeviceNameDraft(value)
        setDeviceNameError(null)
      }}
      onDeviceNameSubmit={(event) => {
        event.preventDefault()
        if (commitWorkbenchDeviceRename()) {
          showSettingsFeedback('设备名已保存')
        }
      }}
      onDiscoverableChange={(checked) => {
        onDeviceSettingsChange({ discoverable: checked })
        showSettingsFeedback(checked ? '已允许被附近设备发现' : '已关闭附近发现')
      }}
      onAllowShortCodeChange={(checked) => {
        onDeviceSettingsChange({ allowShortCode: checked })
        showSettingsFeedback(checked ? '已允许短码连接' : '已关闭短码连接')
      }}
      onAutoConnectChange={(checked) => {
        onDeviceSettingsChange({ autoConnect: checked })
        showSettingsFeedback(checked ? '已开启自动连接' : '已关闭自动连接')
      }}
      onEnterToSendChange={(checked) => {
        onDevicePreferencesChange({ enterToSend: checked })
        showSettingsFeedback(checked ? '已开启回车发送' : '已关闭回车发送')
      }}
      onThemeModeChange={(nextThemeMode) => {
        updateWorkbenchThemeMode(nextThemeMode)
        if (nextThemeMode === 'system') {
          showSettingsFeedback('已跟随系统外观')
          return
        }

        showSettingsFeedback(nextThemeMode === 'dark' ? '已切换深色模式' : '已切换浅色模式')
      }}
      onThemeColorChange={(target, value) => {
        updateThemeColor(target, value)
        showSettingsFeedback('消息主题已更新')
      }}
      onThemePresetApply={(colors) => {
        applyThemeColors(colors)
        showSettingsFeedback('主题预设已应用')
      }}
      onThemeReset={() => {
        resetThemeColors()
        showSettingsFeedback('主题已恢复默认')
      }}
      onShowHistory={handleShowWorkbenchHistory}
      onOpenAiChat={handleOpenAiChat}
      onOpenImage={handleOpenImage}
      onOpenCommand={handleOpenCommand}
      onOpenAdmin={onOpenAdminView}
    />
  )

  const renderWorkbenchNearbySection = () => (
    <NearbyDevicesPanel
      devices={onlineDeviceItems}
      discoveryHint={workbenchDiscoveryHint}
      isScanning={isWorkbenchScanning}
      renderDeviceCard={renderWorkbenchDeviceCard}
      onRescan={handleWorkbenchRescan}
    />
  )

  const renderWorkbenchTransferBoard = () => {
    const visibleTransferTab = workbenchTransferTab === 'history' ? 'active' : workbenchTransferTab
    const activeEntries = workbenchTransferEntries.filter((file) =>
      isSnapLinkTransferActive(resolveSnapLinkTransferStatus(file)),
    )
    const completedEntries = workbenchTransferEntries.filter(
      (file) => resolveSnapLinkTransferStatus(file) === 'completed',
    )
    const failedEntries = workbenchTransferEntries.filter(
      (file) => resolveSnapLinkTransferStatus(file) === 'failed',
    )
    const transferTabs: TransferQueuePageTab[] = [
      { id: 'active', label: '进行中', count: activeEntries.length },
      { id: 'completed', label: '已完成', count: completedEntries.length },
      { id: 'failed', label: '失败', count: failedEntries.length },
    ]
    const tabEntries = visibleTransferTab === 'completed'
      ? completedEntries
      : visibleTransferTab === 'failed'
        ? failedEntries
        : activeEntries
    const groupedSections = [
      {
        id: visibleTransferTab,
        label:
          visibleTransferTab === 'completed'
            ? '已完成'
            : visibleTransferTab === 'failed'
              ? '失败'
              : '进行中',
        entries: tabEntries,
      },
    ]

    return (
      <TransferQueuePage
        sections={groupedSections}
        tabs={transferTabs}
        activeTab={visibleTransferTab}
        totalCount={tabEntries.length}
        activeCount={workbenchActiveTransferCount}
        completedCount={workbenchCompletedTransferCount}
        failedCount={workbenchFailedTransferCount}
        incomingNotice={renderIncomingReceiveNotice('full')}
        renderTaskCard={renderWorkbenchTransferCard}
        onTabChange={(tab) => {
          if (tab !== 'history') {
            setWorkbenchTransferTab(tab)
          }
        }}
        onShowNearby={handleShowWorkbenchNearby}
        onShowFiles={handleShowWorkbenchFiles}
      />
    )
  }

  const renderWorkbenchModeContent = () => {
    if (workbenchMode === 'rooms') {
      return renderWorkbenchMessagesPage()
    }

    if (workbenchMode === 'nearby') {
      return renderWorkbenchDevicesPage()
    }

    if (workbenchMode === 'files') {
      return renderWorkbenchFileSendPage()
    }

    if (workbenchMode === 'transfers') {
      return renderWorkbenchTransferBoard()
    }

    if (workbenchMode === 'text') {
      return renderWorkbenchTextPage()
    }

    if (workbenchMode === 'history') {
      return renderWorkbenchHistoryPage()
    }

    if (workbenchMode === 'settings') {
      return renderWorkbenchSettingsPage()
    }

    return (
      <>
        {renderWorkbenchNearbySection()}
        <div className="dd-snaplink__workbench-lower">
          {renderWorkbenchRoomsSection()}
          {renderWorkbenchDropZone()}
        </div>
      </>
    )
  }

  const getWorkbenchConnectionSummary = () => {
    if (deviceSettings.discoverable === false) {
      return '对外不可见'
    }

    return workbenchOnlineDeviceCount > 0 ? `${workbenchOnlineDeviceCount.toString()} 台设备` : '无设备'
  }

  const commandPaletteItems: CommandPaletteItem[] = [
    {
      id: 'web-command',
      label: '打开命令行',
      description: '进入命令行工具，运行命令并把结果发送回当前会话',
      icon: <Command size={16} strokeWidth={2} />,
      action: handleOpenCommand,
    },
    {
      id: 'send-file',
      label: '发送文件到当前会话',
      description: '打开文件选择器，发送到当前会话',
      icon: <FileUp size={16} strokeWidth={2} />,
      action: openCurrentFilePicker,
    },
    {
      id: 'theme-toggle',
      label: resolvedThemeMode === 'dark' ? '切换到浅色模式' : '切换到深色模式',
      description: '立即切换界面外观，并保存到本机',
      icon: resolvedThemeMode === 'dark'
        ? <SunMedium size={16} strokeWidth={2} />
        : <MoonStar size={16} strokeWidth={2} />,
      action: toggleResolvedThemeMode,
    },
    {
      id: 'zen-toggle',
      label: isZenMode ? '退出极简模式' : '进入极简模式',
      description: '桌面端收起中栏，专注当前会话',
      icon: isZenMode ? <Maximize2 size={16} strokeWidth={2} /> : <Minimize2 size={16} strokeWidth={2} />,
      action: () => setIsZenMode((current) => !current),
    },
    {
      id: 'device-radar',
      label: '查看附近设备',
      description: '查看当前可互传的设备',
      icon: <Radio size={16} strokeWidth={2} />,
      action: handleShowWorkbenchNearby,
    },
    {
      id: 'transfer-queue',
      label: '查看传输记录',
      description: `${workbenchActiveTransferCount.toString()} 个进行中，${workbenchCompletedTransferCount.toString()} 个已完成`,
      icon: <Upload size={16} strokeWidth={2} />,
      action: handleShowWorkbenchQueue,
    },
    {
      id: 'new-room',
      label: '新建 / 进入公共房间',
      description: '创建公共房间，或进入已有世界对话',
      icon: <Plus size={16} strokeWidth={2} />,
      action: handleCreatePublicRoom,
    },
    {
      id: 'copy-link',
      label: selectedRoomId ? '复制当前房间码' : '复制当前页面链接',
      description: selectedRoomId ? '复制短码给另一台设备加入' : '复制 DD直连访问地址',
      icon: <Copy size={16} strokeWidth={2} />,
      action: () => {
        const text = selectedRoomId || (typeof window !== 'undefined' ? window.location.href : '')
        if (text && navigator.clipboard) {
          void navigator.clipboard.writeText(text)
        }
        showSettingsFeedback(selectedRoomId ? '房间码已复制' : '页面链接已复制')
      },
    },
  ]

  const renderToolConnectionStatus = () => (
    <div className="dd-snaplink__status-actions">
      <StatusPillsCollapsible
        online={deviceSettings.discoverable !== false}
        summary={getWorkbenchConnectionSummary()}
        details={[
          {
            id: 'lan-workbench',
            label: <><Wifi size={13} strokeWidth={2} aria-hidden="true" />同一网络可见</>,
          },
          { id: 'webrtc', label: '直连中' },
          {
            id: 'serverless',
            label: <><ShieldCheck size={13} strokeWidth={2} aria-hidden="true" />文件不经过服务器</>,
          },
        ]}
        ariaLabel="工具连接状态"
      />
      <button
        type="button"
        className="dd-snaplink__status-command"
        aria-label="打开快捷操作面板"
        title="打开快捷操作面板 Ctrl / ⌘ + K"
        onClick={() => setIsCommandPaletteOpen(true)}
      >
        快捷 <kbd>⌘K</kbd>
      </button>
      <button
        type="button"
        className="dd-snaplink__status-icon"
        aria-label={resolvedThemeMode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        onClick={toggleResolvedThemeMode}
      >
        {resolvedThemeMode === 'dark' ? (
          <SunMedium size={15} strokeWidth={2} aria-hidden="true" />
        ) : (
          <MoonStar size={15} strokeWidth={2} aria-hidden="true" />
        )}
      </button>
    </div>
  )

  const renderWorkbenchView = () => {
    return (
    <section
      className={[
        'dd-snaplink__workbench',
        'has-no-mobile-actions',
        isZenMode ? 'is-zen' : '',
        isDesktopQueueCollapsed ? 'is-queue-collapsed' : '',
        workbenchVisibleTransferQueueCount === 0 ? 'has-empty-transfer-queue' : '',
      ].filter(Boolean).join(' ')}
      aria-label="DD直连文件互传工作台"
    >
      <input
        ref={workbenchFileInputRef}
        id={`${fileInputId}-workbench`}
        type="file"
        multiple
        hidden
        onChange={handleWorkbenchDirectFileInputChange}
      />
      <input
        ref={workbenchCameraInputRef}
        id={`${fileInputId}-workbench-camera`}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleWorkbenchDirectFileInputChange}
      />
      <SidebarNav
        deviceName={deviceName}
        avatarDataUrl={deviceAvatarDataUrl}
        activeMode={workbenchMode}
        activeTransferCount={workbenchActiveTransferCount}
        onAvatarClick={openAvatarPicker}
        onShowNearby={handleShowWorkbenchNearby}
        onShowRooms={handleShowWorkbenchRooms}
        onShowQueue={handleShowWorkbenchQueue}
        onShowSettings={handleShowWorkbenchSettings}
      />

      <div className="dd-snaplink__workbench-main">
        <MobileWorkbenchNav
          activeMode={workbenchMode}
          ariaLabel="移动端功能导航"
          activeTransferCount={workbenchActiveTransferCount}
          onShowNearby={handleShowWorkbenchNearby}
          onShowRooms={handleShowWorkbenchRooms}
          onShowQueue={handleShowWorkbenchQueue}
          onShowSettings={handleShowWorkbenchSettings}
        />

        <main className={`dd-snaplink__workbench-content is-${workbenchMode}`}>
          {visibleErrorText ? (
            <div className="dd-snaplink__workbench-note is-error" role="status">
              <span>{visibleErrorText}</span>
              <button type="button" onClick={() => setDismissedErrorText(visibleErrorText)}>
                关闭
              </button>
            </div>
          ) : null}
          {renderWorkbenchModeContent()}
        </main>
      </div>

      <TransferQueuePanel
        entries={workbenchTransferEntries}
        activeCount={workbenchActiveTransferCount}
        completedCount={workbenchCompletedTransferCount}
        isMobileOpen={isMobileQueueOpen}
        isDesktopCollapsed={isDesktopQueueCollapsed}
        incomingNotice={renderIncomingReceiveNotice('compact')}
        renderTaskCard={renderWorkbenchTransferCard}
        onToggleMobileOpen={() => setIsMobileQueueOpen((current) => !current)}
        onToggleDesktopCollapsed={() => setIsDesktopQueueCollapsed((current) => !current)}
        onShowAllTransfers={handleShowWorkbenchQueue}
      />
    </section>
    )
  }

  const renderToolWorkbenchView = (content: ReactNode, tool: 'ai-chat' | 'image' | 'command') => {
    const isAiTool = tool === 'ai-chat'
    const isImageTool = tool === 'image'
    const toolTitle = isAiTool ? 'DD助手' : isImageTool ? '图片工具' : '命令行'
    const toolSubtitle = isAiTool
      ? '本地优先 · 上下文不外传'
      : isImageTool
        ? '提示词生成 · 历史与额度同步'
        : '浏览器 / Docker 沙箱 · 本页运行'
    const toolLabel = isAiTool
      ? 'DD直连 DD助手会话'
      : isImageTool
        ? 'DD直连图片工具'
        : 'DD直连 命令行工作台'
    const toolSideNote = isAiTool
      ? 'DD助手只读取你选择的内容，不会上传整机文件，也不会经过中转服务器保存。'
      : isImageTool
        ? '图片生成记录独立保存，传输文件仍通过 DD直连传输记录管理。'
        : '命令运行在浏览器或沙箱环境中，输出可复制后继续发送给附近设备。'
    const hasCommandResultText = commandResultText.trim().length > 0
    const toolSideActions: ToolContextPanelAction[] = isAiTool
      ? [
          {
            label: aiTransferContextFiles.length > 0 ? '分析最近传输' : '辅助生成传输说明',
            action: () => onPrepareAiDraft?.(buildAiTransferAnalysisPrompt(), buildAiTransferAnalysisContext()),
            title:
              aiTransferContextFiles.length > 0
                ? '把最近传输文件整理成分析草稿'
                : '生成一段用于文件传输说明的草稿',
          },
          { label: '发送文本', action: handleShowWorkbenchText },
          { label: '查看附近设备', action: handleShowWorkbenchNearby },
        ]
      : isImageTool
        ? [
            { label: '发送图片文件', action: handleShowWorkbenchFiles },
            { label: '查看传输记录', action: handleShowWorkbenchQueue },
            { label: '附近设备', action: handleShowWorkbenchNearby },
          ]
        : [
            {
              label: hasCommandResultText ? '发送运行结果' : '运行后发送结果',
              action: () => {
                onShareCommandResult?.()
                handleShowWorkbenchText()
              },
              disabled: !hasCommandResultText,
              title: hasCommandResultText ? '把当前运行输出填入文本发送页' : '先运行命令生成输出结果',
            },
            { label: '查看传输记录', action: handleShowWorkbenchQueue },
            { label: '附近设备', action: handleShowWorkbenchNearby },
          ]
    const toolContextRows = isAiTool
      ? [
          { label: '上下文来源', value: sharedFileEntries.length + sharedMediaEntries.length > 0 ? '传输文件' : '按需选择' },
          { label: '模型', value: selectedAiModelLabel || '未选择' },
          { label: '文件上下文', value: `${aiTransferContextFiles.length.toString()} 项可分析` },
        ]
      : isImageTool
        ? [
            { label: '账号状态', value: '按页面状态' },
            { label: '生成额度', value: aiQuotaLabel || '同步中' },
            { label: '参考图', value: `${composerImageDrafts.length.toString()} 项` },
          ]
        : [
            { label: '运行环境', value: '浏览器 / Docker 沙箱' },
            { label: '输出状态', value: hasCommandResultText ? '有可发送结果' : '等待运行' },
            { label: '传输联动', value: hasCommandResultText ? '可填入文本发送' : '复制后也可发送' },
          ]

    return (
      <section className={`dd-snaplink__tool-workbench is-${tool}`} aria-label={toolLabel}>
        <SidebarNav
          deviceName={deviceName}
          avatarDataUrl={deviceAvatarDataUrl}
          activeMode={isAiTool ? 'rooms' : undefined}
          activeTool={isAiTool ? undefined : tool}
          activeTransferCount={workbenchActiveTransferCount}
          onAvatarClick={openAvatarPicker}
          onShowNearby={handleShowWorkbenchNearby}
          onShowRooms={handleShowWorkbenchRooms}
          onShowQueue={handleShowWorkbenchQueue}
          onShowSettings={handleShowWorkbenchSettings}
        />

        <div className="dd-snaplink__tool-main">
          <TopStatusBar
            className="dd-snaplink__tool-status"
            title={toolTitle}
            subtitle={toolSubtitle}
            icon={isAiTool ? (
              <Bot size={17} strokeWidth={1.8} aria-hidden="true" />
            ) : isImageTool ? (
              <ImageIcon size={17} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <Command size={17} strokeWidth={1.8} aria-hidden="true" />
            )}
            pillAriaLabel="工具状态"
            statusContent={renderToolConnectionStatus()}
          />

          <MobileWorkbenchNav
            className="dd-snaplink__tool-mobile-nav"
            activeMode={isAiTool ? 'rooms' : undefined}
            activeTool={isAiTool ? undefined : tool}
            ariaLabel="移动端工作台导航"
            activeTransferCount={workbenchActiveTransferCount}
            onShowNearby={handleShowWorkbenchNearby}
            onShowRooms={handleShowWorkbenchRooms}
            onShowQueue={handleShowWorkbenchQueue}
            onShowSettings={handleShowWorkbenchSettings}
          />

          <div className="dd-snaplink__tool-mobile-actions" aria-label={`${toolTitle}移动端快捷操作`}>
            {toolSideActions.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                title={item.title}
                onClick={item.action}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="dd-snaplink__tool-mobile-queue">
            <TransferQueuePanel
              entries={workbenchTransferEntries}
              activeCount={workbenchActiveTransferCount}
              completedCount={workbenchCompletedTransferCount}
              isMobileOpen={isMobileQueueOpen}
              incomingNotice={renderIncomingReceiveNotice('compact')}
              renderTaskCard={renderWorkbenchTransferCard}
              onToggleMobileOpen={() => setIsMobileQueueOpen((current) => !current)}
              onShowAllTransfers={handleShowWorkbenchQueue}
            />
          </div>

          <main className="dd-snaplink__tool-content">
            {content}
          </main>
        </div>

        <ToolContextPanel
          title={toolTitle}
          note={toolSideNote}
          rows={toolContextRows}
          actions={toolSideActions}
          transferCount={workbenchTransferEntries.length}
          activeTransferCount={workbenchActiveTransferCount}
          completedTransferCount={workbenchCompletedTransferCount}
          failedTransferCount={workbenchFailedTransferCount}
          incomingNotice={renderIncomingReceiveNotice('compact')}
          transferCards={workbenchTransferEntries.slice(0, 5).map(renderWorkbenchTransferCard)}
        />
      </section>
    )
  }

  const renderFileCard = (file: SnapLinkFileEntry) => (
    <FileMessageCard file={file} actions={renderFileActions(file)} />
  )

  const imagePreviewImageStyle: CSSProperties | undefined = isImagePreviewZoomed
    ? {
        transform: `translate3d(${imagePreviewPan.x.toFixed(1)}px, ${imagePreviewPan.y.toFixed(1)}px, 0) scale(${snapLinkImagePreviewZoomScale.toString()})`,
      }
    : undefined
  const snapLinkShellClassName = [
    'dd-snaplink',
    isDragging ? 'is-dragging' : '',
    !isAdminOpen ? 'is-workbench-shell' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleAvatarFileSelection}
      />
      <section
        className={snapLinkShellClassName}
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
            <span>DD直连</span>
            <em>文件互传</em>
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
                  : isCommandOpen
                    ? snapLinkCommandSelectionValue
                  : isAiChatOpen
                    ? snapLinkAiChatSelectionValue
                      : hasActiveRoom ? selectedRoomId ?? '' : ''
              }
              onChange={(event) => handleRoomSelection(event.target.value)}
            >
              <option value="">附近设备</option>
              <option value={snapLinkAiChatSelectionValue}>DD助手</option>
              <option value={snapLinkImageSelectionValue}>图片</option>
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
                  {renderThemeColorField('ai', '助手的信息框', 'DD直连小助手回复气泡')}
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
            className={!isAiChatOpen && !isImageOpen && !isAdminOpen && !isCommandOpen && workbenchMode === 'nearby' ? 'is-active' : ''}
            onClick={handleShowWorkbenchNearby}
          >
            附近设备
          </button>
          <button
            type="button"
            className={isAiChatOpen ? 'is-active' : ''}
            onClick={handleOpenAiChat}
          >
            AI
          </button>
          <button
            type="button"
            className={isImageOpen ? 'is-active' : ''}
            onClick={handleOpenImage}
          >
            图片
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
            renderToolWorkbenchView(imageElement, 'image')
          ) : isCommandOpen ? (
            renderToolWorkbenchView(commandElement, 'command')
          ) : isAiChatOpen ? (
            renderToolWorkbenchView(aiChatElement, 'ai-chat')
          ) : !hasActiveRoom ? (
            renderWorkbenchView()
          ) : (
            <section
              className={[
                'dd-snaplink__room-workbench',
                isZenMode ? 'is-zen' : '',
                isDesktopQueueCollapsed ? 'is-queue-collapsed' : '',
                workbenchVisibleTransferQueueCount === 0 ? 'has-empty-transfer-queue' : '',
              ].filter(Boolean).join(' ')}
              aria-label="DD直连房间会话工作台"
            >
              <SidebarNav
                deviceName={deviceName}
                avatarDataUrl={deviceAvatarDataUrl}
                activeMode="rooms"
                activeTransferCount={workbenchActiveTransferCount}
                onAvatarClick={openAvatarPicker}
                onShowNearby={handleShowWorkbenchNearby}
                onShowRooms={handleShowWorkbenchRooms}
                onShowQueue={handleShowWorkbenchQueue}
                onShowSettings={handleShowWorkbenchSettings}
              />

              <div className="dd-snaplink__room-workbench-main">
                {renderDesktopConversationSideList()}

                <div className="dd-snaplink__room-detail-pane">
                <div className="dd-snaplink__room-mobile-actions" aria-label="移动端房间更多入口">
                  <button
                    type="button"
                    className="dd-snaplink__room-mobile-back"
                    onClick={handleShowWorkbenchRooms}
                  >
                    ‹ 返回消息
                  </button>
                  <button
                    type="button"
                    className={isMobileRoomMembersOpen || Boolean(effectiveActiveSharedTab) ? 'is-active' : ''}
                    aria-pressed={isMobileRoomMembersOpen}
                    aria-expanded={isMobileRoomMembersOpen}
                    onClick={() => {
                      setActiveSharedTab(null)
                      setIsMobileRoomMembersOpen((current) => !current)
                    }}
                  >
                    更多
                  </button>
                </div>

                <section className="dd-snaplink__room" aria-label="ddzhilian 对话">
                  <RoomHeader
                    roomCodeLabel={copiedRoomId === selectedRoomId ? '已复制' : selectedRoomId}
                    roomCodeValue={selectedRoomId ?? undefined}
                    roomShareValue={selectedRoomShareValue}
                    shareSubtitle={selectedRoomShareSubtitle}
                    copyLabel={selectedRoomCopyLabel}
                    copiedLabel={selectedRoomCopiedLabel}
                    peerLabel={roomStatusLabel || selectedConversationName}
                    peerTitle={selectedConversationName}
                    connectionDetails={selectedRoomMoreDetails}
                    sharedContentCount={sharedContentCount}
                    isSharedContentOpen={Boolean(effectiveActiveSharedTab)}
                    onCopyRoomId={handleCopyRoomId}
                    onToggleSharedContent={() => setActiveSharedTab((current) => (current ? null : 'files'))}
                    onLeave={() => {
                      setActiveSharedTab(null)
                      setIsLobbyOpen(true)
                    }}
                    onOpenAssistant={handleOpenAiChat}
                    onOpenImageTool={handleOpenImage}
                    onOpenOcr={handleOcrTriggerClick}
                    onOpenCommandTool={handleOpenCommand}
                  />

              {workbenchActiveTransferCount > 0 ? (
                <button
                  type="button"
                  className="dd-snaplink__transfer-mini-banner"
                  aria-label="查看正在传输的文件"
                  onClick={() => {
                    setIsMobileQueueOpen(true)
                    setIsDesktopQueueCollapsed(false)
                  }}
                >
                  <span>
                    <i aria-hidden="true" />
                    正在传 {workbenchActiveTransferCount.toString()} 个文件
                    {activeTransferSpeedLabel ? ` · ${activeTransferSpeedLabel}` : ''}
                  </span>
                  <em>查看</em>
                </button>
              ) : null}

              {isMobileRoomMembersOpen ? (
                <aside className="dd-snaplink__room-member-panel" aria-label="更多功能">
                  <div className="dd-snaplink__room-member-head">
                    <strong>更多功能</strong>
                    <span>
                      {selectedRoomOnlineCount.toString()} 在线 · {(selectedRoom?.memberCount ?? 1).toString()} 成员
                    </span>
                  </div>
                  <div className="dd-snaplink__room-member-actions" aria-label="更多操作">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileRoomMembersOpen(false)
                        setActiveSharedTab('files')
                      }}
                    >
                      传输记录 {sharedContentCount.toString()}
                    </button>
                    <button type="button" onClick={handleCopyRoomId}>
                      {copiedRoomId === selectedRoomId ? selectedRoomCopiedLabel : selectedRoomCopyLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSharedTab(null)
                        setIsMobileRoomMembersOpen(false)
                        setIsLobbyOpen(true)
                      }}
                    >
                      回到列表
                    </button>
                  </div>
                  <div className="dd-snaplink__room-member-list">
                    {(selectedRoom?.members ?? []).map((member) => (
                      <span key={member.deviceId} className={member.online ? 'is-online' : ''}>
                        <em>{member.deviceName.slice(0, 1).toUpperCase()}</em>
                        <strong>{member.isSelf ? `${member.deviceName}（本机）` : member.deviceName}</strong>
                        <small>{member.platform || '设备'} · {member.online ? '在线' : '离线'}</small>
                      </span>
                    ))}
                  </div>
                </aside>
              ) : null}

              {effectiveActiveSharedTab ? (
                <SharedContentPanel
                  activeTab={effectiveActiveSharedTab}
                  activeLabel={activeSharedTabItem?.label}
                  tabs={sharedTabItems}
                  onTabChange={setActiveSharedTab}
                  onClose={() => setActiveSharedTab(null)}
                >
                  {renderSharedPanelContent()}
                </SharedContentPanel>
              ) : null}

              {isDragging ? <RoomDragOverlay targetName={selectedConversationName} /> : null}

              <RoomConversationStream
                messagesRef={messagesRef}
                hasContent={visibleConversationEntries.length > 0 || shouldShowAiThinking}
                emptyState={renderRoomConversationEmptyState()}
                onScroll={handleMessagesScroll}
              >
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
                      renderedEntry.fromSelf && deviceAvatarDataUrl && showSenderIdentity ? 'has-image' : '',
                    ].filter(Boolean).join(' ')
                    const selfAvatarStyle =
                      renderedEntry.fromSelf && deviceAvatarDataUrl && showSenderIdentity
                        ? { '--dd-avatar': `url("${deviceAvatarDataUrl}")` } as CSSProperties
                        : undefined
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
                              <MessageBubble
                                entryId={entry.id}
                                html={
                                  isBotMessage
                                    ? sanitizeBotReplyHtml(renderedEntry.text)
                                    : sanitizeRichTextHtml(renderedEntry.text)
                                }
                                isImageOnly={isImageOnlyMessage}
                                isRecalling={isRecallingTextEntry}
                                recallPhase={recallState?.phase}
                                onClick={handleRichBubbleClick}
                                onContextMenu={(event) => openMessageContextMenu(event, renderedEntry, actorIdentity.displayName)}
                                onPointerMove={handleImageBubbleCometPointerMove}
                                onPointerLeave={handleImageBubbleCometPointerReset}
                                onPointerCancel={handleImageBubbleCometPointerReset}
                              />
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
                            <span className={avatarClassName} style={selfAvatarStyle} aria-hidden="true">
                              {selfAvatarStyle ? null : actorIdentity.avatarLabel}
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
                          助
                        </span>
                        <div className="dd-snaplink__message-main">
                          <div className="dd-snaplink__sender-meta">
                            <span className="dd-snaplink__sender-name" title="DD直连小助手">
                              DD直连小助手
                            </span>
                            <span className="dd-snaplink__sender-badge is-ai">助手</span>
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
              </RoomConversationStream>

              {visibleErrorText ? (
                <div className="dd-snaplink__note is-error" role="status">
                  <span>{visibleErrorText}</span>
                  <button type="button" onClick={() => setDismissedErrorText(visibleErrorText)}>
                    关闭
                  </button>
                </div>
              ) : null}

              <RoomComposer
                quoteDraft={quoteDraft}
                images={composerImageDrafts}
                fileInputId={fileInputId}
                ocrPanelId={ocrPanelId}
                targetName={selectedConversationName}
                defaultDraft={plainDraft}
                isOcrPanelOpen={isOcrPanelOpen}
                isBotDraft={isBotDraft}
                isBotPanelOpen={isBotPanelOpen}
                isAiGenerating={isAiGenerating}
                selectedAiModel={selectedAiModel}
                selectedAiModelLabel={selectedAiModelLabel}
                aiQuotaLabel={aiQuotaLabel}
                aiModelOptions={aiModelOptions}
                isEmojiPickerOpen={isEmojiPickerOpen}
                isSendDisabled={isSendDisabled}
                ocrTriggerRef={ocrTriggerRef}
                ocrFileInputRef={ocrFileInputRef}
                botTriggerRef={botTriggerRef}
                botPanelRef={botPanelRef}
                inputRef={inputRef}
                emojiTriggerRef={emojiTriggerRef}
                emojiPickerRef={emojiPickerRef}
                getAiModelOptionValue={getAiModelOptionValue}
                onCancelQuote={() => setQuoteDraft(null)}
                onImageRemove={onComposerImageRemove}
                onSubmit={handleSubmit}
                onDirectFileInputChange={handleDirectFileInputChange}
                onOcrTriggerClick={handleOcrTriggerClick}
                onOcrFileSelection={handleOcrFileSelection}
                onBotTriggerClick={handleBotTriggerClick}
                onBotMentionSelect={handleBotMentionSelect}
                onAiModelChange={onAiModelChange}
                onDraftChange={handleDraftChange}
                onDraftCompositionStart={handleDraftCompositionStart}
                onDraftCompositionEnd={handleDraftCompositionEnd}
                onComposerPaste={handleComposerPaste}
                onComposerKeyDown={handleComposerKeyDown}
                onEmojiToggle={() => {
                  setIsBotPanelOpen(false)
                  setIsThemePanelOpen(false)
                  botMentionTriggerRangeRef.current = null
                  setIsEmojiPickerOpen((previous) => !previous)
                }}
                onEmojiInsert={handleEmojiInsert}
                onEmojiBackspace={handleEmojiBackspace}
                onEmojiSend={handleEmojiSend}
                onOpenImageTool={handleOpenImage}
                onOpenCommandTool={handleOpenCommand}
              />
                </section>
                </div>
              </div>

              <TransferQueuePanel
                entries={workbenchTransferEntries}
                activeCount={workbenchActiveTransferCount}
                completedCount={workbenchCompletedTransferCount}
                isMobileOpen={isMobileQueueOpen}
                isDesktopCollapsed={isDesktopQueueCollapsed}
                incomingNotice={renderIncomingReceiveNotice('compact')}
                renderTaskCard={renderWorkbenchTransferCard}
                onToggleMobileOpen={() => setIsMobileQueueOpen((current) => !current)}
                onToggleDesktopCollapsed={() => setIsDesktopQueueCollapsed((current) => !current)}
                onShowAllTransfers={handleShowWorkbenchQueue}
              />
            </section>
          )}
        </div>
      </main>
      </section>
      {renderTrustDeviceDialog()}
      {renderIncomingFileOfferDialog()}
      <CommandPalette
        open={isCommandPaletteOpen}
        commands={commandPaletteItems}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
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
          {messageContextMenu.ocrImage ? (
            <button type="button" role="menuitem" onClick={() => {
              void recognizeContextMessageImage()
            }}>
              OCR 识别
            </button>
          ) : null}
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
