import { startTransition, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AdminStage } from './app/components/AdminStage'
import { ChatAiStage } from './app/components/ChatAiStage'
import { ImageAccountGate } from './app/components/ImageAccountGate'
import { ImageGenerationStage } from './app/components/ImageGenerationStage'
import { SnapLinkStage } from './app/components/SnapLinkStage'
import { pathForView, resolveViewFromPathname } from './app/routes'
import type {
  ComposerImageDraft,
  ConversationNotice,
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
} from './lib/ddzhilian-types'
import { useAccountAuth } from './lib/use-account-auth'
import { useAdmin } from './lib/use-admin'
import { useAdminPermissions } from './lib/use-admin-permissions'
import { useDdzhilian } from './lib/use-ddzhilian'

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

type HistoryDownloadProgressState = {
  receivedBytes: number
  totalBytes: number
  progress: number
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
  return new URLSearchParams(search).get('room')?.trim().toUpperCase() || null
}

function isBotChatRoom(room: Pick<RoomSummary, 'reason'> | null | undefined) {
  return room?.reason === 'bot-chat'
}

function parseAiBotPrompt(value: string) {
  const match = /^@(?:ai|bot)(?:[\s:：,，]+)?([\s\S]*)$/i.exec(value.trim())
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

function isSupportedChatInlineImage(file: File) {
  const mimeType = normalizeAiChatImageMimeType(file.type)
  return Boolean(mimeType && AI_CHAT_ALLOWED_IMAGE_TYPES.has(mimeType))
}

const AI_CHAT_IMAGE_MAX_COUNT = 4
const AI_CHAT_ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const CHAT_INLINE_IMAGE_MAX_BYTES = 4 * 1024 * 1024

function isAiQuotaPrompt(value: string) {
  return /(余额|额度|quota|balance)/i.test(value.trim())
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
  const [joinRoomIdDraft, setJoinRoomIdDraft] = useState('')
  const [pendingRoomSelectionId, setPendingRoomSelectionId] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
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
  const isAdminProtectedView = isAdminView
  const {
    adminEmailDraft,
    adminPasswordDraft,
    adminSession,
    isAdminAuthenticated,
    isAdminLoading,
    isAdminLoginTransitioning,
    isAdminSaving,
    isAdminClearingHistory,
    isAdminRenamingOnlineDevice,
    isAdminUpdatingUser,
    isAdminUpdatingRole,
    adminError,
    adminHistoryStats,
    adminAiSettings,
    adminUsage,
    adminOnlineDevices,
    adminUsers,
    adminRoles,
    adminThemeSubmissions,
    adminToasts,
    isAdminDevLoginEnabled,
    setAdminEmailDraft,
    setAdminPasswordDraft,
    dismissAdminToast,
    handleAdminConnect,
    handleAdminDevConnect,
    handleAdminDisconnect,
    handleAdminProviderChange,
    handleAdminSystemPromptChange,
    handleAdminCloudflareFieldChange,
    handleAdminOpenRouterFieldChange,
    handleAdminOpenRouterModelsDetect,
    handleAdminSave,
    handleAdminClearHistory,
    handleAdminOnlineDeviceRename,
    handleAdminUserQuotaUpdate,
    handleAdminRoleCreate,
    handleAdminRoleDelete,
  } = useAdmin({ enabled: isAdminProtectedView })
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

  const {
    self,
    localIdentity,
    onlinePeers,
    rooms,
    roomStates,
    sessions,
    connectionStates,
    connectedTargets,
    transferItems,
    textRecords,
    receivedFiles,
    historyFiles,
    historyTexts,
    errorMessage,
    lastCreatedPublicRoomId,
    lastCreatedPrivateRoomId,
    joinRoom,
    createPublicRoom,
    updateSettings,
    updateRoomState,
    createTransferItems,
    retryTransfer,
    cancelTransfer,
    downloadHistoryFile,
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
            if (current && models.some((model) => model.id === current)) {
              return current
            }

            if (status.model && models.some((model) => model.id === status.model)) {
              return status.model
            }

            return models[0]?.id ?? status.model ?? ''
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
    setPendingRoomSelectionId(lastCreatedPrivateRoomId)
    setSelectedRoomId(lastCreatedPrivateRoomId)
    setLocalError('已创建私密聊天。')

    if (activeView !== 'text') {
      navigate(pathForView('text'))
    }
  }, [activeView, lastCreatedPrivateRoomId, navigate])

  const roomById = useMemo(
    () => new Map(rooms.map((room) => [room.roomId, room] as const)),
    [rooms],
  )
  const roomStateById = useMemo(
    () => new Map(roomStates.map((state) => [state.roomId, state] as const)),
    [roomStates],
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
    ? 'DD直连小助手'
    : selectedRoom?.isPublic
    ? '世界对话'
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
    selectedRoom
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

    return {
      ...primary,
      status,
      sentBytes: Math.max(...items.map((item) => item.sentBytes)),
      acknowledgedBytes: Math.max(...items.map((item) => item.acknowledgedBytes)),
      progress:
        items.length > 1
          ? Math.min(...items.map((item) => item.progress))
          : primary.progress,
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
    ...groupedTransferItemsForConversation.map((item) => ({
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
      detail: `${formatFileSize(item.sentBytes)} / ${formatFileSize(item.fileSize)}`,
      statusLabel: transferStatusLabel(item.status),
      tone: transferStatusTone(item.status),
      progress: item.progress,
      action:
        item.status === 'failed'
          ? ('retry' as const)
          : item.status !== 'completed'
            ? ('cancel' as const)
            : undefined,
      canRecall: item.status === 'completed',
    })),
    ...receivedFilesForConversation.map((file) => ({
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
      tone: file.completed ? ('completed' as const) : ('active' as const),
      progress: file.size > 0 ? Math.min(file.receivedBytes / file.size, 1) : 0,
      downloadUrl: file.objectUrl,
      downloadName: file.name,
      canRecall: Boolean(file.historyId && canRecallAnyMessage),
    })),
    ...historyFilesForConversation.map((file) => {
      const downloadProgress = historyDownloadProgressById[file.historyId]

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
        tone: downloadProgress ? ('active' as const) : ('completed' as const),
        progress: downloadProgress ? downloadProgress.progress : 1,
        downloadName: file.fileName,
        onDownload: () => handleHistoryFileDownload(file),
        isDownloadDisabled: Boolean(downloadProgress),
        canRecall: file.sourceDeviceId === self?.deviceId || canRecallAnyMessage,
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
        ? '世界对话的文件会通过服务器中转保存。'
        : selectedConnectedTarget
        ? '把文件拖进对话区，或点击下方按钮加入发送队列。'
        : `还没有与 ${selectedConversationName} 建立直连，发送的文件会先保存到当前对话。`
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
    ? aiQuotaStatus.provider === 'openrouter'
      ? (aiQuotaStatus.limitLabel ?? 'OpenAI 兼容接口')
      : `今日剩余 ${aiQuotaStatus.remainingNeurons.toLocaleString()} / ${aiQuotaStatus.dailyNeuronBudget.toLocaleString()} Neurons`
    : 'AI 额度加载中'
  const selectedAiModelLabel =
    aiModelOptions.find((model) => model.id === selectedAiModel)?.label ||
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
      const title =
        isBotChatRoom(room)
          ? 'DD直连小助手'
          : room.isPublic
          ? '世界对话'
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
            ? '世界对话，可通过链接加入'
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
        memberCount: room.members.length,
        onlineCount,
        status,
        pinned: roomState?.pinned ?? false,
        unreadCount,
      }
    })
    .sort((left, right) => {
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

  const handleJoinRoomByIdValue = (roomId: string) => {
    const nextRoomId = roomId.trim().toUpperCase()
    if (!nextRoomId) {
      setLocalError('请输入 roomId。')
      return
    }

    joinRoom(nextRoomId)
    setPendingRoomSelectionId(nextRoomId)
    setJoinRoomIdDraft('')
    setLocalError(null)

    if (activeView !== 'text') {
      handleViewChange('text')
    }
  }

  const handleSendFilesToCurrentConversation = async (files: File[]) => {
    if (files.length === 0) {
      return
    }

    if (!selectedRoom) {
      setLocalError('请先创建或选择一个对话。')
      return
    }

    const shouldSendRoomFilesThroughHistory =
      selectedRoom.isPublic || selectedRoomConnectedTargets.length === 0

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

        const created = createTransferItems(files, targetSessionIds)
        await startPendingTransfers(
          created.map((item) => item.id),
          null,
        )
      }
      setLocalError(null)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '文件发送失败。')
    }
  }

  const handleComposerImagePaste = async (files: File[]) => {
    if (files.length === 0) {
      return
    }

    const remainingSlots = Math.max(0, AI_CHAT_IMAGE_MAX_COUNT - composerImageDrafts.length)
    if (remainingSlots === 0) {
      setLocalError(`一次最多暂存 ${AI_CHAT_IMAGE_MAX_COUNT.toString()} 张图片。`)
      return
    }

    const selectedFiles = files.slice(0, remainingSlots)
    const acceptedFiles = selectedFiles.filter((file) =>
      file.size <= CHAT_INLINE_IMAGE_MAX_BYTES &&
      isSupportedChatInlineImage(file),
    )
    const skippedCount = files.length - acceptedFiles.length

    if (acceptedFiles.length === 0) {
      setLocalError('粘贴图片需为 PNG、JPEG、WebP 或 GIF，且不能超过 4 MiB；其他图片请改用文件发送。')
      return
    }

    try {
      const drafts = await Promise.all(
        acceptedFiles.map(async (file) => ({
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
          ? `已暂存 ${acceptedFiles.length.toString()} 张图片，另有 ${skippedCount.toString()} 张因数量或大小限制未加入。`
          : null,
      )
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '图片读取失败。')
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
      setLocalError('请输入要问 @Ai 的问题。')
      return
    }

    const isPublicRoom = Boolean(selectedRoom?.isPublic)
    const shouldSendRoomContentThroughHistory =
      Boolean(selectedRoom) &&
      (isPublicRoom || selectedRoomConnectedTargets.length === 0 || hasImageContent)

    if (selectedRoomConnectedTargets.length === 0 && !shouldSendRoomContentThroughHistory) {
      setLocalError('先与当前选中的设备建立连接，再发送消息。')
      return
    }

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
            })
          }
        }
      }

      setChatDraft('')
      setComposerImageDrafts([])
      setLocalError(null)

      if (aiBotPrompt !== null) {
        setIsAiGenerating(true)
        try {
          const botRoomId = effectiveSelectedRoomId

          if (!botRoomId) {
            throw new Error('当前对话尚未建立房间，无法同步 AI 回复。')
          }

          const answer = await askAi(aiBotPrompt, {
            roomId: botRoomId,
            replyToName: self?.deviceName ?? localIdentity.deviceName,
            kind: isAiBotQuotaPrompt ? 'quota' : 'chat',
            historyId: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            model: selectedAiModel || undefined,
            images: aiBotImages,
          })

          if (answer.quota) {
            setAiQuotaStatus(answer.quota)
          }
        } catch (error) {
          setLocalError(error instanceof Error ? error.message : 'AI 请求失败。')
        } finally {
          setIsAiGenerating(false)
        }
      }
    } catch (error) {
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

    await handleSendFilesToCurrentConversation(nextFiles)
  }

  const handleDragEnter = () => {
    setIsDragging(true)
  }

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
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

  const handleDeviceNameChange = (deviceName: string) => {
    const normalizedName = deviceName.trim().slice(0, 80)
    if (!normalizedName) {
      setLocalError('设备名不能为空。')
      return
    }

    updateSettings({ deviceName: normalizedName })
    setLocalError(null)
  }

  const handleCreatePublicRoom = () => {
    if (!self) {
      setLocalError('服务连接完成后才能进入世界对话。')
      return
    }

    createPublicRoom()
    setLocalError(null)
  }

  const adminRouteElement = (
    <AdminStage
      adminEmailDraft={adminEmailDraft}
      adminPasswordDraft={adminPasswordDraft}
      adminSession={adminSession}
      isAdminAuthenticated={isAdminAuthenticated}
      isAdminLoading={isAdminLoading}
      isAdminLoginTransitioning={isAdminLoginTransitioning}
      isAdminSaving={isAdminSaving}
      isAdminClearingHistory={isAdminClearingHistory}
      isAdminRenamingOnlineDevice={isAdminRenamingOnlineDevice}
      isAdminUpdatingUser={isAdminUpdatingUser}
      isAdminUpdatingRole={isAdminUpdatingRole}
      isAdminDevLoginEnabled={isAdminDevLoginEnabled}
      adminError={adminError}
      adminToasts={adminToasts}
      historyStats={adminHistoryStats}
      aiSettings={adminAiSettings}
      usage={adminUsage}
      onlineDevices={adminOnlineDevices}
      users={adminUsers}
      roles={adminRoles}
      themeSubmissions={adminThemeSubmissions}
      onAdminEmailDraftChange={setAdminEmailDraft}
      onAdminPasswordDraftChange={setAdminPasswordDraft}
      onAdminToastDismiss={dismissAdminToast}
      onConnect={handleAdminConnect}
      onDevConnect={handleAdminDevConnect}
      onDisconnect={handleAdminDisconnect}
      onProviderChange={handleAdminProviderChange}
      onSystemPromptChange={handleAdminSystemPromptChange}
      onCloudflareFieldChange={handleAdminCloudflareFieldChange}
      onOpenRouterFieldChange={handleAdminOpenRouterFieldChange}
      onOpenRouterModelsDetect={handleAdminOpenRouterModelsDetect}
      onSave={handleAdminSave}
      onClearHistory={handleAdminClearHistory}
      onOnlineDeviceRename={handleAdminOnlineDeviceRename}
      onUserQuotaUpdate={handleAdminUserQuotaUpdate}
      onRoleCreate={handleAdminRoleCreate}
      onRoleDelete={handleAdminRoleDelete}
    />
  )

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
      onAskAi={(prompt, options) =>
        askAi(prompt, {
          kind: 'chat',
          model: options?.model,
          images: options?.images,
          webSearch: options?.webSearch,
          signal: options?.signal,
        })}
      onListConversations={listAiChatConversations}
      onSaveConversations={saveAiChatConversations}
      onDeleteConversationRemote={deleteAiChatConversation}
      onQuotaStatusChange={setAiQuotaStatus}
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

  const snapLinkStageElement = (
    <SnapLinkStage
      isDragging={isDragging}
      activeView={isAdminView ? 'admin' : isImageView ? 'image' : isAiChatView ? 'ai-chat' : 'conversation'}
      deviceId={self?.deviceId ?? localIdentity.deviceId}
      deviceName={selfName}
      accountId={self?.accountId ?? localIdentity.accountId}
      selectedRoomId={effectiveSelectedRoomId}
      selectedConversationName={selectedConversationName}
      activeTransferLabel={activeTransferLabel}
      roomJoinDraft={joinRoomIdDraft}
      roomListItems={roomListItems}
      chatDraft={chatDraft}
      composerImageDrafts={composerImageDrafts}
      fileInputId={fileInputId}
      isSendDisabled={
        !hasChatDraftContent ||
        (selectedRoomConnectedTargets.length === 0 && !canSendRoomContentWithoutConnection)
      }
      isAiGenerating={isAiGenerating}
      aiQuotaLabel={aiQuotaLabel}
      aiModelOptions={aiModelOptions}
      selectedAiModel={selectedAiModel}
      selectedAiModelLabel={selectedAiModelLabel}
      unifiedConversationEntries={unifiedConversationEntries}
      fileConversationEmptyState={fileConversationEmptyState}
      sharedMediaEntries={sharedMediaEntries}
      sharedFileEntries={sharedFileEntries}
      sharedLinkEntries={sharedLinkEntries}
      localError={localError}
      errorMessage={errorMessage}
      aiChatElement={aiChatElement}
      imageElement={imageGenerationElement}
      adminElement={adminRouteElement}
      onRoomJoinDraftChange={setJoinRoomIdDraft}
      onJoinRoomById={handleJoinRoomByIdValue}
      onCreatePublicRoom={handleCreatePublicRoom}
      onOpenRoomConversation={handleOpenRoomConversation}
      onDeviceNameChange={handleDeviceNameChange}
      onOpenRoomHome={() => handleViewChange('text')}
      onOpenAiChatView={() => handleViewChange('chat')}
      onOpenImageView={() => handleViewChange('image')}
      onChatDraftChange={setChatDraft}
      onAiModelChange={setSelectedAiModel}
      onPastedImageSelection={(files) => {
        void handleComposerImagePaste(files)
      }}
      onComposerImageRemove={(imageId) => {
        setComposerImageDrafts((previous) => previous.filter((image) => image.id !== imageId))
      }}
      onDirectFileSelection={(files) => {
        void handleSendFilesToCurrentConversation(files)
      }}
      onSendText={(quoteHtml) => {
        void handleSendText(quoteHtml)
      }}
      onRecallText={handleRecallText}
      onRecallFile={handleRecallFile}
      onLoadOlderRoomHistory={loadOlderRoomHistoryTexts}
      canRecallAnyMessage={canRecallAnyMessage}
      onRetryTransfer={retryTransfer}
      onCancelTransfer={cancelTransfer}
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
