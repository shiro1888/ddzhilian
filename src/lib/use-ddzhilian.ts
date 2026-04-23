import { startTransition, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import type {
  AiChatResponse,
  AiQuotaStatus,
  ChannelMessage,
  ClientEvent,
  ConnectedTarget,
  DevicePreferencesPayload,
  DeviceSettingsPayload,
  DirectorySnapshotPayload,
  HistoryFileSummary,
  HistoryTextSummary,
  LiveSession,
  PairReason,
  PeerConnectionState,
  PeerSummary,
  ReceivedFile,
  RoomStateSummary,
  RoomSummary,
  ServerEvent,
  SessionState,
  TextRecord,
  TransferItem,
  TransferStatus,
} from './ddzhilian-types'

const DEFAULT_DEV_WS_URL = 'ws://localhost:8787/ws'
const STORAGE_KEY = 'ddzhilian.identity.v1'
const CHUNK_SIZE = 64 * 1024
const SERVER_UPLOAD_CHUNK_SIZE = 2 * 1024 * 1024
const CHANNEL_BUFFER_HIGH_WATER = 4 * 1024 * 1024
const CHANNEL_BUFFER_LOW_WATER = 1 * 1024 * 1024
const TEXT_SEND_STATUS_MIN_MS = 900
const binaryChunkEncoder = new TextEncoder()
const binaryChunkDecoder = new TextDecoder()

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function resolveWsUrl() {
  const configuredUrl = import.meta.env.VITE_SIGNALING_WS_URL?.trim()
  if (configuredUrl) {
    return configuredUrl
  }

  const { protocol, hostname, host } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return DEFAULT_DEV_WS_URL
  }

  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProtocol}//${host}/ws`
}

const WS_URL = resolveWsUrl()

function resolveApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_SIGNALING_HTTP_URL?.trim()
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  const url = new URL(WS_URL, window.location.href)
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  url.pathname = ''
  url.search = ''
  url.hash = ''

  return url.toString().replace(/\/$/, '')
}

const API_BASE_URL = resolveApiBaseUrl()

function buildHistoryAuthHeaders(self: DirectorySnapshotPayload['self']) {
  return {
    authorization: `Bearer ${self.historyAuthToken}`,
  }
}

async function readResponseError(response: Response) {
  try {
    const payload = await response.json() as { error?: string; message?: string }
    return payload.error ?? payload.message ?? response.statusText
  } catch {
    return response.statusText
  }
}

async function readApiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: unknown } | null
  return typeof payload?.error === 'string' && payload.error.trim()
    ? payload.error
    : fallback
}

type HistoryDownloadProgress = {
  receivedBytes: number
  totalBytes: number
  progress: number
}

function saveBlobAsDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 60_000)
}

type StoredIdentity = {
  deviceId?: string
  deviceName: string
  platform: string
  accountId?: string
  autoConnect: boolean
  discoverable: boolean
  allowShortCode: boolean
}

type IncomingTransferDraft = {
  id: string
  historyId?: string
  sessionId: string
  fromDeviceId: string
  name: string
  size: number
  mimeType?: string
  chunkSize: number
  createdAt: string
  receivedBytes: number
  chunks: Uint8Array[]
}

type SystemName = 'windows' | 'android' | 'ios' | 'ipad' | 'mac' | 'linux' | 'web'

function debugLog(...parts: unknown[]) {
  if (import.meta.env.DEV) {
    console.debug('[ddzhilian]', ...parts)
  }
}

function createRandomSuffix(length = 4) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('')
}

function detectSystemName(): SystemName {
  const ua = navigator.userAgent.toLowerCase()
  const platform = navigator.platform.toLowerCase()
  const maxTouchPoints = navigator.maxTouchPoints || 0

  if (ua.includes('android')) {
    return 'android'
  }

  if (ua.includes('iphone') || ua.includes('ipod')) {
    return 'ios'
  }

  if (ua.includes('ipad') || (platform.includes('mac') && maxTouchPoints > 1)) {
    return 'ipad'
  }

  if (platform.includes('win')) {
    return 'windows'
  }

  if (platform.includes('mac')) {
    return 'mac'
  }

  if (platform.includes('linux')) {
    return 'linux'
  }

  return 'web'
}

function createGeneratedDeviceName(system: SystemName) {
  return `${system}-${createRandomSuffix()}`
}

function isLegacyGeneratedName(name: string) {
  return /\b(browser|device)$/i.test(name.trim())
}

function getDefaultIdentity(): StoredIdentity {
  const system = detectSystemName()
  const platform = /iphone|android|mobile/i.test(navigator.userAgent)
    ? 'mobile'
    : /ipad|tablet/i.test(navigator.userAgent)
      ? 'tablet'
      : 'web'
  const deviceName = createGeneratedDeviceName(system)

  return {
    deviceName,
    platform,
    autoConnect: true,
    discoverable: true,
    allowShortCode: true,
  }
}

function readStoredIdentity(): StoredIdentity {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return getDefaultIdentity()
    }

    const fallback = getDefaultIdentity()
    const parsed = { ...fallback, ...(JSON.parse(raw) as StoredIdentity) }

    if (!parsed.deviceName || isLegacyGeneratedName(parsed.deviceName)) {
      const next = {
        ...parsed,
        deviceName: fallback.deviceName,
      }
      writeStoredIdentity(next)
      return next
    }

    return parsed
  } catch {
    return getDefaultIdentity()
  }
}

function writeStoredIdentity(value: StoredIdentity) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

function base64ToUint8Array(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function encodeBinaryChunkMessage(
  metadata: Extract<ChannelMessage, { type: 'file-chunk-binary' }>,
  buffer: ArrayBuffer,
) {
  const header = binaryChunkEncoder.encode(JSON.stringify(metadata))
  const body = new Uint8Array(buffer)
  const message = new Uint8Array(4 + header.byteLength + body.byteLength)
  const view = new DataView(message.buffer)

  view.setUint32(0, header.byteLength)
  message.set(header, 4)
  message.set(body, 4 + header.byteLength)

  return message.buffer
}

function decodeBinaryChunkMessage(buffer: ArrayBuffer) {
  if (buffer.byteLength < 4) {
    return null
  }

  const bytes = new Uint8Array(buffer)
  const headerLength = new DataView(buffer).getUint32(0)
  const bodyOffset = 4 + headerLength

  if (headerLength <= 0 || bodyOffset > bytes.byteLength) {
    return null
  }

  const metadata = JSON.parse(
    binaryChunkDecoder.decode(bytes.slice(4, bodyOffset)),
  ) as ChannelMessage

  if (metadata.type !== 'file-chunk-binary') {
    return null
  }

  return {
    metadata,
    chunk: bytes.slice(bodyOffset),
  }
}

async function readBinaryMessageData(data: unknown) {
  if (data instanceof ArrayBuffer) {
    return data
  }

  if (typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer) {
    const copy = new Uint8Array(data.byteLength)
    copy.set(new Uint8Array(data))
    return copy.buffer
  }

  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView
    const copy = new Uint8Array(view.byteLength)
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    return copy.buffer
  }

  if (data instanceof Blob) {
    return data.arrayBuffer()
  }

  return null
}

function isPreviewableMediaType(mimeType?: string) {
  return Boolean(mimeType?.startsWith('image/') || mimeType?.startsWith('video/'))
}

function normalizePeerLists(snapshot: DirectorySnapshotPayload) {
  const map = new Map<string, PeerSummary>()

  for (const peer of [...snapshot.peers, ...snapshot.lanPeers, ...snapshot.accountPeers]) {
    map.set(peer.deviceId, peer)
  }

  return [...map.values()]
}

function stateToUiStatus(state: SessionState) {
  switch (state) {
    case 'connecting':
      return 'waiting' as const
    case 'connected':
      return 'active' as const
    case 'failed':
    case 'closed':
      return 'completed' as const
  }
}

function reasonLabel(reason: LiveSession['reason']) {
  switch (reason) {
    case 'short-code':
      return '互传码'
    case 'pair-link':
      return '链接'
    case 'account-auto':
      return '账号自动'
    case 'lan-discovery':
      return '同网发现'
    case 'manual':
      return '手动'
  }
}

function mapBrowserConnectionState(
  state: RTCPeerConnectionState,
): PeerConnectionState['status'] {
  if (state === 'connected') {
    return 'connected'
  }

  if (state === 'failed') {
    return 'failed'
  }

  if (state === 'closed' || state === 'disconnected') {
    return 'closed'
  }

  return 'connecting'
}

