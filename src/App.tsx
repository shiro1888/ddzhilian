import { startTransition, useDeferredValue, useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import './App.css'
import { useCcconnect } from './lib/use-ccconnect'

type TransferMode = 'file' | 'text'
type SessionStatus = 'waiting' | 'active' | 'completed'
type NavView = 'connect' | 'send' | 'receive' | 'text' | 'sessions'
type ThemeId = 'classic' | 'chat-desktop'

type UiSession = {
  id: string
  kind: TransferMode
  source: string
  target: string
  summary: string
  updatedAt: string
  status: SessionStatus
  expiresIn: string
  via: string
  canTransfer: boolean
}

type FileConversationEntry = {
  id: string
  sessionId?: string
  kind: 'outgoing' | 'incoming'
  fromSelf: boolean
  createdAt: string
  fileName: string
  fileSize: number
  subtitle: string
  detail: string
  statusLabel: string
  tone: 'pending' | 'active' | 'completed' | 'failed'
  progress: number
  downloadUrl?: string
  downloadName?: string
  action?: 'retry' | 'cancel'
}

type ConversationNotice = {
  id: string
  sessionId: string
  deviceId: string
  createdAt: string
  text: string
}

type UnifiedConversationEntry =
  | {
      id: string
      entryType: 'text'
      sessionId: string
      fromSelf: boolean
      createdAt: string
      text: string
    }
  | {
      id: string
      entryType: 'notice'
      sessionId: string
      fromSelf: false
      createdAt: string
      text: string
    }
  | {
      id: string
      entryType: 'file'
      sessionId: string
      fromSelf: boolean
      createdAt: string
      file: FileConversationEntry
    }

function transferStatusLabel(
  status:
    | 'queued'
    | 'waiting_for_target'
    | 'connecting'
    | 'ready'
    | 'transferring'
    | 'completed'
    | 'failed'
    | 'cancelled',
) {
  switch (status) {
    case 'queued':
      return '等待开始'
    case 'waiting_for_target':
      return '等待已连接设备'
    case 'connecting':
      return '正在建立连接'
    case 'ready':
      return '准备发送'
    case 'transferring':
      return '正在发送'
    case 'completed':
      return '发送成功'
    case 'failed':
      return '发送失败'
    case 'cancelled':
      return '已取消'
  }
}

const navItems: Array<{
  id: NavView
  label: string
  hint: string
  icon: ReactNode
}> = [
  {
    id: 'connect',
    label: '连接设备',
    hint: '发现并接入其他设备',
    icon: (
      <>
        <rect x="3.5" y="5" width="17" height="14" rx="3" />
        <path d="M8 3.5v3" />
        <path d="M16 3.5v3" />
        <path d="M8 20.5v-3" />
        <path d="M16 20.5v-3" />
      </>
    ),
  },
  {
    id: 'send',
    label: '发送文件',
    hint: '投递文件并生成会话',
    icon: (
      <>
        <path d="M12 20V6" />
        <path d="M6.5 11.5 12 6l5.5 5.5" />
        <path d="M5 20.5h14" />
      </>
    ),
  },
  {
    id: 'receive',
    label: '接收文件',
    hint: '查看待接收与签收记录',
    icon: (
      <>
        <path d="M12 4v14" />
        <path d="m6.5 12.5 5.5 5.5 5.5-5.5" />
        <path d="M5 20.5h14" />
      </>
    ),
  },
  {
    id: 'text',
    label: '长文本',
    hint: '发送验证码、链接与便笺',
    icon: (
      <>
        <path d="M4 6.5a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" />
        <path d="M8 8.5h8" />
        <path d="M8 11.5h5.5" />
      </>
    ),
  },
  {
    id: 'sessions',
    label: '会话记录',
    hint: '搜索当前与历史会话',
    icon: (
      <>
        <path d="M6.5 5h11A1.5 1.5 0 0 1 19 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5v-11A1.5 1.5 0 0 1 6.5 5Z" />
        <path d="M8 9h8" />
        <path d="M8 12h8" />
        <path d="M8 15h5" />
      </>
    ),
  },
]

const THEME_STORAGE_KEY = 'ccconnect-theme'

const themeOptions: Array<{
  id: ThemeId
  label: string
  description: string
}> = [
  { id: 'classic', label: '经典暖砂', description: '暖色、杂志感、强调卡片层次。' },
  { id: 'chat-desktop', label: '聊天桌面', description: '灰绿桌面聊天风，强调消息工作区。' },
]

const viewMeta: Record<
  NavView,
  {
    title: string
    description: string
    primaryAction: string
    secondaryAction: string
  }
> = {
  connect: {
    title: '连接设备',
    description: '先建立连接，再决定传文件还是发文本。工具页的第一件事应该是让另一台设备快速加入。',
    primaryAction: '连接其他设备',
    secondaryAction: '刷新列表',
  },
  send: {
    title: '发送文件',
    description: '点对点文件传输助手，可实时共享，也可直接推送。',
    primaryAction: '发送',
    secondaryAction: '刷新列表',
  },
  receive: {
    title: '接收文件',
    description: '从连接的设备实时接收文件。',
    primaryAction: '接收此会话',
    secondaryAction: '刷新列表',
  },
  text: {
    title: '长文本',
    description: '在设备之间互发消息，或传送长图文内容。',
    primaryAction: '发送',
    secondaryAction: '刷新列表',
  },
  sessions: {
    title: '会话记录',
    description: '搜索当前与历史会话。',
    primaryAction: '刷新列表',
    secondaryAction: '查看在线设备',
  },
}

const quickPanels = [
  {
    title: '私密直连',
    body: '会话短留、不扫盘、不做公开目录，只让参与的设备知道这次交接。',
  },
  {
    title: '免安装接入',
    body: '浏览器、桌面端、平板都能用同一套互传码逻辑加入当前会话。',
  },
  {
    title: '高速传输',
    body: '文件会话和文本会话分开处理，利于接后端继续接局域网或 WebRTC 直连。',
  },
  {
    title: '实时共享',
    body: '发送台、会话列表、详情面板保持同步，不用在多个页面来回跳。',
  },
]

function transferStatusTone(
  status:
    | 'queued'
    | 'waiting_for_target'
    | 'connecting'
    | 'ready'
    | 'transferring'
    | 'completed'
    | 'failed'
    | 'cancelled',
): FileConversationEntry['tone'] {
  switch (status) {
    case 'failed':
      return 'failed'
    case 'completed':
      return 'completed'
    case 'transferring':
      return 'active'
    default:
      return 'pending'
  }
}

function deviceRelationText(peer: {
  relation: {
    sameAccount: boolean
    sameLan: boolean
    autoConnectEligible: boolean
    discoverable: boolean
  }
}) {
  if (peer.relation.sameLan) {
    return '同网设备'
  }

  if (peer.relation.sameAccount) {
    return '同账号设备'
  }

  return '可发现设备'
}

function deviceBarStatus(
  status?: 'connecting' | 'connected' | 'failed' | 'closed',
): 'connected' | 'connectable' | 'connecting' | 'failed' {
  switch (status) {
    case 'connected':
      return 'connected'
    case 'connecting':
      return 'connecting'
    case 'failed':
      return 'failed'
    case 'closed':
    default:
      return 'connectable'
  }
}

function deviceBarStatusLabel(
  status: ReturnType<typeof deviceBarStatus>,
) {
  switch (status) {
    case 'connected':
      return '已连接'
    case 'connecting':
      return '连接中'
    case 'failed':
      return '连接失败'
    case 'connectable':
    default:
      return '可连接'
  }
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }

  return `${bytes} B`
}

