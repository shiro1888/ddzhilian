import { lazy, startTransition, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { navItems, viewMeta } from './app/config'
import { AdminStage } from './app/components/AdminStage'
import { AppHeader } from './app/components/AppHeader'
import { AppSidebar } from './app/components/AppSidebar'
import { ConnectStage } from './app/components/ConnectStage'
import { ContentGrid } from './app/components/ContentGrid'
import { ReceiveStage } from './app/components/ReceiveStage'
import { SendStage } from './app/components/SendStage'
import { SnapLinkStage } from './app/components/SnapLinkStage'
import { TextStage } from './app/components/TextStage'
import { DEFAULT_VIEW, pathForView, resolveViewFromPathname } from './app/routes'
import type {
  AttachmentDraft,
  ConversationNotice,
  InterfaceMode,
  NavView,
  RoomListItem,
  SessionArtifact,
  SharedContentTab,
  UiSession,
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
  renderImageFilesAsInlineHtml,
  transferStatusLabel,
  transferStatusTone,
} from './app/utils'
import type {
  AdminAiSettings,
  AdminCloudflareConfig,
  AdminHistoryStats,
  AdminOpenRouterConfig,
  AdminStateResponse,
  AdminUsageSnapshot,
  AiModelOption,
  AiQuotaStatus,
} from './lib/ddzhilian-types'
import { useDdzhilian } from './lib/use-ddzhilian'

const ChatConversationStage = lazy(() =>
  import('./app/components/ChatConversationStage').then((module) => ({
    default: module.ChatConversationStage,
  })),
)

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

function resolveAttachmentKind(file: File): AttachmentDraft['kind'] {
  if (file.type.startsWith('image/')) {
    return 'image'
  }

  if (file.type.startsWith('video/')) {
    return 'video'
  }

  return 'file'
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

function buildPublicRoomUrl(roomId: string) {
  const url = new URL(pathForView('text'), window.location.origin)
  url.searchParams.set('room', roomId)
  return url.toString()
}

function parseAiBotPrompt(value: string) {
  const match = /^@bot(?:[\s:：,，]+)?([\s\S]*)$/i.exec(value.trim())
  if (!match) {
    return null
  }

  return match[1].trim()
}

function buildAiBotPrompt(question: string, quotedText: string) {
  const normalizedQuestion = question.trim()
  const normalizedQuote = quotedText.trim()

  if (!normalizedQuote) {
    return normalizedQuestion
  }

  return [
    '请参考下面的引用内容回答用户问题。',
    '',
    '引用内容：',
    normalizedQuote,
    '',
    '用户问题：',
    normalizedQuestion || '请阅读并回应这段引用内容。',
  ].join('\n')
}

function resolveAdminApiBaseUrl() {
  const env = process.env as Record<string, string | undefined>
  const configuredUrl =
    env.NEXT_PUBLIC_SIGNALING_HTTP_URL?.trim() ||
    env.VITE_SIGNALING_HTTP_URL?.trim() ||
    ''

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  const { protocol, hostname, host } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8787'
  }

  return `${protocol}//${host}`
}

const ADMIN_API_BASE_URL = resolveAdminApiBaseUrl()
const ADMIN_LOGIN_EXIT_ANIMATION_MS = 720
const INTERFACE_MODE_STORAGE_KEY = 'ddzhilian-interface-mode'

function readStoredInterfaceMode(): InterfaceMode {
  if (typeof window === 'undefined') {
    return 'classic'
  }

  return window.localStorage.getItem(INTERFACE_MODE_STORAGE_KEY) === 'snaplink'
    ? 'snaplink'
    : 'classic'
}

async function readAdminApiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: unknown } | null
  return typeof payload?.error === 'string' && payload.error.trim()
    ? payload.error
    : fallback
}