export function useDdzhilian() {
  const [socketState, setSocketState] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle')
  const [self, setSelf] = useState<DirectorySnapshotPayload['self'] | null>(null)
  const [localIdentity, setLocalIdentity] = useState<StoredIdentity>(() => readStoredIdentity())
  const [onlinePeers, setOnlinePeers] = useState<PeerSummary[]>([])
  const [roomsById, setRoomsById] = useState<Record<string, RoomSummary>>({})
  const [roomStates, setRoomStates] = useState<RoomStateSummary[]>([])
  const [preferences, setPreferences] = useState<DevicePreferencesPayload>({ enterToSend: true })
  const [historyFiles, setHistoryFiles] = useState<HistoryFileSummary[]>([])
  const [historyTexts, setHistoryTexts] = useState<HistoryTextSummary[]>([])
  const [sessionsById, setSessionsById] = useState<Record<string, LiveSession>>({})
  const [connectionStatesById, setConnectionStatesById] = useState<Record<string, PeerConnectionState>>({})
  const [textRecords, setTextRecords] = useState<TextRecord[]>([])
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([])
  const [transferItems, setTransferItems] = useState<TransferItem[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastCreatedPublicRoomId, setLastCreatedPublicRoomId] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const identityRef = useRef<StoredIdentity>(localIdentity)
  const selfRef = useRef<DirectorySnapshotPayload['self'] | null>(null)
  const rtcConfigRef = useRef<RTCConfiguration | null>(null)
  const peerConnectionsRef = useRef(new Map<string, RTCPeerConnection>())
  const dataChannelsRef = useRef(new Map<string, RTCDataChannel>())
  const sessionsRef = useRef<Record<string, LiveSession>>({})
  const connectionStatesRef = useRef<Record<string, PeerConnectionState>>({})
  const transferItemsRef = useRef<TransferItem[]>([])
  const textRecordsRef = useRef<TextRecord[]>([])
  const historyTextsRef = useRef<HistoryTextSummary[]>([])
  const historyTextRefreshKeyRef = useRef('')
  const historyTextRefreshRequestRef = useRef('')
  const incomingTransfersRef = useRef(new Map<string, IncomingTransferDraft>())
  const pendingIceCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>())
  const transferFilesRef = useRef(new Map<string, File>())
  const transferAckWaitersRef = useRef(
    new Map<
      string,
      {
        resolve: (value: ChannelMessage & { type: 'file-ack' }) => void
        reject: (reason?: unknown) => void
        timeoutId: number
      }
    >(),
  )
  const transferResumeWaitersRef = useRef(
    new Map<
      string,
      {
        resolve: (value: ChannelMessage & { type: 'file-resume' }) => void
        timeoutId: number
      }
    >(),
  )
  const objectUrlsRef = useRef<string[]>([])
  const archivedHistoryIdsRef = useRef(new Set<string>())
  const archivingHistoryIdsRef = useRef(new Set<string>())
  const archivedTextHistoryIdsRef = useRef(new Set<string>())
  const archivingTextHistoryIdsRef = useRef(new Set<string>())

  useEffect(() => {
    selfRef.current = self
  }, [self])

  useEffect(() => {
    sessionsRef.current = sessionsById
  }, [sessionsById])

  useEffect(() => {
    connectionStatesRef.current = connectionStatesById
  }, [connectionStatesById])

  useEffect(() => {
    transferItemsRef.current = transferItems
  }, [transferItems])

  useEffect(() => {
    textRecordsRef.current = textRecords
  }, [textRecords])

  useEffect(() => {
    historyTextsRef.current = historyTexts
  }, [historyTexts])

  const sendEvent = (event: ClientEvent) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }

    if (event.type === 'hello' || event.type === 'signal' || event.type === 'session-state') {
      debugLog('send', event.type, event)
    }

    socket.send(JSON.stringify(event))
  }

  const updateTransfer = (transferId: string, patch: Partial<TransferItem>) => {
    startTransition(() => {
      setTransferItems((previous) =>
        previous.map((item) =>
          item.id === transferId
            ? {
                ...item,
                ...patch,
              }
            : item,
        ),
      )
    })
  }

  const getCurrentConnectedTargets = (): ConnectedTarget[] => {
    const connected: ConnectedTarget[] = []

    for (const [sessionId, state] of Object.entries(connectionStatesRef.current)) {
      if (state.status !== 'connected') {
        continue
      }

      const session = sessionsRef.current[sessionId]
      if (!session) {
        continue
      }

      connected.push({
        ...state,
        peerName: session.peer?.deviceName ?? state.peerName,
        session,
      })
    }

    return connected
  }

  const updateConnectionState = (
    sessionId: string,
    next: Omit<PeerConnectionState, 'sessionId'> & { status: PeerConnectionState['status'] },
  ) => {
    startTransition(() => {
      setConnectionStatesById((previous) => ({
        ...previous,
        [sessionId]: {
          sessionId,
          ...next,
        },
      }))
    })
  }

  const mergeSession = (sessionId: string, patch: Partial<LiveSession>) => {
    startTransition(() => {
      setSessionsById((previous) => {
        const current = previous[sessionId]
        if (!current) {
          return previous
        }

        return {
          ...previous,
          [sessionId]: {
            ...current,
            ...patch,
          },
        }
      })
    })
  }

  const refreshHistoryTextsForRooms = async (
    requestSelf: DirectorySnapshotPayload['self'],
    rooms: RoomSummary[],
  ) => {
    const roomKey = rooms
      .map((room) => `${room.roomId}:${room.historyTextCount}:${room.historyTextLatestAt ?? ''}`)
      .sort()
      .join('|')
    const refreshKey = `${requestSelf.historyAuthToken}:${roomKey}`

    if (
      historyTextRefreshKeyRef.current === refreshKey ||
      historyTextRefreshRequestRef.current === refreshKey
    ) {
      return
    }

    const roomsWithText = rooms.filter((room) => room.historyTextCount > 0)

    if (roomsWithText.length === 0) {
      historyTextRefreshKeyRef.current = refreshKey
      startTransition(() => {
        setHistoryTexts([])
      })
      archivedTextHistoryIdsRef.current = new Set()
      return
    }

    historyTextRefreshRequestRef.current = refreshKey

    try {
      const results = await Promise.all(
        roomsWithText.map(async (room) => {
          const url = new URL('/api/history/text', API_BASE_URL)
          url.searchParams.set('roomId', room.roomId)

          const response = await fetch(url, {
            headers: buildHistoryAuthHeaders(requestSelf),
          })

          if (!response.ok) {
            throw new Error(`历史文本拉取失败：${response.status.toString()} ${await readResponseError(response)}`)
          }

          const payload = await response.json() as { texts?: HistoryTextSummary[] }
          return payload.texts ?? []
        }),
      )
      const nextHistoryTexts = results
        .flat()
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))

      historyTextRefreshKeyRef.current = refreshKey
      archivedTextHistoryIdsRef.current = new Set(
        nextHistoryTexts.map((record) => record.historyId),
      )
      startTransition(() => {
        setHistoryTexts(nextHistoryTexts)
      })
    } catch (error) {
      debugLog('history text refresh failed', error)
    } finally {
      if (historyTextRefreshRequestRef.current === refreshKey) {
        historyTextRefreshRequestRef.current = ''
      }
    }
  }

  const applySnapshot = (snapshot: DirectorySnapshotPayload) => {
    rtcConfigRef.current = snapshot.rtcConfig

    const nextIdentity: StoredIdentity = {
      ...identityRef.current,
      deviceId: snapshot.self.deviceId,
      deviceName: snapshot.self.deviceName,
      platform: snapshot.self.platform,
      accountId: snapshot.self.accountId,
      autoConnect: snapshot.self.autoConnect,
      discoverable: snapshot.self.discoverable,
      allowShortCode: snapshot.self.allowShortCode,
    }

    identityRef.current = nextIdentity
    writeStoredIdentity(nextIdentity)
    setLocalIdentity(nextIdentity)

    const normalizedPeers = normalizePeerLists(snapshot)
    const peerIndex = new Map(normalizedPeers.map((peer) => [peer.deviceId, peer] as const))
    const peerNameById = new Map(normalizedPeers.map((peer) => [peer.deviceId, peer.deviceName] as const))
    peerNameById.set(snapshot.self.deviceId, snapshot.self.deviceName)
    const snapshotIds = new Set(snapshot.sessions.map((session) => session.sessionId))

    void refreshHistoryTextsForRooms(snapshot.self, snapshot.rooms)

    startTransition(() => {
      setSelf(snapshot.self)
      setOnlinePeers(normalizedPeers)
      setRoomsById(
        Object.fromEntries(snapshot.rooms.map((room) => [room.roomId, room] as const)),
      )
      setRoomStates(snapshot.roomStates ?? [])
      setPreferences(snapshot.self.preferences ?? { enterToSend: true })
      setHistoryFiles(snapshot.historyFiles)
      if (snapshot.historyTexts.length > 0) {
        setHistoryTexts(snapshot.historyTexts)
      }
      setSessionsById((previous) => {
        const next: Record<string, LiveSession> = {}

        for (const session of snapshot.sessions) {
          const current = previous[session.sessionId]
          next[session.sessionId] = {
            ...current,
            ...session,
            peer: peerIndex.get(session.peerId) ?? current?.peer,
            channelState: current?.channelState ?? 'idle',
            kind: current?.kind,
          }
        }

        for (const [sessionId, session] of Object.entries(previous)) {
          const localState = connectionStatesRef.current[sessionId]?.status
          if (!snapshotIds.has(sessionId) && (localState === 'connecting' || localState === 'connected')) {
            next[sessionId] = session
          }
        }

        return next
      })
      setConnectionStatesById((previous) => {
        let changed = false
        const next = Object.fromEntries(
          Object.entries(previous).map(([sessionId, state]) => {
            const peerName = peerNameById.get(state.peerId) ?? state.peerName
            if (peerName !== state.peerName) {
              changed = true
              return [sessionId, { ...state, peerName }] as const
            }

            return [sessionId, state] as const
          }),
        )

        return changed ? next : previous
      })
      setTransferItems((previous) => {
        let changed = false
        const next = previous.map((item) => {
          const targetDeviceName = item.targetDeviceId
            ? peerNameById.get(item.targetDeviceId)
            : undefined

          if (!targetDeviceName || targetDeviceName === item.targetDeviceName) {
            return item
          }

          changed = true
          return {
            ...item,
            targetDeviceName,
          }
        })

        return changed ? next : previous
      })
    })

    archivedHistoryIdsRef.current = new Set(
      snapshot.historyFiles.map((file) => file.historyId),
    )
    if (snapshot.historyTexts.length > 0) {
      archivedTextHistoryIdsRef.current = new Set(
        snapshot.historyTexts.map((text) => text.historyId),
      )
    }
  }

  const receiveFileChunk = (transferId: string, index: number, chunk: Uint8Array) => {
    const draft = incomingTransfersRef.current.get(transferId)
    if (!draft) {
      return
    }

    if (index < draft.chunks.length) {
      return
    }

    if (index > draft.chunks.length) {
      debugLog('skip out-of-order file chunk', { transferId, index, expected: draft.chunks.length })
      return
    }

    draft.chunks.push(chunk)
    draft.receivedBytes += chunk.byteLength

    startTransition(() => {
      setReceivedFiles((previous) =>
        previous.map((file) =>
          file.id === transferId
            ? { ...file, receivedBytes: Math.min(draft.receivedBytes, file.size) }
            : file,
        ),
      )
    })
  }

  const handleBinaryChannelMessage = async (raw: unknown) => {
    const buffer = await readBinaryMessageData(raw)
    if (!buffer) {
      return
    }

    try {
      const decoded = decodeBinaryChunkMessage(buffer)
      if (!decoded) {
        return
      }

      receiveFileChunk(decoded.metadata.id, decoded.metadata.index, decoded.chunk)
    } catch (error) {
      debugLog('binary chunk decode failed', error)
    }
  }

  const handleChannelMessage = (sessionId: string, fromDeviceId: string, raw: string) => {
    let message: ChannelMessage

    try {
      message = JSON.parse(raw) as ChannelMessage
    } catch {
      return
    }

    if (message.type === 'text-recall') {
      startTransition(() => {
        setTextRecords((previous) => previous.filter((record) => record.id !== message.id))
        setHistoryTexts((previous) => previous.filter((record) => record.historyId !== message.id))
      })
      return
    }

    if (message.type === 'text') {
      mergeSession(sessionId, { kind: 'text' })
      startTransition(() => {
        setTextRecords((previous) => [
          ...previous,
            {
              id: message.id,
              sessionId,
              roomId: sessionsRef.current[sessionId]?.roomId,
              fromSelf: false,
              text: message.text,
            createdAt: message.createdAt,
          },
        ])
      })
      return
    }

    if (message.type === 'file-meta') {
      mergeSession(sessionId, { kind: 'file' })
      const existingDraft = incomingTransfersRef.current.get(message.id)
      const draft =
        existingDraft &&
        existingDraft.size === message.size &&
        existingDraft.chunkSize === message.chunkSize
          ? {
              ...existingDraft,
              sessionId,
              fromDeviceId,
            }
          : {
              id: message.id,
              historyId: message.historyId,
              sessionId,
              fromDeviceId,
              name: message.name,
              size: message.size,
              mimeType: message.mimeType,
              chunkSize: message.chunkSize,
              createdAt: message.createdAt,
              receivedBytes: 0,
              chunks: [],
            }

      incomingTransfersRef.current.set(message.id, draft)

      startTransition(() => {
        setReceivedFiles((previous) => {
          const existingFile = previous.find((file) => file.id === message.id)
          return [
            ...previous.filter((file) => file.id !== message.id),
            {
              id: message.id,
              historyId: message.historyId,
              sessionId,
              fromDeviceId,
              name: message.name,
              size: message.size,
              mimeType: message.mimeType,
              createdAt: message.createdAt,
              receivedBytes: existingFile?.completed ? message.size : draft.receivedBytes,
              completed: existingFile?.completed ?? false,
              objectUrl: existingFile?.objectUrl,
            },
          ]
        })
      })

      const channel = dataChannelsRef.current.get(sessionId)
      if (channel && channel.readyState === 'open') {
        channel.send(
          JSON.stringify({
            type: 'file-resume',
            id: message.id,
            receivedBytes: draft.receivedBytes,
            nextIndex: draft.chunks.length,
          } satisfies ChannelMessage),
        )
      }
      return
    }

    if (message.type === 'file-chunk') {
      receiveFileChunk(message.id, message.index, base64ToUint8Array(message.data))
      return
    }

    if (message.type === 'file-chunk-binary') {
      return
    }

    if (message.type === 'file-complete') {
      const draft = incomingTransfersRef.current.get(message.id)
      if (!draft) {
        return
      }

      if (draft.receivedBytes < draft.size) {
        const channel = dataChannelsRef.current.get(sessionId)
        if (channel && channel.readyState === 'open') {
          channel.send(
            JSON.stringify({
              type: 'file-ack',
              id: message.id,
              receivedBytes: draft.receivedBytes,
              completed: false,
            } satisfies ChannelMessage),
          )
        }
        return
      }

      const blob = new Blob(
        draft.chunks.map((chunk) => {
          const buffer = new ArrayBuffer(chunk.byteLength)
          new Uint8Array(buffer).set(chunk)
          return buffer
        }),
        { type: draft.mimeType || 'application/octet-stream' },
      )
      const objectUrl = URL.createObjectURL(blob)
      objectUrlsRef.current.push(objectUrl)
      incomingTransfersRef.current.delete(message.id)

      startTransition(() => {
        setReceivedFiles((previous) =>
          previous.map((file) =>
            file.id === message.id
              ? {
                  ...file,
                  completed: true,
                  receivedBytes: file.size,
                  objectUrl,
                  historyId: draft.historyId,
                }
              : file,
          ),
        )
      })

      const channel = dataChannelsRef.current.get(sessionId)
      if (channel && channel.readyState === 'open') {
        channel.send(
          JSON.stringify({
            type: 'file-ack',
            id: message.id,
            receivedBytes: draft.size,
            completed: true,
          } satisfies ChannelMessage),
        )
      }
      return
    }

    if (message.type === 'file-resume') {
      const waiter = transferResumeWaitersRef.current.get(message.id)
      if (waiter) {
        window.clearTimeout(waiter.timeoutId)
        transferResumeWaitersRef.current.delete(message.id)
        waiter.resolve(message)
      }
      return
    }

    if (message.type === 'file-ack') {
      debugLog('receiver acknowledgement received', {
        transferId: message.id,
        receivedBytes: message.receivedBytes,
        completed: message.completed,
      })
      const waiter = transferAckWaitersRef.current.get(message.id)
      if (waiter) {
        window.clearTimeout(waiter.timeoutId)
        transferAckWaitersRef.current.delete(message.id)
        waiter.resolve(message)
      }
    }
  }

  const flushPendingIceCandidates = async (
    sessionId: string,
    peerConnection: RTCPeerConnection,
  ) => {
    const pending = pendingIceCandidatesRef.current.get(sessionId)
    if (!pending || pending.length === 0) {
      return
    }

    pendingIceCandidatesRef.current.delete(sessionId)

    for (const candidate of pending) {
      try {
        await peerConnection.addIceCandidate(candidate)
      } catch (error) {
        debugLog('flush ice failed', { sessionId, error })
      }
    }
  }

  const registerDataChannel = (
    sessionId: string,
    peerId: string,
    peerName: string,
    reason: LiveSession['reason'],
    channel: RTCDataChannel,
  ) => {
    channel.binaryType = 'arraybuffer'
    dataChannelsRef.current.set(sessionId, channel)
    mergeSession(sessionId, { channelState: 'opening' })

    channel.addEventListener('open', () => {
      mergeSession(sessionId, { channelState: 'open' })
      updateConnectionState(sessionId, {
        peerId,
        peerName,
        reason,
        status: 'connected',
      })
      sendEvent({
        type: 'session-state',
        payload: {
          sessionId,
          targetDeviceId: peerId,
          state: 'connected',
        },
      })
      debugLog('datachannel open', { sessionId, peerId })
      void startPendingTransfers()
    })

    channel.addEventListener('close', () => {
      mergeSession(sessionId, { channelState: 'closed' })
      updateConnectionState(sessionId, {
        peerId,
        peerName,
        reason,
        status: 'closed',
      })
      sendEvent({
        type: 'session-state',
        payload: {
          sessionId,
          targetDeviceId: peerId,
          state: 'closed',
        },
      })
      debugLog('datachannel close', { sessionId, peerId })
    })

    channel.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        handleChannelMessage(sessionId, peerId, event.data)
        return
      }

      void handleBinaryChannelMessage(event.data)
    })
  }

  const ensurePeerConnection = (
    sessionId: string,
    peer: PeerSummary,
    initiator: boolean,
    reason: LiveSession['reason'],
  ) => {
    const existing = peerConnectionsRef.current.get(sessionId)
    if (existing) {
      return existing
    }

    updateConnectionState(sessionId, {
      peerId: peer.deviceId,
      peerName: peer.deviceName,
      reason,
      status: 'connecting',
    })

    const peerConnection = new RTCPeerConnection(rtcConfigRef.current ?? undefined)

    peerConnection.addEventListener('icecandidate', (event) => {
      if (!event.candidate) {
        return
      }

      const payload: ClientEvent = {
        type: 'signal',
        payload: {
          sessionId,
          targetDeviceId: peer.deviceId,
          signal: {
            kind: 'ice-candidate',
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              usernameFragment: event.candidate.usernameFragment,
            },
          },
        },
      }

      sendEvent(payload)
    })

    peerConnection.addEventListener('connectionstatechange', () => {
      const status = mapBrowserConnectionState(peerConnection.connectionState)
      debugLog('rtc connectionState', {
        sessionId,
        peerId: peer.deviceId,
        browserState: peerConnection.connectionState,
        mappedState: status,
      })

      updateConnectionState(sessionId, {
        peerId: peer.deviceId,
        peerName: peer.deviceName,
        reason,
        status,
      })

      mergeSession(sessionId, { state: status })

      const payload: ClientEvent = {
        type: 'session-state',
        payload: {
          sessionId,
          targetDeviceId: peer.deviceId,
          state: status,
        },
      }

      debugLog('send session-state', payload)
      sendEvent(payload)
    })

    peerConnection.addEventListener('datachannel', (event) => {
      registerDataChannel(sessionId, peer.deviceId, peer.deviceName, reason, event.channel)
    })

    if (initiator) {
      const dataChannel = peerConnection.createDataChannel('ddzhilian')
      registerDataChannel(sessionId, peer.deviceId, peer.deviceName, reason, dataChannel)
    }

    peerConnectionsRef.current.set(sessionId, peerConnection)
    return peerConnection
  }

  const createOfferForSession = async (
    sessionId: string,
    peer: PeerSummary,
    reason: LiveSession['reason'],
  ) => {
    const peerConnection = ensurePeerConnection(sessionId, peer, true, reason)
    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)

    const payload: ClientEvent = {
      type: 'signal',
      payload: {
        sessionId,
        targetDeviceId: peer.deviceId,
        signal: {
          kind: 'offer',
          description: {
            sdp: offer.sdp ?? '',
            type: 'offer',
          },
        },
      },
    }

    sendEvent(payload)
  }

  const handleSignalEvent = async (
    payload: Extract<ServerEvent, { type: 'signal' }>['payload'],
  ) => {
    debugLog('receive signal', payload)

    const current = sessionsRef.current[payload.sessionId]
    const peer =
      current?.peer ??
      onlinePeers.find((item) => item.deviceId === payload.fromDeviceId)

    if (!peer) {
      return
    }

    const peerConnection = ensurePeerConnection(
      payload.sessionId,
      peer,
      current?.initiator ?? false,
      current?.reason ?? 'manual',
    )

    if (payload.signal.kind === 'offer') {
      await peerConnection.setRemoteDescription(payload.signal.description)
      await flushPendingIceCandidates(payload.sessionId, peerConnection)
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)

      sendEvent({
        type: 'signal',
        payload: {
          sessionId: payload.sessionId,
          targetDeviceId: peer.deviceId,
          signal: {
            kind: 'answer',
            description: {
              sdp: answer.sdp ?? '',
              type: 'answer',
            },
          },
        },
      })
      return
    }

    if (payload.signal.kind === 'answer') {
      await peerConnection.setRemoteDescription(payload.signal.description)
      await flushPendingIceCandidates(payload.sessionId, peerConnection)
      return
    }

    if (payload.signal.kind === 'ice-candidate') {
      if (!peerConnection.remoteDescription) {
        const pending = pendingIceCandidatesRef.current.get(payload.sessionId) ?? []
        pending.push(payload.signal.candidate)
        pendingIceCandidatesRef.current.set(payload.sessionId, pending)
        debugLog('queue ice candidate', { sessionId: payload.sessionId, peerId: peer.deviceId })
        return
      }

      try {
        await peerConnection.addIceCandidate(payload.signal.candidate)
      } catch (error) {
        const pending = pendingIceCandidatesRef.current.get(payload.sessionId) ?? []
        pending.push(payload.signal.candidate)
        pendingIceCandidatesRef.current.set(payload.sessionId, pending)
        debugLog('requeue ice candidate', {
          sessionId: payload.sessionId,
          peerId: peer.deviceId,
          error,
        })
      }
    }
  }

  const handleServerEvent = useEffectEvent(async (event: ServerEvent) => {
    if (event.type === 'welcome') {
      debugLog('receive welcome', event.payload)
      applySnapshot(event.payload)
      setSocketState('open')
      setErrorMessage(null)
      return
    }

    if (event.type === 'directory-snapshot') {
      applySnapshot(event.payload)
      return
    }

    if (event.type === 'session-created') {
      debugLog('receive session-created', event.payload)

      startTransition(() => {
        setSessionsById((previous) => ({
          ...previous,
          [event.payload.sessionId]: {
            ...(previous[event.payload.sessionId] ?? {}),
            sessionId: event.payload.sessionId,
            roomId: event.payload.roomId,
            peerId: event.payload.peer.deviceId,
            state: 'connecting',
            reason: event.payload.reason,
            initiator: event.payload.initiator,
            updatedAt: new Date().toISOString(),
            peer: event.payload.peer,
            channelState: previous[event.payload.sessionId]?.channelState ?? 'idle',
            kind: previous[event.payload.sessionId]?.kind,
          },
        }))
      })

      updateConnectionState(event.payload.sessionId, {
        peerId: event.payload.peer.deviceId,
        peerName: event.payload.peer.deviceName,
        reason: event.payload.reason,
        status: 'connecting',
      })

      if (event.payload.initiator) {
        await createOfferForSession(
          event.payload.sessionId,
          event.payload.peer,
          event.payload.reason,
        )
      } else {
        ensurePeerConnection(
          event.payload.sessionId,
          event.payload.peer,
          false,
          event.payload.reason,
        )
      }
      return
    }

    if (event.type === 'signal') {
      await handleSignalEvent(event.payload)
      return
    }

    if (event.type === 'peer-state') {
      const current = sessionsRef.current[event.payload.sessionId]
      if (current?.peer) {
        updateConnectionState(event.payload.sessionId, {
          peerId: current.peer.deviceId,
          peerName: current.peer.deviceName,
          reason: current.reason,
          status: event.payload.state,
        })
      }

      mergeSession(event.payload.sessionId, {
        state: event.payload.state,
      })
      return
    }

    if (event.type === 'public-room-created') {
      setLastCreatedPublicRoomId(event.payload.roomId)
      return
    }

    if (event.type === 'error') {
      setErrorMessage(event.payload.message)
    }
  })

  useEffect(() => {
    let disposed = false
    const objectUrls = objectUrlsRef.current
    const peerConnections = peerConnectionsRef.current

    const connect = () => {
      if (disposed) {
        return
      }

      setSocketState('connecting')
      const socket = new WebSocket(WS_URL)
      socketRef.current = socket

      socket.addEventListener('open', () => {
        const token = new URLSearchParams(window.location.search).get('token')
        const payload: DeviceSettingsPayload = {
          ...identityRef.current,
          requestedPairToken: token,
        }

        debugLog('send hello', payload)
        socket.send(
          JSON.stringify({
            type: 'hello',
            payload,
          } satisfies ClientEvent),
        )
      })

      socket.addEventListener('message', (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as ServerEvent
          void handleServerEvent(parsed)
        } catch {
          setErrorMessage('收到无法解析的服务端消息。')
        }
      })

      socket.addEventListener('close', () => {
        setSocketState('closed')
        if (!disposed) {
          reconnectTimerRef.current = window.setTimeout(connect, 2_000)
        }
      })

      socket.addEventListener('error', () => {
        setSocketState('error')
      })
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
      }

      for (const url of objectUrls) {
        URL.revokeObjectURL(url)
      }

      for (const peerConnection of peerConnections.values()) {
        peerConnection.close()
      }

      socketRef.current?.close()
    }
  }, [])

  const connectedTargets: ConnectedTarget[] = []
  for (const [sessionId, state] of Object.entries(connectionStatesById)) {
    if (state.status !== 'connected') {
      continue
    }

    const session = sessionsById[sessionId]
    if (!session) {
      continue
    }

    connectedTargets.push({
      ...state,
      peerName: session.peer?.deviceName ?? state.peerName,
      session,
    })
  }

  useEffect(() => {
    debugLog(
      'connectedTargets changed',
      Object.values(connectionStatesById)
        .filter((state) => state.status === 'connected')
        .map((state) => ({
          sessionId: state.sessionId,
          peerId: state.peerId,
          peerName: state.peerName,
        })),
    )
  }, [connectionStatesById])

  useEffect(() => {
    const connected = getCurrentConnectedTargets()
    const connectingCount = Object.values(connectionStatesById).filter(
      (state) => state.status === 'connecting',
    ).length

    startTransition(() => {
      setTransferItems((previous) =>
        previous.map((item) => {
          if (item.status === 'completed' || item.status === 'cancelled') {
            return item
          }

          const sessionState = item.sessionId
            ? connectionStatesById[item.sessionId]
            : undefined
          const connectedTarget = item.sessionId
            ? connected.find((target) => target.sessionId === item.sessionId)
            : undefined

          if (
            item.status === 'transferring' &&
            sessionState &&
            (sessionState.status === 'failed' || sessionState.status === 'closed')
          ) {
            return {
              ...item,
              status: 'failed',
              errorMessage: '连接中断，传输未完成。',
            }
          }

          if (connectedTarget) {
            if (item.status === 'queued' || item.status === 'waiting_for_target' || item.status === 'connecting') {
              return {
                ...item,
                sessionId: connectedTarget.sessionId,
                targetDeviceId: connectedTarget.peerId,
                targetDeviceName: connectedTarget.peerName,
                status: 'ready',
                errorMessage: undefined,
              }
            }

            return item
          }

          if (sessionState?.status === 'connecting') {
            return {
              ...item,
              status: 'connecting',
            }
          }

          if (!item.sessionId && connected.length === 1) {
            return {
              ...item,
              sessionId: connected[0].sessionId,
              targetDeviceId: connected[0].peerId,
              targetDeviceName: connected[0].peerName,
              status: 'ready',
              errorMessage: undefined,
            }
          }

          if (item.status === 'failed') {
            return item
          }

          if (!item.sessionId && connected.length > 1) {
            return {
              ...item,
              status: 'queued',
            }
          }

          return {
            ...item,
            status: connectingCount > 0 ? 'connecting' : 'waiting_for_target',
          }
        }),
      )
    })
  }, [connectionStatesById])

  const createTransferItems = (
    files: File[],
    preferredSessionIds?: string | string[] | null,
  ) => {
    const connected = getCurrentConnectedTargets()
    const connectingCount = Object.values(connectionStatesRef.current).filter(
      (state) => state.status === 'connecting',
    ).length
    const preferredIds = Array.isArray(preferredSessionIds)
      ? preferredSessionIds
      : preferredSessionIds
        ? [preferredSessionIds]
        : []
    const targetSet =
      preferredIds.length > 0
        ? preferredIds.map((sessionId) => {
            const connectedTarget = connected.find((target) => target.sessionId === sessionId)
            if (connectedTarget) {
              return connectedTarget
            }

            const session = sessionsRef.current[sessionId]
            return {
              sessionId,
              peerId: session?.peer?.deviceId ?? session?.peerId,
              peerName: session?.peer?.deviceName ?? session?.peerId,
              status:
                connectionStatesRef.current[sessionId]?.status ??
                ('closed' as const),
            }
          })
        : connected.length > 0
          ? connected
          : [null]

    const nextItems: TransferItem[] = []

    for (const file of files) {
      const historyId = crypto.randomUUID()
      const fileMimeType = file.type || undefined
      const previewUrl = isPreviewableMediaType(fileMimeType)
        ? URL.createObjectURL(file)
        : undefined

      if (previewUrl) {
        objectUrlsRef.current.push(previewUrl)
      }

      for (const target of targetSet) {
        const id = crypto.randomUUID()
        transferFilesRef.current.set(id, file)

        const status: TransferStatus =
          target && target.status === 'connected'
            ? 'ready'
            : target && target.sessionId
              ? target.status === 'connecting'
                ? 'connecting'
                : 'waiting_for_target'
              : connectingCount > 0
                ? 'connecting'
                : 'waiting_for_target'

        const item: TransferItem = {
          id,
          historyId,
          fileName: file.name,
          fileSize: file.size,
          fileMimeType,
          previewUrl,
          targetDeviceId: target?.peerId,
          targetDeviceName: target?.peerName,
          sessionId: target?.sessionId,
          status,
          progress: 0,
          sentBytes: 0,
          acknowledgedBytes: 0,
          createdAt: new Date().toISOString(),
        }

        debugLog('transfer item creation', item)
        nextItems.push(item)
      }
    }

    transferItemsRef.current = [...nextItems, ...transferItemsRef.current]

    startTransition(() => {
      setTransferItems((previous) => [...nextItems, ...previous])
    })

    return nextItems
  }

  const cancelTransfer = (transferId: string) => {
    updateTransfer(transferId, {
      status: 'cancelled',
      errorMessage: undefined,
    })
    debugLog('transfer cancelled', { transferId })
  }

  const retryTransfer = (transferId: string) => {
    const transfer = transferItemsRef.current.find((item) => item.id === transferId)
    if (!transfer) {
      return
    }

    if (transfer.roomId && !transfer.sessionId) {
      const file = transferFilesRef.current.get(transferId)
      if (!file) {
        updateTransfer(transferId, {
          status: 'failed',
          errorMessage: '本地文件句柄已丢失，无法继续传输。',
        })
        return
      }

      void sendRoomFiles(transfer.roomId, [{ id: transfer.historyId, file }])
      return
    }

    const connected = getCurrentConnectedTargets()
    const reuseTarget =
      transfer.sessionId
        ? connected.find((target) => target.sessionId === transfer.sessionId)
        : null

    updateTransfer(transferId, {
      status: reuseTarget ? 'ready' : 'waiting_for_target',
      progress: transfer.progress,
      sentBytes: 0,
      acknowledgedBytes: 0,
      startedAt: undefined,
      completedAt: undefined,
      errorMessage: undefined,
      sessionId: reuseTarget?.sessionId ?? transfer.sessionId,
      targetDeviceId: reuseTarget?.peerId ?? transfer.targetDeviceId,
      targetDeviceName: reuseTarget?.peerName ?? transfer.targetDeviceName,
    })
    debugLog('transfer retry queued', { transferId, reuseTarget: reuseTarget?.peerName })
  }

  const archiveTransferHistory = async (
    transferId: string,
    historyId: string,
    sessionId: string,
    file: File,
  ) => {
    if (archivedHistoryIdsRef.current.has(historyId) || archivingHistoryIdsRef.current.has(historyId)) {
      return
    }

    const session = sessionsRef.current[sessionId]
    const activeSelf = selfRef.current

    if (!session?.roomId || !activeSelf?.deviceId || !activeSelf.historyAuthToken) {
      return
    }

    archivingHistoryIdsRef.current.add(historyId)

    try {
      const uploadUrl = new URL('/api/history/upload', API_BASE_URL)
      uploadUrl.searchParams.set('roomId', session.roomId)
      uploadUrl.searchParams.set('historyId', historyId)
      uploadUrl.searchParams.set('sessionId', sessionId)

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          ...buildHistoryAuthHeaders(activeSelf),
          'content-type': file.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name),
          'x-file-created-at': encodeURIComponent(new Date().toISOString()),
        },
        body: file,
      })

      if (!response.ok) {
        throw new Error(`History upload failed with status ${response.status.toString()}`)
      }

      archivedHistoryIdsRef.current.add(historyId)
      debugLog('history archived', { transferId, historyId, roomId: session.roomId })
    } catch (error) {
      debugLog('history archive failed', { transferId, historyId, error })
    } finally {
      archivingHistoryIdsRef.current.delete(historyId)
    }
  }

  const updateTextRecordStatus = (recordId: string, status: TextRecord['status']) => {
    startTransition(() => {
      setTextRecords((previous) =>
        previous.map((record) =>
          record.id === recordId
            ? { ...record, status }
            : record,
        ),
      )
    })
  }

  const clearTextRecordStatusLater = (recordId: string, startedAt: number) => {
    const delay = Math.max(0, TEXT_SEND_STATUS_MIN_MS - (Date.now() - startedAt))
    window.setTimeout(() => {
      updateTextRecordStatus(recordId, undefined)
    }, delay)
  }

  const archiveTextHistory = async (record: TextRecord) => {
    if (
      archivedTextHistoryIdsRef.current.has(record.id) ||
      archivingTextHistoryIdsRef.current.has(record.id)
    ) {
      return
    }

    const session = sessionsRef.current[record.sessionId]
    const activeSelf = selfRef.current

    if (!session?.roomId || !activeSelf?.deviceId || !activeSelf.historyAuthToken) {
      return
    }

    archivingTextHistoryIdsRef.current.add(record.id)

    try {
      const response = await fetch(`${API_BASE_URL}/api/history/text`, {
        method: 'POST',
        headers: {
          ...buildHistoryAuthHeaders(activeSelf),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          historyId: record.id,
          roomId: session.roomId,
          sessionId: record.sessionId,
          text: record.text,
          createdAt: record.createdAt,
        }),
      })

      if (!response.ok) {
        throw new Error(`History text upload failed with status ${response.status.toString()}`)
      }

      archivedTextHistoryIdsRef.current.add(record.id)
      debugLog('text history archived', { recordId: record.id, roomId: session.roomId })
    } catch (error) {
      debugLog('text history archive failed', { recordId: record.id, error })
    } finally {
      archivingTextHistoryIdsRef.current.delete(record.id)
    }
  }

  const downloadHistoryFile = async (
    file: HistoryFileSummary,
    onProgress?: (progress: HistoryDownloadProgress) => void,
  ) => {
    const activeSelf = selfRef.current

    if (!activeSelf?.historyAuthToken) {
      throw new Error('当前设备尚未完成历史记录授权。')
    }

    const response = await fetch(new URL(file.downloadPath, API_BASE_URL), {
      headers: buildHistoryAuthHeaders(activeSelf),
    })

    if (!response.ok) {
      throw new Error(`History download failed with status ${response.status.toString()}`)
    }

    const contentLength = Number(response.headers.get('content-length'))
    const totalBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : file.size
    const contentType = response.headers.get('content-type') ?? file.mimeType ?? 'application/octet-stream'

    if (!response.body) {
      const blob = await response.blob()
      onProgress?.({
        receivedBytes: blob.size,
        totalBytes: totalBytes > 0 ? totalBytes : blob.size,
        progress: 1,
      })
      saveBlobAsDownload(blob, file.fileName)
      return
    }

    const reader = response.body.getReader()
    const chunks: ArrayBuffer[] = []
    let receivedBytes = 0
    let lastReportedPercent = -1
    const reportProgress = (force = false) => {
      const progress = totalBytes > 0 ? Math.min(receivedBytes / totalBytes, 1) : 0
      const percent = Math.round(progress * 100)

      if (!force && percent === lastReportedPercent) {
        return
      }

      lastReportedPercent = percent
      onProgress?.({
        receivedBytes,
        totalBytes: totalBytes > 0 ? totalBytes : receivedBytes,
        progress,
      })
    }

    reportProgress(true)

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        const chunk = new Uint8Array(value.byteLength)
        chunk.set(value)
        chunks.push(chunk.buffer)
        receivedBytes += value.byteLength
        reportProgress()
      }
    } finally {
      reader.releaseLock()
    }

    const blob = new Blob(chunks, { type: contentType })
    onProgress?.({
      receivedBytes: blob.size,
      totalBytes: totalBytes > 0 ? totalBytes : blob.size,
      progress: 1,
    })
    saveBlobAsDownload(blob, file.fileName)
  }

  const startTransfer = async (transferId: string, preferredSessionId?: string | null) => {
    const transfer = transferItemsRef.current.find((item) => item.id === transferId)
    if (!transfer) {
      return
    }

    const file = transferFilesRef.current.get(transferId)
    if (!file) {
      updateTransfer(transferId, {
        status: 'failed',
        errorMessage: '本地文件句柄已丢失，无法重试。',
      })
      return
    }

    const connectedTargets = getCurrentConnectedTargets()
    const target =
      transfer.sessionId
        ? connectedTargets.find((item) => item.sessionId === transfer.sessionId)
        : preferredSessionId
          ? connectedTargets.find((item) => item.sessionId === preferredSessionId)
          : connectedTargets[0]

    if (!target) {
      updateTransfer(transferId, {
        status:
          Object.values(connectionStatesRef.current).some((state) => state.status === 'connecting')
            ? 'connecting'
            : 'waiting_for_target',
        errorMessage: undefined,
      })
      return
    }

    const channel = dataChannelsRef.current.get(target.sessionId)
    if (!channel || channel.readyState !== 'open') {
      updateTransfer(transferId, {
        status: 'connecting',
        sessionId: target.sessionId,
        targetDeviceId: target.peerId,
        targetDeviceName: target.peerName,
      })
      return
    }

    updateTransfer(transferId, {
      status: 'ready',
      sessionId: target.sessionId,
      targetDeviceId: target.peerId,
      targetDeviceName: target.peerName,
      errorMessage: undefined,
    })

    debugLog('selected target device', {
      transferId,
      peerId: target.peerId,
      peerName: target.peerName,
    })

    try {
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
      const createdAt = new Date().toISOString()

      const resume = await waitForTransferResume(
        transferId,
        () => {
          channel.send(
            JSON.stringify({
              type: 'file-meta',
              id: transferId,
              historyId: transfer.historyId,
              name: file.name,
              size: file.size,
              mimeType: file.type || undefined,
              chunkSize: CHUNK_SIZE,
              createdAt,
            } satisfies ChannelMessage),
          )
        },
      )
      const startIndex = Math.min(Math.max(resume.nextIndex, 0), totalChunks)
      let sentBytes = Math.min(startIndex * CHUNK_SIZE, file.size)

      updateTransfer(transferId, {
        status: 'transferring',
        progress: file.size > 0 ? sentBytes / file.size : 0,
        sentBytes,
        acknowledgedBytes: Math.min(resume.receivedBytes, file.size),
        startedAt: new Date().toISOString(),
        sessionId: target.sessionId,
        targetDeviceId: target.peerId,
        targetDeviceName: target.peerName,
      })
      debugLog('state transition', { transferId, status: 'transferring' })

      for (let index = startIndex; index < totalChunks; index += 1) {
        const currentTransfer = transferItemsRef.current.find((item) => item.id === transferId)
        if (currentTransfer?.status === 'cancelled') {
          throw new Error('传输已取消。')
        }

        const slice = file.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
        const buffer = await slice.arrayBuffer()
        sentBytes += buffer.byteLength

        channel.send(
          encodeBinaryChunkMessage(
            {
              type: 'file-chunk-binary',
              id: transferId,
              index,
              total: totalChunks,
            },
            buffer,
          ),
        )

        updateTransfer(transferId, {
          status: 'transferring',
          sentBytes,
          progress: sentBytes / file.size,
        })
        debugLog('bytes sent', { transferId, sentBytes, totalBytes: file.size })

        await waitForBufferedAmount(channel)
      }

      channel.send(
        JSON.stringify({
          type: 'file-complete',
          id: transferId,
        } satisfies ChannelMessage),
      )
      debugLog('file completion sent', { transferId })

      const currentTransfer = transferItemsRef.current.find((item) => item.id === transferId)
      if (currentTransfer?.status === 'cancelled') {
        throw new Error('传输已取消。')
      }

      const ack = await new Promise<ChannelMessage & { type: 'file-ack' }>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          transferAckWaitersRef.current.delete(transferId)
          reject(new Error('等待接收端确认超时。'))
        }, 15_000)

        transferAckWaitersRef.current.set(transferId, {
          resolve,
          reject,
          timeoutId,
        })
      })

      updateTransfer(transferId, {
        status: ack.completed ? 'completed' : 'failed',
        progress: ack.completed ? 1 : transfer.progress,
        acknowledgedBytes: ack.receivedBytes,
        completedAt: ack.completed ? new Date().toISOString() : undefined,
        errorMessage: ack.completed ? undefined : '接收端未完成确认。',
      })
      if (ack.completed) {
        void archiveTransferHistory(
          transferId,
          transfer.historyId,
          target.sessionId,
          file,
        )
      }
      debugLog('state transition', {
        transferId,
        status: ack.completed ? 'completed' : 'failed',
      })
    } catch (error) {
      updateTransfer(transferId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : '传输失败。',
      })
      debugLog('failure reason', { transferId, error })
    }
  }

  const startPendingTransfers = async (
    preferredTransferIds?: string[],
    preferredSessionId?: string | null,
  ) => {
    const candidates = transferItemsRef.current.filter((item) => {
      if (preferredTransferIds && !preferredTransferIds.includes(item.id)) {
        return false
      }

      return ['queued', 'waiting_for_target', 'connecting', 'ready', 'failed'].includes(item.status)
    })

    for (const item of candidates) {
      await startTransfer(item.id, preferredSessionId)
    }
  }

  const requestSnapshot = () => {
    sendEvent({
      type: 'request-snapshot',
      payload: undefined,
    })
  }

  const pairByShortCode = (shortCode: string) => {
    sendEvent({
      type: 'pair-by-short-code',
      payload: {
        shortCode: shortCode.trim().toUpperCase(),
      },
    })
  }

  const joinRoom = (roomId: string) => {
    sendEvent({
      type: 'join-room',
      payload: {
        roomId: roomId.trim(),
      },
    })
  }

  const createPublicRoom = () => {
    sendEvent({
      type: 'create-public-room',
      payload: undefined,
    })
  }

  const requestConnect = (
    targetDeviceId: string,
    options: PairReason | { reason?: PairReason; createNewRoom?: boolean } = 'manual',
  ) => {
    const normalizedOptions = typeof options === 'string' ? { reason: options } : options

    sendEvent({
      type: 'request-connect',
      payload: {
        targetDeviceId,
        reason: normalizedOptions.reason ?? 'manual',
        createNewRoom: normalizedOptions.createNewRoom,
      },
    })
  }

  const disconnectSession = (sessionId: string) => {
    const peerConnection = peerConnectionsRef.current.get(sessionId)
    const dataChannel = dataChannelsRef.current.get(sessionId)
    const session = sessionsRef.current[sessionId]
    const peerId = session?.peer?.deviceId ?? session?.peerId
    const peerName = session?.peer?.deviceName ?? session?.peerId ?? '对方设备'
    const reason = session?.reason ?? 'manual'

    try {
      dataChannel?.close()
    } catch {
      // Ignore close failures to keep local state consistent.
    }

    try {
      peerConnection?.close()
    } catch {
      // Ignore close failures to keep local state consistent.
    }

    dataChannelsRef.current.delete(sessionId)
    peerConnectionsRef.current.delete(sessionId)
    pendingIceCandidatesRef.current.delete(sessionId)

    if (peerId) {
      updateConnectionState(sessionId, {
        peerId,
        peerName,
        reason,
        status: 'closed',
      })

      sendEvent({
        type: 'session-state',
        payload: {
          sessionId,
          targetDeviceId: peerId,
          state: 'closed',
        },
      })
    }

    mergeSession(sessionId, {
      state: 'closed',
      channelState: 'closed',
    })
  }

  const updateSettings = (patch: Partial<DeviceSettingsPayload>) => {
    const nextIdentity: StoredIdentity = {
      ...identityRef.current,
      ...patch,
    }

    identityRef.current = nextIdentity
    writeStoredIdentity(nextIdentity)
    setLocalIdentity(nextIdentity)

    startTransition(() => {
      setSelf((previous) =>
        previous
          ? {
              ...previous,
              ...patch,
            }
          : previous,
      )
    })

    sendEvent({
      type: 'update-settings',
      payload: {
        deviceName: nextIdentity.deviceName,
        platform: nextIdentity.platform,
        accountId: nextIdentity.accountId,
        autoConnect: nextIdentity.autoConnect,
        discoverable: nextIdentity.discoverable,
        allowShortCode: nextIdentity.allowShortCode,
      },
    })
  }

  const updateRoomState = (payload: { roomId: string; pinned?: boolean; lastReadAt?: string }) => {
    setRoomStates((current) => {
      const existing = current.find((state) => state.roomId === payload.roomId)
      if (existing) {
        return current.map((state) =>
          state.roomId === payload.roomId
            ? {
                ...state,
                ...payload,
                pinned: payload.pinned ?? state.pinned,
              }
            : state,
        )
      }

      return [
        ...current,
        {
          roomId: payload.roomId,
          pinned: payload.pinned ?? false,
          lastReadAt: payload.lastReadAt,
        },
      ]
    })

    sendEvent({
      type: 'update-room-state',
      payload,
    })
  }

  const updatePreferences = (patch: Partial<DevicePreferencesPayload>) => {
    setPreferences((current) => ({
      ...current,
      ...patch,
    }))

    sendEvent({
      type: 'update-preferences',
      payload: patch,
    })
  }

  const waitForBufferedAmount = async (channel: RTCDataChannel) => {
    if (channel.bufferedAmount < CHANNEL_BUFFER_HIGH_WATER) {
      return
    }

    await new Promise<void>((resolve) => {
      channel.bufferedAmountLowThreshold = CHANNEL_BUFFER_LOW_WATER
      const flush = () => {
        channel.removeEventListener('bufferedamountlow', flush)
        resolve()
      }

      channel.addEventListener('bufferedamountlow', flush)
    })
  }

  const waitForTransferResume = async (
    transferId: string,
    sendMetadata: () => void,
  ) => {
    const resumePromise = new Promise<ChannelMessage & { type: 'file-resume' }>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        transferResumeWaitersRef.current.delete(transferId)
        resolve({
          type: 'file-resume',
          id: transferId,
          receivedBytes: 0,
          nextIndex: 0,
        })
      }, 5_000)

      transferResumeWaitersRef.current.set(transferId, {
        resolve,
        timeoutId,
      })
    })

    sendMetadata()
    return resumePromise
  }

  const sendText = async (
    sessionId: string,
    text: string,
    options?: { logLocalRecord?: boolean; recordId?: string; createdAt?: string },
  ) => {
    const channel = dataChannelsRef.current.get(sessionId)
    if (!channel || channel.readyState !== 'open') {
      throw new Error('当前会话还没有建立可用的数据通道。')
    }

    const record: TextRecord = {
      id: options?.recordId ?? crypto.randomUUID(),
      sessionId,
      roomId: sessionsRef.current[sessionId]?.roomId,
      fromSelf: true,
      status: 'sending',
      text,
      createdAt: options?.createdAt ?? new Date().toISOString(),
    }
    const startedAt = Date.now()

    channel.send(
      JSON.stringify({
        type: 'text',
        id: record.id,
        text: record.text,
        createdAt: record.createdAt,
      } satisfies ChannelMessage),
    )

    if (options?.logLocalRecord !== false) {
      startTransition(() => {
        setTextRecords((previous) => [...previous, record])
      })
      clearTextRecordStatusLater(record.id, startedAt)
    }

    void archiveTextHistory(record)

    mergeSession(sessionId, { kind: 'text' })
  }

  const sendRoomText = async (
    roomId: string,
    text: string,
    options?: { recordId?: string; createdAt?: string },
  ) => {
    const activeSelf = selfRef.current
    const historyId = options?.recordId ?? crypto.randomUUID()
    const createdAt = options?.createdAt ?? new Date().toISOString()

    if (!activeSelf?.deviceId || !activeSelf.historyAuthToken) {
      throw new Error('当前设备尚未完成历史记录授权。')
    }

    if (
      archivedTextHistoryIdsRef.current.has(historyId) ||
      archivingTextHistoryIdsRef.current.has(historyId)
    ) {
      return
    }

    archivingTextHistoryIdsRef.current.add(historyId)
    const startedAt = Date.now()
    startTransition(() => {
      setTextRecords((previous) =>
        previous.some((record) => record.id === historyId)
          ? previous.map((record) =>
              record.id === historyId
                ? { ...record, status: 'sending' as const }
                : record,
            )
          : [
              ...previous,
              {
                id: historyId,
                sessionId: '',
                roomId,
                fromSelf: true,
                senderName: activeSelf.deviceName,
                status: 'sending' as const,
                text,
                createdAt,
              },
            ],
      )
    })

    try {
      const postRoomText = (requestSelf: DirectorySnapshotPayload['self']) => fetch(`${API_BASE_URL}/api/history/text`, {
        method: 'POST',
        headers: {
          ...buildHistoryAuthHeaders(requestSelf),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          historyId,
          roomId,
          text,
          createdAt,
        }),
      })
      let response = await postRoomText(activeSelf)

      if (response.status === 401 || response.status === 403) {
        requestSnapshot()
        await delay(1_200)

        const refreshedSelf = selfRef.current
        if (refreshedSelf?.historyAuthToken && refreshedSelf.historyAuthToken !== activeSelf.historyAuthToken) {
          response = await postRoomText(refreshedSelf)
        }
      }

      if (!response.ok) {
        const responseError = await readResponseError(response)
        throw new Error(`消息发送失败：${response.status.toString()} ${responseError || '服务拒绝了这条消息。'}`)
      }

      const payload = await response.json() as { text?: HistoryTextSummary }
      const summary = payload.text ?? {
        historyId,
        roomId,
        isPublic: true,
        sourceDeviceId: activeSelf.deviceId,
        sourceDeviceName: activeSelf.deviceName,
        text,
        createdAt,
      }

      archivedTextHistoryIdsRef.current.add(historyId)
      startTransition(() => {
        setHistoryTexts((previous) =>
          previous.some((record) => record.historyId === historyId)
            ? previous
            : [...previous, summary],
        )
      })
      clearTextRecordStatusLater(historyId, startedAt)
      debugLog('room text archived', { historyId, roomId })
    } catch (error) {
      startTransition(() => {
        setTextRecords((previous) =>
          previous.map((record) =>
            record.id === historyId
              ? { ...record, status: 'failed' as const }
              : record,
          ),
        )
      })
      throw error
    } finally {
      archivingTextHistoryIdsRef.current.delete(historyId)
    }
  }

  const recallText = async (recordId: string) => {
    const activeSelf = selfRef.current
    const localRecord = textRecordsRef.current.find((record) => record.id === recordId)
    const historyRecord = historyTextsRef.current.find((record) => record.historyId === recordId)

    if (localRecord && !localRecord.fromSelf) {
      throw new Error('只能撤回自己发送的消息。')
    }

    if (historyRecord && historyRecord.sourceDeviceId !== activeSelf?.deviceId) {
      throw new Error('只能撤回自己发送的消息。')
    }

    const roomId = localRecord?.roomId ?? historyRecord?.roomId
    const directSessionId = localRecord?.sessionId || historyRecord?.sessionId
    const recallMessage: ChannelMessage = {
      type: 'text-recall',
      id: recordId,
      createdAt: new Date().toISOString(),
    }
    const targetSessionIds = new Set<string>()

    if (roomId) {
      for (const session of Object.values(sessionsRef.current)) {
        if (session.roomId === roomId) {
          targetSessionIds.add(session.sessionId)
        }
      }
    }

    if (directSessionId) {
      targetSessionIds.add(directSessionId)
    }

    for (const sessionId of targetSessionIds) {
      const channel = dataChannelsRef.current.get(sessionId)
      if (channel?.readyState === 'open') {
        channel.send(JSON.stringify(recallMessage))
      }
    }

    if (activeSelf?.historyAuthToken) {
      const response = await fetch(`${API_BASE_URL}/api/history/text/${encodeURIComponent(recordId)}`, {
        method: 'DELETE',
        headers: buildHistoryAuthHeaders(activeSelf),
      })

      if (!response.ok && response.status !== 404) {
        throw new Error(`History text recall failed with status ${response.status.toString()}`)
      }
    }

    archivedTextHistoryIdsRef.current.delete(recordId)
    archivingTextHistoryIdsRef.current.delete(recordId)
    startTransition(() => {
      setTextRecords((previous) => previous.filter((record) => record.id !== recordId))
      setHistoryTexts((previous) => previous.filter((record) => record.historyId !== recordId))
    })
  }

  const askCloudflareAi = async (
    prompt: string,
    options?: {
      roomId?: string
      replyToName?: string
      kind?: 'chat' | 'quota'
      historyId?: string
      createdAt?: string
    },
  ): Promise<AiChatResponse> => {
    const activeSelf = selfRef.current
    const normalizedPrompt = prompt.trim()

    if (!activeSelf?.historyAuthToken) {
      throw new Error('当前设备尚未完成 AI 请求授权。')
    }

    if (!normalizedPrompt) {
      throw new Error('请输入要交给 AI 的内容。')
    }

    const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        ...buildHistoryAuthHeaders(activeSelf),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prompt: normalizedPrompt,
        roomId: options?.roomId,
        replyToName: options?.replyToName,
        kind: options?.kind,
        historyId: options?.historyId,
        createdAt: options?.createdAt,
      }),
    })

    if (!response.ok) {
      throw new Error(
        await readApiError(
          response,
          `Cloudflare AI request failed with status ${response.status.toString()}`,
        ),
      )
    }

    const payload = await response.json() as Partial<AiChatResponse>
    if (typeof payload.response !== 'string' || !payload.response.trim()) {
      throw new Error('Cloudflare AI 返回了空结果。')
    }

    return {
      response: payload.response,
      model: typeof payload.model === 'string' ? payload.model : '',
      quota: payload.quota,
      historyText: payload.historyText,
    }
  }

  const getCloudflareAiQuota = useCallback(async (): Promise<AiQuotaStatus> => {
    const activeSelf = selfRef.current

    if (!activeSelf?.historyAuthToken) {
      throw new Error('当前设备尚未完成 AI 请求授权。')
    }

    const response = await fetch(`${API_BASE_URL}/api/ai/quota`, {
      headers: buildHistoryAuthHeaders(activeSelf),
    })

    if (!response.ok) {
      throw new Error(
        await readApiError(
          response,
          `Cloudflare AI quota request failed with status ${response.status.toString()}`,
        ),
      )
    }

    return response.json() as Promise<AiQuotaStatus>
  }, [])

  const uploadRoomFileChunk = async (input: {
    roomId: string
    historyId: string
    file: File
    activeSelf: DirectorySnapshotPayload['self']
    createdAt: string
    start?: number
    end?: number
  }): Promise<
    | { complete: false; offset: number }
    | { complete: true; offset: number; file: HistoryFileSummary }
  > => {
    const uploadUrl = new URL('/api/history/upload', API_BASE_URL)
    uploadUrl.searchParams.set('roomId', input.roomId)
    uploadUrl.searchParams.set('historyId', input.historyId)

    const headers: Record<string, string> = {
      ...buildHistoryAuthHeaders(input.activeSelf),
      'content-type': input.file.type || 'application/octet-stream',
      'x-file-name': encodeURIComponent(input.file.name),
      'x-file-created-at': encodeURIComponent(input.createdAt),
    }
    const body =
      input.start === undefined || input.end === undefined
        ? input.file
        : input.file.slice(input.start, input.end)

    if (input.start !== undefined && input.end !== undefined) {
      headers['content-range'] = `bytes ${input.start.toString()}-${(input.end - 1).toString()}/${input.file.size.toString()}`
    }

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers,
      body,
    })
    const payload = await response.json().catch(() => ({})) as {
      offset?: number
      complete?: boolean
      file?: HistoryFileSummary
    }

    if (response.status === 409 && typeof payload.offset === 'number') {
      return {
        complete: false,
        offset: Math.min(Math.max(payload.offset, 0), input.file.size),
      }
    }

    if (!response.ok) {
      throw new Error(`History upload failed with status ${response.status.toString()}`)
    }

    if (payload.file) {
      return {
        complete: true,
        offset: payload.offset ?? payload.file.size,
        file: payload.file,
      }
    }

    return {
      complete: false,
      offset: Math.min(Math.max(payload.offset ?? input.end ?? input.file.size, 0), input.file.size),
    }
  }

  const sendRoomFiles = async (roomId: string, files: Array<{ id: string; file: File }>) => {
    const activeSelf = selfRef.current

    if (!activeSelf?.deviceId || !activeSelf.historyAuthToken) {
      throw new Error('当前设备尚未完成历史记录授权。')
    }

    for (const item of files) {
      const historyId = item.id
      const file = item.file
      const createdAt = new Date().toISOString()

      if (archivedHistoryIdsRef.current.has(historyId) || archivingHistoryIdsRef.current.has(historyId)) {
        continue
      }

      const existingTransfer = transferItemsRef.current.find((transfer) => transfer.id === historyId)
      const previewUrl = existingTransfer?.previewUrl ?? (
        isPreviewableMediaType(file.type || undefined)
          ? URL.createObjectURL(file)
          : undefined
      )

      if (previewUrl && !existingTransfer?.previewUrl) {
        objectUrlsRef.current.push(previewUrl)
      }

      const transferItem: TransferItem = {
        ...(existingTransfer ?? {
          id: historyId,
          historyId,
          fileName: file.name,
          fileSize: file.size,
          fileMimeType: file.type || undefined,
          previewUrl,
          progress: 0,
          sentBytes: 0,
          acknowledgedBytes: 0,
          createdAt,
        }),
        roomId,
        targetDeviceName: '服务器中转',
        status: 'transferring',
        errorMessage: undefined,
        startedAt: existingTransfer?.startedAt ?? createdAt,
      }

      transferFilesRef.current.set(historyId, file)
      transferItemsRef.current = [
        transferItem,
        ...transferItemsRef.current.filter((transfer) => transfer.id !== historyId),
      ]
      startTransition(() => {
        setTransferItems((previous) => [
          transferItem,
          ...previous.filter((transfer) => transfer.id !== historyId),
        ])
      })

      archivingHistoryIdsRef.current.add(historyId)

      try {
        let offset = 0
        let uploadedSummary: HistoryFileSummary | undefined

        if (file.size === 0) {
          const next = await uploadRoomFileChunk({
            roomId,
            historyId,
            file,
            activeSelf,
            createdAt,
          })
          if (next.complete) {
            uploadedSummary = next.file
          }
          updateTransfer(historyId, {
            status: next.complete ? 'completed' : 'transferring',
            sentBytes: next.offset,
            acknowledgedBytes: next.offset,
            progress: 1,
            completedAt: next.complete ? new Date().toISOString() : undefined,
          })
        } else {
          while (offset < file.size) {
            const end = Math.min(offset + SERVER_UPLOAD_CHUNK_SIZE, file.size)
            const next = await uploadRoomFileChunk({
              roomId,
              historyId,
              file,
              activeSelf,
              createdAt,
              start: offset,
              end,
            })

            if (next.complete) {
              uploadedSummary = next.file
              updateTransfer(historyId, {
                status: 'completed',
                sentBytes: next.offset,
                acknowledgedBytes: next.offset,
                progress: 1,
                completedAt: new Date().toISOString(),
              })
              break
            }

            if (next.offset <= offset) {
              throw new Error('服务器没有接受新的文件分片。')
            }

            offset = next.offset
            updateTransfer(historyId, {
              status: 'transferring',
              sentBytes: offset,
              acknowledgedBytes: offset,
              progress: file.size > 0 ? offset / file.size : 1,
            })
          }
        }

        const summary = uploadedSummary ?? {
          historyId,
          roomId,
          isPublic: true,
          sourceDeviceId: activeSelf.deviceId,
          sourceDeviceName: activeSelf.deviceName,
          fileName: file.name,
          size: file.size,
          mimeType: file.type || undefined,
          createdAt,
          downloadPath: `/api/history/download/${encodeURIComponent(historyId)}`,
        }

        archivedHistoryIdsRef.current.add(historyId)
        startTransition(() => {
          setHistoryFiles((previous) =>
            previous.some((record) => record.historyId === historyId)
              ? previous
              : [...previous, summary],
          )
        })
        debugLog('room file archived', { historyId, roomId, fileName: file.name })
      } catch (error) {
        updateTransfer(historyId, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : '服务器中转上传失败。',
        })
        throw error
      } finally {
        archivingHistoryIdsRef.current.delete(historyId)
      }
    }
  }

  const sendFiles = async (sessionId: string, files: File[]) => {
    const channel = dataChannelsRef.current.get(sessionId)
    if (!channel || channel.readyState !== 'open') {
      throw new Error('当前会话还没有建立可用的数据通道。')
    }

    for (const file of files) {
      const transferId = crypto.randomUUID()
      const historyId = crypto.randomUUID()
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
      const createdAt = new Date().toISOString()

      channel.send(
        JSON.stringify({
          type: 'file-meta',
          id: transferId,
          historyId,
          name: file.name,
          size: file.size,
          mimeType: file.type || undefined,
          chunkSize: CHUNK_SIZE,
          createdAt,
        } satisfies ChannelMessage),
      )

      for (let index = 0; index < totalChunks; index += 1) {
        const slice = file.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
        const buffer = await slice.arrayBuffer()

        channel.send(
          encodeBinaryChunkMessage(
            {
              type: 'file-chunk-binary',
              id: transferId,
              index,
              total: totalChunks,
            },
            buffer,
          ),
        )

        await waitForBufferedAmount(channel)
      }

      channel.send(
        JSON.stringify({
          type: 'file-complete',
          id: transferId,
        } satisfies ChannelMessage),
      )
    }

    mergeSession(sessionId, { kind: 'file' })
  }

  return {
    socketState,
    self,
    localIdentity,
    onlinePeers,
    rooms: Object.values(roomsById).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    ),
    roomStates,
    preferences,
    sessions: Object.values(sessionsById).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    ),
    connectionStates: connectionStatesById,
    connectedTargets,
    transferItems,
    textRecords,
    receivedFiles,
    historyFiles,
    historyTexts,
    errorMessage,
    lastCreatedPublicRoomId,
    pairByShortCode,
    joinRoom,
    createPublicRoom,
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
    askCloudflareAi,
    getCloudflareAiQuota,
    sendRoomFiles,
    sendFiles,
    stateToUiStatus,
    reasonLabel,
  }
}