function formatRelativeTime(iso: string) {
  const delta = Date.now() - new Date(iso).getTime()
  const minutes = Math.max(0, Math.floor(delta / 60_000))

  if (minutes <= 0) {
    return '刚刚'
  }

  if (minutes < 60) {
    return `${minutes} 分钟前`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} 小时前`
  }

  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

function formatChatDivider(iso: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function shouldInsertDivider(previousIso: string | null, currentIso: string) {
  if (!previousIso) {
    return true
  }

  const previousTime = new Date(previousIso).getTime()
  const currentTime = new Date(currentIso).getTime()
  return currentTime - previousTime > 15 * 60 * 1000
}

function collapseBroadcastTextRecords<T extends { fromSelf: boolean; text: string; createdAt: string }>(
  records: T[],
) {
  const collapsed: T[] = []

  for (const record of records) {
    const previous = collapsed[collapsed.length - 1]
    const isDuplicateBroadcast =
      previous &&
      previous.fromSelf &&
      record.fromSelf &&
      previous.text === record.text &&
      Math.abs(new Date(record.createdAt).getTime() - new Date(previous.createdAt).getTime()) < 5_000

    if (!isDuplicateBroadcast) {
      collapsed.push(record)
    }
  }

  return collapsed
}

function deviceConnectionLabel(status?: 'connecting' | 'connected' | 'failed' | 'closed') {
  switch (status) {
    case 'connecting':
      return '连接中'
    case 'connected':
      return '已连接'
    case 'failed':
      return '连接失败'
    case 'closed':
      return '在线'
    default:
      return '在线'
  }
}

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null
}

async function readEntryFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    return new Promise<File[]>((resolve, reject) => {
      fileEntry.file(
        (file) => resolve([file]),
        (error) => reject(error),
      )
    })
  }

  if (entry.isDirectory) {
    const directoryEntry = entry as FileSystemDirectoryEntry
    const reader = directoryEntry.createReader()
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      const allEntries: FileSystemEntry[] = []

      const readBatch = () => {
        reader.readEntries(
          (batch) => {
            if (batch.length === 0) {
              resolve(allEntries)
              return
            }

            allEntries.push(...batch)
            readBatch()
          },
          (error) => reject(error),
        )
      }

      readBatch()
    })

    const nestedFiles = await Promise.all(entries.map((child) => readEntryFiles(child)))
    return nestedFiles.flat()
  }

  return []
}

async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []) as DataTransferItemWithEntry[]
  const entries = items
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry))

  if (entries.length === 0) {
    return Array.from(dataTransfer.files ?? [])
  }

  const batches = await Promise.all(entries.map((entry) => readEntryFiles(entry)))
  return batches.flat()
}

function resolveInitialTheme(): ThemeId {
  if (typeof window === 'undefined') {
    return 'classic'
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return storedTheme === 'chat-desktop' || storedTheme === 'classic' ? storedTheme : 'classic'
}

function App() {
  const fileInputId = useId()
  const [theme, setTheme] = useState<ThemeId>(resolveInitialTheme)
  const [activeView, setActiveView] = useState<NavView>('connect')
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [textMode, setTextMode] = useState<'long' | 'chat'>('long')
  const [draftText, setDraftText] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)
  const [sessionQuery, setSessionQuery] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false)
  const [deviceNameDraft, setDeviceNameDraft] = useState('')
  const [sessionArtifacts, setSessionArtifacts] = useState<
    Record<string, { kind: TransferMode; summary: string }>
  >({})
  const [conversationNotices, setConversationNotices] = useState<ConversationNotice[]>([])
  const deferredQuery = useDeferredValue(sessionQuery)
  const isChatDesktopTheme = theme === 'chat-desktop'
  const visibleNavItems = isChatDesktopTheme
    ? navItems.filter((item) => item.id !== 'send' && item.id !== 'receive')
    : navItems
  const effectiveNavView: NavView =
    isChatDesktopTheme && (activeView === 'send' || activeView === 'receive') ? 'text' : activeView
  const previousConnectionStatusesRef = useRef<Record<string, 'connecting' | 'connected' | 'failed' | 'closed'>>({})
  const hasConnectionSnapshotRef = useRef(false)

  const {
    socketState,
    self,
    onlinePeers,
    sessions,
    connectionStates,
    connectedTargets,
    transferItems,
    textRecords,
    receivedFiles,
    errorMessage,
    pairByShortCode,
    requestConnect,
    disconnectSession,
    requestSnapshot,
    updateSettings,
    createTransferItems,
    retryTransfer,
    cancelTransfer,
    startPendingTransfers,
    sendText,
    stateToUiStatus,
    reasonLabel,
  } = useCcconnect()

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

  const sessionPeerNameById = new Map<string, string>()
  const sessionPeerIdById = new Map<string, string>()
  for (const session of sessions) {
    sessionPeerNameById.set(session.sessionId, session.peer?.deviceName ?? session.peerId)
    sessionPeerIdById.set(session.sessionId, session.peer?.deviceId ?? session.peerId)
  }

  const uiSessions: UiSession[] = sessions.map((session) => {
    const file = latestFileBySession.get(session.sessionId)
    const text = latestTextBySession.get(session.sessionId)
    const artifact = sessionArtifacts[session.sessionId]
    const kind = artifact?.kind ?? session.kind ?? (text ? 'text' : 'file')
    const summary =
      artifact?.summary ??
      (file
        ? `${file.name} · ${formatFileSize(file.size)}`
        : text
          ? `${text.text.split(/\r?\n/).length} 行文本 · ${text.text.slice(0, 18)}`
          : `${session.peer?.deviceName ?? session.peerId} · ${session.state === 'connected' ? '可传输' : '等待连接'}`)

    return {
      id: session.sessionId,
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

  const latestSessionByPeerId = new Map<string, { uiSession: UiSession; updatedAt: string }>()
  for (const session of sessions) {
    const uiSession = uiSessions.find((item) => item.id === session.sessionId)
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
  const selectedDeviceSessions = sessions
    .filter((session) => session.peerId === selectedDevicePeer?.deviceId)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
  const selectedDeviceSessionIds = new Set(selectedDeviceSessions.map((session) => session.sessionId))

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
  const onlineCount = onlinePeers.length
  const activeCount = sessions.filter((session) => session.state === 'connected').length
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
  const selectedConversationName = isChatDesktopTheme
    ? selectedDevicePeer?.deviceName ?? '设备对话'
    : selectedUiSession
      ? selectedUiSession.source === selfName
        ? selectedUiSession.target
        : selectedUiSession.source
      : '当前会话'
  const currentMeta = isChatConversationView
    ? {
        title: selectedConversationName,
        description: selectedDevicePeer
          ? `${selectedDevicePeer.platform} · 互传码 ${selectedDevicePeer.shortCode} · ${deviceConnectionLabel(selectedDeviceStatus)}`
          : '选择一个在线设备开始对话。',
        primaryAction: '发送',
        secondaryAction: '加入会话',
      }
    : viewMeta[activeView]

  const connectingTargetCount = Object.values(connectionStates).filter(
    (state) => state.status === 'connecting',
  ).length

  const selectedConnectedTarget =
    connectedTargets.find((target) => target.peerId === selectedDevicePeer?.deviceId) ?? null

  const activeTransferLabel =
    isChatDesktopTheme && selectedDevicePeer
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
            (item.sessionId ? selectedDeviceSessionIds.has(item.sessionId) : false),
        )
      : visibleTransferItems
  const receivedFilesForConversation =
    isChatDesktopTheme && selectedDevicePeer
      ? receivedFiles.filter((file) => selectedDeviceSessionIds.has(file.sessionId))
      : receivedFiles
  const sortedChatRecordsForConversation =
    isChatDesktopTheme && selectedDevicePeer
      ? sortedChatRecords.filter((record) => selectedDeviceSessionIds.has(record.sessionId))
      : sortedChatRecords
  const conversationNoticesForConversation =
    isChatDesktopTheme && selectedDevicePeer
      ? conversationNotices.filter((notice) => selectedDeviceSessionIds.has(notice.sessionId))
      : conversationNotices
  const hasRunnableTransfers = visibleTransferItemsForConversation.some((item) =>
    ['queued', 'waiting_for_target', 'connecting', 'ready', 'failed'].includes(item.status),
  )

  const fileConversationEntries: FileConversationEntry[] = [
    ...visibleTransferItemsForConversation.map((item) => ({
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
  ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())

  const unifiedConversationEntries: UnifiedConversationEntry[] = [
    ...sortedChatRecordsForConversation.map((record) => ({
      id: `text-${record.id}`,
      entryType: 'text' as const,
      sessionId: record.sessionId,
      fromSelf: record.fromSelf,
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
  const selectedDeviceTransferSessionId = selectedConnectedTarget?.sessionId ?? null
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
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Ignore storage failures so the UI can still render normally.
    }
  }, [theme])

  const handleViewChange = (view: NavView) => {
    startTransition(() => {
      setActiveView(view)
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

  const handleSendFiles = async () => {
    if (visibleTransferItemsForConversation.length === 0) {
      setLocalError('请先选择文件。')
      return
    }

    try {
      await startPendingTransfers(
        isChatDesktopTheme ? runnableTransferIds : undefined,
        isChatDesktopTheme ? selectedDeviceTransferSessionId : null,
      )
      setLocalError(null)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '文件发送失败。')
    }
  }

  const handleSendText = async () => {
    const rawText = isChatDesktopTheme ? chatDraft : textMode === 'chat' ? chatDraft : draftText
    const normalizedText = rawText.trim()
    if (normalizedText.length === 0) {
      setLocalError('请输入要发送的内容。')
      return
    }

    if (isChatDesktopTheme) {
      if (!selectedDeviceTransferSessionId) {
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
        ? connectedTargets.filter((target) => target.sessionId === selectedDeviceTransferSessionId)
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
        for (const target of connectedTargets) {
          next[target.session.sessionId] = {
            kind: 'text',
            summary: `${rawText.split(/\r?\n/).length} 行文本 · ${normalizedText.slice(0, 18)}`,
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

    const created = createTransferItems(files, isChatDesktopTheme ? selectedDeviceTransferSessionId : null)
    setActiveView('send')
    void startPendingTransfers(
      created.map((item) => item.id),
      isChatDesktopTheme ? selectedDeviceTransferSessionId : null,
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

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    const relatedTarget = event.relatedTarget
    if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
      setIsDragging(false)
    }
  }

  return (
    <div className="pp-shell" data-theme={theme}>
      <aside className={`pp-sidebar${isMobileNavOpen ? ' is-mobile-open' : ''}`}>
        <div className="pp-brand">
          <span className="pp-brand__mark">CC</span>
          <div className="pp-brand__copy">
            <strong>CCConnect</strong>
            <small>V0.1.0</small>
          </div>
          <button
            type="button"
            className="pp-sidebar__toggle"
            aria-expanded={isMobileNavOpen}
            aria-controls="pp-primary-nav"
            onClick={() => setIsMobileNavOpen((previous) => !previous)}
          >
            {isMobileNavOpen ? '收起' : '菜单'}
          </button>
        </div>

        <div className="pp-sidebar__menu" id="pp-primary-nav">
          <div className="pp-theme-switch" role="group" aria-label="主题切换">
            {themeOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={theme === option.id ? 'is-active' : ''}
                aria-pressed={theme === option.id}
                title={option.label}
                onClick={() => setTheme(option.id)}
              >
                <span className={`pp-theme-switch__swatch is-${option.id}`} aria-hidden="true" />
                <span className="pp-theme-switch__copy">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </button>
            ))}
          </div>

          <div className="pp-sidebar__actions">
            <button type="button" onClick={() => handleViewChange('connect')}>
              新会话
            </button>
            <button type="button" className="is-secondary" onClick={() => handleViewChange('sessions')}>
              会话记录
            </button>
          </div>

          <nav className="pp-nav" aria-label="功能导航">
            {visibleNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={effectiveNavView === item.id ? 'is-active' : ''}
                title={item.label}
                aria-label={item.label}
                onClick={() => handleViewChange(item.id)}
              >
                <span className="pp-nav__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {item.icon}
                  </svg>
                </span>
                <span className="pp-nav__copy">
                  <strong>{item.label}</strong>
                  <span>{item.hint}</span>
                </span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <main className={`pp-main${isChatDesktopTheme ? ' is-chat-desktop' : ''}`}>
        <header className="pp-header">
          <div>
            <p className="pp-header__eyebrow">{isChatConversationView ? '当前对话' : '连接 · 传输 · 共享'}</p>
            <h1>{currentMeta.title}</h1>
            <p>{currentMeta.description}</p>
            {(localError || errorMessage) && <p className="pp-error-note">{localError ?? errorMessage}</p>}
          </div>

          {isChatDesktopTheme ? (
            <div className="pp-header__actions">
              <button type="button" className="pp-icon-button pp-icon-button--plain" aria-label="刷新" onClick={requestSnapshot}>
                ↻
              </button>
              <button
                type="button"
                className="pp-icon-button pp-icon-button--plain"
                aria-label="连接设备"
                onClick={() => handleViewChange('connect')}
              >
                ⊕
              </button>
              <button
                type="button"
                className="pp-icon-button pp-icon-button--plain"
                aria-label="会话记录"
                onClick={() => handleViewChange('sessions')}
              >
                ⋯
              </button>
            </div>
          ) : (
            <div className="pp-header__status">
              <span>{onlineCount} 台设备在线</span>
              <span>{activeCount} 个活跃会话</span>
              <span>{socketState}</span>
            </div>
          )}
        </header>

        <section className="pp-stage">
          <div className="pp-stage__backdrop" aria-hidden="true" />

          {isChatConversationView && (
            <section className="pp-view pp-view--single pp-view--files">
              <div
                className={`pp-chatbox pp-chatbox--files${isDragging ? ' is-dragging' : ''}`}
                onDragEnter={() => setIsDragging(true)}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (!isDragging) {
                    setIsDragging(true)
                  }
                }}
                onDragLeave={handleDragLeave}
                onDrop={(event) => {
                  void handleDrop(event)
                }}
              >
                <div className="pp-chatbox__thread">
                  {unifiedConversationEntries.length > 0 ? (
                    unifiedConversationEntries.map((entry, index) => {
                      const previousIso = index > 0 ? unifiedConversationEntries[index - 1].createdAt : null
                      const showDivider = shouldInsertDivider(previousIso, entry.createdAt)

                      return (
                        <div key={entry.id} className="pp-chatbox__entry">
                          {entry.entryType === 'notice' ? (
                            <div className="pp-chatbox__notice">
                              <span>{entry.text}</span>
                            </div>
                          ) : (
                            <>
                          {showDivider && (
                            <div className="pp-chatbox__divider">
                              <span>{formatChatDivider(entry.createdAt)}</span>
                            </div>
                          )}

                          <div className={`pp-chatbox__message${entry.fromSelf ? ' is-self' : ' is-peer'}`}>
                            {!entry.fromSelf && <div className="pp-chatbox__avatar">TA</div>}

                            {entry.entryType === 'text' ? (
                              <div className="pp-chatbox__bubble">
                                <p>{entry.text}</p>
                              </div>
                            ) : (
                              <div className={`pp-file-bubble is-${entry.file.tone}`}>
                                <small className="pp-file-bubble__eyebrow">
                                  {entry.file.kind === 'outgoing' ? '我发送的文件' : '收到的文件'}
                                </small>
                                <strong>{entry.file.fileName}</strong>
                                <span className="pp-file-bubble__meta">
                                  {formatFileSize(entry.file.fileSize)} · {entry.file.subtitle}
                                </span>
                                <div className="pp-file-bubble__progress">
                                  <div
                                    className={`pp-file-bubble__bar is-${entry.file.tone}`}
                                    style={{ width: `${Math.round(entry.file.progress * 100)}%` }}
                                  />
                                </div>
                                <div className="pp-file-bubble__footer">
                                  <span>{entry.file.statusLabel}</span>
                                  <span>{entry.file.detail}</span>
                                </div>
                                {(entry.file.downloadUrl || entry.file.action) && (
                                  <div className="pp-file-bubble__actions">
                                    {entry.file.downloadUrl ? (
                                      <a
                                        className="pp-file-bubble__action"
                                        href={entry.file.downloadUrl}
                                        download={entry.file.downloadName}
                                      >
                                        下载文件
                                      </a>
                                    ) : null}
                                    {entry.file.action === 'retry' ? (
                                      <button
                                        type="button"
                                        className="pp-file-bubble__action"
                                        onClick={() => retryTransfer(entry.file.id)}
                                      >
                                        重试
                                      </button>
                                    ) : null}
                                    {entry.file.action === 'cancel' ? (
                                      <button
                                        type="button"
                                        className="pp-file-bubble__action"
                                        onClick={() => cancelTransfer(entry.file.id)}
                                      >
                                        取消
                                      </button>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            )}

                            {entry.fromSelf && <div className="pp-chatbox__avatar is-self">我</div>}
                          </div>
                            </>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <div className="pp-chatbox__empty pp-chatbox__empty--files">{fileConversationEmptyState}</div>
                  )}
                </div>

                <div className="pp-chatbox__composer">
                  <div className="pp-chatbox__textarea-wrap">
                    <textarea
                      className="pp-chatbox__textarea"
                      placeholder="输入消息，Ctrl/Cmd + Enter 发送。"
                      value={chatDraft}
                      onChange={(event) => setChatDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault()
                          void handleSendText()
                        }
                      }}
                    />
                  </div>

                  <div className="pp-chatbox__composer-footer">
                    <div className="pp-chatbox__toolbar pp-chatbox__toolbar--files">
                      <button type="button" aria-label="表情">
                        ☺
                      </button>
                      <button type="button" aria-label="文件夹">
                        ▣
                      </button>
                      <button type="button" aria-label="剪贴板">
                        ✂
                      </button>
                      <button type="button" aria-label="语音">
                        ◉
                      </button>
                    </div>

                    <div className="pp-chatbox__composer-actions">
                      <label className="pp-chatbox__file-trigger" htmlFor={fileInputId}>
                        <input
                          id={fileInputId}
                          className="sr-only"
                          type="file"
                          multiple
                          onChange={handleFileSelection}
                        />
                        选择文件
                      </label>
                      <button
                        type="button"
                        className="pp-button pp-button--primary"
                        onClick={handleSendText}
                        disabled={
                          chatDraft.trim().length === 0 ||
                          (isChatDesktopTheme ? !selectedDeviceTransferSessionId : connectedTargets.length === 0)
                        }
                      >
                        发送
                      </button>
                    </div>
                  </div>

                  <div className="pp-chatbox__toolbar pp-chatbox__toolbar--meta">
                    <span className="pp-chatbox__meta-note">
                      文件、消息、接收进度都在同一条对话里
                    </span>
                    <span className="pp-chatbox__meta-note">当前目标：{activeTransferLabel}</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeView === 'send' && !isChatConversationView && (
            <section className="pp-view pp-view--single pp-view--send">
              <div
                className={`pp-bluebox${isDragging ? ' is-dragging' : ''}`}
                onDragEnter={() => setIsDragging(true)}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (!isDragging) {
                    setIsDragging(true)
                  }
                }}
                onDragLeave={handleDragLeave}
                onDrop={(event) => {
                  void handleDrop(event)
                }}
              >
                <p>选择文件，实时共享，等待已连接设备下载</p>
                <div className="pp-bluebox__actions">
                  <label
                    className={`pp-pill-button${isDragging ? ' is-dragging' : ''}`}
                    htmlFor={fileInputId}
                  >
                    <input
                      id={fileInputId}
                      className="sr-only"
                      type="file"
                      multiple
                      onChange={handleFileSelection}
                    />
                    共享文件
                  </label>
                  <span>粘贴或者拖拽文件/文件夹到此</span>
                </div>
              </div>

              <div className="pp-section-block">
                <div className="pp-section-block__head">
                  <div>
                    <h3>推送文件到已连接设备</h3>
                    <p className="pp-inline-note">当前目标：{activeTransferLabel}</p>
                  </div>
                  <button
                    type="button"
                    className="pp-button pp-button--primary"
                    onClick={handleSendFiles}
                    disabled={!hasRunnableTransfers}
                  >
                    发送
                  </button>
                </div>

                {visibleTransferItems.length > 0 ? (
                  <ul className="pp-transfer-list">
                    {visibleTransferItems.map((item) => (
                      <li key={item.id}>
                        <div className="pp-transfer-list__head">
                          <div>
                            <strong>{item.fileName}</strong>
                            <span>{formatFileSize(item.fileSize)}</span>
                          </div>
                          <div className="pp-transfer-list__meta">
                            <span>{item.targetDeviceName ?? activeTransferLabel}</span>
                            <strong>{transferStatusLabel(item.status)}</strong>
                          </div>
                        </div>

                        <div className="pp-transfer-list__progress">
                          <div
                            className={`pp-transfer-list__bar pp-transfer-list__bar--${item.status}`}
                            style={{ width: `${Math.round(item.progress * 100)}%` }}
                          />
                        </div>

                        <div className="pp-transfer-list__footer">
                          <span>{Math.round(item.progress * 100)}%</span>
                          <span>
                            {formatFileSize(item.sentBytes)} / {formatFileSize(item.fileSize)}
                          </span>
                          {item.status === 'failed' ? (
                            <button type="button" onClick={() => retryTransfer(item.id)}>
                              重试
                            </button>
                          ) : item.status !== 'completed' ? (
                            <button type="button" onClick={() => cancelTransfer(item.id)}>
                              取消
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="pp-empty">{fileSenderEmptyState}</div>
                )}
              </div>
            </section>
          )}

          {activeView === 'text' && !isChatConversationView && (
            <section className="pp-view pp-view--single pp-view--text">
              <div className="pp-text-topbar">
                <div className="pp-text-mode">
                  <button
                    type="button"
                    className={textMode === 'long' ? 'is-active' : ''}
                    onClick={() => setTextMode('long')}
                  >
                    长文模式
                  </button>
                  <button
                    type="button"
                    className={textMode === 'chat' ? 'is-active' : ''}
                    onClick={() => setTextMode('chat')}
                  >
                    对话模式
                  </button>
                </div>
              </div>

              {textMode === 'long' ? (
                <div className="pp-text-editor">
                  <textarea
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    placeholder="在这里输入要发送到另一台设备的长文本。"
                  />

                  <div className="pp-text-editor__toolbar">
                    <div className="pp-text-tools">
                      <button type="button">📋</button>
                      <button type="button">A</button>
                      <button type="button">&lt;&gt;</button>
                      <button type="button">≡</button>
                      <button type="button">↶</button>
                      <button type="button">↷</button>
                    </div>

                    <div className="pp-text-send">
                      <span>当前目标：{activeTransferLabel}</span>
                      <button
                        type="button"
                        className="pp-button pp-button--primary"
                        onClick={handleSendText}
                        disabled={draftText.trim().length === 0 || connectedTargets.length === 0}
                      >
                        发送
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pp-chatbox">
                  <div className="pp-chatbox__thread">
                    {sortedChatRecords.length > 0 ? (
                      sortedChatRecords.map((record, index) => {
                        const previousIso = index > 0 ? sortedChatRecords[index - 1].createdAt : null
                        const showDivider = shouldInsertDivider(previousIso, record.createdAt)

                        return (
                          <div key={record.id} className="pp-chatbox__entry">
                            {showDivider && (
                              <div className="pp-chatbox__divider">
                                <span>{formatChatDivider(record.createdAt)}</span>
                              </div>
                            )}

                            <div
                              className={`pp-chatbox__message${record.fromSelf ? ' is-self' : ' is-peer'}`}
                            >
                              {!record.fromSelf && <div className="pp-chatbox__avatar">TA</div>}

                              <div className="pp-chatbox__bubble">
                                <p>{record.text}</p>
                              </div>

                              {record.fromSelf && <div className="pp-chatbox__avatar is-self">我</div>}
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="pp-chatbox__empty">当前暂无内容</div>
                    )}
                  </div>

                  <div className="pp-chatbox__composer">
                    <div className="pp-chatbox__toolbar">
                      <button type="button" aria-label="表情">
                        ☺
                      </button>
                      <button type="button" aria-label="文件">
                        □
                      </button>
                      <button type="button" aria-label="目录">
                        ▣
                      </button>
                      <button type="button" aria-label="剪贴板">
                        ✂
                      </button>
                      <button type="button" aria-label="语音">
                        ◉
                      </button>
                    </div>

                    <div className="pp-chatbox__input-row">
                      <input
                        type="text"
                        placeholder="输入消息"
                        value={chatDraft}
                        onChange={(event) => setChatDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            void handleSendText()
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="pp-button pp-button--primary"
                        onClick={handleSendText}
                        disabled={chatDraft.trim().length === 0 || connectedTargets.length === 0}
                      >
                        发送
                      </button>
                    </div>

                    <p className="pp-inline-note">当前目标：{activeTransferLabel}</p>
                  </div>
                </div>
              )}

              {textMode === 'long' && (
                <div className="pp-section-block">
                  <div className="pp-section-block__head">
                    <h3>消息记录</h3>
                  </div>

                  {textRecords.length > 0 ? (
                    <ul className="pp-record-list">
                      {[...textRecords]
                        .reverse()
                        .slice(0, 12)
                        .map((record) => (
                          <li key={record.id}>
                            <strong>{record.fromSelf ? '我' : '对方'}</strong>
                            <span>{record.text}</span>
                            <small>{formatRelativeTime(record.createdAt)}</small>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <div className="pp-empty">当前暂无内容</div>
                  )}
                </div>
              )}
            </section>
          )}

          {activeView === 'receive' && !isChatConversationView && (
            <section className="pp-view pp-view--single pp-view--receive">
              <div className="pp-receive-topbar">
                <div className="pp-receive-topbar__actions">
                  <span>设置</span>
                  <button type="button" className="pp-icon-button" onClick={requestSnapshot}>
                    ↻
                  </button>
                </div>
              </div>

              <div className="pp-section-block">
                <div className="pp-section-block__head">
                  <h3>下载共享文件</h3>
                </div>
                {receivedCompletedFiles.length > 0 ? (
                  <ul className="pp-record-list">
                    {receivedCompletedFiles.map((file) => (
                      <li key={file.id}>
                        <strong>{file.name}</strong>
                        <span>{formatFileSize(file.size)}</span>
                        {file.objectUrl ? (
                          <small>
                            <a href={file.objectUrl} download={file.name}>
                              下载文件
                            </a>
                          </small>
                        ) : (
                          <small>{formatRelativeTime(file.createdAt)}</small>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="pp-empty">当前暂无文件</div>
                )}
              </div>

              <div className="pp-section-block">
                <div className="pp-section-block__head">
                  <h3>自动接收的文件</h3>
                </div>
                {receivedPendingFiles.length > 0 ? (
                  <ul className="pp-record-list">
                    {receivedPendingFiles.map((file) => (
                      <li key={file.id}>
                        <strong>{file.name}</strong>
                        <span>
                          {file.receivedBytes} / {file.size} bytes
                        </span>
                        <small>{formatRelativeTime(file.createdAt)}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="pp-empty">当前暂无文件</div>
                )}
              </div>

              <div className="pp-section-block">
                <div className="pp-section-block__head pp-section-block__head--inline-form">
                  <h3>临时缓存文件</h3>
                  <div className="pp-join-inline">
                    <input
                      type="text"
                      inputMode="text"
                      placeholder="输入互传码"
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    />
                    <button type="button" className="pp-button pp-button--dark" onClick={handleJoinCode}>
                      接收此会话
                    </button>
                  </div>
                </div>
                <div className="pp-empty">当前暂无文件</div>
              </div>
            </section>
          )}

          {activeView === 'connect' && (
            <>
              <div className="pp-stage__toolbar">
                <div className="pp-joinbox">
                  <input
                    type="text"
                    inputMode="text"
                    placeholder="输入互传码"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  />
                  <button type="button" className="pp-button pp-button--primary" onClick={handlePrimaryConnect}>
                    {currentMeta.primaryAction}
                  </button>
                  <button type="button" className="pp-button pp-button--dark" onClick={requestSnapshot}>
                    {currentMeta.secondaryAction}
                  </button>
                </div>
              </div>

              <div className="pp-stage__grid">
                <section className="pp-composer">
                  <div className="pp-connectbox">
                    <div className="pp-receivebox__head">
                      <span>在线设备</span>
                    <small>{onlinePeers.length} 台设备</small>
                  </div>

                    {onlinePeers.length > 0 ? (
                      <ul className="pp-device-list pp-device-list--stage">
                        {onlinePeers.map((peer) => (
                          <li key={peer.deviceId}>
                            <button
                              type="button"
                              className={effectiveSelectedPeerId === peer.deviceId ? 'is-selected' : ''}
                              onClick={() => setSelectedPeerId(peer.deviceId)}
                            >
                              <strong>{peer.deviceName}</strong>
                              <span>
                                {peer.platform} · {peer.shortCode}
                              </span>
                              <small>
                                {peer.relation.sameLan ? '同网设备' : peer.relation.sameAccount ? '同账号设备' : '可连接设备'}
                              </small>
                              <small className={`pp-peer-badge pp-peer-badge--${peerStatusById.get(peer.deviceId) ?? 'online'}`}>
                                {deviceConnectionLabel(peerStatusById.get(peer.deviceId))}
                              </small>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="pp-empty">当前没有可见设备。可以输入互传码，或等待另一台设备上线。</div>
                    )}
                  </div>
                </section>

                <aside className="pp-stage__side">
                  <div className="pp-codecard">
                    <p>我的互传码</p>
                    <strong>{self?.shortCode ?? '------'}</strong>
                    <span>{self?.pairToken ? `pairToken: ${self.pairToken}` : '连接成功后会显示互传码和分享令牌。'}</span>
                  </div>

                  <div className="pp-detailcard">
                    <p>连接提示</p>
                    <ul>
                      <li
                        className={`pp-device-name-row${isEditingDeviceName ? ' is-editing' : ''}`}
                        onClick={() => {
                          if (!isEditingDeviceName) {
                            beginEditDeviceName()
                          }
                        }}
                      >
                        <span>设备名</span>
                        {isEditingDeviceName ? (
                          <div
                            className="pp-device-name-editor"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={deviceNameDraft}
                              onChange={(event) => setDeviceNameDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  saveDeviceName()
                                }

                                if (event.key === 'Escape') {
                                  event.preventDefault()
                                  cancelEditDeviceName()
                                }
                              }}
                              autoFocus
                            />
                            <div className="pp-device-name-editor__actions">
                              <button type="button" onClick={saveDeviceName}>
                                保存
                              </button>
                              <button type="button" className="is-ghost" onClick={cancelEditDeviceName}>
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="pp-device-name-display">
                            <strong>{self?.deviceName ?? '正在连接…'}</strong>
                            <small>点击名称可修改</small>
                          </div>
                        )}
                      </li>
                      <li>
                        <span>连接方式</span>
                        <strong>互传码 / 可见设备列表 / pair token</strong>
                      </li>
                      <li>
                        <span>Socket</span>
                        <strong>{socketState}</strong>
                      </li>
                    </ul>
                  </div>
                </aside>
              </div>
            </>
          )}

          {activeView === 'sessions' && (
            <>
              <div className="pp-stage__toolbar">
                <div className="pp-joinbox">
                  <input
                    type="text"
                    inputMode="text"
                    placeholder="输入互传码"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  />
                  <button type="button" className="pp-button pp-button--primary" onClick={requestSnapshot}>
                    {currentMeta.primaryAction}
                  </button>
                  <button type="button" className="pp-button pp-button--dark" onClick={() => handleViewChange('connect')}>
                    {currentMeta.secondaryAction}
                  </button>
                </div>
              </div>

              <div className="pp-stage__grid">
                <section className="pp-composer">
                  <div className="pp-connectbox">
                    <div className="pp-receivebox__head">
                      <span>会话概览</span>
                      <small>{uiSessions.length} 个会话</small>
                    </div>

                    <div className="pp-overview">
                      <div>
                        <span>全部会话</span>
                        <strong>{uiSessions.length}</strong>
                      </div>
                      <div>
                        <span>待接收</span>
                        <strong>{uiSessions.filter((session) => session.status === 'waiting').length}</strong>
                      </div>
                      <div>
                        <span>传输中</span>
                        <strong>{uiSessions.filter((session) => session.status === 'active').length}</strong>
                      </div>
                      <div>
                        <span>已关闭</span>
                        <strong>{uiSessions.filter((session) => session.status === 'completed').length}</strong>
                      </div>
                    </div>
                  </div>
                </section>

                <aside className="pp-stage__side">
                  <div className="pp-detailcard">
                    <p>记录提示</p>
                    <ul>
                      <li>
                        <span>搜索范围</span>
                        <strong>会话码 / 设备 / 载荷摘要</strong>
                      </li>
                      <li>
                        <span>当前选中</span>
                        <strong>
                          {selectedUiSession ? `${selectedUiSession.id} · ${selectedUiSession.summary}` : '暂无会话'}
                        </strong>
                      </li>
                    </ul>
                  </div>
                </aside>
              </div>
            </>
          )}
        </section>

        <section className="pp-content-grid">
          <section className={`pp-panel ${isChatDesktopTheme ? 'pp-panel--devices' : 'pp-panel--sessions'}`}>
            <div className="pp-panel__head">
              {!isChatDesktopTheme && (
                <div>
                  <p>当前会话</p>
                  <h2>会话列表</h2>
                </div>
              )}
              <div className="pp-panel__search">
                <input
                  type="search"
                  placeholder={isChatDesktopTheme ? '搜索设备名称或互传码' : '搜索会话码、设备或载荷'}
                  value={sessionQuery}
                  onChange={(event) => setSessionQuery(event.target.value)}
                />
                {isChatDesktopTheme && (
                  <button
                    type="button"
                    className="pp-icon-button pp-icon-button--plain"
                    aria-label="新会话"
                    onClick={() => handleViewChange('connect')}
                  >
                    +
                  </button>
                )}
              </div>
            </div>

            {isChatDesktopTheme ? (
              filteredDevicePeers.length > 0 ? (
                <ul className="pp-device-bar">
                  {filteredDevicePeers.map((peer) => {
                    const peerStatus = peerStatusById.get(peer.deviceId)
                    const deviceStatus = deviceBarStatus(peerStatus)
                    const peerLatestSession = sessions
                      .filter((session) => session.peerId === peer.deviceId)
                      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0]
                    return (
                      <li key={peer.deviceId}>
                        <div className={`pp-device-bar__item${effectiveSelectedPeerId === peer.deviceId ? ' is-selected' : ''}`}>
                          <button
                            type="button"
                            className="pp-device-bar__summary"
                            onClick={() => {
                              setSelectedPeerId(peer.deviceId)
                              setSelectedSessionId(peerLatestSession?.sessionId ?? null)
                              if (activeView === 'connect' || activeView === 'sessions') {
                                handleViewChange('text')
                              }
                            }}
                          >
                            <span className="pp-device-bar__avatar" aria-hidden="true">
                              {peer.deviceName.slice(0, 1)}
                            </span>
                            <div className="pp-device-bar__body">
                              <div className="pp-device-bar__head">
                                <strong>{peer.deviceName}</strong>
                                <small>{formatRelativeTime(peer.lastSeenAt)}</small>
                              </div>
                              <p>{devicePreviewText(peer)}</p>
                              <div className="pp-device-bar__meta">
                                <small>{peer.platform} · {deviceRelationText(peer)}</small>
                                <span className={`pp-peer-badge pp-peer-badge--${deviceStatus}`}>
                                  {deviceBarStatusLabel(deviceStatus)}
                                </span>
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            className={`pp-device-bar__action is-${deviceStatus}`}
                            onClick={() => {
                              setSelectedPeerId(peer.deviceId)
                              setSelectedSessionId(peerLatestSession?.sessionId ?? null)

                              if (deviceStatus === 'connected' && peerLatestSession) {
                                disconnectSession(peerLatestSession.sessionId)
                                return
                              }

                              if (deviceStatus === 'connectable' || deviceStatus === 'failed') {
                                requestConnect(peer.deviceId)
                                if (activeView === 'connect' || activeView === 'sessions') {
                                  handleViewChange('text')
                                }
                              }
                            }}
                            disabled={deviceStatus === 'connecting'}
                          >
                            {deviceStatus === 'connected' ? '断开' : '连接中' === deviceBarStatusLabel(deviceStatus) ? '连接中' : '连接'}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="pp-empty">当前没有发现设备。新发现的设备会在这里按时间竖向排列。</div>
              )
            ) : (
              <ul className="pp-session-list">
                {filteredSessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      className={selectedUiSession?.id === session.id ? 'is-selected' : ''}
                      onClick={() => setSelectedSessionId(session.id)}
                    >
                      <span className={`pp-session-list__avatar is-${session.kind}`} aria-hidden="true">
                        {session.kind === 'file' ? '文' : session.source === selfName ? session.target.slice(0, 1) : session.source.slice(0, 1)}
                      </span>
                      <div className="pp-session-list__body">
                        <div className="pp-session-list__head">
                          <strong>{session.source === selfName ? session.target : session.source}</strong>
                          <small>{session.updatedAt}</small>
                        </div>
                        <p>{session.kind === 'file' ? `[文件] ${session.summary}` : session.summary}</p>
                        <div className="pp-session-list__meta-row">
                          <small>
                            {session.source} {'->'} {session.target}
                          </small>
                          <span className={`is-${session.status}`}>{session.status === 'waiting' ? '待接收' : session.status === 'active' ? '传输中' : '已关闭'}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!isChatDesktopTheme && <aside className="pp-side-stack">
            <section className="pp-panel">
              <div className="pp-panel__head pp-panel__head--compact">
                <div>
                  <p>选中会话</p>
                  <h2>会话详情</h2>
                </div>
              </div>

              {selectedUiSession ? (
                <div className="pp-session-detail">
                  <div className="pp-codecard pp-codecard--small">
                    <p>Session code</p>
                    <strong>{selectedUiSession.id.slice(0, 6).toUpperCase()}</strong>
                    <span>{selectedUiSession.kind === 'file' ? '文件会话' : '文本会话'}</span>
                  </div>

                  <ul>
                    <li>
                      <span>来源</span>
                      <strong>{selectedUiSession.source}</strong>
                    </li>
                    <li>
                      <span>目标</span>
                      <strong>{selectedUiSession.target}</strong>
                    </li>
                    <li>
                      <span>载荷</span>
                      <strong>{selectedUiSession.summary}</strong>
                    </li>
                    <li>
                      <span>剩余状态</span>
                      <strong>{selectedUiSession.expiresIn}</strong>
                    </li>
                  </ul>
                </div>
              ) : (
                <div className="pp-empty">选中一条会话后，这里会显示详细信息。</div>
              )}
            </section>

            <section className="pp-panel">
              <div className="pp-panel__head pp-panel__head--compact">
                <div>
                  <p>在线设备</p>
                  <h2>设备列表</h2>
                </div>
              </div>

              <ul className="pp-device-list">
                {onlinePeers.map((peer) => (
                  <li key={peer.deviceId}>
                    <strong>{peer.deviceName}</strong>
                    <span>
                      {peer.platform} · {peer.shortCode}
                    </span>
                    <small>{peer.relation.sameLan ? '同网设备' : peer.relation.sameAccount ? '同账号设备' : '在线设备'}</small>
                    <small className={`pp-peer-badge pp-peer-badge--${peerStatusById.get(peer.deviceId) ?? 'online'}`}>
                      {deviceConnectionLabel(peerStatusById.get(peer.deviceId))}
                    </small>
                    <small>{formatRelativeTime(peer.lastSeenAt)}</small>
                  </li>
                ))}
              </ul>
            </section>
          </aside>}
        </section>

        {!isChatDesktopTheme && (
          <section className="pp-utility-row pp-utility-row--footer">
            {quickPanels.map((panel) => (
              <article key={panel.title}>
                <strong>{panel.title}</strong>
                <p>{panel.body}</p>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}

export default App
