import { startTransition, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AdminStage } from './app/components/AdminStage'
import { ChatAiStage } from './app/components/ChatAiStage'
import { ImageAccountGate } from './app/components/ImageAccountGate'
import { ImageGenerationStage } from './app/components/ImageGenerationStage'
import { SnapLinkStage } from './app/components/SnapLinkStage'
import { WebCommandStage } from './app/components/WebCommandStage'
import { selectComposerAttachmentFiles, selectComposerImagePasteFiles } from './app/composer-image-paste'
import { pathForView, resolveViewFromPathname } from './app/routes'
import type {
  AiDraftContextPayload,
  AiDraftRequest,
  ComposerImageDraft,
  ConversationNotice,
  FileConversationEntry,
  NavView,
  RoomListItem,
  UnifiedConversationEntry,
} from './app/types'
import {
  collapseBroadcastTextRecords,
  collectDroppedFiles,
  deviceConnectionLabel,
  extractPlainTextFromRichText,
  formatFileSize,
  formatRelativeTime,
  hasRichTextImage,
  readImageFileAsDataUrl,
  renderInlineImageHtml,
  transferStatusLabel,
  transferStatusTone,
} from './app/utils'
import type {
  AiChatImageInput,
  AiModelOption,
  AiQuotaStatus,
  RoomSummary,
  TransferItem,
} from './lib/ddzhilian-types'
import { resolveDocumentPreviewKind } from './lib/document-preview'
import type { DocumentPreviewSource } from './lib/document-preview'
import { useAccountAuth } from './lib/use-account-auth'
import { useAdminPermissions } from './lib/use-admin-permissions'
import { useDdzhilian } from './lib/use-ddzhilian'

const AI_BOT_MENTION_LABEL = '@DD直连小助手'
const AI_THINKING_MIN_VISIBLE_MS = 650

function wait(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs)
  })
}

function hasDraggedFiles(event: DragEvent<HTMLElement>) {
  return event.dataTransfer.files.length > 0 || Array.from(event.dataTransfer.types).includes('Files')
}

async function keepAiThinkingVisibleSince(startedAt: number | null) {
  if (startedAt === null) {
    return
  }

  const remainingMs = AI_THINKING_MIN_VISIBLE_MS - (Date.now() - startedAt)
  if (remainingMs > 0) {
    await wait(remainingMs)
  }
}

function isPreviewableMediaType(mimeType?: string) {
  return Boolean(mimeType?.startsWith('image/') || mimeType?.startsWith('video/'))
}

function resolveMediaPreviewKind(mimeType: string | undefined, fileName: string) {
  const normalizedMimeType = mimeType?.toLowerCase() ?? ''
  const normalizedName = fileName.toLowerCase()

  if (normalizedMimeType.startsWith('image/') || /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(normalizedName)) {
    return 'image' as const
  }

  if (normalizedMimeType.startsWith('video/') || /\.(m4v|mov|mp4|ogv|webm)$/i.test(normalizedName)) {
    return 'video' as const
  }

  return null
}

function buildDocumentPreviewPayload(input: {
  fileName: string
  mimeType?: string
  source: DocumentPreviewSource
  downloadUrl?: string
  downloadName?: string
}) {
  const kind = resolveDocumentPreviewKind(input.mimeType, input.fileName)

  return kind
    ? {
        kind,
        fileName: input.fileName,
        mimeType: input.mimeType,
        source: input.source,
        downloadUrl: input.downloadUrl,
        downloadName: input.downloadName,
      }
    : null
}

function resolvePdfPreviewHref(payload: ReturnType<typeof buildDocumentPreviewPayload>) {
  return payload?.kind === 'pdf' && typeof payload.source === 'string'
    ? payload.source
    : undefined
}

type HistoryDownloadProgressState = {
  receivedBytes: number
  totalBytes: number
  progress: number
}

function formatTransferRate(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return null
  }

  return `${formatFileSize(Math.round(bytesPerSecond))}/s`
}

function formatTransferEta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 1) {
    return '不到 1 秒'
  }

  if (seconds < 60) {
    return `${Math.ceil(seconds).toString()} 秒`
  }

  if (seconds < 3600) {
    return `${Math.ceil(seconds / 60).toString()} 分钟`
  }

  return `${Math.ceil(seconds / 3600).toString()} 小时`
}

function resolveTransferTelemetry(
  item: Pick<TransferItem, 'status' | 'fileSize' | 'acknowledgedBytes' | 'createdAt' | 'startedAt'>,
  bytesPerSecond: number | null,
) {
  if (item.status !== 'transferring') {
    return {}
  }

  const acknowledgedBytes = Math.min(Math.max(item.acknowledgedBytes, 0), item.fileSize)

  if (!bytesPerSecond || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0 || acknowledgedBytes <= 0) {
    return {}
  }

  const speedLabel = formatTransferRate(bytesPerSecond)
  if (!speedLabel) {
    return {}
  }

  const remainingBytes = Math.max(item.fileSize - acknowledgedBytes, 0)
  const etaSeconds = remainingBytes / bytesPerSecond

  return {
    transferSpeedLabel: `速度 ${speedLabel}`,
    transferEtaLabel: remainingBytes > 0 ? `剩余 ${formatTransferEta(etaSeconds)}` : '即将完成',
  }
}

function resolveAcknowledgedTransferProgress(
  item: Pick<TransferItem, 'status' | 'fileSize' | 'acknowledgedBytes'>,
) {
  if (item.status === 'completed') {
    return 1
  }

  if (item.status !== 'transferring' && item.status !== 'failed') {
    return 0
  }

  if (item.fileSize <= 0) {
    return 0
  }

  const acknowledgedBytes = Math.min(Math.max(item.acknowledgedBytes, 0), item.fileSize)

  return acknowledgedBytes / item.fileSize
}

type TransferTelemetrySample = {
  acknowledgedBytes: number
  sampledAt: number
  bytesPerSecond: number
}

function extractLinksFromRichText(value: string) {
  if (!value) {
    return []
  }

  const links: Array<{ url: string; label: string }> = []

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser()
    const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
    for (const anchor of Array.from(documentFragment.querySelectorAll('a[href]'))) {
      const url = anchor.getAttribute('href')?.trim()
      if (url) {
        links.push({
          url,
          label: anchor.textContent?.trim() || url,
        })
      }
    }
  }

  const plainText = extractPlainTextFromRichText(value)
  for (const match of plainText.matchAll(/(?:https?:\/\/|www\.)[^\s<>"']+/gi)) {
    const rawUrl = match[0].replace(/[.,!?;:，。！？；：]+$/, '')
    const url = rawUrl.startsWith('www.') ? `https://${rawUrl}` : rawUrl
    if (!links.some((link) => link.url === url)) {
      links.push({ url, label: rawUrl })
    }
  }

  return links
}

function readRoomIdFromSearch(search: string) {
  const roomId = new URLSearchParams(search).get('room')

  return roomId?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || null
}

function isBotChatRoom(room: Pick<RoomSummary, 'reason'> | null | undefined) {
  return room?.reason === 'bot-chat'
}

function getPrivateRoomPeerKey(room: Pick<RoomListItem, 'isPublic' | 'isAssistant' | 'members'>) {
  if (room.isPublic || room.isAssistant) {
    return null
  }

  const peerIds = room.members
    .filter((member) => !member.isSelf)
    .map((member) => member.deviceId)
    .sort()

  return peerIds.length > 0 ? peerIds.join('|') : null
}

function resolvePublicRoomTitle(publicIndex?: number) {
  return publicIndex ? `世界对话 ${publicIndex.toString()}` : '世界对话'
}

function parseAiBotPrompt(value: string) {
  const match = /^@(?:DD直连小助手|ai|bot)(?:[\s:：,，]+)?([\s\S]*)$/i.exec(value.trim())
  if (!match) {
    return null
  }

  return match[1].trim()
}

function buildAiBotPrompt(question: string, quotedText: string, imageCount: number, fileCount: number) {
  const normalizedQuestion =
    question.trim() ||
    (imageCount > 0 || fileCount > 0 ? '请阅读附件内容并说明重点。' : '')
  const normalizedQuote = quotedText.trim()
  const imageInstruction = imageCount > 0 ? '\n\n用户同时附带了图片，请结合图片回答。' : ''
  const fileInstruction = fileCount > 0 ? '\n\n用户同时附带了文件，请结合文件内容回答。' : ''

  if (!normalizedQuote) {
    return `${normalizedQuestion}${imageInstruction}${fileInstruction}`
  }

  return [
    '请参考下面的引用内容回答用户问题。',
    '',
    '引用内容：',
    normalizedQuote,
    '',
    '用户问题：',
    `${normalizedQuestion || '请阅读并回应这段引用内容。'}${imageInstruction}${fileInstruction}`,
  ].join('\n')
}

function normalizeAiChatImageMimeType(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }

  return normalized === 'image/jpg' ? 'image/jpeg' : normalized
}

function parseDataUrlImageMimeType(value: string) {
  const match = /^data:([^;,]+)(?:;[^,]*)?,/i.exec(value.trim())
  return normalizeAiChatImageMimeType(match?.[1])
}

function normalizeAiChatImageSource(value: string) {
  const source = value.trim()
  if (!source) {
    return null
  }

  if (source.toLowerCase().startsWith('data:image/')) {
    const mimeType = parseDataUrlImageMimeType(source)
    if (!mimeType || !AI_CHAT_ALLOWED_IMAGE_TYPES.has(mimeType)) {
      return null
    }

    return { url: source, mimeType }
  }

  try {
    const url = new URL(source)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return { url: url.toString(), mimeType: undefined }
    }
  } catch {
    return null
  }

  return null
}

