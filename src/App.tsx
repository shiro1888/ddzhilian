import { startTransition, useDeferredValue, useId, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import './App.css'
import { useCcconnect } from './lib/use-ccconnect'

type TransferMode = 'file' | 'text'
type SessionStatus = 'waiting' | 'active' | 'completed'
type NavView = 'connect' | 'send' | 'receive' | 'text' | 'sessions'

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
}> = [
  { id: 'connect', label: '连接设备', hint: '发现并接入其他设备' },
  { id: 'send', label: '发送文件', hint: '投递文件并生成会话' },
  { id: 'receive', label: '接收文件', hint: '查看待接收与签收记录' },
  { id: 'text', label: '长文本', hint: '发送验证码、链接与便笺' },
  { id: 'sessions', label: '会话记录', hint: '搜索当前与历史会话' },
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

function App() {
  const fileInputId = useId()
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
  const [sessionArtifacts, setSessionArtifacts] = useState<
    Record<string, { kind: TransferMode; summary: string }>
  >({})
  const deferredQuery = useDeferredValue(sessionQuery)

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
    requestSnapshot,
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
  const currentMeta = viewMeta[activeView]

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

  const connectingTargetCount = Object.values(connectionStates).filter(
    (state) => state.status === 'connecting',
  ).length

  const activeTransferLabel =
    activeTransferTarget?.peerName ??
    (connectedTargets.length > 1
      ? '所有已连接设备'
      : onlinePeers.length > 0 && connectingTargetCount > 0
        ? '检测到在线设备，但尚未完成直连，正在尝试自动连接...'
        : onlinePeers.length > 0
          ? '当前没有可接收文件的已连接设备'
          : '暂无已连接设备')

  const fileSenderEmptyState =
    connectedTargets.length === 0
      ? onlinePeers.length > 0 && connectingTargetCount > 0
        ? '检测到在线设备，但尚未完成直连，正在尝试自动连接...'
        : '当前没有可接收文件的已连接设备'
      : '请选择文件后发送到所有已连接设备'

  const visibleTransferItems = transferItems.filter(
    (item) => item.status !== 'cancelled',
  )
  const hasRunnableTransfers = visibleTransferItems.some((item) =>
    ['queued', 'waiting_for_target', 'connecting', 'ready', 'failed'].includes(item.status),
  )

  const sortedChatRecords = collapseBroadcastTextRecords(
    [...textRecords].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    ),
  )

  const handleViewChange = (view: NavView) => {
    startTransition(() => {
      setActiveView(view)
      setIsMobileNavOpen(false)
      setLocalError(null)
    })
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
    if (visibleTransferItems.length === 0) {
      setLocalError('请先选择文件。')
      return
    }

    try {
      await startPendingTransfers()
      setLocalError(null)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '文件发送失败。')
    }
  }

  const handleSendText = async () => {
    const rawText = textMode === 'chat' ? chatDraft : draftText
    const normalizedText = rawText.trim()
    if (connectedTargets.length === 0 || normalizedText.length === 0) {
      setLocalError('先建立一个已连接会话，再发送长文本。')
      return
    }

    try {
      const recordId = crypto.randomUUID()
      const createdAt = new Date().toISOString()

      for (const [index, target] of connectedTargets.entries()) {
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

      if (textMode === 'chat') {
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

    const created = createTransferItems(files, null)
    setActiveView('send')
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

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    const relatedTarget = event.relatedTarget
    if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
      setIsDragging(false)
    }
  }

  return (
    <div className="pp-shell">
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
          <div className="pp-sidebar__actions">
            <button type="button" onClick={() => handleViewChange('connect')}>
              新会话
            </button>
            <button type="button" className="is-secondary" onClick={() => handleViewChange('sessions')}>
              会话记录
            </button>
          </div>

          <nav className="pp-nav" aria-label="功能导航">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activeView === item.id ? 'is-active' : ''}
                onClick={() => handleViewChange(item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.hint}</span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <main className="pp-main">
        <header className="pp-header">
          <div>
            <p className="pp-header__eyebrow">连接 · 传输 · 共享</p>
            <h1>{currentMeta.title}</h1>
            <p>{currentMeta.description}</p>
            {(localError || errorMessage) && <p className="pp-error-note">{localError ?? errorMessage}</p>}
          </div>

          <div className="pp-header__status">
            <span>{onlineCount} 台设备在线</span>
            <span>{activeCount} 个活跃会话</span>
            <span>{socketState}</span>
          </div>
        </header>

        <section className="pp-stage">
          <div className="pp-stage__backdrop" aria-hidden="true" />

          {activeView === 'send' && (
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

          {activeView === 'text' && (
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
                      <button type="button" aria-label="表情">☺</button>
                      <button type="button" aria-label="文件">□</button>
                      <button type="button" aria-label="目录">▣</button>
                      <button type="button" aria-label="剪贴板">✂</button>
                      <button type="button" aria-label="语音">◉</button>
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

          {activeView === 'receive' && (
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
                      <li>
                        <span>设备名</span>
                        <strong>{self?.deviceName ?? '正在连接…'}</strong>
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
          <section className="pp-panel">
            <div className="pp-panel__head">
              <div>
                <p>当前会话</p>
                <h2>会话列表</h2>
              </div>
              <input
                type="search"
                placeholder="搜索会话码、设备或载荷"
                value={sessionQuery}
                onChange={(event) => setSessionQuery(event.target.value)}
              />
            </div>

            <ul className="pp-session-list">
              {filteredSessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    className={selectedUiSession?.id === session.id ? 'is-selected' : ''}
                    onClick={() => setSelectedSessionId(session.id)}
                  >
                    <div className="pp-session-list__head">
                      <strong>{session.id}</strong>
                      <span className={`is-${session.status}`}>{session.status === 'waiting' ? '待接收' : session.status === 'active' ? '传输中' : '已关闭'}</span>
                    </div>
                    <p>{session.summary}</p>
                    <small>
                      {session.source} {'->'} {session.target}
                    </small>
                    <small>
                      {session.via} · {session.updatedAt}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <aside className="pp-side-stack">
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
          </aside>
        </section>

        <section className="pp-utility-row pp-utility-row--footer">
          {quickPanels.map((panel) => (
            <article key={panel.title}>
              <strong>{panel.title}</strong>
              <p>{panel.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}

export default App
