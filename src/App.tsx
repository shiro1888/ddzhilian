import { startTransition, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import { navItems, viewMeta } from './app/config'
import { AppHeader } from './app/components/AppHeader'
import { AppSidebar } from './app/components/AppSidebar'
import { ChatConversationStage } from './app/components/ChatConversationStage'
import { ConnectStage } from './app/components/ConnectStage'
import { ContentGrid } from './app/components/ContentGrid'
import { ReceiveStage } from './app/components/ReceiveStage'
import { SendStage } from './app/components/SendStage'
import { SessionsStage } from './app/components/SessionsStage'
import { TextStage } from './app/components/TextStage'
import { DEFAULT_VIEW, pathForView, resolveViewFromPathname } from './app/routes'
import type {
  ConversationNotice,
  DeviceBarItem,
  NavView,
  SessionArtifact,
  UiSession,
  UnifiedConversationEntry,
} from './app/types'
import {
  collapseBroadcastTextRecords,
  collectDroppedFiles,
  deviceBarStatus,
  deviceConnectionLabel,
  extractPlainTextFromRichText,
  formatFileSize,
  formatRelativeTime,
  transferStatusLabel,
  transferStatusTone,
} from './app/utils'
import { useDdzhilian } from './lib/use-ddzhilian'

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const fileInputId = useId()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [isContentRailCollapsed, setIsContentRailCollapsed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [textMode, setTextMode] = useState<'long' | 'chat'>('long')
  const [draftText, setDraftText] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)
  const [joinRoomIdDraft, setJoinRoomIdDraft] = useState('')
  const [pendingRoomSelectionId, setPendingRoomSelectionId] = useState<string | null>(null)
  const [sessionQuery, setSessionQuery] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false)
  const [deviceNameDraft, setDeviceNameDraft] = useState('')
  const [sessionArtifacts, setSessionArtifacts] = useState<Record<string, SessionArtifact>>({})
  const [conversationNotices, setConversationNotices] = useState<ConversationNotice[]>([])
  const deferredQuery = useDeferredValue(sessionQuery)
  const activeView = resolveViewFromPathname(location.pathname)
  const isChatDesktopTheme = true
  const visibleNavItems = navItems.filter((item) => item.id !== 'send' && item.id !== 'receive')
  const effectiveNavView: NavView =
    activeView === 'send' || activeView === 'receive' ? 'text' : activeView
  const previousConnectionStatusesRef = useRef<Record<string, 'connecting' | 'connected' | 'failed' | 'closed'>>({})
  const hasConnectionSnapshotRef = useRef(false)

  const {
    socketState,
    self,
    onlinePeers,
    rooms,
    sessions,
    connectionStates,
    connectedTargets,
    transferItems,
    textRecords,
    receivedFiles,
    historyFiles,
    historyTexts,
    errorMessage,
    pairByShortCode,
    joinRoom,
    requestConnect,
    disconnectSession,
    requestSnapshot,
    updateSettings,
    createTransferItems,
    retryTransfer,
    cancelTransfer,
    downloadHistoryFile,
    startPendingTransfers,
    sendText,
    stateToUiStatus,
    reasonLabel,
  } = useDdzhilian()

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

  const filteredDevicePeers = onlinePeers.filter((peer) => {
    const keyword = deferredQuery.trim().toLowerCase()
    const haystack = `${peer.deviceName} ${peer.platform} ${peer.shortCode} ${peer.pairToken}`.toLowerCase()
    return keyword.length === 0 || haystack.includes(keyword)
  })

  const selectedDevicePeer = onlinePeers.find((peer) => peer.deviceId === effectiveSelectedPeerId) ?? null
  const selectedPeerLatestSession =
    selectedDevicePeer ? latestSessionByPeerId.get(selectedDevicePeer.deviceId)?.uiSession ?? null : null
  const selectedRoomId = selectedPeerLatestSession?.roomId ?? null
  const selectedRoom = selectedRoomId ? roomById.get(selectedRoomId) ?? null : null
  const selectedRoomMemberNames =
    selectedRoom?.members
      .filter((member) => member.deviceId !== self?.deviceId)
      .map((member) => deviceNameById.get(member.deviceId) ?? member.deviceName) ?? []
  const selectedConversationSessions = sessions
    .filter((session) =>
      selectedRoomId ? session.roomId === selectedRoomId : session.peerId === selectedDevicePeer?.deviceId,
    )
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
  const selectedConversationSessionIds = new Set(
    selectedConversationSessions.map((session) => session.sessionId),
  )

  useEffect(() => {
    if (!pendingRoomSelectionId || !self) {
      return
    }

    const room = roomById.get(pendingRoomSelectionId)
    if (!room) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const firstPeer = room.members.find((member) => member.deviceId !== self.deviceId)
      if (firstPeer) {
        setSelectedPeerId(firstPeer.deviceId)
        const latestSession = sessions
          .filter((session) => session.roomId === room.roomId && session.peerId === firstPeer.deviceId)
          .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0]
        setSelectedSessionId(latestSession?.sessionId ?? null)
      }

      setPendingRoomSelectionId(null)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [pendingRoomSelectionId, roomById, self, sessions])

  const filteredSessions = uiSessions.filter((session) => {
    const keyword = deferredQuery.trim().toLowerCase()
    const haystack = `${session.id} ${session.source} ${session.target} ${session.summary}`.toLowerCase()

    if (activeView === 'receive' && session.kind !== 'file') {
      return false
    }

    if (activeView === 'send' && session.kind !== 'file') {
      return false
    }

    if (activeView === 'text' && session.kind !== 'text') {
      return false
    }

    return keyword.length === 0 || haystack.includes(keyword)
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
  const selfName = self?.deviceName ?? '当前设备'
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
  const selectedRoomConnectedTargets = selectedRoomId
    ? connectedTargets.filter((target) => target.session.roomId === selectedRoomId)
    : selectedDevicePeer
      ? connectedTargets.filter((target) => target.peerId === selectedDevicePeer.deviceId)
      : []
  const selectedConversationTitle = isChatDesktopTheme
    ? selectedRoom && selectedRoomMemberNames.length > 0
      ? selectedRoomMemberNames.length <= 3
        ? selectedRoomMemberNames.join('、')
        : `${selectedRoomMemberNames.slice(0, 3).join('、')} 等 ${selectedRoomMemberNames.length} 位成员`
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
        description: selectedDevicePeer
          ? selectedRoom
            ? `${selectedRoom.members.length} 位成员 · 已连接 ${selectedRoomConnectedTargets.length} 台设备`
            : `${selectedDevicePeer.platform} · 互传码 ${selectedDevicePeer.shortCode} · ${deviceConnectionLabel(selectedDeviceStatus)}`
          : '选择一个在线设备开始对话。',
        primaryAction: '发送',
        secondaryAction: '加入会话',
      }
    : viewMeta[activeView]

  const connectingTargetCount = Object.values(connectionStates).filter(
    (state) => state.status === 'connecting',
  ).length

  const selectedConnectedTarget = selectedRoomConnectedTargets[0] ?? null
  const connectionActionLabel =
    selectedDeviceStatus === 'connected' && selectedPeerLatestSession ? '断开当前设备' : '连接当前设备'
  const connectionActionDisabled =
    !selectedDevicePeer || selectedDeviceStatus === 'connecting'

  const activeTransferLabel =
    isChatDesktopTheme && selectedDevicePeer
      ? selectedRoom
        ? `${selectedConversationName} · ${selectedRoomConnectedTargets.length} 台已连接设备`
        : `${selectedDevicePeer.deviceName} · ${deviceConnectionLabel(selectedDeviceStatus)}`
      : activeTransferTarget?.peerName ??
        (connectedTargets.length > 1
          ? '所有已连接设备'
          : onlinePeers.length > 0 && connectingTargetCount > 0
            ? '检测到在线设备，但尚未完成直连，正在尝试自动连接...'
            : onlinePeers.length > 0
              ? '当前没有可接收文件的已连接设备'
              : '暂无已连接设备')

  const fileSenderEmptyState =
    isChatDesktopTheme && selectedDevicePeer
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
    isChatDesktopTheme && selectedDevicePeer
      ? visibleTransferItems.filter(
          (item) =>
            item.targetDeviceId === selectedDevicePeer.deviceId ||
            (item.sessionId ? selectedConversationSessionIds.has(item.sessionId) : false),
        )
      : visibleTransferItems
  const receivedFilesForConversation =
    isChatDesktopTheme && selectedDevicePeer
      ? receivedFiles.filter((file) => selectedConversationSessionIds.has(file.sessionId))
      : receivedFiles
  const conversationNoticesForConversation =
    isChatDesktopTheme && selectedDevicePeer
      ? conversationNotices.filter((notice) => selectedConversationSessionIds.has(notice.sessionId))
      : conversationNotices
  const activeConversationRoomId = isChatDesktopTheme
    ? selectedRoomId
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
            sessionId:
              record.sessionId ??
              selectedConversationSessions[0]?.sessionId ??
              '',
            fromSelf: record.sourceDeviceId === self?.deviceId,
            text: record.text,
            createdAt: record.createdAt,
          }))
      : []
  const sortedChatRecordsForConversation = collapseBroadcastTextRecords(
    [
      ...(isChatDesktopTheme && selectedDevicePeer
        ? sortedChatRecords.filter((record) => selectedConversationSessionIds.has(record.sessionId))
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

  const fileConversationEntries = [
    ...groupedTransferItemsForConversation.map((item) => ({
      id: item.id,
      sessionId: item.sessionId,
      kind: 'outgoing' as const,
      fromSelf: true,
      createdAt: item.createdAt,
      fileName: item.fileName,
      fileSize: item.fileSize,
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
    ...historyFilesForConversation.map((file) => ({
      id: `history-${file.historyId}`,
      sessionId: file.sessionId,
      kind: file.sourceDeviceId === self?.deviceId ? ('outgoing' as const) : ('incoming' as const),
      fromSelf: file.sourceDeviceId === self?.deviceId,
      createdAt: file.createdAt,
      fileName: file.fileName,
      fileSize: file.size,
      subtitle: file.sourceDeviceId === self?.deviceId ? '已归档到当前对话' : file.sourceDeviceName,
      detail: `${formatFileSize(file.size)} · 历史文件`,
      statusLabel: '可回放',
      tone: 'completed' as const,
      progress: 1,
      downloadName: file.fileName,
      onDownload: () => {
        void downloadHistoryFile(file).catch((error) => {
          setLocalError(error instanceof Error ? error.message : '历史文件下载失败。')
        })
      },
    })),
  ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())

  const unifiedConversationEntries: UnifiedConversationEntry[] = [
    ...sortedChatRecordsForConversation.map((record) => ({
      id: `text-${record.id}`,
      entryType: 'text' as const,
      sessionId: record.sessionId,
      fromSelf: record.fromSelf,
      senderName: record.fromSelf
        ? selfName
        : sessionPeerNameById.get(record.sessionId) ?? '对方设备',
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
    selectedDevicePeer
      ? selectedConnectedTarget
        ? '把文件拖进对话区，或点击下方按钮加入发送队列。'
        : `还没有与 ${selectedDevicePeer.deviceName} 建立直连。`
      : '发现到新设备后，它们会显示在这里。'
  const selectedConversationTransferSessionIds = [...selectedConversationSessionIds]
  const runnableTransferIds = visibleTransferItemsForConversation
    .filter((item) => ['queued', 'waiting_for_target', 'connecting', 'ready', 'failed'].includes(item.status))
    .map((item) => item.id)
  const devicePreviewText = (peer: (typeof onlinePeers)[number]) => {
    const latestSession = latestSessionByPeerId.get(peer.deviceId)?.uiSession
    if (latestSession) {
      return latestSession.kind === 'file' ? `[文件] ${latestSession.summary}` : latestSession.summary
    }

    return `${peer.platform} · 互传码 ${peer.shortCode}`
  }
  const deviceBarItems: DeviceBarItem[] = filteredDevicePeers.map((peer) => ({
    peer,
    deviceStatus: deviceBarStatus(peerStatusById.get(peer.deviceId)),
    latestSessionId: latestSessionByPeerId.get(peer.deviceId)?.uiSession.id ?? null,
    previewText: devicePreviewText(peer),
  }))

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
    if (activeView === 'send' || activeView === 'receive') {
      navigate(pathForView('text'), { replace: true })
    }
  }, [activeView, navigate])

  const handleViewChange = (view: NavView) => {
    startTransition(() => {
      navigate(pathForView(view))
      setIsContentRailCollapsed(false)
      setIsMobileNavOpen(false)
      setIsEditingDeviceName(false)
      setLocalError(null)
    })
  }

  const beginEditDeviceName = () => {
    setDeviceNameDraft(self?.deviceName ?? '')
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

  const handleJoinRoomById = () => {
    const nextRoomId = joinRoomIdDraft.trim().toUpperCase()
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

  const handleSendText = async () => {
    const rawText = isChatDesktopTheme ? chatDraft : textMode === 'chat' ? chatDraft : draftText
    const normalizedText = extractPlainTextFromRichText(rawText).trim()
    if (normalizedText.length === 0) {
      setLocalError('请输入要发送的内容。')
      return
    }

    if (isChatDesktopTheme) {
      if (selectedRoomConnectedTargets.length === 0) {
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

      for (const [index, target] of targets.entries()) {
        await sendText(target.session.sessionId, rawText, {
          logLocalRecord: index === 0,
          recordId,
          createdAt,
        })
      }

      setSessionArtifacts((previous) => {
        const next = { ...previous }
        for (const target of targets) {
          next[target.session.sessionId] = {
            kind: 'text',
            summary: `${Math.max(1, normalizedText.split(/\r?\n/).filter(Boolean).length)} 行文本 · ${normalizedText.slice(0, 18)}`,
          }
        }
        return next
      })

      if (isChatDesktopTheme || textMode === 'chat') {
        setChatDraft('')
      } else {
        setDraftText('')
      }
      setLocalError(null)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '文本发送失败。')
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

    handleNewFiles(nextFiles)
    event.target.value = ''
  }

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setIsDragging(false)

    const nextFiles = await collectDroppedFiles(event.dataTransfer)
    if (nextFiles.length === 0) {
      return
    }

    handleNewFiles(nextFiles)
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

  const handleOpenDeviceConversation = (peerId: string, latestSessionId: string | null) => {
    setSelectedPeerId(peerId)
    setSelectedSessionId(latestSessionId)
    if (activeView === 'connect' || activeView === 'sessions') {
      handleViewChange('text')
    }
  }

  const handleDeviceAction = (item: DeviceBarItem) => {
    setSelectedPeerId(item.peer.deviceId)
    setSelectedSessionId(item.latestSessionId)

    if (item.deviceStatus === 'connected' && item.latestSessionId) {
      disconnectSession(item.latestSessionId)
      return
    }

    if (item.deviceStatus === 'connectable' || item.deviceStatus === 'failed') {
      requestConnect(item.peer.deviceId)
      if (activeView === 'connect' || activeView === 'sessions') {
        handleViewChange('text')
      }
    }
  }

  const handleSelectedDeviceConnectionAction = () => {
    if (!selectedDevicePeer) {
      return
    }

    if (selectedDeviceStatus === 'connected' && selectedPeerLatestSession) {
      disconnectSession(selectedPeerLatestSession.id)
      return
    }

    requestConnect(selectedDevicePeer.deviceId)
  }

  const chatRouteElement = (
    <ChatConversationStage
      isDragging={isDragging}
      unifiedConversationEntries={unifiedConversationEntries}
      fileConversationEmptyState={fileConversationEmptyState}
      chatDraft={chatDraft}
      fileInputId={fileInputId}
      activeTransferLabel={activeTransferLabel}
      isSendDisabled={chatDraft.trim().length === 0 || selectedRoomConnectedTargets.length === 0}
      onChatDraftChange={setChatDraft}
      onFileSelection={handleFileSelection}
      onRetryTransfer={retryTransfer}
      onCancelTransfer={cancelTransfer}
      onSendText={() => {
        void handleSendText()
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => {
        void handleDrop(event)
      }}
    />
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

  return (
    <div className="dd-shell" data-theme="chat-desktop">
      <AppSidebar
        isMobileNavOpen={isMobileNavOpen}
        effectiveNavView={effectiveNavView}
        visibleNavItems={visibleNavItems}
        onToggleMobileNav={() => setIsMobileNavOpen((previous) => !previous)}
        onToggleContentRail={() => setIsContentRailCollapsed((previous) => !previous)}
        onViewChange={handleViewChange}
      />

      <main className={`dd-main${isChatDesktopTheme ? ' is-chat-desktop' : ''}${isContentRailCollapsed ? ' is-content-collapsed' : ''}`}>
        <AppHeader
          isChatConversationView={isChatConversationView}
          currentMeta={currentMeta}
          currentRoomId={selectedRoomId}
          localError={localError}
          errorMessage={errorMessage}
        />

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
                  selfDeviceName={self?.deviceName}
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
            <Route
              path="/sessions"
              element={
                <SessionsStage
                  joinCode={joinCode}
                  currentMeta={currentMeta}
                  uiSessions={uiSessions}
                  selectedUiSession={selectedUiSession}
                  onJoinCodeChange={setJoinCode}
                  onRequestSnapshot={requestSnapshot}
                  onShowConnect={() => handleViewChange('connect')}
                />
              }
            />
            <Route
              path="*"
              element={<Navigate to={pathForView(DEFAULT_VIEW)} replace />}
            />
          </Routes>
        </section>

        <ContentGrid
          roomJoinDraft={joinRoomIdDraft}
          sessionQuery={sessionQuery}
          deviceBarItems={deviceBarItems}
          effectiveSelectedPeerId={effectiveSelectedPeerId}
          isContentRailCollapsed={isContentRailCollapsed}
          connectionActionLabel={connectionActionLabel}
          connectionActionDisabled={connectionActionDisabled}
          onSessionQueryChange={setSessionQuery}
          onRoomJoinDraftChange={setJoinRoomIdDraft}
          onJoinRoom={handleJoinRoomById}
          onConnectionAction={handleSelectedDeviceConnectionAction}
          onShowConnect={() => handleViewChange('connect')}
          onOpenDeviceConversation={handleOpenDeviceConversation}
          onDeviceAction={handleDeviceAction}
        />
      </main>
    </div>
  )
}

export default App