function extractAiChatImagesFromRichText(value: string): AiChatImageInput[] {
  if (!value || typeof DOMParser === 'undefined') {
    return []
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const seenSources = new Set<string>()
  const images: AiChatImageInput[] = []

  for (const image of Array.from(documentFragment.body.querySelectorAll('img[src]'))) {
    if (images.length >= AI_CHAT_IMAGE_MAX_COUNT) {
      break
    }

    const normalizedSource = normalizeAiChatImageSource(image.getAttribute('src') ?? '')
    if (!normalizedSource || seenSources.has(normalizedSource.url)) {
      continue
    }

    seenSources.add(normalizedSource.url)
    const alt = image.getAttribute('alt')?.trim()
    images.push({
      url: normalizedSource.url,
      mimeType: normalizedSource.mimeType,
      ...(alt ? { alt: alt.slice(0, 120) } : {}),
    })
  }

  return images
}

const AI_CHAT_IMAGE_MAX_COUNT = 99
const AI_CHAT_ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function isAiQuotaPrompt(value: string) {
  return /(余额|额度|quota|balance)/i.test(value.trim())
}

function getAiModelOptionValue(option: AiModelOption) {
  return option.value ?? (option.provider ? `${option.provider}::${option.id}` : option.id)
}

function findAiModelOption(options: AiModelOption[], value: string) {
  return options.find((option) => getAiModelOptionValue(option) === value || option.id === value)
}

type RoomPreviewEvent = {
  createdAt: string
  previewText: string
}

function isNewerRoomPreviewEvent(candidate: RoomPreviewEvent, current: RoomPreviewEvent | undefined) {
  return !current || Date.parse(candidate.createdAt) > Date.parse(current.createdAt)
}

function setLatestRoomPreviewEvent(
  eventsByRoomId: Map<string, RoomPreviewEvent>,
  roomId: string | undefined,
  event: RoomPreviewEvent,
) {
  if (!roomId) {
    return
  }

  const current = eventsByRoomId.get(roomId)
  if (isNewerRoomPreviewEvent(event, current)) {
    eventsByRoomId.set(roomId, event)
  }
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const fileInputId = useId()
  const [isDragging, setIsDragging] = useState(false)
  const [chatDraft, setChatDraft] = useState('')
  const [composerImageDrafts, setComposerImageDrafts] = useState<ComposerImageDraft[]>([])
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [pendingRoomSelectionId, setPendingRoomSelectionId] = useState<string | null>(null)
  const [autoOpenRoomId, setAutoOpenRoomId] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [aiGeneratingRoomId, setAiGeneratingRoomId] = useState<string | null>(null)
  const [aiDraftRequest, setAiDraftRequest] = useState<AiDraftRequest | null>(null)
  const [commandResultText, setCommandResultText] = useState('')
  const [workbenchTextRequestId, setWorkbenchTextRequestId] = useState(0)
  const [conversationNotices, setConversationNotices] = useState<ConversationNotice[]>([])
  const [aiQuotaStatus, setAiQuotaStatus] = useState<AiQuotaStatus | null>(null)
  const [aiModelOptions, setAiModelOptions] = useState<AiModelOption[]>([])
  const [selectedAiModel, setSelectedAiModel] = useState('')
  const [historyDownloadProgressById, setHistoryDownloadProgressById] = useState<
    Record<string, HistoryDownloadProgressState>
  >({})
  const activeView = resolveViewFromPathname(location.pathname)
  const isAdminView = activeView === 'admin'
  const isAiChatView = activeView === 'chat'
  const isImageView = activeView === 'image'
  const isCommandView = activeView === 'command'
  const isAdminProtectedView = isAdminView
  const imageAccount = useAccountAuth()
  const { canRecallAnyMessage } = useAdminPermissions({
    enabled: !isAdminProtectedView,
    refreshKey: imageAccount.user?.id ?? '',
  })
  const previousConnectionStatusesRef = useRef<Record<string, 'connecting' | 'connected' | 'failed' | 'closed'>>({})
  const hasConnectionSnapshotRef = useRef(false)
  const joinedRoomLinkRef = useRef<string | null>(null)
  const handledPublicRoomRef = useRef<string | null>(null)
  const handledPrivateRoomRef = useRef<string | null>(null)
  const suppressNextPrivateRoomAutoOpenRef = useRef(false)
  const transferTelemetrySamplesRef = useRef<Record<string, TransferTelemetrySample>>({})

  const {
    self,
    localIdentity,
    onlinePeers,
    rooms,
    roomStates,
    preferences,
    sessions,
    connectionStates,
    connectedTargets,
    transferItems,
    textRecords,
    receivedFiles,
    pendingIncomingFileOffers,
    historyFiles,
    historyTexts,
    errorMessage,
    lastCreatedPublicRoomId,
    lastCreatedPrivateRoomId,
    joinRoom,
    createPublicRoom,
    createBotRoom,
    requestConnect,
    updateSettings,
    updateRoomState,
    updatePreferences,
    requestSnapshot,
    createTransferItems,
    retryTransfer,
    cancelTransfer,
    acceptIncomingFileOffer,
    rejectIncomingFileOffer,
    downloadHistoryFile,
    loadHistoryFileBlob,
    resolveHistoryFileDownloadUrl,
    startPendingTransfers,
    sendText,
    recallText,
    recallFile,
    sendRoomText,
    ensureRoomHistoryLoaded,
    loadOlderRoomHistoryTexts,
    askAi,
    listAiChatConversations,
    saveAiChatConversations,
    deleteAiChatConversation,
    generateImage,
    startOcrJob,
    listOcrHistory,
    deleteOcrHistory,
    getImageQuota,
    listImageHistory,
    getAiQuota,
    sendRoomFiles,
  } = useDdzhilian()

  useEffect(() => {
    if (location.pathname === '/') {
      navigate(`${pathForView('text')}${location.search}`, { replace: true })
    }
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    const nextAccountId = imageAccount.user?.id ?? ''
    if ((localIdentity.accountId ?? '') === nextAccountId) {
      return
    }

    updateSettings({ accountId: nextAccountId })
  }, [imageAccount.user?.id, localIdentity.accountId, updateSettings])

  useEffect(() => {
    if (!self?.historyAuthToken) {
      setAiQuotaStatus(null)
      setAiModelOptions([])
      setSelectedAiModel('')
      return
    }

    let isCancelled = false

    void getAiQuota()
      .then((status) => {
        if (!isCancelled) {
          setAiQuotaStatus(status)
          const models = status.models ?? []
          setAiModelOptions(models)
          setSelectedAiModel((current) => {
            if (current && findAiModelOption(models, current)) {
              return current
            }

            const defaultModel = models.find((model) =>
              model.id === status.model &&
              (!status.provider || !model.provider || model.provider === status.provider),
            )
            if (defaultModel) {
              return getAiModelOptionValue(defaultModel)
            }

            return models[0] ? getAiModelOptionValue(models[0]) : status.model ?? ''
          })
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setAiQuotaStatus(null)
          setAiModelOptions([])
          setSelectedAiModel('')
        }
      })

    return () => {
      isCancelled = true
    }
  }, [getAiQuota, self?.historyAuthToken])

  useEffect(() => {
    const roomId = readRoomIdFromSearch(location.search)
    if (!roomId || !self || joinedRoomLinkRef.current === roomId) {
      return
    }

    joinedRoomLinkRef.current = roomId
    joinRoom(roomId)
    setPendingRoomSelectionId(roomId)
    setAutoOpenRoomId(roomId)
    setLocalError(null)

    if (activeView !== 'text') {
      navigate(`${pathForView('text')}${location.search}`, { replace: true })
    }
  }, [activeView, joinRoom, location.search, navigate, self])

  useEffect(() => {
    if (!lastCreatedPublicRoomId || handledPublicRoomRef.current === lastCreatedPublicRoomId) {
      return
    }

    handledPublicRoomRef.current = lastCreatedPublicRoomId
    setPendingRoomSelectionId(lastCreatedPublicRoomId)
    setSelectedRoomId(lastCreatedPublicRoomId)
    setAutoOpenRoomId(lastCreatedPublicRoomId)
    setLocalError(null)

    if (activeView !== 'text') {
      navigate(pathForView('text'))
    }
  }, [activeView, lastCreatedPublicRoomId, navigate])

  useEffect(() => {
    if (!lastCreatedPrivateRoomId || handledPrivateRoomRef.current === lastCreatedPrivateRoomId) {
      return
    }

    handledPrivateRoomRef.current = lastCreatedPrivateRoomId

    if (suppressNextPrivateRoomAutoOpenRef.current) {
      suppressNextPrivateRoomAutoOpenRef.current = false
      setLocalError(null)
      return
    }

    setPendingRoomSelectionId(lastCreatedPrivateRoomId)
    setSelectedRoomId(lastCreatedPrivateRoomId)
    setAutoOpenRoomId(lastCreatedPrivateRoomId)
    setLocalError(null)

    if (activeView !== 'text') {
      navigate(pathForView('text'))
    }
  }, [activeView, lastCreatedPrivateRoomId, navigate])

  const roomById = useMemo(
    () => new Map(rooms.map((room) => [room.roomId, room] as const)),
    [rooms],
  )
  const findExistingPrivateRoomForDevice = (deviceId: string) => {
    const selfDeviceId = self?.deviceId
    if (!selfDeviceId) {
      return null
    }

    return [...rooms]
      .filter((room) =>
        !room.isPublic &&
        !isBotChatRoom(room) &&
        room.members.some((member) => member.deviceId === selfDeviceId) &&
        room.members.some((member) => member.deviceId === deviceId),
      )
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] ?? null
  }
  const roomStateById = useMemo(
    () => new Map(roomStates.map((state) => [state.roomId, state] as const)),
    [roomStates],
  )
  const onlineDeviceItems = useMemo(
    () =>
      [...onlinePeers]
        .sort((left, right) => {
          if (left.relation.sameAccount !== right.relation.sameAccount) {
            return left.relation.sameAccount ? -1 : 1
          }

          if (left.relation.sameLan !== right.relation.sameLan) {
            return left.relation.sameLan ? -1 : 1
          }

          return left.deviceName.localeCompare(right.deviceName, 'zh-CN')
        })
        .map((peer) => {
          const relationLabels = [
            peer.relation.sameAccount ? '同账号' : '',
            peer.relation.sameLan ? '局域网' : '',
          ].filter(Boolean)

          return {
            deviceId: peer.deviceId,
            deviceName: peer.deviceName,
            platform: peer.platform,
            shortCode: peer.shortCode,
            pairToken: peer.pairToken,
            scopeLabel: relationLabels.join(' · ') || '可发现设备',
            lastSeenLabel: formatRelativeTime(peer.lastSeenAt),
          }
        }),
    [onlinePeers],
  )
  const deviceNameById = useMemo(() => {
    const next = new Map<string, string>()
    if (self) {
      next.set(self.deviceId, self.deviceName)
    }
    for (const peer of onlinePeers) {
      next.set(peer.deviceId, peer.deviceName)
    }
    for (const room of rooms) {
      for (const member of room.members) {
        next.set(member.deviceId, member.deviceName)
      }
    }
    return next
  }, [onlinePeers, rooms, self])

  const sessionPeerNameById = useMemo(() => {
    const next = new Map<string, string>()
    for (const session of sessions) {
      next.set(session.sessionId, session.peer?.deviceName ?? session.peerId)
    }
    return next
  }, [sessions])

  const effectiveSelectedRoomId =
    selectedRoomId && roomById.has(selectedRoomId)
      ? selectedRoomId
      : (rooms[0]?.roomId ?? null)
  const selectedRoom = effectiveSelectedRoomId ? roomById.get(effectiveSelectedRoomId) ?? null : null
  const isSelectedBotRoom = isBotChatRoom(selectedRoom)
  const selectedRoomMemberNames =
    selectedRoom?.members
      .filter((member) => member.deviceId !== self?.deviceId)
      .map((member) => deviceNameById.get(member.deviceId) ?? member.deviceName) ?? []
  const selectedRoomPeerId =
    selectedRoom?.members.find(
      (member) => member.deviceId === selectedPeerId && member.deviceId !== self?.deviceId,
    )?.deviceId ??
    selectedRoom?.members.find(
      (member) =>
        member.deviceId !== self?.deviceId &&
        onlinePeers.some((peer) => peer.deviceId === member.deviceId),
    )?.deviceId ??
    null
  const effectiveSelectedPeerId =
    selectedPeerId && onlinePeers.some((peer) => peer.deviceId === selectedPeerId)
      ? selectedPeerId
      : (onlinePeers[0]?.deviceId ?? null)
  const selectedDevicePeer = selectedRoom
    ? onlinePeers.find((peer) => peer.deviceId === selectedRoomPeerId) ?? null
    : onlinePeers.find((peer) => peer.deviceId === effectiveSelectedPeerId) ?? null
  const selectedConversationSessions = sessions
    .filter((session) =>
      effectiveSelectedRoomId ? session.roomId === effectiveSelectedRoomId : session.peerId === selectedDevicePeer?.deviceId,
    )
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
  const selectedConversationSessionIds = new Set(
    selectedConversationSessions.map((session) => session.sessionId),
  )

  useEffect(() => {
    if (!selectedRoom) {
      return
    }

    ensureRoomHistoryLoaded(selectedRoom.roomId)
  }, [ensureRoomHistoryLoaded, selectedRoom])

  useEffect(() => {
    if (!pendingRoomSelectionId || !self) {
      return
    }

    const room = roomById.get(pendingRoomSelectionId)
    if (!room) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      setSelectedRoomId(room.roomId)
      const firstPeer = room.members.find((member) => member.deviceId !== self.deviceId)

      if (firstPeer) {
        setSelectedPeerId(firstPeer.deviceId)
      }

      setPendingRoomSelectionId(null)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [pendingRoomSelectionId, roomById, self, sessions])

  const selfName = self?.deviceName ?? localIdentity.deviceName

  const peerStatusById = new Map<string, 'connecting' | 'connected' | 'failed' | 'closed'>()
  for (const state of Object.values(connectionStates)) {
    const previous = peerStatusById.get(state.peerId)
    if (!previous) {
      peerStatusById.set(state.peerId, state.status)
      continue
    }

    const priority = { connected: 4, connecting: 3, failed: 2, closed: 1 }
    if (priority[state.status] > priority[previous]) {
      peerStatusById.set(state.peerId, state.status)
    }
  }

  const selectedDeviceStatus =
    selectedDevicePeer ? peerStatusById.get(selectedDevicePeer.deviceId) : undefined
  const selectedRoomConnectedTargets = effectiveSelectedRoomId
    ? connectedTargets.filter((target) => target.session.roomId === effectiveSelectedRoomId)
    : selectedDevicePeer
      ? connectedTargets.filter((target) => target.peerId === selectedDevicePeer.deviceId)
      : []
  const selectedConversationName = isSelectedBotRoom
    ? 'DD助手'
    : selectedRoom?.isPublic
    ? resolvePublicRoomTitle(selectedRoom.publicIndex)
    : selectedRoom && selectedRoomMemberNames.length > 0
    ? selectedRoomMemberNames.length <= 3
      ? selectedRoomMemberNames.join('、')
      : `${selectedRoomMemberNames.slice(0, 3).join('、')} 等 ${selectedRoomMemberNames.length} 位成员`
    : selectedRoom
      ? `Room ${selectedRoom.roomId}`
      : selectedDevicePeer?.deviceName ?? '设备对话'

  const connectingTargetCount = Object.values(connectionStates).filter(
    (state) => state.status === 'connecting',
  ).length

  const selectedConnectedTarget = selectedRoomConnectedTargets[0] ?? null
  const activeTransferLabel =
    isSelectedBotRoom
      ? 'AI 助手 · 随时可用'
      : selectedRoom
      ? `${selectedConversationName} · ${selectedRoomConnectedTargets.length} 台已连接设备`
      : selectedDevicePeer
        ? `${selectedDevicePeer.deviceName} · ${deviceConnectionLabel(selectedDeviceStatus)}`
        : onlinePeers.length > 0 && connectingTargetCount > 0
          ? '检测到在线设备，但尚未完成直连，正在尝试自动连接...'
          : onlinePeers.length > 0
            ? '当前没有可接收文件的已连接设备'
            : '暂无已连接设备'

  const visibleTransferItems = useMemo(
    () => transferItems.filter((item) => item.status !== 'cancelled'),
    [transferItems],
  )
  const transferTelemetryById = useMemo(() => {
    const now = Date.now()
    const nextActiveIds = new Set<string>()
    const nextTelemetryById: Record<string, ReturnType<typeof resolveTransferTelemetry>> = {}

    for (const item of visibleTransferItems) {
      if (item.status !== 'transferring') {
        delete transferTelemetrySamplesRef.current[item.id]
        continue
      }

      nextActiveIds.add(item.id)

      const acknowledgedBytes = Math.min(Math.max(item.acknowledgedBytes, 0), item.fileSize)
      const previousSample = transferTelemetrySamplesRef.current[item.id]

      if (!previousSample || acknowledgedBytes < previousSample.acknowledgedBytes) {
        transferTelemetrySamplesRef.current[item.id] = {
          acknowledgedBytes,
          sampledAt: now,
          bytesPerSecond: 0,
        }
        continue
      }

      let bytesPerSecond = previousSample.bytesPerSecond
      const deltaBytes = acknowledgedBytes - previousSample.acknowledgedBytes
      const deltaSeconds = (now - previousSample.sampledAt) / 1000

      if (deltaBytes > 0 && deltaSeconds >= 0.12) {
        const instantBytesPerSecond = deltaBytes / deltaSeconds
        bytesPerSecond = previousSample.bytesPerSecond > 0
          ? previousSample.bytesPerSecond * 0.66 + instantBytesPerSecond * 0.34
          : instantBytesPerSecond

        transferTelemetrySamplesRef.current[item.id] = {
          acknowledgedBytes,
          sampledAt: now,
          bytesPerSecond,
        }
      }

      nextTelemetryById[item.id] = resolveTransferTelemetry(item, bytesPerSecond)
    }

    for (const id of Object.keys(transferTelemetrySamplesRef.current)) {
      if (!nextActiveIds.has(id)) {
        delete transferTelemetrySamplesRef.current[id]
      }
    }

    return nextTelemetryById
  }, [visibleTransferItems])
  const sortedChatRecords = collapseBroadcastTextRecords(
    [...textRecords].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    ),
  )
  const visibleTransferItemsForConversation =
    effectiveSelectedRoomId
      ? visibleTransferItems.filter(
          (item) =>
            item.roomId === effectiveSelectedRoomId ||
            (item.sessionId ? selectedConversationSessionIds.has(item.sessionId) : false),
        )
      : selectedDevicePeer
        ? visibleTransferItems.filter((item) => item.targetDeviceId === selectedDevicePeer.deviceId)
      : visibleTransferItems
  const receivedFilesForConversation =
    effectiveSelectedRoomId
      ? receivedFiles.filter((file) => selectedConversationSessionIds.has(file.sessionId))
      : receivedFiles
  const conversationNoticesForConversation =
    effectiveSelectedRoomId
      ? conversationNotices.filter((notice) => selectedConversationSessionIds.has(notice.sessionId))
      : conversationNotices
  const activeConversationRoomId = effectiveSelectedRoomId
  const localHistoryIds = new Set<string>()
  for (const item of visibleTransferItemsForConversation) {
    localHistoryIds.add(item.historyId)
  }
  for (const file of receivedFilesForConversation) {
    if (file.historyId) {
      localHistoryIds.add(file.historyId)
    }
  }
  const historyFilesForConversation =
    activeConversationRoomId
      ? historyFiles.filter(
          (file) =>
            file.roomId === activeConversationRoomId &&
            !localHistoryIds.has(file.historyId),
        )
      : []
  const localTextHistoryIds = new Set<string>()
  for (const record of textRecords) {
    localTextHistoryIds.add(record.id)
  }
  const historyTextRecordsForConversation =
    activeConversationRoomId
      ? historyTexts
          .filter(
            (record) =>
              record.roomId === activeConversationRoomId &&
              !localTextHistoryIds.has(record.historyId),
          )
          .map((record) => ({
            id: record.historyId,
            roomId: record.roomId,
            sessionId:
              record.sessionId ??
              selectedConversationSessions[0]?.sessionId ??
              '',
            sourceDeviceId: record.sourceDeviceId,
            fromSelf: record.sourceDeviceId === self?.deviceId,
            senderName: deviceNameById.get(record.sourceDeviceId) ?? record.sourceDeviceName,
            status: undefined,
            text: record.text,
            createdAt: record.createdAt,
          }))
      : []
  const sortedChatRecordsForConversation = collapseBroadcastTextRecords(
    [
      ...(effectiveSelectedRoomId
        ? sortedChatRecords.filter(
            (record) =>
              record.roomId === effectiveSelectedRoomId ||
              selectedConversationSessionIds.has(record.sessionId),
          )
        : sortedChatRecords),
      ...historyTextRecordsForConversation,
    ].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    ),
  )
  const groupedTransferItemsForConversation = [
    ...visibleTransferItemsForConversation
      .reduce((groups, item) => {
        const key = item.historyId || item.id
        const group = groups.get(key) ?? []
        group.push(item)
        groups.set(key, group)
        return groups
      }, new Map<string, typeof visibleTransferItemsForConversation>())
      .values(),
  ].map((items) => {
    const primary = items[0]
    const statuses = new Set(items.map((item) => item.status))
    const status: typeof primary.status = statuses.has('failed')
      ? 'failed'
      : items.every((item) => item.status === 'completed')
        ? 'completed'
        : statuses.has('transferring')
          ? 'transferring'
          : statuses.has('ready')
            ? 'ready'
            : statuses.has('connecting')
              ? 'connecting'
              : statuses.has('waiting_for_target')
                ? 'waiting_for_target'
                : 'queued'
    const targetNames = [
      ...new Set(
        items
          .map((item) => item.targetDeviceName)
          .filter((name): name is string => Boolean(name)),
      ),
    ]
    const startedTimes = items
      .map((item) => item.startedAt ? new Date(item.startedAt).getTime() : Number.NaN)
      .filter((time) => Number.isFinite(time))
    const completedTimes = items
      .map((item) => item.completedAt ? new Date(item.completedAt).getTime() : Number.NaN)
      .filter((time) => Number.isFinite(time))

    return {
      ...primary,
      status,
      startedAt: startedTimes.length > 0 ? new Date(Math.min(...startedTimes)).toISOString() : primary.startedAt,
      completedAt: completedTimes.length > 0 ? new Date(Math.max(...completedTimes)).toISOString() : primary.completedAt,
      sentBytes: Math.max(...items.map((item) => item.sentBytes)),
      acknowledgedBytes: Math.max(...items.map((item) => item.acknowledgedBytes)),
      progress:
        items.length > 1
          ? Math.min(...items.map(resolveAcknowledgedTransferProgress))
          : resolveAcknowledgedTransferProgress(primary),
      targetDeviceName:
        targetNames.length > 1
          ? `${targetNames.length} 台设备`
          : targetNames[0] ?? primary.targetDeviceName,
      errorMessage: items.find((item) => item.errorMessage)?.errorMessage,
    }
  })

  const handleHistoryFileDownload = (file: (typeof historyFiles)[number]) => {
    setHistoryDownloadProgressById((current) => ({
      ...current,
      [file.historyId]: {
        receivedBytes: 0,
        totalBytes: file.size,
        progress: 0,
      },
    }))

    void downloadHistoryFile(file, (progress) => {
      setHistoryDownloadProgressById((current) => ({
        ...current,
        [file.historyId]: progress,
      }))
    }).then(
      () => {
        setLocalError(null)
        setHistoryDownloadProgressById((current) => ({
          ...current,
          [file.historyId]: {
            receivedBytes: file.size,
            totalBytes: file.size,
            progress: 1,
          },
        }))
        window.setTimeout(() => {
          setHistoryDownloadProgressById((current) => {
            const progress = current[file.historyId]
            if (!progress || progress.progress < 1) {
              return current
            }

            const next = { ...current }
            delete next[file.historyId]
            return next
          })
        }, 1200)
      },
      (error) => {
        setHistoryDownloadProgressById((current) => {
          const next = { ...current }
          delete next[file.historyId]
          return next
        })
        setLocalError(error instanceof Error ? error.message : '历史文件下载失败。')
      },
    )
  }

  const fileConversationEntries = [
    ...groupedTransferItemsForConversation.map((item) => {
      const documentPreviewPayload = item.documentPreviewUrl
        ? buildDocumentPreviewPayload({
            fileName: item.fileName,
            mimeType: item.fileMimeType,
            source: item.documentPreviewUrl,
            downloadUrl: item.documentPreviewUrl,
            downloadName: item.fileName,
          })
        : null

      const acknowledgedBytes = item.status === 'completed'
        ? item.fileSize
        : Math.min(Math.max(item.acknowledgedBytes, 0), item.fileSize)
      const transferTelemetry = transferTelemetryById[item.id] ?? {}
      const transferProgress = resolveAcknowledgedTransferProgress(item)

      return {
        id: item.id,
        historyId: item.historyId,
        sessionId: item.sessionId,
        kind: 'outgoing' as const,
        fromSelf: true,
        createdAt: item.createdAt,
        fileName: item.fileName,
        fileSize: item.fileSize,
        mimeType: item.fileMimeType,
        previewUrl: item.previewUrl,
        subtitle: item.targetDeviceName ?? activeTransferLabel,
        detail: `${formatFileSize(acknowledgedBytes)} / ${formatFileSize(item.fileSize)}`,
        statusLabel: transferStatusLabel(item.status),
        transferStatus: item.status,
        transferSpeedLabel: transferTelemetry.transferSpeedLabel,
        transferEtaLabel: transferTelemetry.transferEtaLabel,
        tone: transferStatusTone(item.status),
        progress: transferProgress,
        documentPreviewKind: documentPreviewPayload?.kind,
        documentPreviewHref: resolvePdfPreviewHref(documentPreviewPayload),
        onOpenDocumentPreview: documentPreviewPayload ? () => documentPreviewPayload : undefined,
        action:
          item.status === 'failed'
            ? ('retry' as const)
            : item.status !== 'completed'
              ? ('cancel' as const)
              : undefined,
        canRecall: item.status === 'completed',
      }
    }),
    ...receivedFilesForConversation.map((file) => {
      const documentPreviewPayload = file.completed && file.objectUrl
        ? buildDocumentPreviewPayload({
            fileName: file.name,
            mimeType: file.mimeType,
            source: file.objectUrl,
            downloadUrl: file.objectUrl,
            downloadName: file.name,
          })
        : null

      return {
        id: `incoming-${file.id}`,
        historyId: file.historyId,
        sessionId: file.sessionId,
        kind: 'incoming' as const,
        fromSelf: false,
        createdAt: file.createdAt,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.mimeType,
        previewUrl: file.completed && isPreviewableMediaType(file.mimeType) ? file.objectUrl : undefined,
        subtitle: sessionPeerNameById.get(file.sessionId) ?? '对方设备',
        detail: file.completed
          ? `${formatFileSize(file.size)} · 已可下载`
          : `${formatFileSize(file.receivedBytes)} / ${formatFileSize(file.size)}`,
        statusLabel: file.completed ? '已接收' : '接收中',
        transferStatus: file.completed ? ('completed' as const) : ('transferring' as const),
        tone: file.completed ? ('completed' as const) : ('active' as const),
        progress: file.size > 0 ? Math.min(file.receivedBytes / file.size, 1) : 0,
        downloadUrl: file.objectUrl,
        downloadName: file.name,
        documentPreviewKind: documentPreviewPayload?.kind,
        documentPreviewHref: resolvePdfPreviewHref(documentPreviewPayload),
        onOpenDocumentPreview: documentPreviewPayload ? () => documentPreviewPayload : undefined,
        canRecall: Boolean(file.historyId && canRecallAnyMessage),
      }
    }),
    ...historyFilesForConversation.map((file) => {
      const downloadProgress = historyDownloadProgressById[file.historyId]
      const documentPreviewKind = resolveDocumentPreviewKind(file.mimeType, file.fileName)

      return {
        id: `history-${file.historyId}`,
        historyId: file.historyId,
        sessionId: file.sessionId,
        kind: file.sourceDeviceId === self?.deviceId ? ('outgoing' as const) : ('incoming' as const),
        fromSelf: file.sourceDeviceId === self?.deviceId,
        createdAt: file.createdAt,
        fileName: file.fileName,
        fileSize: file.size,
        mimeType: file.mimeType,
        subtitle:
          file.sourceDeviceId === self?.deviceId
            ? '已归档到当前对话'
            : deviceNameById.get(file.sourceDeviceId) ?? file.sourceDeviceName,
        detail: downloadProgress
          ? `${formatFileSize(downloadProgress.receivedBytes)} / ${formatFileSize(downloadProgress.totalBytes)}`
          : `${formatFileSize(file.size)} · 历史文件`,
        statusLabel: downloadProgress ? '下载中' : '可回放',
        transferStatus: downloadProgress ? ('transferring' as const) : ('completed' as const),
        tone: downloadProgress ? ('active' as const) : ('completed' as const),
        progress: downloadProgress ? downloadProgress.progress : 1,
        downloadName: file.fileName,
        onDownload: () => handleHistoryFileDownload(file),
        isDownloadDisabled: Boolean(downloadProgress),
        documentPreviewKind: documentPreviewKind ?? undefined,
        documentPreviewHref:
          documentPreviewKind === 'pdf' && file.isPublic
            ? resolveHistoryFileDownloadUrl(file)
            : undefined,
        onOpenDocumentPreview: documentPreviewKind
          ? async () => ({
              kind: documentPreviewKind,
              fileName: file.fileName,
              mimeType: file.mimeType,
              source: await loadHistoryFileBlob(file),
              downloadName: file.fileName,
            })
          : undefined,
        canRecall: file.sourceDeviceId === self?.deviceId || canRecallAnyMessage,
      }
    }),
  ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())

  const globalTransferEntries: FileConversationEntry[] = [
    ...visibleTransferItems.map((item) => {
      const documentPreviewPayload = item.documentPreviewUrl
        ? buildDocumentPreviewPayload({
            fileName: item.fileName,
            mimeType: item.fileMimeType,
            source: item.documentPreviewUrl,
            downloadUrl: item.documentPreviewUrl,
            downloadName: item.fileName,
          })
        : null
      const acknowledgedBytes = item.status === 'completed'
        ? item.fileSize
        : Math.min(Math.max(item.acknowledgedBytes, 0), item.fileSize)
      const transferTelemetry = transferTelemetryById[item.id] ?? {}
      const transferProgress = resolveAcknowledgedTransferProgress(item)

      return {
        id: item.id,
        historyId: item.historyId,
        sessionId: item.sessionId,
        kind: 'outgoing' as const,
        fromSelf: true,
        createdAt: item.createdAt,
        fileName: item.fileName,
        fileSize: item.fileSize,
        mimeType: item.fileMimeType,
        previewUrl: item.previewUrl,
        subtitle: item.targetDeviceName ?? '目标设备',
        detail: `${formatFileSize(acknowledgedBytes)} / ${formatFileSize(item.fileSize)}`,
        statusLabel: transferStatusLabel(item.status),
        transferStatus: item.status,
        transferSpeedLabel: transferTelemetry.transferSpeedLabel,
        transferEtaLabel: transferTelemetry.transferEtaLabel,
        tone: transferStatusTone(item.status),
        progress: transferProgress,
        documentPreviewKind: documentPreviewPayload?.kind,
        documentPreviewHref: resolvePdfPreviewHref(documentPreviewPayload),
        onOpenDocumentPreview: documentPreviewPayload ? () => documentPreviewPayload : undefined,
        action:
          item.status === 'failed'
            ? ('retry' as const)
            : item.status !== 'completed'
              ? ('cancel' as const)
              : undefined,
        canRecall: item.status === 'completed',
      }
    }),
    ...receivedFiles.map((file) => {
      const documentPreviewPayload = file.completed && file.objectUrl
        ? buildDocumentPreviewPayload({
            fileName: file.name,
            mimeType: file.mimeType,
            source: file.objectUrl,
            downloadUrl: file.objectUrl,
            downloadName: file.name,
          })
        : null

      return {
        id: `incoming-${file.id}`,
        historyId: file.historyId,
        sessionId: file.sessionId,
        kind: 'incoming' as const,
        fromSelf: false,
        createdAt: file.createdAt,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.mimeType,
        previewUrl: file.completed && isPreviewableMediaType(file.mimeType) ? file.objectUrl : undefined,
        subtitle: sessionPeerNameById.get(file.sessionId) ?? '对方设备',
        detail: file.completed
          ? `${formatFileSize(file.size)} · 已可下载`
          : `${formatFileSize(file.receivedBytes)} / ${formatFileSize(file.size)}`,
        statusLabel: file.completed ? '已接收' : '接收中',
        transferStatus: file.completed ? ('completed' as const) : ('transferring' as const),
        tone: file.completed ? ('completed' as const) : ('active' as const),
        progress: file.size > 0 ? Math.min(file.receivedBytes / file.size, 1) : 0,
        downloadUrl: file.objectUrl,
        downloadName: file.name,
        documentPreviewKind: documentPreviewPayload?.kind,
        documentPreviewHref: resolvePdfPreviewHref(documentPreviewPayload),
        onOpenDocumentPreview: documentPreviewPayload ? () => documentPreviewPayload : undefined,
        canRecall: Boolean(file.historyId && canRecallAnyMessage),
      }
    }),
  ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())

  const unifiedConversationEntries: UnifiedConversationEntry[] = [
    ...sortedChatRecordsForConversation.map((record) => {
      const recordSourceDeviceId =
        'sourceDeviceId' in record && typeof record.sourceDeviceId === 'string'
          ? record.sourceDeviceId
          : undefined
      const sourceDeviceId =
        recordSourceDeviceId ??
        (record.senderName === 'bot' && !record.fromSelf
          ? 'bot_cloudflare_ai'
          : record.fromSelf
            ? self?.deviceId
            : undefined)

      return {
        id: `text-${record.id}`,
        entryType: 'text' as const,
        sessionId: record.sessionId,
        sourceDeviceId,
        fromSelf: record.fromSelf,
        senderName: record.fromSelf
          ? selfName
          : sourceDeviceId
            ? deviceNameById.get(sourceDeviceId) ??
              sessionPeerNameById.get(record.sessionId) ??
              record.senderName ??
              '对方设备'
            : record.senderName ?? sessionPeerNameById.get(record.sessionId) ?? '对方设备',
        status: record.status,
        createdAt: record.createdAt,
        text: record.text,
      }
    }),
    ...conversationNoticesForConversation.map((notice) => ({
      id: `notice-${notice.id}`,
      entryType: 'notice' as const,
      sessionId: notice.sessionId,
      fromSelf: false as const,
      createdAt: notice.createdAt,
      text: notice.text,
    })),
    ...fileConversationEntries.map((entry) => ({
      id: `file-${entry.id}`,
      entryType: 'file' as const,
      sessionId: entry.sessionId ?? '',
      fromSelf: entry.fromSelf,
      senderName: entry.fromSelf
        ? selfName
        : sessionPeerNameById.get(entry.sessionId ?? '') ?? entry.subtitle ?? '对方设备',
      createdAt: entry.createdAt,
      file: entry,
    })),
  ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())

  const fileConversationEmptyState =
    selectedRoom
      ? isSelectedBotRoom
        ? '这里是和 DD直连小助手的私密聊天，不会出现在世界对话。'
        : selectedRoom.isPublic
        ? '公共房间适合多人共享文本，也可以从这里发起文件任务。'
        : selectedConnectedTarget
        ? '把文件拖进对话区，或点击下方按钮加入发送队列。'
        : `还没有与 ${selectedConversationName} 建立直连，发送文件前会先等待设备连接。`
      : '选择一个已有对话后，消息和文件会显示在这里。'
  const hasChatDraftContent =
    extractPlainTextFromRichText(chatDraft).trim().length > 0 ||
    hasRichTextImage(chatDraft) ||
    composerImageDrafts.length > 0
  const hasChatTextDraft =
    extractPlainTextFromRichText(chatDraft).trim().length > 0 ||
    hasRichTextImage(chatDraft) ||
    composerImageDrafts.length > 0
  const canSendRoomContentWithoutConnection =
    Boolean(selectedRoom) &&
    hasChatTextDraft
  const aiQuotaLabel = aiQuotaStatus
    ? aiQuotaStatus.provider && aiQuotaStatus.provider !== 'cloudflare'
      ? (aiQuotaStatus.limitLabel ?? '外部 API 计费')
      : `今日剩余 ${aiQuotaStatus.remainingNeurons.toLocaleString()} / ${aiQuotaStatus.dailyNeuronBudget.toLocaleString()} Neurons`
    : 'AI 额度加载中'
  const selectedAiModelOption = findAiModelOption(aiModelOptions, selectedAiModel)
  const selectedAiModelLabel =
    selectedAiModelOption?.label ||
    selectedAiModel ||
    aiQuotaStatus?.model ||
    'AI 模型'
  const selectedConversationTransferSessionIds = [...selectedConversationSessionIds]
  const sessionRoomIdById = useMemo(
    () => new Map(sessions.map((session) => [session.sessionId, session.roomId] as const)),
    [sessions],
  )
  const latestSessionByRoomId = useMemo(() => {
    const next = new Map<string, (typeof sessions)[number]>()
    for (const session of sessions) {
      const current = next.get(session.roomId)
      if (!current || Date.parse(session.updatedAt) > Date.parse(current.updatedAt)) {
        next.set(session.roomId, session)
      }
    }
    return next
  }, [sessions])
  const connectedCountByRoomId = useMemo(() => {
    const next = new Map<string, number>()
    for (const target of connectedTargets) {
      const roomId = target.session.roomId
      next.set(roomId, (next.get(roomId) ?? 0) + 1)
    }
    return next
  }, [connectedTargets])
  const loadedHistoryTextRoomIds = useMemo(() => {
    const next = new Set<string>()
    for (const record of historyTexts) {
      next.add(record.roomId)
    }
    return next
  }, [historyTexts])
  const roomActivityById = useMemo(() => {
    const latestEventByRoomId = new Map<string, RoomPreviewEvent>()
    const unreadCountByRoomId = new Map<string, number>()
    const lastReadTimeByRoomId = new Map<string, number>()
    for (const state of roomStates) {
      if (state.lastReadAt) {
        lastReadTimeByRoomId.set(state.roomId, Date.parse(state.lastReadAt))
      }
    }

    const addEvent = (
      roomId: string | undefined,
      event: RoomPreviewEvent,
      isIncoming: boolean,
    ) => {
      if (!roomId) {
        return
      }

      setLatestRoomPreviewEvent(latestEventByRoomId, roomId, event)
      const lastReadTime = lastReadTimeByRoomId.get(roomId)
      if (isIncoming && lastReadTime !== undefined && Date.parse(event.createdAt) > lastReadTime) {
        unreadCountByRoomId.set(roomId, (unreadCountByRoomId.get(roomId) ?? 0) + 1)
      }
    }

    for (const record of textRecords) {
      const roomId = record.roomId ?? sessionRoomIdById.get(record.sessionId)
      const preview = extractPlainTextFromRichText(record.text).slice(0, 28) || '空消息'
      addEvent(roomId, {
        createdAt: record.createdAt,
        previewText: `[文本] ${preview}`,
      }, !record.fromSelf)
    }

    for (const record of historyTexts) {
      const preview = extractPlainTextFromRichText(record.text).slice(0, 28) || '空消息'
      addEvent(record.roomId, {
        createdAt: record.createdAt,
        previewText: `[文本] ${preview}`,
      }, record.sourceDeviceId !== self?.deviceId)
    }

    for (const file of receivedFiles) {
      addEvent(sessionRoomIdById.get(file.sessionId), {
        createdAt: file.createdAt,
        previewText: `[文件] ${file.name}`,
      }, true)
    }

    for (const item of visibleTransferItems) {
      addEvent(item.roomId ?? (item.sessionId ? sessionRoomIdById.get(item.sessionId) : undefined), {
        createdAt: item.createdAt,
        previewText: `[文件] ${item.fileName}`,
      }, false)
    }

    for (const file of historyFiles) {
      addEvent(file.roomId, {
        createdAt: file.createdAt,
        previewText: `[文件] ${file.fileName}`,
      }, file.sourceDeviceId !== self?.deviceId)
    }

    return { latestEventByRoomId, unreadCountByRoomId }
  }, [
    historyFiles,
    historyTexts,
    receivedFiles,
    roomStates,
    self?.deviceId,
    sessionRoomIdById,
    textRecords,
    visibleTransferItems,
  ])
  const roomListItems: RoomListItem[] = rooms
    .map((room) => {
      const latestSession = latestSessionByRoomId.get(room.roomId)
      const memberNames = room.members
        .filter((member) => member.deviceId !== self?.deviceId)
        .map((member) => deviceNameById.get(member.deviceId) ?? member.deviceName)
      const hasLoadedHistoryTexts = loadedHistoryTextRoomIds.has(room.roomId)
      const publicRoomTitle = room.isPublic ? resolvePublicRoomTitle(room.publicIndex) : ''
      const title =
        isBotChatRoom(room)
          ? 'DD直连小助手'
          : room.isPublic
          ? publicRoomTitle
          : memberNames.length === 0
          ? `Room ${room.roomId}`
          : memberNames.length <= 3
            ? memberNames.join('、')
            : `${memberNames.slice(0, 3).join('、')} 等 ${memberNames.length} 位成员`
      const roomState = roomStateById.get(room.roomId)
      const lastReadTime = roomState?.lastReadAt ? Date.parse(roomState.lastReadAt) : null
      const unloadedHistoryPreview =
        !hasLoadedHistoryTexts && room.historyTextLatestAt && room.historyTextPreview
          ? {
              createdAt: room.historyTextLatestAt,
              previewText: `[文本] ${(extractPlainTextFromRichText(room.historyTextPreview).slice(0, 28) || '空消息')}`,
            }
          : undefined
      const indexedLatestEvent = roomActivityById.latestEventByRoomId.get(room.roomId)
      const latestEvent = unloadedHistoryPreview && isNewerRoomPreviewEvent(unloadedHistoryPreview, indexedLatestEvent)
        ? unloadedHistoryPreview
        : indexedLatestEvent
      const updatedAt = latestEvent?.createdAt ?? latestSession?.updatedAt ?? room.updatedAt
      const previewText =
        latestEvent?.previewText ??
        (isBotChatRoom(room)
          ? 'DD直连小助手'
          : room.isPublic
            ? `${publicRoomTitle}，可通过链接加入`
            : '暂无消息')
      const onlineCount = room.members.filter(
        (member) => member.deviceId !== self?.deviceId && member.online,
      ).length
      const hasSelf = room.members.some((member) => member.deviceId === self?.deviceId)
      const connectedCount = connectedCountByRoomId.get(room.roomId) ?? 0
      const unloadedHistoryUnreadCount =
        (!hasLoadedHistoryTexts &&
        lastReadTime !== null &&
        room.historyTextLatestAt &&
        room.historyTextLatestSourceDeviceId &&
        room.historyTextLatestSourceDeviceId !== self?.deviceId &&
        Date.parse(room.historyTextLatestAt) > lastReadTime
          ? 1
          : 0)
      const unreadCount =
        (roomActivityById.unreadCountByRoomId.get(room.roomId) ?? 0) + unloadedHistoryUnreadCount
      const status: RoomListItem['status'] =
        connectedCount > 0 ? 'connected' : onlineCount > 0 || hasSelf ? 'online' : 'history'

      return {
        roomId: room.roomId,
        title,
        previewText,
        updatedAt,
        updatedAtLabel: formatRelativeTime(updatedAt),
        isPublic: room.isPublic,
        publicIndex: room.publicIndex,
        memberCount: room.members.length,
        onlineCount,
        members: room.members.map((member) => ({
          deviceId: member.deviceId,
          deviceName: deviceNameById.get(member.deviceId) ?? member.deviceName,
          platform: member.platform,
          online: member.online,
          isSelf: member.deviceId === self?.deviceId,
        })),
        status,
        pinned: roomState?.pinned ?? false,
        unreadCount,
        isAssistant: isBotChatRoom(room),
      }
    })
    .reduce<RoomListItem[]>((visibleRooms, room) => {
      const peerKey = getPrivateRoomPeerKey(room)
      if (!peerKey) {
        visibleRooms.push(room)
        return visibleRooms
      }

      const existingIndex = visibleRooms.findIndex((item) => getPrivateRoomPeerKey(item) === peerKey)
      if (existingIndex === -1) {
        visibleRooms.push(room)
        return visibleRooms
      }

      const existingRoom = visibleRooms[existingIndex]
      if (Date.parse(room.updatedAt) > Date.parse(existingRoom.updatedAt)) {
        visibleRooms[existingIndex] = room
      }

      return visibleRooms
    }, [])
    .sort((left, right) => {
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
    })
  const sharedMediaEntries = fileConversationEntries.filter((entry) =>
    Boolean(resolveMediaPreviewKind(entry.mimeType, entry.fileName)),
  )
  const sharedFileEntries = fileConversationEntries.filter((entry) =>
    !resolveMediaPreviewKind(entry.mimeType, entry.fileName),
  )
  const sharedLinkEntries = [
    ...sortedChatRecordsForConversation.flatMap((record) =>
      extractLinksFromRichText(record.text).map((link, index) => ({
        id: `${record.id}-link-${index.toString()}`,
        url: link.url,
        label: link.label,
        sourceName: record.fromSelf
          ? selfName
          : (
              (record.sourceDeviceId ? deviceNameById.get(record.sourceDeviceId) : undefined) ??
              record.senderName?.trim() ??
              sessionPeerNameById.get(record.sessionId) ??
              '对方设备'
            ),
        createdAt: record.createdAt,
      })),
    ),
  ]

  useEffect(() => {
    const currentStatuses = Object.fromEntries(
      Object.entries(connectionStates).map(([sessionId, state]) => [sessionId, state.status]),
    )

    if (!hasConnectionSnapshotRef.current) {
      previousConnectionStatusesRef.current = currentStatuses
      hasConnectionSnapshotRef.current = true
      return
    }

    const nextNotices: ConversationNotice[] = []
    for (const [sessionId, state] of Object.entries(connectionStates)) {
      const previousStatus = previousConnectionStatusesRef.current[sessionId]
      const currentStatus = state.status

      if (previousStatus !== 'connected' && currentStatus === 'connected') {
        nextNotices.push({
          id: `${sessionId}-joined-${Date.now()}-${state.peerId}`,
          sessionId,
          deviceId: state.peerId,
          createdAt: new Date().toISOString(),
          text: `${state.peerName} 加入对话`,
        })
      }

      if (previousStatus === 'connected' && (currentStatus === 'closed' || currentStatus === 'failed')) {
        nextNotices.push({
          id: `${sessionId}-left-${Date.now()}-${state.peerId}`,
          sessionId,
          deviceId: state.peerId,
          createdAt: new Date().toISOString(),
          text: `${state.peerName} 退出对话`,
        })
      }
    }

    if (nextNotices.length > 0) {
      queueMicrotask(() => {
        setConversationNotices((previous) => [...previous, ...nextNotices])
      })
    }

    previousConnectionStatusesRef.current = currentStatuses
  }, [connectionStates])

  const handleViewChange = (view: NavView) => {
    startTransition(() => {
      navigate(pathForView(view))
      setLocalError(null)
    })
  }

  const handleShareCommandResult = (text = commandResultText) => {
    const normalizedText = text.trim()
    if (!normalizedText) {
      setLocalError('先运行命令，生成可发送的结果。')
      handleViewChange('command')
      return
    }

    setChatDraft((current) => {
      const currentText = current.trim()
      const resultText = `命令运行结果\n\n${normalizedText}`
      return currentText ? `${current.trimEnd()}\n\n${resultText}` : resultText
    })
    setLocalError(null)
    setWorkbenchTextRequestId((current) => current + 1)
    handleViewChange('text')
  }

  const handlePrepareAiDraft = (text: string, context?: AiDraftContextPayload) => {
    const normalizedText = text.trim()
    if (!normalizedText) {
      setLocalError('没有可发送给 AI 的上下文。')
      handleViewChange('chat')
      return
    }

    setAiDraftRequest({
      id: Date.now(),
      text: normalizedText,
      contextLabel: context?.contextLabel,
      contextItems: context?.contextItems,
    })
    setLocalError(null)
    handleViewChange('chat')
  }

  const handleSendFilesToCurrentConversation = async (
    files: File[],
    options: { preserveLocalError?: boolean } = {},
  ) => {
    if (files.length === 0) {
      return
    }

    if (!selectedRoom) {
      setLocalError('请先创建或选择一个对话。')
      return
    }

    const isPrivateDeviceRoom = !selectedRoom.isPublic && !isSelectedBotRoom
    const shouldSendRoomFilesThroughHistory =
      !isPrivateDeviceRoom && (selectedRoom.isPublic || selectedRoomConnectedTargets.length === 0)

    try {
      if (shouldSendRoomFilesThroughHistory) {
        await sendRoomFiles(
          selectedRoom.roomId,
          files.map((file) => ({
            id: crypto.randomUUID(),
            file,
          })),
        )
      } else {
        const targetSessionIds =
          selectedConversationTransferSessionIds.length > 0
            ? selectedConversationTransferSessionIds
            : selectedRoomConnectedTargets.map((target) => target.session.sessionId)

        if (targetSessionIds.length === 0) {
          setLocalError('先加入当前对话，再发送文件。')
          return
        }

        const created = createTransferItems(files, targetSessionIds, {
          archiveHistory: !isPrivateDeviceRoom,
        })
        await startPendingTransfers(
          created.map((item) => item.id),
          null,
        )
      }
      if (!options.preserveLocalError) {
        setLocalError(null)
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '文件发送失败。')
    }
  }

  const handleSendFilesToDevice = async (deviceId: string, files: File[]) => {
    if (files.length === 0) {
      return
    }

    const targetPeer = onlinePeers.find((peer) => peer.deviceId === deviceId)
    const peerName = targetPeer?.deviceName ?? deviceNameById.get(deviceId) ?? deviceId
    const targetSessions = connectedTargets
      .filter((target) => target.peerId === deviceId)
      .map((target) => target.session.sessionId)

    try {
      setIsDragging(false)
      setSelectedPeerId(deviceId)
      setSelectedRoomId(null)
      setLocalError(null)

      if (targetSessions.length === 0) {
        const existingPrivateRoom = findExistingPrivateRoomForDevice(deviceId)
        if (existingPrivateRoom) {
          requestConnect(deviceId, { reason: 'manual' })
        } else {
          suppressNextPrivateRoomAutoOpenRef.current = true
          requestConnect(deviceId, { reason: 'manual', createNewRoom: true })
          window.setTimeout(() => {
            suppressNextPrivateRoomAutoOpenRef.current = false
          }, 10_000)
        }
      }

      const created = createTransferItems(
        files,
        targetSessions.length > 0 ? targetSessions : null,
        {
          archiveHistory: false,
          preferredPeer: {
            peerId: deviceId,
            peerName,
          },
        },
      )
      await startPendingTransfers(
        created.map((item) => item.id),
        targetSessions[0] ?? null,
      )
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '文件发送失败。')
    }
  }

  const handleComposerImagePaste = async (files: File[]) => {
    if (files.length === 0) {
      return
    }

    const {
      remainingSlots,
      selectedFiles,
      skippedCount,
    } = selectComposerImagePasteFiles(files, composerImageDrafts.length, AI_CHAT_IMAGE_MAX_COUNT)
    if (remainingSlots === 0) {
      setLocalError(`一次最多暂存 ${AI_CHAT_IMAGE_MAX_COUNT.toString()} 张图片。`)
      return
    }

    try {
      const drafts = await Promise.all(
        selectedFiles.map(async (file) => ({
          id: crypto.randomUUID(),
          name: file.name || '粘贴图片',
          size: file.size,
          mimeType: file.type || undefined,
          dataUrl: await readImageFileAsDataUrl(file),
        })),
      )

      setComposerImageDrafts((previous) => [
        ...previous,
        ...drafts,
      ].slice(0, AI_CHAT_IMAGE_MAX_COUNT))
      setLocalError(
        skippedCount > 0
          ? `已暂存 ${selectedFiles.length.toString()} 张图片，另有 ${skippedCount.toString()} 张因一次最多暂存 ${AI_CHAT_IMAGE_MAX_COUNT.toString()} 张未加入。`
          : null,
      )
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '图片读取失败。')
    }
  }

  const handleAttachFilesToCurrentConversation = async (files: File[]) => {
    if (files.length === 0) {
      return
    }

    const {
      inlineImageFiles,
      transferableFiles,
    } = selectComposerAttachmentFiles(files)

    if (inlineImageFiles.length > 0) {
      await handleComposerImagePaste(inlineImageFiles)
    }

    if (transferableFiles.length > 0) {
      await handleSendFilesToCurrentConversation(transferableFiles, {
        preserveLocalError: inlineImageFiles.length > 0,
      })
    }
  }

  const handleSendText = async (quoteHtml = '') => {
    const draftSource = chatDraft
    const inlineImageHtml = composerImageDrafts
      .map((image) => renderInlineImageHtml(image.dataUrl, image.name))
      .join('')
    const rawText = [
      quoteHtml,
      draftSource,
      inlineImageHtml ? `<div>${inlineImageHtml}</div>` : '',
    ].filter(Boolean).join('\n')
    const draftPlainText = extractPlainTextFromRichText(draftSource).trim()
    const quotedText = quoteHtml ? extractPlainTextFromRichText(quoteHtml).trim() : ''
    const normalizedText = extractPlainTextFromRichText(rawText).trim()
    const hasImageContent = hasRichTextImage(rawText)
    const hasTextPayload = normalizedText.length > 0 || hasImageContent
    const parsedAiBotQuestion = parseAiBotPrompt(draftPlainText)
    const aiBotQuestion = parsedAiBotQuestion ?? (isSelectedBotRoom ? draftPlainText : null)
    const aiBotImages = aiBotQuestion === null ? [] : extractAiChatImagesFromRichText(rawText)
    const aiBotPrompt = aiBotQuestion === null
      ? null
      : buildAiBotPrompt(aiBotQuestion, quotedText, aiBotImages.length, 0)
    if (!hasTextPayload) {
      setLocalError('请输入要发送的内容。')
      return
    }

    if (
      aiBotQuestion !== null &&
      aiBotQuestion.length === 0 &&
      !quotedText &&
      aiBotImages.length === 0
    ) {
      setLocalError(`请输入要问 ${AI_BOT_MENTION_LABEL} 的问题。`)
      return
    }

    const isPublicRoom = Boolean(selectedRoom?.isPublic)
    const isPrivateDeviceRoom = Boolean(selectedRoom && !selectedRoom.isPublic && !isSelectedBotRoom)
    const shouldSendRoomContentThroughHistory =
      Boolean(selectedRoom) &&
      !isPrivateDeviceRoom &&
      (isPublicRoom || selectedRoomConnectedTargets.length === 0 || hasImageContent)

    if (selectedRoomConnectedTargets.length === 0 && !shouldSendRoomContentThroughHistory) {
      setLocalError('先与当前选中的设备建立连接，再发送消息。')
      return
    }

    const botRoomId = aiBotPrompt === null ? null : effectiveSelectedRoomId
    if (aiBotPrompt !== null && !botRoomId) {
      setLocalError('当前对话尚未建立房间，无法同步 AI 回复。')
      return
    }

    const shouldShowAiThinking = botRoomId !== null
    if (shouldShowAiThinking) {
      setLocalError(null)
      setAiGeneratingRoomId(botRoomId)
      setIsAiGenerating(true)
    }
    const aiThinkingStartedAt = shouldShowAiThinking ? Date.now() : null

    try {
      const recordId = crypto.randomUUID()
      const createdAt = new Date().toISOString()
      const isAiBotQuotaPrompt = aiBotQuestion !== null && isAiQuotaPrompt(aiBotQuestion)

      const targets = selectedRoomConnectedTargets

      if (hasTextPayload) {
        const textPayload = rawText

        if (shouldSendRoomContentThroughHistory && selectedRoom) {
          await sendRoomText(selectedRoom.roomId, textPayload, {
            recordId,
            createdAt,
          })
        } else {
          for (const [index, target] of targets.entries()) {
            await sendText(target.session.sessionId, textPayload, {
              logLocalRecord: index === 0,
              recordId,
              createdAt,
              archiveHistory: !isPrivateDeviceRoom,
            })
          }
        }
      }

      setChatDraft('')
      setComposerImageDrafts([])
      setLocalError(null)

      if (aiBotPrompt !== null && botRoomId !== null) {
        try {
          const answer = await askAi(aiBotPrompt, {
            roomId: botRoomId,
            replyToName: self?.deviceName ?? localIdentity.deviceName,
            kind: isAiBotQuotaPrompt ? 'quota' : 'chat',
            historyId: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            provider: selectedAiModelOption?.provider,
            model: selectedAiModelOption?.id ?? (selectedAiModel || undefined),
            images: aiBotImages,
          })

          if (answer.quota) {
            setAiQuotaStatus(answer.quota)
          }
        } catch (error) {
          setLocalError(error instanceof Error ? error.message : 'AI 请求失败。')
        } finally {
          await keepAiThinkingVisibleSince(aiThinkingStartedAt)
          setIsAiGenerating(false)
          setAiGeneratingRoomId(null)
        }
      }
    } catch (error) {
      if (shouldShowAiThinking) {
        await keepAiThinkingVisibleSince(aiThinkingStartedAt)
        setIsAiGenerating(false)
        setAiGeneratingRoomId(null)
      }
      setLocalError(error instanceof Error ? error.message : '文本发送失败。')
    }
  }

  const handleRecallText = async (entryId: string) => {
    const recordId = entryId.startsWith('text-') ? entryId.slice('text-'.length) : entryId

    try {
      await recallText(recordId, { canRecallAny: canRecallAnyMessage })
      setLocalError(null)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '消息撤回失败。')
      throw error
    }
  }

  const handleRecallFile = async (entryId: string) => {
    const historyId = entryId.startsWith('file-') ? entryId.slice('file-'.length) : entryId

    try {
      await recallFile(historyId, { canRecallAny: canRecallAnyMessage })
      setLocalError(null)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '文件撤回失败。')
      throw error
    }
  }

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setIsDragging(false)

    const nextFiles = await collectDroppedFiles(event.dataTransfer)
    if (nextFiles.length === 0) {
      return
    }

    await handleAttachFilesToCurrentConversation(nextFiles)
  }

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) {
      return
    }

    setIsDragging(true)
  }

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) {
      return
    }

    event.preventDefault()
    if (!isDragging) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    const relatedTarget = event.relatedTarget
    if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
      setIsDragging(false)
    }
  }

  const handleOpenRoomConversation = (roomId: string) => {
    const room = roomById.get(roomId)
    const firstPeer = room?.members.find(
      (member) =>
        member.deviceId !== self?.deviceId &&
        onlinePeers.some((peer) => peer.deviceId === member.deviceId),
    )
    setSelectedRoomId(roomId)
    setSelectedPeerId(firstPeer?.deviceId ?? null)
    updateRoomState({ roomId, lastReadAt: new Date().toISOString() })
  }

  const handleStartPrivateChat = (deviceId: string) => {
    setSelectedPeerId(deviceId)
    setLocalError(null)
    const existingPrivateRoom = findExistingPrivateRoomForDevice(deviceId)

    if (existingPrivateRoom) {
      requestConnect(deviceId, { reason: 'manual' })
      handleOpenRoomConversation(existingPrivateRoom.roomId)
      setAutoOpenRoomId(existingPrivateRoom.roomId)

      if (activeView !== 'text') {
        navigate(pathForView('text'))
      }
      return
    }

    requestConnect(deviceId, { reason: 'manual', createNewRoom: true })
  }

  const handleCreatePublicRoom = () => {
    createPublicRoom()
    setLocalError(null)
  }

  const handleOpenAssistantConversation = () => {
    const existingBotRoom = rooms.find((room) => isBotChatRoom(room))

    setLocalError(null)

    if (existingBotRoom) {
      setPendingRoomSelectionId(existingBotRoom.roomId)
      setSelectedRoomId(existingBotRoom.roomId)
      setAutoOpenRoomId(existingBotRoom.roomId)
      updateRoomState({ roomId: existingBotRoom.roomId, lastReadAt: new Date().toISOString() })

      if (activeView !== 'text') {
        navigate(pathForView('text'))
      }
      return
    }

    createBotRoom()

    if (activeView !== 'text') {
      navigate(pathForView('text'))
    }
  }

  const handleJoinRoomFromWorkbench = (roomId: string) => {
    const normalizedRoomId = roomId.trim().toUpperCase()
    if (!normalizedRoomId) {
      setLocalError('请输入房间短码。')
      return
    }

    joinRoom(normalizedRoomId)
    setPendingRoomSelectionId(normalizedRoomId)
    setAutoOpenRoomId(normalizedRoomId)
    setLocalError(null)
  }

  const handleDeviceNameChange = (deviceName: string) => {
    const normalizedName = deviceName.trim().slice(0, 80)
    if (!normalizedName) {
      setLocalError('设备名不能为空。')
      return
    }

    updateSettings({ deviceName: normalizedName })
    setLocalError(null)
  }

  const adminRouteElement = <AdminStage />

  const imageAuthGateElement = (
    <ImageAccountGate
      isLoading={imageAccount.isLoading}
      isSubmitting={imageAccount.isSubmitting}
      error={imageAccount.error}
      onLogin={imageAccount.login}
      onRegister={imageAccount.register}
    />
  )

  const aiChatElement = (
    <ChatAiStage
      aiModelOptions={aiModelOptions}
      selectedAiModel={selectedAiModel}
      selectedAiModelLabel={selectedAiModelLabel}
      isConversationSyncReady={Boolean(self?.historyAuthToken)}
      onAiModelChange={setSelectedAiModel}
      onAskAi={(prompt, options) => {
        const requestedModelOption = findAiModelOption(aiModelOptions, options?.model ?? selectedAiModel)
        return askAi(prompt, {
          kind: 'chat',
          provider: requestedModelOption?.provider ?? options?.provider,
          model: requestedModelOption?.id ?? options?.model,
          images: options?.images,
          webSearch: options?.webSearch,
          signal: options?.signal,
        })
      }}
      onListConversations={listAiChatConversations}
      onSaveConversations={saveAiChatConversations}
      onDeleteConversationRemote={deleteAiChatConversation}
      onQuotaStatusChange={setAiQuotaStatus}
      draftRequest={aiDraftRequest}
    />
  )

  const imageGenerationElement = imageAccount.isAuthenticated ? (
    <ImageGenerationStage
      isReady={!imageAccount.isLoading}
      userEmail={imageAccount.user?.email ?? ''}
      onGenerateImage={generateImage}
      onGetImageQuota={getImageQuota}
      onListImageHistory={listImageHistory}
      onLogout={imageAccount.logout}
    />
  ) : imageAuthGateElement

  const webCommandElement = (
    <WebCommandStage
      onResultTextChange={setCommandResultText}
      onShareResult={handleShareCommandResult}
    />
  )

  const snapLinkStageElement = (
    <SnapLinkStage
      isDragging={isDragging}
      activeView={isAdminView ? 'admin' : isImageView ? 'image' : isCommandView ? 'command' : isAiChatView ? 'ai-chat' : 'conversation'}
      deviceId={self?.deviceId ?? localIdentity.deviceId}
      deviceName={selfName}
      devicePlatform={self?.platform ?? localIdentity.platform}
      deviceShortCode={self?.shortCode}
      deviceSettings={{
        autoConnect: self?.autoConnect ?? localIdentity.autoConnect,
        discoverable: self?.discoverable ?? localIdentity.discoverable,
        allowShortCode: self?.allowShortCode ?? localIdentity.allowShortCode,
      }}
      devicePreferences={preferences}
      accountId={self?.accountId ?? localIdentity.accountId}
      selectedRoomId={effectiveSelectedRoomId}
      autoOpenRoomId={autoOpenRoomId}
      selectedConversationName={selectedConversationName}
      activeTransferLabel={activeTransferLabel}
      roomListItems={roomListItems}
      onlineDeviceItems={onlineDeviceItems}
      chatDraft={chatDraft}
      composerImageDrafts={composerImageDrafts}
      fileInputId={fileInputId}
      isSendDisabled={
        !hasChatDraftContent ||
        (selectedRoomConnectedTargets.length === 0 && !canSendRoomContentWithoutConnection)
      }
      isAiGenerating={isAiGenerating}
      aiGeneratingRoomId={aiGeneratingRoomId}
      aiQuotaLabel={aiQuotaLabel}
      aiModelOptions={aiModelOptions}
      selectedAiModel={selectedAiModel}
      selectedAiModelLabel={selectedAiModelLabel}
      unifiedConversationEntries={unifiedConversationEntries}
      fileConversationEmptyState={fileConversationEmptyState}
      globalTransferEntries={globalTransferEntries}
      sharedMediaEntries={sharedMediaEntries}
      sharedFileEntries={sharedFileEntries}
      sharedLinkEntries={sharedLinkEntries}
      historyFiles={historyFiles}
      historyTexts={historyTexts}
      pendingIncomingFileOffers={pendingIncomingFileOffers}
      localError={localError}
      errorMessage={errorMessage}
      aiChatElement={aiChatElement}
      imageElement={imageGenerationElement}
      adminElement={adminRouteElement}
      commandElement={webCommandElement}
      commandResultText={commandResultText}
      workbenchTextRequestId={workbenchTextRequestId}
      onCreatePublicRoom={handleCreatePublicRoom}
      onJoinRoom={handleJoinRoomFromWorkbench}
      onOpenRoomConversation={handleOpenRoomConversation}
      onUpdateRoomState={updateRoomState}
      onStartPrivateChat={handleStartPrivateChat}
      onDeviceNameChange={handleDeviceNameChange}
      onDeviceSettingsChange={updateSettings}
      onDevicePreferencesChange={updatePreferences}
      onRequestSnapshot={requestSnapshot}
      onOpenRoomHome={() => handleViewChange('text')}
      onOpenAiChatView={handleOpenAssistantConversation}
      onOpenImageView={() => handleViewChange('image')}
      onOpenAdminView={() => handleViewChange('admin')}
      onOpenCommandView={() => handleViewChange('command')}
      onShareCommandResult={handleShareCommandResult}
      onPrepareAiDraft={handlePrepareAiDraft}
      onChatDraftChange={setChatDraft}
      onAiModelChange={setSelectedAiModel}
      onPastedImageSelection={(files) => {
        void handleComposerImagePaste(files)
      }}
      onComposerImageRemove={(imageId) => {
        setComposerImageDrafts((previous) => previous.filter((image) => image.id !== imageId))
      }}
      onDirectFileSelection={(files) => {
        void handleAttachFilesToCurrentConversation(files)
      }}
      onDirectFileSelectionForDevice={(deviceId, files) => {
        void handleSendFilesToDevice(deviceId, files)
      }}
      onDownloadHistoryFile={handleHistoryFileDownload}
      onStartOcrJob={startOcrJob}
      onListOcrHistory={listOcrHistory}
      onDeleteOcrHistory={deleteOcrHistory}
      onSendText={(quoteHtml) => {
        void handleSendText(quoteHtml)
      }}
      onRecallText={handleRecallText}
      onRecallFile={handleRecallFile}
      onLoadOlderRoomHistory={loadOlderRoomHistoryTexts}
      canRecallAnyMessage={canRecallAnyMessage}
      onRetryTransfer={retryTransfer}
      onCancelTransfer={cancelTransfer}
      onAcceptIncomingFileOffer={acceptIncomingFileOffer}
      onRejectIncomingFileOffer={rejectIncomingFileOffer}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => {
        void handleDrop(event)
      }}
    />
  )

  return snapLinkStageElement
}

export default App
