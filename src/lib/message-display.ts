import type { RoomListItem, UnifiedConversationEntry } from '../app/types'
import {
  getRoomOnlineMemberCount,
  getRoomPeerOnlineCount,
} from '../app/room-presence'
import type { AiModelOption } from './ddzhilian-types'

export function formatMessageClock(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

export function resolveRoomLabel(room: RoomListItem | undefined, fallbackName: string) {
  if (!room) {
    return fallbackName
  }

  if (room.isAssistant) {
    return 'DD助手'
  }

  const peerOnlineCount = getRoomPeerOnlineCount(room)
  const onlineMemberCount = getRoomOnlineMemberCount(room)

  if (room.isPublic) {
    return '公共空间'
  }

  if (room.memberCount > 2) {
    return `${onlineMemberCount.toString()}/${room.memberCount.toString()} 位成员在线（含本机）`
  }

  if (room.status === 'connected') {
    return '对方在线 · WebRTC 直连中'
  }

  if (peerOnlineCount > 0) {
    return '对方在线 · 等待直连'
  }

  return '对方离线'
}

export function getAiModelOptionValue(option: AiModelOption) {
  return option.value ?? (option.provider ? `${option.provider}::${option.id}` : option.id)
}

export function resolveAvatarLabel(senderName: string, fromSelf: boolean) {
  if (fromSelf) {
    return '我'
  }

  const compactName = senderName.replace(/\s+/g, '').trim()
  if (!compactName) {
    return 'TA'
  }

  return Array.from(compactName)[0]?.toUpperCase() ?? 'TA'
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function escapeSnapLinkEntryIdSelector(value: string) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }

  return value.replace(/["\\]/g, '\\$&')
}

const DEVICE_SYSTEM_PREFIXES = new Set(['windows', 'android', 'ios', 'ipad', 'mac', 'linux', 'web'])

export function resolveActorIdentity(
  entry: Exclude<UnifiedConversationEntry, { entryType: 'notice' }>,
  isBotMessage: boolean,
) {
  if (isBotMessage) {
    return {
      displayName: 'DD助手',
      title: 'DD助手',
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

export function isConversationMessageEntry(
  entry: UnifiedConversationEntry | undefined,
): entry is Exclude<UnifiedConversationEntry, { entryType: 'notice' }> {
  return Boolean(entry && entry.entryType !== 'notice')
}

export function isBotConversationEntry(entry: Exclude<UnifiedConversationEntry, { entryType: 'notice' }>) {
  return entry.entryType === 'text' && entry.sourceDeviceId === 'bot_cloudflare_ai'
}

export function resolveMessageActorKey(entry: Exclude<UnifiedConversationEntry, { entryType: 'notice' }>) {
  if (entry.fromSelf) {
    return 'self'
  }

  if (isBotConversationEntry(entry)) {
    return 'bot'
  }

  return `peer:${entry.senderName.trim() || 'unknown'}`
}

export function getSnapLinkEntryCreatedAtMs(entry: UnifiedConversationEntry) {
  const createdAtMs = Date.parse(entry.createdAt)
  return Number.isNaN(createdAtMs) ? 0 : createdAtMs
}

export function getLatestSnapLinkEntryCreatedAtMs(entries: UnifiedConversationEntry[]) {
  return entries.reduce(
    (latestCreatedAtMs, entry) => Math.max(latestCreatedAtMs, getSnapLinkEntryCreatedAtMs(entry)),
    Number.NEGATIVE_INFINITY,
  )
}

const SNAPLINK_IMAGE_COMET_ROTATE_DEGREES = 7
const SNAPLINK_IMAGE_COMET_TRANSLATE_PX = 5

export function clampSnapLinkImageCometOffset(value: number) {
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

export function setSnapLinkImageCometPointerState(element: HTMLElement, xOffset: number, yOffset: number) {
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

export function resetSnapLinkImageCometPointerState(element: HTMLElement) {
  element.style.setProperty('--snaplink-image-comet-rotate-x', '0deg')
  element.style.setProperty('--snaplink-image-comet-rotate-y', '0deg')
  element.style.setProperty('--snaplink-image-comet-translate-x', '0px')
  element.style.setProperty('--snaplink-image-comet-translate-y', '0px')
  element.style.setProperty('--snaplink-image-comet-glare-x', '50%')
  element.style.setProperty('--snaplink-image-comet-glare-y', '50%')
}