function isAiQuotaPrompt(value: string) {
  return /(余额|额度|quota|balance)/i.test(value.trim())
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const fileInputId = useId()
  const [interfaceMode, setInterfaceMode] = useState<InterfaceMode>(readStoredInterfaceMode)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [isContentRailCollapsed, setIsContentRailCollapsed] = useState(false)
  const [isCompactMobileViewport, setIsCompactMobileViewport] = useState(false)
  const [isMobileConversationListVisible, setIsMobileConversationListVisible] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [textMode, setTextMode] = useState<'long' | 'chat'>('long')
  const [draftText, setDraftText] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [joinRoomIdDraft, setJoinRoomIdDraft] = useState('')
  const [pendingRoomSelectionId, setPendingRoomSelectionId] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false)
  const [deviceNameDraft, setDeviceNameDraft] = useState('')
  const [sessionArtifacts, setSessionArtifacts] = useState<Record<string, SessionArtifact>>({})
  const [conversationNotices, setConversationNotices] = useState<ConversationNotice[]>([])
  const [aiQuotaStatus, setAiQuotaStatus] = useState<AiQuotaStatus | null>(null)
  const [aiModelOptions, setAiModelOptions] = useState<AiModelOption[]>([])
  const [selectedAiModel, setSelectedAiModel] = useState('')
  const [attachmentDrafts, setAttachmentDrafts] = useState<AttachmentDraft[]>([])
  const [historyDownloadProgressById, setHistoryDownloadProgressById] = useState<
    Record<string, HistoryDownloadProgressState>
  >({})
  const [isSharedPanelOpen, setIsSharedPanelOpen] = useState(false)
  const [sharedContentTab, setSharedContentTab] = useState<SharedContentTab>('chat')
  const [adminPasswordDraft, setAdminPasswordDraft] = useState('')
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false)
  const [isAdminLoading, setIsAdminLoading] = useState(false)
  const [isAdminLoginTransitioning, setIsAdminLoginTransitioning] = useState(false)
  const [isAdminSaving, setIsAdminSaving] = useState(false)
  const [isAdminClearingHistory, setIsAdminClearingHistory] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminHistoryStats, setAdminHistoryStats] = useState<AdminHistoryStats | null>(null)
  const [adminAiSettings, setAdminAiSettings] = useState<AdminAiSettings | null>(null)
  const [adminUsage, setAdminUsage] = useState<AdminUsageSnapshot | null>(null)
  const activeView = resolveViewFromPathname(location.pathname)
  const isAdminView = activeView === 'admin'
  const isSnapLinkMode = !isAdminView && interfaceMode === 'snaplink'
  const isChatDesktopTheme = true
  const visibleNavItems = navItems.filter((item) => !['send', 'receive', 'sessions', 'admin'].includes(item.id))
  const effectiveNavView: NavView =
    activeView === 'send' || activeView === 'receive' || activeView === 'sessions' ? 'text' : activeView
  const previousConnectionStatusesRef = useRef<Record<string, 'connecting' | 'connected' | 'failed' | 'closed'>>({})
  const adminLoginTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasConnectionSnapshotRef = useRef(false)
  const attachmentDraftsRef = useRef<AttachmentDraft[]>([])
  const joinedRoomLinkRef = useRef<string | null>(null)
  const handledPublicRoomRef = useRef<string | null>(null)

  const {
    socketState,
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
    historyFiles,
    historyTexts,
    historyTextPaginationByRoomId,
    errorMessage,
    lastCreatedPublicRoomId,
    pairByShortCode,
    joinRoom,
    createPublicRoom,
    reconnectSocket,
    requestConnect,
    disconnectSession,
    requestSnapshot,
    updateSettings,
    updateRoomState,
    updatePreferences,
    createTransferItems,
    retryTransfer,
    cancelTransfer,
    downloadHistoryFile,
    startPendingTransfers,
    sendText,
    recallText,
    sendRoomText,
    ensureRoomHistoryLoaded,
    loadOlderRoomHistoryTexts,
    askAi,
    getAiQuota,
    sendRoomFiles,
    stateToUiStatus,
    reasonLabel,
  } = useDdzhilian()

  useEffect(() => {
    window.localStorage.setItem(INTERFACE_MODE_STORAGE_KEY, interfaceMode)
  }, [interfaceMode])

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
    attachmentDraftsRef.current = attachmentDrafts
  }, [attachmentDrafts])

  useEffect(() => {
    return () => {
      for (const attachment of attachmentDraftsRef.current) {
        URL.revokeObjectURL(attachment.objectUrl)
      }
    }
  }, [])

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
    setLocalError('已进入公共对话，可复制入口链接分享。')

    if (activeView !== 'text') {
      navigate(pathForView('text'))
    }
  }, [activeView, lastCreatedPublicRoomId, navigate])

  const effectiveSelectedPeerId =
    onlinePeers.some((peer) => peer.deviceId === selectedPeerId)
      ? selectedPeerId
      : (onlinePeers[0]?.deviceId ?? null)

  const latestTextBySession = new Map<string, (typeof textRecords)[number]>()
  for (const record of textRecords) {
    latestTextBySession.set(record.sessionId, record)
  }

  const latestFileBySession = new Map<string, (typeof receivedFiles)[number]>()
  for (const file of receivedFiles) {
    latestFileBySession.set(file.sessionId, file)
  }

  const roomById = useMemo(
    () => new Map(rooms.map((room) => [room.roomId, room] as const)),
    [rooms],
  )
  const roomStateById = new Map(roomStates.map((state) => [state.roomId, state] as const))
  const deviceNameById = new Map<string, string>()
  if (self) {
    deviceNameById.set(self.deviceId, self.deviceName)
  }
  for (const peer of onlinePeers) {
    deviceNameById.set(peer.deviceId, peer.deviceName)
  }
  for (const room of rooms) {
    for (const member of room.members) {
      deviceNameById.set(member.deviceId, member.deviceName)
    }
  }

  const sessionPeerNameById = new Map<string, string>()
  for (const session of sessions) {
    sessionPeerNameById.set(session.sessionId, session.peer?.deviceName ?? session.peerId)
  }

  const uiSessions: UiSession[] = sessions.map((session) => {
    const file = latestFileBySession.get(session.sessionId)
    const text = latestTextBySession.get(session.sessionId)
    const artifact = sessionArtifacts[session.sessionId]
    const kind = artifact?.kind ?? session.kind ?? (text ? 'text' : 'file')
    const textPreview = text ? extractPlainTextFromRichText(text.text) : ''
    const summary =
      artifact?.summary ??
      (file
        ? `${file.name} · ${formatFileSize(file.size)}`
        : text
          ? `${Math.max(1, textPreview.split(/\r?\n/).filter(Boolean).length)} 行文本 · ${textPreview.slice(0, 18)}`
          : `${session.peer?.deviceName ?? session.peerId} · Room ${session.roomId} · ${session.state === 'connected' ? '可传输' : '等待连接'}`)

    return {
      id: session.sessionId,
      roomId: session.roomId,
      kind,
      source: session.initiator ? self?.deviceName ?? '当前设备' : session.peer?.deviceName ?? session.peerId,
      target: session.initiator ? session.peer?.deviceName ?? session.peerId : self?.deviceName ?? '当前设备',
      summary,
      updatedAt: formatRelativeTime(session.updatedAt),
      status: stateToUiStatus(session.state),
      expiresIn:
        session.state === 'connected'
          ? '连接中'
          : session.state === 'connecting'
            ? '等待建立'
            : '已关闭',
      via: reasonLabel(session.reason),
      canTransfer: session.state === 'connected' && session.channelState === 'open',
    }
  })

  const uiSessionById = new Map(uiSessions.map((session) => [session.id, session] as const))
  const latestSessionByPeerId = new Map<string, { uiSession: UiSession; updatedAt: string }>()
  for (const session of sessions) {
    const uiSession = uiSessionById.get(session.sessionId)
    if (!uiSession) {
      continue
    }

    const previous = latestSessionByPeerId.get(session.peerId)
    if (!previous || new Date(session.updatedAt).getTime() > new Date(previous.updatedAt).getTime()) {
      latestSessionByPeerId.set(session.peerId, { uiSession, updatedAt: session.updatedAt })
    }
  }

  const effectiveSelectedRoomId =
    selectedRoomId && roomById.has(selectedRoomId)
      ? selectedRoomId
      : (rooms[0]?.roomId ?? null)
  const selectedRoom = effectiveSelectedRoomId ? roomById.get(effectiveSelectedRoomId) ?? null : null
  const selectedRoomHistoryPagination = selectedRoom
    ? historyTextPaginationByRoomId[selectedRoom.roomId]
    : undefined
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
  const selectedDevicePeer = selectedRoom
    ? onlinePeers.find((peer) => peer.deviceId === selectedRoomPeerId) ?? null
    : onlinePeers.find((peer) => peer.deviceId === effectiveSelectedPeerId) ?? null
  const selectedConnectionPeer =
    onlinePeers.find((peer) => peer.deviceId === selectedPeerId) ?? selectedDevicePeer
  const selectedConnectionLatestSession =
    selectedConnectionPeer ? latestSessionByPeerId.get(selectedConnectionPeer.deviceId)?.uiSession ?? null : null
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
      const latestSession = sessions
        .filter((session) => session.roomId === room.roomId)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0]

      if (firstPeer) {
        setSelectedPeerId(firstPeer.deviceId)
      }
      setSelectedSessionId(latestSession?.sessionId ?? null)

      setPendingRoomSelectionId(null)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [pendingRoomSelectionId, roomById, self, sessions])

  const filteredSessions = uiSessions.filter((session) => {
    if (activeView === 'receive' && session.kind !== 'file') {
      return false
    }

    if (activeView === 'send' && session.kind !== 'file') {
      return false
    }

    if (activeView === 'text' && session.kind !== 'text') {
      return false
    }

    return true
  })

  const effectiveSelectedSessionId =
    uiSessions.some((session) => session.id === selectedSessionId) ? selectedSessionId : (uiSessions[0]?.id ?? null)

  const selectedUiSession =
    filteredSessions.find((session) => session.id === effectiveSelectedSessionId) ??
    uiSessions.find((session) => session.id === effectiveSelectedSessionId) ??
    filteredSessions[0] ??
    uiSessions[0]

  const effectiveSelectedTargetSessionId =
    connectedTargets.some((target) => target.sessionId === selectedSessionId)
      ? selectedSessionId
      : connectedTargets.length === 1
        ? connectedTargets[0].sessionId
        : null

  const activeTransferTarget =
    connectedTargets.find((target) => target.sessionId === effectiveSelectedTargetSessionId) ??
    (connectedTargets.length === 1 ? connectedTargets[0] : null)

  const receivedCompletedFiles = receivedFiles.filter((file) => file.completed)
  const receivedPendingFiles = receivedFiles.filter((file) => !file.completed)
  const selfName = self?.deviceName ?? localIdentity.deviceName
  const isChatConversationView =
    isChatDesktopTheme && (activeView === 'send' || activeView === 'receive' || activeView === 'text')

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
  const selectedConnectionStatus =
    selectedConnectionPeer ? peerStatusById.get(selectedConnectionPeer.deviceId) : undefined
  const selectedRoomConnectedTargets = effectiveSelectedRoomId
    ? connectedTargets.filter((target) => target.session.roomId === effectiveSelectedRoomId)
    : selectedDevicePeer
      ? connectedTargets.filter((target) => target.peerId === selectedDevicePeer.deviceId)
      : []
  const selectedConversationTitle = isChatDesktopTheme
    ? selectedRoom?.isPublic
      ? '公共对话'
      : selectedRoom && selectedRoomMemberNames.length > 0
      ? selectedRoomMemberNames.length <= 3
        ? selectedRoomMemberNames.join('、')
        : `${selectedRoomMemberNames.slice(0, 3).join('、')} 等 ${selectedRoomMemberNames.length} 位成员`
      : selectedRoom
        ? `Room ${selectedRoom.roomId}`
        : selectedDevicePeer?.deviceName ?? '设备对话'
    : selectedUiSession
      ? selectedUiSession.source === selfName
        ? selectedUiSession.target
        : selectedUiSession.source
      : '当前会话'
  const selectedConversationName = isChatDesktopTheme
    ? selectedConversationTitle
    : selectedUiSession
      ? selectedUiSession.source === selfName
        ? selectedUiSession.target
        : selectedUiSession.source
      : '当前会话'
  const currentMeta = isChatConversationView
    ? {
        title: selectedConversationName,
        description: selectedRoom
          ? `${selectedRoom.isPublic ? '公共对话 · ' : ''}${selectedRoom.members.length} 位成员 · 已连接 ${selectedRoomConnectedTargets.length} 台设备`
          : selectedDevicePeer
            ? `${selectedDevicePeer.platform} · 互传码 ${selectedDevicePeer.shortCode} · ${deviceConnectionLabel(selectedDeviceStatus)}`
            : '选择一个已有对话开始查看。',
        primaryAction: '发送',
        secondaryAction: '加入会话',
      }
    : viewMeta[activeView]

  const connectingTargetCount = Object.values(connectionStates).filter(
    (state) => state.status === 'connecting',
  ).length

  const selectedConnectedTarget = selectedRoomConnectedTargets[0] ?? null
  const connectionActionLabel =
    selectedConnectionStatus === 'connected' && selectedConnectionLatestSession
      ? '断开当前设备'
      : selectedConnectionStatus === 'failed'
        ? '重新连接当前设备'
        : '连接当前设备'
  const connectionActionDisabled =
    !selectedConnectionPeer || selectedConnectionStatus === 'connecting'

  const activeTransferLabel =
    isChatDesktopTheme && selectedRoom
      ? `${selectedConversationName} · ${selectedRoomConnectedTargets.length} 台已连接设备`
      : isChatDesktopTheme && selectedDevicePeer
        ? `${selectedDevicePeer.deviceName} · ${deviceConnectionLabel(selectedDeviceStatus)}`
        : activeTransferTarget?.peerName ??
          (connectedTargets.length > 1
            ? '所有已连接设备'
            : onlinePeers.length > 0 && connectingTargetCount > 0
              ? '检测到在线设备，但尚未完成直连，正在尝试自动连接...'
              : onlinePeers.length > 0
                ? '当前没有可接收文件的已连接设备'
                : '暂无已连接设备')

  const fileSenderEmptyState =
    isChatDesktopTheme && selectedRoom
      ? selectedConnectedTarget
        ? '把文件拖进对话区，或点击下方按钮加入发送队列。'
        : `还没有与 ${selectedConversationName} 建立直连，也可以先把文件保存到当前对话。`
      : isChatDesktopTheme && selectedDevicePeer
        ? selectedConnectedTarget
          ? '把文件拖进对话区，或点击下方按钮加入发送队列。'
          : `还没有与 ${selectedDevicePeer.deviceName} 建立直连。`
      : connectedTargets.length === 0
        ? onlinePeers.length > 0 && connectingTargetCount > 0
          ? '检测到在线设备，但尚未完成直连，正在尝试自动连接...'
          : '当前没有可接收文件的已连接设备'
        : '请选择文件后发送到所有已连接设备'

  const visibleTransferItems = transferItems.filter(
    (item) => item.status !== 'cancelled',
  )
  const sortedChatRecords = collapseBroadcastTextRecords(
    [...textRecords].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    ),
  )
  const visibleTransferItemsForConversation =
    isChatDesktopTheme && effectiveSelectedRoomId
      ? visibleTransferItems.filter(
          (item) =>
            item.roomId === effectiveSelectedRoomId ||
            (item.sessionId ? selectedConversationSessionIds.has(item.sessionId) : false),
        )
      : isChatDesktopTheme && selectedDevicePeer
        ? visibleTransferItems.filter((item) => item.targetDeviceId === selectedDevicePeer.deviceId)
      : visibleTransferItems
  const receivedFilesForConversation =
    isChatDesktopTheme && effectiveSelectedRoomId
      ? receivedFiles.filter((file) => selectedConversationSessionIds.has(file.sessionId))
      : receivedFiles
  const conversationNoticesForConversation =
    isChatDesktopTheme && effectiveSelectedRoomId
      ? conversationNotices.filter((notice) => selectedConversationSessionIds.has(notice.sessionId))
      : conversationNotices
  const activeConversationRoomId = isChatDesktopTheme
    ? effectiveSelectedRoomId
    : selectedUiSession?.roomId ?? null
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
            fromSelf: record.sourceDeviceId === self?.deviceId,
            senderName: record.sourceDeviceName,
            status: undefined,
            text: record.text,
            createdAt: record.createdAt,
          }))
      : []
  const sortedChatRecordsForConversation = collapseBroadcastTextRecords(
    [
      ...(isChatDesktopTheme && effectiveSelectedRoomId
        ? sortedChatRecords.filter(
            (record) =>
              record.roomId === effectiveSelectedRoomId ||
              selectedConversationSessionIds.has(record.sessionId),
          )
        : selectedUiSession
          ? sortedChatRecords.filter((record) => record.sessionId === selectedUiSession.id)
          : sortedChatRecords),
      ...historyTextRecordsForConversation,
    ].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    ),
  )
  const hasRunnableTransfers = visibleTransferItemsForConversation.some((item) =>
    ['queued', 'waiting_for_target', 'connecting', 'ready', 'failed'].includes(item.status),
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
    })),
    ...receivedFilesForConversation.map((file) => ({
      id: `incoming-${file.id}`,
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
    })),
    ...historyFilesForConversation.map((file) => {
      const downloadProgress = historyDownloadProgressById[file.historyId]

      return {
        id: `history-${file.historyId}`,
        sessionId: file.sessionId,
        kind: file.sourceDeviceId === self?.deviceId ? ('outgoing' as const) : ('incoming' as const),
        fromSelf: file.sourceDeviceId === self?.deviceId,
        createdAt: file.createdAt,
        fileName: file.fileName,
        fileSize: file.size,
        mimeType: file.mimeType,
        subtitle: file.sourceDeviceId === self?.deviceId ? '已归档到当前对话' : file.sourceDeviceName,
        detail: downloadProgress
          ? `${formatFileSize(downloadProgress.receivedBytes)} / ${formatFileSize(downloadProgress.totalBytes)}`
          : `${formatFileSize(file.size)} · 历史文件`,
        statusLabel: downloadProgress ? '下载中' : '可回放',
        tone: downloadProgress ? ('active' as const) : ('completed' as const),
        progress: downloadProgress ? downloadProgress.progress : 1,
        downloadName: file.fileName,
        onDownload: () => handleHistoryFileDownload(file),
        isDownloadDisabled: Boolean(downloadProgress),
      }
    }),
  ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())

  const unifiedConversationEntries: UnifiedConversationEntry[] = [
    ...sortedChatRecordsForConversation.map((record) => ({
      id: `text-${record.id}`,
      entryType: 'text' as const,
      sessionId: record.sessionId,
      sourceDeviceId: record.senderName === 'bot' && !record.fromSelf
        ? 'bot_cloudflare_ai'
        : undefined,
      fromSelf: record.fromSelf,
      senderName: record.fromSelf
        ? selfName
        : record.senderName ?? sessionPeerNameById.get(record.sessionId) ?? '对方设备',
      status: record.status,
      createdAt: record.createdAt,
      text: record.text,
    })),
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
      ? selectedRoom.isPublic
        ? '公共对话的文件会通过服务器中转保存。'
        : selectedConnectedTarget
        ? '把文件拖进对话区，或点击下方按钮加入发送队列。'
        : `还没有与 ${selectedConversationName} 建立直连，发送的文件会先保存到当前对话。`
      : '选择一个已有对话后，消息和文件会显示在这里。'
  const hasChatDraftContent =
    extractPlainTextFromRichText(chatDraft).trim().length > 0 ||
    hasRichTextImage(chatDraft) ||
    attachmentDrafts.length > 0
  const hasChatTextDraft =
    extractPlainTextFromRichText(chatDraft).trim().length > 0 ||
    hasRichTextImage(chatDraft)
  const canSendRoomContentWithoutConnection =
    isChatDesktopTheme &&
    Boolean(selectedRoom) &&
    (hasChatTextDraft || attachmentDrafts.length > 0)
  const aiQuotaLabel = aiQuotaStatus
    ? aiQuotaStatus.provider === 'openrouter'
      ? (aiQuotaStatus.limitLabel ?? 'OpenRouter API')
      : `今日剩余 ${aiQuotaStatus.remainingNeurons.toLocaleString()} / ${aiQuotaStatus.dailyNeuronBudget.toLocaleString()} Neurons`
    : 'AI 额度加载中'
  const selectedAiModelLabel =
    aiModelOptions.find((model) => model.id === selectedAiModel)?.label ||
    selectedAiModel ||
    aiQuotaStatus?.model ||
    'AI 模型'
  const selectedConversationTransferSessionIds = [...selectedConversationSessionIds]
  const runnableTransferIds = visibleTransferItemsForConversation
    .filter((item) => ['queued', 'waiting_for_target', 'connecting', 'ready', 'failed'].includes(item.status))
    .map((item) => item.id)
  const sessionRoomIdById = new Map(sessions.map((session) => [session.sessionId, session.roomId] as const))
  const roomListItems: RoomListItem[] = rooms
    .map((room) => {
      const roomSessions = sessions
        .filter((session) => session.roomId === room.roomId)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      const roomSessionIds = new Set(roomSessions.map((session) => session.sessionId))
      const latestSession = roomSessions[0]
      const latestUiSession = latestSession ? uiSessionById.get(latestSession.sessionId) : undefined
      const memberNames = room.members
        .filter((member) => member.deviceId !== self?.deviceId)
        .map((member) => deviceNameById.get(member.deviceId) ?? member.deviceName)
      const hasLoadedHistoryTexts = historyTexts.some((record) => record.roomId === room.roomId)
      const title =
        room.isPublic
          ? '公共对话'
          : memberNames.length === 0
          ? `Room ${room.roomId}`
          : memberNames.length <= 3
            ? memberNames.join('、')
            : `${memberNames.slice(0, 3).join('、')} 等 ${memberNames.length} 位成员`
      const latestEvents = [
        ...textRecords
          .filter((record) => roomSessionIds.has(record.sessionId))
          .map((record) => {
            const preview = extractPlainTextFromRichText(record.text).slice(0, 28) || '空消息'
            return {
              createdAt: record.createdAt,
              previewText: `[文本] ${preview}`,
            }
          }),
        ...historyTexts
          .filter((record) => record.roomId === room.roomId)
          .map((record) => {
            const preview = extractPlainTextFromRichText(record.text).slice(0, 28) || '空消息'
            return {
              createdAt: record.createdAt,
              previewText: `[文本] ${preview}`,
            }
          }),
        ...receivedFiles
          .filter((file) => roomSessionIds.has(file.sessionId))
          .map((file) => ({
            createdAt: file.createdAt,
            previewText: `[文件] ${file.name}`,
          })),
        ...visibleTransferItems
          .filter((item) => item.sessionId && sessionRoomIdById.get(item.sessionId) === room.roomId)
          .map((item) => ({
            createdAt: item.createdAt,
            previewText: `[文件] ${item.fileName}`,
          })),
        ...historyFiles
          .filter((file) => file.roomId === room.roomId)
          .map((file) => ({
            createdAt: file.createdAt,
            previewText: `[文件] ${file.fileName}`,
          })),
        ...(!hasLoadedHistoryTexts && room.historyTextLatestAt && room.historyTextPreview
          ? [{
              createdAt: room.historyTextLatestAt,
              previewText: `[文本] ${(extractPlainTextFromRichText(room.historyTextPreview).slice(0, 28) || '空消息')}`,
            }]
          : []),
      ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      const latestEvent = latestEvents[0]
      const updatedAt = latestEvent?.createdAt ?? latestSession?.updatedAt ?? room.updatedAt
      const previewText =
        latestEvent?.previewText ??
        (latestUiSession
          ? latestUiSession.kind === 'file'
            ? `[文件] ${latestUiSession.summary}`
            : latestUiSession.summary
          : room.isPublic
            ? '公共对话，可通过链接加入'
            : '暂无消息')
      const onlineCount = room.members.filter(
        (member) => member.deviceId !== self?.deviceId && member.online,
      ).length
      const hasSelf = room.members.some((member) => member.deviceId === self?.deviceId)
      const connectedCount = connectedTargets.filter((target) => target.session.roomId === room.roomId).length
      const roomState = roomStateById.get(room.roomId)
      const lastReadTime = roomState?.lastReadAt ? new Date(roomState.lastReadAt).getTime() : null
      const incomingEvents = [
        ...textRecords
          .filter((record) => roomSessionIds.has(record.sessionId) && !record.fromSelf)
          .map((record) => record.createdAt),
        ...historyTexts
          .filter((record) => record.roomId === room.roomId && record.sourceDeviceId !== self?.deviceId)
          .map((record) => record.createdAt),
        ...receivedFiles
          .filter((file) => roomSessionIds.has(file.sessionId))
          .map((file) => file.createdAt),
        ...historyFiles
          .filter((file) => file.roomId === room.roomId && file.sourceDeviceId !== self?.deviceId)
          .map((file) => file.createdAt),
        ...(!hasLoadedHistoryTexts &&
        room.historyTextLatestAt &&
        room.historyTextLatestSourceDeviceId &&
        room.historyTextLatestSourceDeviceId !== self?.deviceId
          ? [room.historyTextLatestAt]
          : []),
      ]
      const unreadCount =
        lastReadTime === null
          ? 0
          : incomingEvents.filter((createdAt) => new Date(createdAt).getTime() > lastReadTime).length
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
        sourceName: record.fromSelf ? selfName : sessionPeerNameById.get(record.sessionId) ?? '对方设备',
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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia('(max-width: 1024px)')
    const applyViewportState = (matches: boolean) => {
      setIsCompactMobileViewport(matches)
      setIsMobileConversationListVisible((current) => (matches ? current : false))
    }

    applyViewportState(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => {
      applyViewportState(event.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  useEffect(() => {
    if (activeView === 'send' || activeView === 'receive' || activeView === 'sessions') {
      navigate(pathForView('text'), { replace: true })
    }
  }, [activeView, navigate])

  useEffect(() => {
    if (!isAdminView) {
      return
    }

    let isCancelled = false
    setIsAdminLoading(true)
    setAdminError(null)

    void fetch(`${ADMIN_API_BASE_URL}/api/admin/session`, {
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readAdminApiError(response, '管理员状态加载失败。'))
        }

        return response.json() as Promise<Partial<AdminStateResponse> & { authenticated?: boolean }>
      })
      .then((payload) => {
        if (isCancelled) {
          return
        }

        if (!payload.authenticated) {
          setIsAdminAuthenticated(false)
          setIsAdminLoginTransitioning(false)
          setAdminHistoryStats(null)
          setAdminAiSettings(null)
          setAdminUsage(null)
          return
        }

        setIsAdminAuthenticated(true)
        setIsAdminLoginTransitioning(false)
        setAdminHistoryStats(payload.history ?? null)
        setAdminAiSettings(payload.ai ?? null)
        setAdminUsage(payload.usage ?? null)
      })
      .catch((error) => {
        if (isCancelled) {
          return
        }

        setAdminError(error instanceof Error ? error.message : '管理员状态加载失败。')
      })
      .finally(() => {
        if (!isCancelled) {
          setIsAdminLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [isAdminView])

  const handleViewChange = (view: NavView) => {
    startTransition(() => {
      navigate(pathForView(view))
      setIsContentRailCollapsed(false)
      setIsMobileNavOpen(false)
      setIsEditingDeviceName(false)
      setLocalError(null)
    })
  }

  const handleAdminConnect = () => {
    const nextPassword = adminPasswordDraft.trim()
    if (!nextPassword) {
      setAdminError('请输入管理员密码。')
      return
    }

    setIsAdminLoading(true)
    setIsAdminLoginTransitioning(false)
    setAdminError(null)

    void fetch(`${ADMIN_API_BASE_URL}/api/admin/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ password: nextPassword }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readAdminApiError(response, '管理员登录失败。'))
        }

        return response.json() as Promise<AdminStateResponse & { authenticated?: boolean }>
      })
      .then((payload) => {
        if (!payload.authenticated) {
          setIsAdminAuthenticated(false)
          setIsAdminLoginTransitioning(false)
          setAdminError('管理员登录失败。')
          return
        }

        setAdminHistoryStats(payload.history)
        setAdminAiSettings(payload.ai)
        setAdminUsage(payload.usage)
        setIsAdminLoginTransitioning(true)

        if (adminLoginTransitionTimeoutRef.current) {
          clearTimeout(adminLoginTransitionTimeoutRef.current)
        }

        adminLoginTransitionTimeoutRef.current = setTimeout(() => {
          setIsAdminAuthenticated(true)
          setIsAdminLoginTransitioning(false)
          adminLoginTransitionTimeoutRef.current = null
        }, ADMIN_LOGIN_EXIT_ANIMATION_MS)
      })
      .catch((error) => {
        setIsAdminLoginTransitioning(false)
        setAdminError(error instanceof Error ? error.message : '管理员登录失败。')
      })
      .finally(() => {
        setIsAdminLoading(false)
      })
  }

  const handleAdminDisconnect = () => {
    if (adminLoginTransitionTimeoutRef.current) {
      clearTimeout(adminLoginTransitionTimeoutRef.current)
      adminLoginTransitionTimeoutRef.current = null
    }

    setIsAdminLoading(true)
    void fetch(`${ADMIN_API_BASE_URL}/api/admin/logout`, {
      method: 'POST',
      credentials: 'include',
    }).finally(() => {
      setIsAdminLoading(false)
    })
    setIsAdminAuthenticated(false)
    setIsAdminLoginTransitioning(false)
    setAdminPasswordDraft('')
    setAdminHistoryStats(null)
    setAdminAiSettings(null)
    setAdminUsage(null)
    setAdminError(null)
  }

  const handleAdminProviderChange = (provider: AdminAiSettings['provider']) => {
    setAdminAiSettings((previous) => (previous ? { ...previous, provider } : previous))
  }

  const handleAdminSystemPromptChange = (systemPrompt: string) => {
    setAdminAiSettings((previous) => (previous ? { ...previous, systemPrompt } : previous))
  }

  const handleAdminCloudflareFieldChange = <Field extends keyof AdminCloudflareConfig,>(
    field: Field,
    value: AdminCloudflareConfig[Field],
  ) => {
    setAdminAiSettings((previous) =>
      previous
        ? {
            ...previous,
            cloudflare: {
              ...previous.cloudflare,
              [field]: value,
            },
          }
        : previous,
    )
  }

  const handleAdminOpenRouterFieldChange = <Field extends keyof AdminOpenRouterConfig,>(
    field: Field,
    value: AdminOpenRouterConfig[Field],
  ) => {
    setAdminAiSettings((previous) =>
      previous
        ? {
            ...previous,
            openrouter: {
              ...previous.openrouter,
              [field]: value,
            },
          }
        : previous,
    )
  }

  const handleAdminSave = () => {
    if (!isAdminAuthenticated || !adminAiSettings) {
      setAdminError('请先登录后台。')
      return
    }

    setIsAdminSaving(true)
    setAdminError(null)

    void fetch(`${ADMIN_API_BASE_URL}/api/admin/ai-config`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(adminAiSettings),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readAdminApiError(response, 'AI 配置保存失败。'))
        }

        return response.json() as Promise<{
          ai: AdminAiSettings
          history: AdminHistoryStats
          usage?: AdminUsageSnapshot
        }>
      })
      .then((payload) => {
        setAdminAiSettings(payload.ai)
        setAdminHistoryStats(payload.history)
        setAdminUsage(payload.usage ?? null)
      })
      .catch((error) => {
        setAdminError(error instanceof Error ? error.message : 'AI 配置保存失败。')
      })
      .finally(() => {
        setIsAdminSaving(false)
      })
  }

  const handleAdminClearHistory = () => {
    if (!isAdminAuthenticated) {
      setAdminError('请先登录后台。')
      return
    }

    setIsAdminClearingHistory(true)
    setAdminError(null)

    void fetch(`${ADMIN_API_BASE_URL}/api/admin/history/clear`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readAdminApiError(response, '历史记录清空失败。'))
        }

        return response.json() as Promise<{
          history: AdminHistoryStats
          usage?: AdminUsageSnapshot
        }>
      })
      .then((payload) => {
        setAdminHistoryStats(payload.history)
        setAdminUsage(payload.usage ?? null)
      })
      .catch((error) => {
        setAdminError(error instanceof Error ? error.message : '历史记录清空失败。')
      })
      .finally(() => {
        setIsAdminClearingHistory(false)
      })
  }

  const beginEditDeviceName = () => {
    setDeviceNameDraft(self?.deviceName ?? localIdentity.deviceName)
    setIsEditingDeviceName(true)
  }

  const cancelEditDeviceName = () => {
    setIsEditingDeviceName(false)
    setDeviceNameDraft('')
  }

  const saveDeviceName = () => {
    const nextName = deviceNameDraft.trim()
    if (!nextName) {
      setLocalError('设备名不能为空。')
      return
    }

    updateSettings({ deviceName: nextName })
    setLocalError(null)
    setIsEditingDeviceName(false)
  }

  const handlePrimaryConnect = () => {
    setLocalError(null)

    if (joinCode.trim()) {
      pairByShortCode(joinCode)
      return
    }

    if (effectiveSelectedPeerId) {
      requestConnect(effectiveSelectedPeerId)
      return
    }

    setLocalError('请输入互传码，或先从在线设备里选择一个目标。')
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

  const handleJoinRoomById = () => {
    handleJoinRoomByIdValue(joinRoomIdDraft)
  }

  const addAttachmentFiles = (files: File[]) => {
    if (files.length === 0) {
      return
    }

    const inlineImageFiles = files.filter((file) => file.type.startsWith('image/'))
    const attachmentFiles = files.filter((file) => !file.type.startsWith('image/'))

    if (inlineImageFiles.length > 0) {
      void renderImageFilesAsInlineHtml(inlineImageFiles).then((imageHtml) => {
        if (!imageHtml) {
          return
        }

        setChatDraft((current) => current ? `${current}<br />${imageHtml}` : imageHtml)
        setSharedContentTab('chat')
        setLocalError(null)
      })
    }

    if (attachmentFiles.length === 0) {
      return
    }

    const drafts = attachmentFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      objectUrl: URL.createObjectURL(file),
      kind: resolveAttachmentKind(file),
      name: file.name,
      size: file.size,
      mimeType: file.type || undefined,
    }))

    setAttachmentDrafts((current) => [...current, ...drafts])
    setSharedContentTab('chat')
    setLocalError(null)
  }

  const removeAttachment = (id: string) => {
    setAttachmentDrafts((current) => {
      const removed = current.find((attachment) => attachment.id === id)
      if (removed) {
        URL.revokeObjectURL(removed.objectUrl)
      }

      return current.filter((attachment) => attachment.id !== id)
    })
  }

  const clearAttachments = () => {
    setAttachmentDrafts((current) => {
      for (const attachment of current) {
        URL.revokeObjectURL(attachment.objectUrl)
      }

      return []
    })
  }

  const handleSendFiles = async () => {
    if (visibleTransferItemsForConversation.length === 0) {
      setLocalError('请先选择文件。')
      return
    }

    try {
      await startPendingTransfers(
        isChatDesktopTheme ? runnableTransferIds : undefined,
        null,
      )
      setLocalError(null)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '文件发送失败。')
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

      clearAttachments()
      setLocalError(null)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '文件发送失败。')
    }
  }

  const handleSendText = async (quoteHtml = '') => {
    const draftSource = isChatDesktopTheme ? chatDraft : textMode === 'chat' ? chatDraft : draftText
    const rawText = quoteHtml ? `${quoteHtml}${draftSource}` : draftSource
    const draftPlainText = extractPlainTextFromRichText(draftSource).trim()
    const quotedText = quoteHtml ? extractPlainTextFromRichText(quoteHtml).trim() : ''
    const normalizedText = extractPlainTextFromRichText(rawText).trim()
    const hasImageContent = hasRichTextImage(rawText)
    const hasTextPayload = normalizedText.length > 0 || hasImageContent
    const attachmentFiles = attachmentDrafts.map((attachment) => attachment.file)
    const aiBotQuestion = parseAiBotPrompt(draftPlainText)
    const aiBotPrompt = aiBotQuestion === null ? null : buildAiBotPrompt(aiBotQuestion, quotedText)
    if (!hasTextPayload && attachmentFiles.length === 0) {
      setLocalError('请输入要发送的内容。')
      return
    }

    if (aiBotQuestion !== null && aiBotQuestion.length === 0 && !quotedText) {
      setLocalError('请输入要问 @bot 的问题。')
      return
    }

    const isPublicRoom = isChatDesktopTheme && Boolean(selectedRoom?.isPublic)
    const shouldSendRoomContentThroughHistory =
      isChatDesktopTheme &&
      Boolean(selectedRoom) &&
      (isPublicRoom || selectedRoomConnectedTargets.length === 0)

    if (isChatDesktopTheme) {
      if (selectedRoomConnectedTargets.length === 0 && !shouldSendRoomContentThroughHistory) {
        setLocalError('先与当前选中的设备建立连接，再发送消息。')
        return
      }
    } else if (connectedTargets.length === 0) {
      setLocalError('先建立一个已连接会话，再发送长文本。')
      return
    }

    try {
      const recordId = crypto.randomUUID()
      const createdAt = new Date().toISOString()

      const targets = isChatDesktopTheme
        ? selectedRoomConnectedTargets
        : connectedTargets

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

      if (attachmentFiles.length > 0) {
        if (shouldSendRoomContentThroughHistory && selectedRoom) {
          await sendRoomFiles(
            selectedRoom.roomId,
            attachmentDrafts.map((attachment) => ({
              id: attachment.id,
              file: attachment.file,
            })),
          )
        } else {
          const created = createTransferItems(attachmentFiles, selectedConversationTransferSessionIds)
          await startPendingTransfers(
            created.map((item) => item.id),
            null,
          )
        }
      }

      setSessionArtifacts((previous) => {
        const next = { ...previous }
        for (const target of targets) {
          next[target.session.sessionId] = {
            kind: attachmentFiles.length > 0 && !hasTextPayload ? 'file' : 'text',
            summary: normalizedText
              ? `${Math.max(1, normalizedText.split(/\r?\n/).filter(Boolean).length)} 行文本 · ${normalizedText.slice(0, 18)}`
              : hasImageContent ? '图片消息' : '文件消息',
          }
        }
        return next
      })

      if (isChatDesktopTheme || textMode === 'chat') {
        setChatDraft('')
      } else {
        setDraftText('')
      }
      clearAttachments()
      setLocalError(null)

      if (aiBotPrompt !== null) {
        setIsAiGenerating(true)
        try {
          const isQuotaPrompt = isAiQuotaPrompt(aiBotQuestion ?? '')
          const botRoomId =
            isChatDesktopTheme
              ? effectiveSelectedRoomId
              : selectedUiSession?.roomId ?? null

          if (!botRoomId) {
            throw new Error('当前对话尚未建立房间，无法同步 bot 回复。')
          }

          const answer = await askAi(aiBotPrompt, {
            roomId: botRoomId,
            replyToName: self?.deviceName ?? localIdentity.deviceName,
            kind: isQuotaPrompt ? 'quota' : 'chat',
            historyId: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            model: selectedAiModel || undefined,
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
      await recallText(recordId)
      setLocalError(null)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '消息撤回失败。')
      throw error
    }
  }

  const handleJoinCode = () => {
    if (!joinCode.trim()) {
      setLocalError('请输入互传码。')
      return
    }

    pairByShortCode(joinCode)
    setLocalError(null)
  }

  const handleNewFiles = (files: File[]) => {
    if (files.length === 0) {
      return
    }

    if (isChatDesktopTheme && selectedConversationTransferSessionIds.length === 0) {
      setLocalError('先加入当前对话，再发送文件。')
      return
    }

    const created = createTransferItems(
      files,
      isChatDesktopTheme ? selectedConversationTransferSessionIds : selectedConnectedTarget?.sessionId ?? null,
    )
    if (!isChatDesktopTheme) {
      handleViewChange('send')
    }
    void startPendingTransfers(
      created.map((item) => item.id),
      null,
    )
  }

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? [])
    if (nextFiles.length === 0) {
      return
    }

    if (isChatConversationView) {
      addAttachmentFiles(nextFiles)
    } else {
      handleNewFiles(nextFiles)
    }
    event.target.value = ''
  }

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setIsDragging(false)

    const nextFiles = await collectDroppedFiles(event.dataTransfer)
    if (nextFiles.length === 0) {
      return
    }

    if (isChatConversationView) {
      addAttachmentFiles(nextFiles)
    } else {
      handleNewFiles(nextFiles)
    }
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
    const latestSession = sessions
      .filter((session) => session.roomId === roomId)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0]

    setSelectedRoomId(roomId)
    setIsMobileConversationListVisible(false)
    setSelectedPeerId(firstPeer?.deviceId ?? null)
    setSelectedSessionId(latestSession?.sessionId ?? null)
    updateRoomState({ roomId, lastReadAt: new Date().toISOString() })
    if (activeView === 'connect' || activeView === 'sessions') {
      handleViewChange('text')
    }
  }

  const handleToggleRoomPinned = (roomId: string) => {
    const current = roomStateById.get(roomId)
    updateRoomState({
      roomId,
      pinned: !(current?.pinned ?? false),
    })
  }

  const handleSelectedDeviceConnectionAction = () => {
    if (!selectedConnectionPeer) {
      return
    }

    if (selectedConnectionStatus === 'connected' && selectedConnectionLatestSession) {
      disconnectSession(selectedConnectionLatestSession.id)
      return
    }

    requestConnect(selectedConnectionPeer.deviceId)
  }

  const handleReconnectPublicRoom = () => {
    setLocalError(null)
    const publicRoomId = selectedRoom?.isPublic ? selectedRoom.roomId : null

    if (!publicRoomId) {
      setLocalError('请选择公共对话后再重连。')
      return
    }

    reconnectSocket(() => {
      joinRoom(publicRoomId)
    })
  }

  const handleConnectAllDevices = () => {
    if (onlinePeers.length === 0) {
      setLocalError('当前没有可连接的在线设备。')
      return
    }

    for (const peer of onlinePeers) {
      requestConnect(peer.deviceId)
    }

    setSelectedPeerId(onlinePeers[0].deviceId)
    setLocalError(null)

    if (activeView === 'connect' || activeView === 'sessions') {
      handleViewChange('text')
    }
  }

  const handleCreateNewConversation = () => {
    if (!selectedConnectionPeer) {
      setLocalError('请先选择一个在线设备。')
      return
    }

    requestConnect(selectedConnectionPeer.deviceId, { createNewRoom: true })
    setSelectedPeerId(selectedConnectionPeer.deviceId)
    setLocalError(null)

    if (activeView === 'connect' || activeView === 'sessions') {
      handleViewChange('text')
    }
  }

  const handleCreatePublicRoom = () => {
    if (!self) {
      setLocalError('服务连接完成后才能进入公共对话。')
      return
    }

    createPublicRoom()
    setLocalError(null)

    if (activeView === 'connect' || activeView === 'sessions') {
      handleViewChange('text')
    }
  }

  const handleCopyPublicRoomLink = (roomId: string) => {
    const url = buildPublicRoomUrl(roomId)

    if (!navigator.clipboard) {
      setLocalError(`公共对话入口链接：${url}`)
      return
    }

    void navigator.clipboard.writeText(url).then(
      () => {
        setLocalError('公共对话入口链接已复制。')
      },
      () => {
        setLocalError(`公共对话入口链接：${url}`)
      },
    )
  }

  const handleSharedPanelOpenChange = (nextIsOpen: boolean) => {
    setIsSharedPanelOpen(nextIsOpen)

    if (nextIsOpen && sharedContentTab === 'chat') {
      setSharedContentTab('media')
    }
  }

  const chatRouteElement = (
    <Suspense fallback={<div className="dd-empty">正在加载对话...</div>}>
      <ChatConversationStage
        isDragging={isDragging}
        unifiedConversationEntries={unifiedConversationEntries}
        fileConversationEmptyState={fileConversationEmptyState}
        chatDraft={chatDraft}
        fileInputId={fileInputId}
        activeTransferLabel={activeTransferLabel}
        isSendDisabled={
          !hasChatDraftContent ||
          (selectedRoomConnectedTargets.length === 0 && !canSendRoomContentWithoutConnection)
        }
        isAiGenerating={isAiGenerating}
        aiQuotaLabel={aiQuotaLabel}
        aiModelOptions={aiModelOptions}
        selectedAiModel={selectedAiModel}
        selectedAiModelLabel={selectedAiModelLabel}
        enterToSend={preferences.enterToSend}
        attachments={attachmentDrafts}
        isSharedPanelOpen={isSharedPanelOpen}
        sharedContentTab={sharedContentTab}
        sharedMediaEntries={sharedMediaEntries}
        sharedFileEntries={sharedFileEntries}
        sharedLinkEntries={sharedLinkEntries}
        hasOlderHistory={selectedRoomHistoryPagination?.hasMore ?? false}
        isOlderHistoryLoading={selectedRoomHistoryPagination?.isLoading ?? false}
        onChatDraftChange={setChatDraft}
        onFileSelection={handleFileSelection}
        onRetryTransfer={retryTransfer}
        onCancelTransfer={cancelTransfer}
        onSendText={(quoteHtml) => {
          void handleSendText(quoteHtml)
        }}
        onRecallText={handleRecallText}
        onRemoveAttachment={removeAttachment}
        onLoadOlderHistory={() => {
          if (selectedRoom) {
            loadOlderRoomHistoryTexts(selectedRoom.roomId)
          }
        }}
        onAiModelChange={setSelectedAiModel}
        onEnterToSendChange={(value) => updatePreferences({ enterToSend: value })}
        onSharedPanelOpenChange={handleSharedPanelOpenChange}
        onSharedContentTabChange={setSharedContentTab}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(event) => {
          void handleDrop(event)
        }}
      />
    </Suspense>
  )

  const sendRouteElement = isChatConversationView ? (
    chatRouteElement
  ) : (
    <SendStage
      isDragging={isDragging}
      fileInputId={fileInputId}
      activeTransferLabel={activeTransferLabel}
      hasRunnableTransfers={hasRunnableTransfers}
      visibleTransferItems={visibleTransferItems}
      fileSenderEmptyState={fileSenderEmptyState}
      onFileSelection={handleFileSelection}
      onSendFiles={() => {
        void handleSendFiles()
      }}
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

  const textRouteElement = isChatConversationView ? (
    chatRouteElement
  ) : (
    <TextStage
      textMode={textMode}
      draftText={draftText}
      chatDraft={chatDraft}
      activeTransferLabel={activeTransferLabel}
      connectedTargetCount={connectedTargets.length}
      sortedChatRecords={sortedChatRecords}
      textRecords={textRecords}
      onTextModeChange={setTextMode}
      onDraftTextChange={setDraftText}
      onChatDraftChange={setChatDraft}
      onSendText={() => {
        void handleSendText()
      }}
    />
  )

  const receiveRouteElement = isChatConversationView ? (
    chatRouteElement
  ) : (
    <ReceiveStage
      joinCode={joinCode}
      receivedCompletedFiles={receivedCompletedFiles}
      receivedPendingFiles={receivedPendingFiles}
      onJoinCodeChange={setJoinCode}
      onJoinCode={handleJoinCode}
      onRequestSnapshot={requestSnapshot}
    />
  )

  const adminRouteElement = (
    <AdminStage
      adminPasswordDraft={adminPasswordDraft}
      isAdminAuthenticated={isAdminAuthenticated}
      isAdminLoading={isAdminLoading}
      isAdminLoginTransitioning={isAdminLoginTransitioning}
      isAdminSaving={isAdminSaving}
      isAdminClearingHistory={isAdminClearingHistory}
      adminError={adminError}
      historyStats={adminHistoryStats}
      aiSettings={adminAiSettings}
      usage={adminUsage}
      onAdminPasswordDraftChange={setAdminPasswordDraft}
      onConnect={handleAdminConnect}
      onDisconnect={handleAdminDisconnect}
      onProviderChange={handleAdminProviderChange}
      onSystemPromptChange={handleAdminSystemPromptChange}
      onCloudflareFieldChange={handleAdminCloudflareFieldChange}
      onOpenRouterFieldChange={handleAdminOpenRouterFieldChange}
      onSave={handleAdminSave}
      onClearHistory={handleAdminClearHistory}
    />
  )

  if (isSnapLinkMode) {
    return (
      <SnapLinkStage
        isDragging={isDragging}
        selectedRoomId={effectiveSelectedRoomId}
        selectedConversationName={selectedConversationName}
        activeTransferLabel={activeTransferLabel}
        roomJoinDraft={joinRoomIdDraft}
        roomListItems={roomListItems}
        chatDraft={chatDraft}
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
        localError={localError}
        errorMessage={errorMessage}
        onRoomJoinDraftChange={setJoinRoomIdDraft}
        onJoinRoomById={handleJoinRoomByIdValue}
        onCreatePublicRoom={handleCreatePublicRoom}
        onOpenRoomConversation={handleOpenRoomConversation}
        onCopyPublicRoomLink={handleCopyPublicRoomLink}
        onChatDraftChange={setChatDraft}
        onAiModelChange={setSelectedAiModel}
        onDirectFileSelection={(files) => {
          void handleSendFilesToCurrentConversation(files)
        }}
        onSendText={() => {
          void handleSendText()
        }}
        onRetryTransfer={retryTransfer}
        onCancelTransfer={cancelTransfer}
        onUseClassicInterface={() => setInterfaceMode('classic')}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(event) => {
          void handleDrop(event)
        }}
      />
    )
  }

  return (
    <div className={`dd-shell${isAdminView ? ' dd-shell--admin' : ''}`} data-theme="chat-desktop">
      {!isAdminView ? (
        <AppSidebar
          isMobileNavOpen={isMobileNavOpen}
          effectiveNavView={effectiveNavView}
          visibleNavItems={visibleNavItems}
          onToggleMobileNav={() => setIsMobileNavOpen((previous) => !previous)}
          onToggleContentRail={() => setIsContentRailCollapsed((previous) => !previous)}
          onInterfaceModeChange={setInterfaceMode}
          onViewChange={handleViewChange}
        />
      ) : null}

      <main className={`dd-main${isChatDesktopTheme ? ' is-chat-desktop' : ''}${isContentRailCollapsed ? ' is-content-collapsed' : ''}${isAdminView ? ' is-admin-main' : ''}${isCompactMobileViewport && isMobileConversationListVisible ? ' is-mobile-room-list-open' : ''}`}>
        {!isAdminView ? (
          <AppHeader
            isChatConversationView={isChatConversationView}
            currentMeta={currentMeta}
            currentRoomId={effectiveSelectedRoomId}
            isSharedPanelOpen={isSharedPanelOpen}
            isEditingDeviceName={isEditingDeviceName}
            deviceNameDraft={deviceNameDraft}
            selfDeviceName={self?.deviceName ?? localIdentity.deviceName}
            localError={localError}
            errorMessage={errorMessage}
            isReconnectDisabled={socketState === 'connecting'}
            onBeginEditDeviceName={beginEditDeviceName}
            onDeviceNameDraftChange={setDeviceNameDraft}
            onSaveDeviceName={saveDeviceName}
            onCancelEditDeviceName={cancelEditDeviceName}
            onReconnect={
              isChatConversationView && selectedRoom?.isPublic
                ? handleReconnectPublicRoom
                : undefined
            }
            onToggleSharedPanel={
              isChatConversationView
                ? () => handleSharedPanelOpenChange(!isSharedPanelOpen)
                : undefined
            }
          />
        ) : null}

        <section className="dd-stage">
          <div className="dd-stage__backdrop" aria-hidden="true" />
          <Routes>
            <Route
              path="/"
              element={<Navigate to={pathForView(DEFAULT_VIEW)} replace />}
            />
            <Route
              path="/connect"
              element={
                <ConnectStage
                  joinCode={joinCode}
                  currentMeta={currentMeta}
                  onlinePeers={onlinePeers}
                  effectiveSelectedPeerId={effectiveSelectedPeerId}
                  peerStatusById={peerStatusById}
                  selfShortCode={self?.shortCode}
                  selfPairToken={self?.pairToken}
                  isEditingDeviceName={isEditingDeviceName}
                  deviceNameDraft={deviceNameDraft}
                  selfDeviceName={self?.deviceName ?? localIdentity.deviceName}
                  socketState={socketState}
                  onJoinCodeChange={setJoinCode}
                  onPrimaryConnect={handlePrimaryConnect}
                  onRequestSnapshot={requestSnapshot}
                  onSelectPeer={setSelectedPeerId}
                  onBeginEditDeviceName={beginEditDeviceName}
                  onDeviceNameDraftChange={setDeviceNameDraft}
                  onSaveDeviceName={saveDeviceName}
                  onCancelEditDeviceName={cancelEditDeviceName}
                />
              }
            />
            <Route path="/send" element={sendRouteElement} />
            <Route path="/receive" element={receiveRouteElement} />
            <Route path="/text" element={textRouteElement} />
            <Route path="/admin" element={adminRouteElement} />
            <Route path="/sessions" element={<Navigate to={pathForView('text')} replace />} />
            <Route
              path="*"
              element={<Navigate to={pathForView(DEFAULT_VIEW)} replace />}
            />
          </Routes>
        </section>

        {!isAdminView ? (
          <ContentGrid
            roomJoinDraft={joinRoomIdDraft}
            roomListItems={roomListItems}
            selectedRoomId={effectiveSelectedRoomId}
            isContentRailCollapsed={isContentRailCollapsed}
            isMobileConversationListVisible={isMobileConversationListVisible}
            connectionActionLabel={connectionActionLabel}
            connectionActionDisabled={connectionActionDisabled}
            connectAllDisabled={onlinePeers.length === 0}
            isEditingDeviceName={isEditingDeviceName}
            deviceNameDraft={deviceNameDraft}
            selfDeviceName={self?.deviceName ?? localIdentity.deviceName}
            onRoomJoinDraftChange={setJoinRoomIdDraft}
            onDeviceNameDraftChange={setDeviceNameDraft}
            onJoinRoom={handleJoinRoomById}
            onConnectionAction={handleSelectedDeviceConnectionAction}
            onConnectAllDevices={handleConnectAllDevices}
            onCreateNewConversation={handleCreateNewConversation}
            onCreatePublicRoom={handleCreatePublicRoom}
            onCopyPublicRoomLink={handleCopyPublicRoomLink}
            onBeginEditDeviceName={beginEditDeviceName}
            onSaveDeviceName={saveDeviceName}
            onCancelEditDeviceName={cancelEditDeviceName}
            onOpenRoomConversation={handleOpenRoomConversation}
            onToggleRoomPinned={handleToggleRoomPinned}
          />
        ) : null}
      </main>
    </div>
  )
}

export default App
