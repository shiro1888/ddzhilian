import { startTransition, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import type {
  AiChatImageInput,
  AiChatConversationRecord,
  AiChatConversationSyncResponse,
  AiChatResponse,
  AiImageHistoryPage,
  AiImageHistoryRequestOptions,
  AiImageJobResponse,
  AiImageQuotaResponse,
  AiImageRequestInput,
  AiImageResponse,
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
  OcrHistoryResponse,
  OcrJobResponse,
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
const DATA_CHANNEL_HEARTBEAT_INTERVAL_MS = 1_000
const TEXT_SEND_STATUS_MIN_MS = 900
const HISTORY_PAGE_SIZE = 50
const HISTORY_AUTH_EXPIRED_MESSAGE = '连接凭证已失效，正在重新连接，请稍后重试。'
const IMAGE_JOB_POLL_INTERVAL_MS = 2_000
const IMAGE_JOB_POLL_TIMEOUT_MS = 15 * 60 * 1000
const OCR_JOB_POLL_INTERVAL_MS = 1_000
const OCR_JOB_POLL_TIMEOUT_MS = 60_000
const binaryChunkEncoder = new TextEncoder()
const binaryChunkDecoder = new TextDecoder()

type RecallHistoryOptions = {
  canRecallAny?: boolean
}

function readPublicEnv(name: 'SIGNALING_WS_URL' | 'SIGNALING_HTTP_URL') {
  const env = process.env as Record<string, string | undefined>
  return env[`NEXT_PUBLIC_${name}`]?.trim() || ''
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function resolveWsUrl() {
  const configuredUrl = readPublicEnv('SIGNALING_WS_URL')
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
  const configuredUrl = readPublicEnv('SIGNALING_HTTP_URL')
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
  const message = typeof payload?.error === 'string' && payload.error.trim()
    ? payload.error
    : fallback

  return normalizeApiErrorMessage(message)
}

function normalizeApiErrorMessage(message: string) {
  return message === 'Missing bearer token.' || message === 'Invalid bearer token.'
    ? HISTORY_AUTH_EXPIRED_MESSAGE
    : message
}

function isHistoryAuthExpiredError(status: number, message: string) {
  return status === 401 && message === HISTORY_AUTH_EXPIRED_MESSAGE
}

type HistoryDownloadProgress = {
  receivedBytes: number
  totalBytes: number
  progress: number
}

type HistoryTextPaginationState = {
  initialized: boolean
  isLoading: boolean
  hasMore: boolean
  oldestCreatedAt?: string
  oldestHistoryId?: string
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
const legacyDevicePlatformNames = new Set(['web', 'mobile', 'tablet'])

function debugLog(...parts: unknown[]) {
  if (process.env.NODE_ENV === 'development') {
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

function normalizeStoredDevicePlatform(value: string | undefined, fallback: string) {
  const platform = value?.trim().toLowerCase()
  if (!platform || legacyDevicePlatformNames.has(platform)) {
    return fallback
  }

  return platform
}

function getDefaultIdentity(): StoredIdentity {
  const system = detectSystemName()
  const deviceName = createGeneratedDeviceName(system)

  return {
    deviceName,
    platform: system,
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
    const next: StoredIdentity = {
      ...parsed,
      platform: normalizeStoredDevicePlatform(parsed.platform, fallback.platform),
    }
    let shouldPersist = next.platform !== parsed.platform

    if (!next.deviceName || isLegacyGeneratedName(next.deviceName)) {
      next.deviceName = fallback.deviceName
      shouldPersist = true
    }

    if (shouldPersist) {
      writeStoredIdentity(next)
    }

    return next
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
    case 'bot-chat':
      return 'DD直连小助手'
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
  const [historyTextPaginationByRoomId, setHistoryTextPaginationByRoomId] = useState<
    Record<string, HistoryTextPaginationState>
  >({})
  const [sessionsById, setSessionsById] = useState<Record<string, LiveSession>>({})
  const [connectionStatesById, setConnectionStatesById] = useState<Record<string, PeerConnectionState>>({})
  const [textRecords, setTextRecords] = useState<TextRecord[]>([])
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([])
  const [transferItems, setTransferItems] = useState<TransferItem[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastCreatedPublicRoomId, setLastCreatedPublicRoomId] = useState<string | null>(null)
  const [lastCreatedPrivateRoomId, setLastCreatedPrivateRoomId] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const connectSocketRef = useRef<(() => void) | null>(null)
  const reconnectCallbacksRef = useRef<Array<() => void>>([])
  const identityRef = useRef<StoredIdentity>(localIdentity)
  const selfRef = useRef<DirectorySnapshotPayload['self'] | null>(null)
  const roomsByIdRef = useRef<Record<string, RoomSummary>>({})
  const restorablePublicRoomIdRef = useRef<string | null>(null)
  const rtcConfigRef = useRef<RTCConfiguration | null>(null)
  const peerConnectionsRef = useRef(new Map<string, RTCPeerConnection>())
  const dataChannelsRef = useRef(new Map<string, RTCDataChannel>())
  const dataChannelHeartbeatIntervalsRef = useRef(new Map<string, number>())
  const sessionsRef = useRef<Record<string, LiveSession>>({})
  const connectionStatesRef = useRef<Record<string, PeerConnectionState>>({})
  const transferItemsRef = useRef<TransferItem[]>([])
  const textRecordsRef = useRef<TextRecord[]>([])
  const receivedFilesRef = useRef<ReceivedFile[]>([])
  const historyFilesRef = useRef<HistoryFileSummary[]>([])
  const historyTextsRef = useRef<HistoryTextSummary[]>([])
  const historyTextPaginationRef = useRef<Record<string, HistoryTextPaginationState>>({})
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

  const reconnectSocket = useCallback((afterReconnect?: () => void) => {
    reconnectCallbacksRef.current = afterReconnect ? [afterReconnect] : []

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    const socket = socketRef.current
    if (socket) {
      socketRef.current = null

      try {
        socket.close()
      } catch {
        // Closing is best effort; the new signaling socket is created below.
      }
    }

    connectSocketRef.current?.()
  }, [])

  useEffect(() => {
    selfRef.current = self
  }, [self])

  useEffect(() => {
    roomsByIdRef.current = roomsById
  }, [roomsById])

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
    receivedFilesRef.current = receivedFiles
  }, [receivedFiles])

  useEffect(() => {
    historyFilesRef.current = historyFiles
  }, [historyFiles])

  useEffect(() => {
    historyTextsRef.current = historyTexts
  }, [historyTexts])

  useEffect(() => {
    historyTextPaginationRef.current = historyTextPaginationByRoomId
  }, [historyTextPaginationByRoomId])

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

  const sendJoinRoomEvent = (roomId: string) => {
    const normalizedRoomId = roomId.trim()
    if (!normalizedRoomId) {
      return
    }

    sendEvent({
      type: 'join-room',
      payload: {
        roomId: normalizedRoomId,
      },
    })
  }

  const trackPublicRoomFromSnapshot = (snapshot: DirectorySnapshotPayload) => {
    const publicRoom = snapshot.rooms.find((room) => room.isPublic)
    if (publicRoom) {
      restorablePublicRoomIdRef.current = publicRoom.roomId
    }
  }

  const restorePublicRoomMembership = (snapshot: DirectorySnapshotPayload) => {
    const publicRoom = snapshot.rooms.find((room) => room.isPublic)
    const roomId = publicRoom?.roomId ?? restorablePublicRoomIdRef.current
    if (!roomId) {
      return
    }

    if (publicRoom?.members.some((member) => member.deviceId === snapshot.self.deviceId)) {
      return
    }

    sendJoinRoomEvent(roomId)
  }

  const isHistoryAuthExpiredResponse = async (response: Response) => {
    if (response.status !== 401) {
      return false
    }

    try {
      const message = await readApiError(response.clone(), HISTORY_AUTH_EXPIRED_MESSAGE)
      return isHistoryAuthExpiredError(response.status, message)
    } catch {
      return false
    }
  }

  const waitForHistoryAuthorizationRefresh = (roomId?: string) =>
    new Promise<DirectorySnapshotPayload['self'] | null>((resolve) => {
      let settled = false
      const timeoutId = window.setTimeout(() => {
        if (settled) {
          return
        }

        settled = true
        resolve(selfRef.current)
      }, 6_000)

      reconnectSocket(() => {
        if (roomId) {
          sendJoinRoomEvent(roomId)
        }

        sendEvent({
          type: 'request-snapshot',
          payload: undefined,
        })

        window.setTimeout(() => {
          if (settled) {
            return
          }

          settled = true
          window.clearTimeout(timeoutId)
          resolve(selfRef.current)
        }, 150)
      })
    })

  const fetchWithHistoryAuthRetry = async (
    createRequest: (requestSelf: DirectorySnapshotPayload['self']) => Promise<Response>,
    options?: {
      roomId?: string
    },
  ) => {
    const requestSelf = selfRef.current
    if (!requestSelf?.historyAuthToken) {
      return {
        response: null,
        self: null,
      }
    }

    let response = await createRequest(requestSelf)
    let responseSelf = requestSelf
    if (await isHistoryAuthExpiredResponse(response)) {
      const refreshedSelf = await waitForHistoryAuthorizationRefresh(options?.roomId)
      if (refreshedSelf?.historyAuthToken) {
        responseSelf = refreshedSelf
        response = await createRequest(refreshedSelf)
      }
    }

    return {
      response,
      self: responseSelf,
    }
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

  const mergeHistoryTexts = (
    previous: HistoryTextSummary[],
    roomId: string,
    nextTexts: HistoryTextSummary[],
    replaceRoom: boolean,
  ) => {
    const base = replaceRoom
      ? previous.filter((record) => record.roomId !== roomId)
      : previous.slice()
    const textById = new Map(base.map((record) => [record.historyId, record] as const))

    for (const record of nextTexts) {
      textById.set(record.historyId, record)
    }

    return [...textById.values()].sort(
      (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
    )
  }

  const fetchRoomHistoryTexts = async (
    roomId: string,
    mode: 'initial' | 'older',
    options?: {
      roomSummary?: RoomSummary
    },
  ) => {
    const requestSelf = selfRef.current
    const room = options?.roomSummary ?? roomsById[roomId]

    if (!requestSelf?.historyAuthToken || !room) {
      return
    }

    const currentState = historyTextPaginationRef.current[roomId]
    if (currentState?.isLoading) {
      return
    }

    if (mode === 'older' && (!currentState?.initialized || !currentState.hasMore)) {
      return
    }

    if (mode === 'initial' && room.historyTextCount === 0) {
      startTransition(() => {
        setHistoryTexts((previous) => previous.filter((record) => record.roomId !== roomId))
        setHistoryTextPaginationByRoomId((previous) => ({
          ...previous,
          [roomId]: {
            initialized: true,
            isLoading: false,
            hasMore: false,
          },
        }))
      })
      return
    }

    startTransition(() => {
      setHistoryTextPaginationByRoomId((previous) => ({
        ...previous,
        [roomId]: {
          initialized: currentState?.initialized ?? false,
          isLoading: true,
          hasMore: currentState?.hasMore ?? room.historyTextCount > 0,
          oldestCreatedAt: currentState?.oldestCreatedAt,
          oldestHistoryId: currentState?.oldestHistoryId,
        },
      }))
    })

    try {
      const url = new URL('/api/history/text', API_BASE_URL)
      url.searchParams.set('roomId', roomId)
      url.searchParams.set('limit', HISTORY_PAGE_SIZE.toString())

      if (mode === 'older' && currentState?.oldestCreatedAt && currentState.oldestHistoryId) {
        url.searchParams.set('beforeCreatedAt', currentState.oldestCreatedAt)
        url.searchParams.set('beforeHistoryId', currentState.oldestHistoryId)
      }

      const response = await fetch(url, {
        headers: buildHistoryAuthHeaders(requestSelf),
      })

      if (!response.ok) {
        throw new Error(`历史文本拉取失败：${response.status.toString()} ${await readResponseError(response)}`)
      }

      const payload = await response.json() as {
        texts?: HistoryTextSummary[]
        hasMore?: boolean
        nextCursor?: {
          createdAt?: string
          historyId?: string
        }
      }
      const nextTexts = payload.texts ?? []
      startTransition(() => {
        setHistoryTexts((previous) => mergeHistoryTexts(previous, roomId, nextTexts, mode === 'initial'))
        setHistoryTextPaginationByRoomId((previous) => ({
          ...previous,
          [roomId]: {
            initialized: true,
            isLoading: false,
            hasMore: payload.hasMore === true,
            oldestCreatedAt: payload.nextCursor?.createdAt,
            oldestHistoryId: payload.nextCursor?.historyId,
          },
        }))
      })
      archivedTextHistoryIdsRef.current = new Set([
        ...archivedTextHistoryIdsRef.current,
        ...nextTexts.map((record) => record.historyId),
      ])
    } catch (error) {
      startTransition(() => {
        setHistoryTextPaginationByRoomId((previous) => ({
          ...previous,
          [roomId]: {
            initialized: currentState?.initialized ?? false,
            isLoading: false,
            hasMore: currentState?.hasMore ?? room.historyTextCount > 0,
            oldestCreatedAt: currentState?.oldestCreatedAt,
            oldestHistoryId: currentState?.oldestHistoryId,
          },
        }))
      })
      debugLog('history text page fetch failed', { roomId, mode, error })
    }
  }

  const applySnapshot = (snapshot: DirectorySnapshotPayload) => {
    rtcConfigRef.current = snapshot.rtcConfig
    selfRef.current = snapshot.self
    trackPublicRoomFromSnapshot(snapshot)

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
    const snapshotHistoryFileIds = new Set(snapshot.historyFiles.map((file) => file.historyId))
    const snapshotIds = new Set(snapshot.sessions.map((session) => session.sessionId))
    const roomsNeedingRefresh = snapshot.rooms.filter((room) => {
      const previousRoom = roomsById[room.roomId]
      const pagination = historyTextPaginationRef.current[room.roomId]

      if (!previousRoom || !pagination?.initialized || pagination.isLoading) {
        return false
      }

      return (
        previousRoom.historyTextCount !== room.historyTextCount ||
        previousRoom.historyTextLatestAt !== room.historyTextLatestAt
      )
    })

    startTransition(() => {
      setSelf(snapshot.self)
      setOnlinePeers(normalizedPeers)
      setRoomsById(
        Object.fromEntries(snapshot.rooms.map((room) => [room.roomId, room] as const)),
      )
      setRoomStates(snapshot.roomStates ?? [])
      setPreferences(snapshot.self.preferences ?? { enterToSend: true })
      setHistoryFiles(snapshot.historyFiles)
      setHistoryTexts((previous) => {
        const roomsWithPersistedTexts = new Set(
          snapshot.rooms
            .filter((room) => room.historyTextCount > 0)
            .map((room) => room.roomId),
        )
        return previous.filter((record) => roomsWithPersistedTexts.has(record.roomId))
      })
      setHistoryTextPaginationByRoomId((previous) => {
        const next: Record<string, HistoryTextPaginationState> = {}

        for (const room of snapshot.rooms) {
          const current = previous[room.roomId]
          if (room.historyTextCount === 0) {
            next[room.roomId] = {
              initialized: true,
              isLoading: false,
              hasMore: false,
            }
            continue
          }

          next[room.roomId] = current ?? {
            initialized: false,
            isLoading: false,
            hasMore: true,
          }
        }

        return next
      })
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
          if (
            archivedHistoryIdsRef.current.has(item.historyId) &&
            !snapshotHistoryFileIds.has(item.historyId)
          ) {
            changed = true
            return null
          }

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
        }).filter((item): item is TransferItem => Boolean(item))

        return changed ? next : previous
      })
      setReceivedFiles((previous) => {
        const next = previous.filter((file) =>
          !file.historyId ||
          !archivedHistoryIdsRef.current.has(file.historyId) ||
          snapshotHistoryFileIds.has(file.historyId),
        )

        return next.length === previous.length ? previous : next
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

    for (const room of roomsNeedingRefresh) {
      void fetchRoomHistoryTexts(room.roomId, 'initial', { roomSummary: room })
    }
  }

  const applyHistoryRecall = (
    payload: Extract<ServerEvent, { type: 'history-recalled' }>['payload'],
  ) => {
    const { historyId, kind } = payload

    if (kind === 'text') {
      archivedTextHistoryIdsRef.current.delete(historyId)
      archivingTextHistoryIdsRef.current.delete(historyId)
      textRecordsRef.current = textRecordsRef.current.filter((record) => record.id !== historyId)
      historyTextsRef.current = historyTextsRef.current.filter((record) => record.historyId !== historyId)

      startTransition(() => {
        setTextRecords((previous) => previous.filter((record) => record.id !== historyId))
        setHistoryTexts((previous) => previous.filter((record) => record.historyId !== historyId))
      })
      return
    }

    archivedHistoryIdsRef.current.delete(historyId)
    archivingHistoryIdsRef.current.delete(historyId)
    transferFilesRef.current.delete(historyId)

    for (const transfer of transferItemsRef.current) {
      if (transfer.historyId === historyId) {
        transferFilesRef.current.delete(transfer.id)
      }
    }

    for (const [transferId, draft] of incomingTransfersRef.current) {
      if (draft.historyId === historyId) {
        incomingTransfersRef.current.delete(transferId)
      }
    }

    historyFilesRef.current = historyFilesRef.current.filter((record) => record.historyId !== historyId)
    transferItemsRef.current = transferItemsRef.current.filter((record) => record.historyId !== historyId)
    receivedFilesRef.current = receivedFilesRef.current.filter((record) => record.historyId !== historyId)

    startTransition(() => {
      setHistoryFiles((previous) => previous.filter((record) => record.historyId !== historyId))
      setTransferItems((previous) => previous.filter((record) => record.historyId !== historyId))
      setReceivedFiles((previous) => previous.filter((record) => record.historyId !== historyId))
    })
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

    if (message.type === 'heartbeat') {
      return
    }

    if (message.type === 'text') {
      mergeSession(sessionId, { kind: 'text' })
      startTransition(() => {
        setTextRecords((previous) => [
          ...previous,
            {
              id: message.id,
              sourceDeviceId: fromDeviceId,
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

    const stopHeartbeat = () => {
      const heartbeatIntervalId = dataChannelHeartbeatIntervalsRef.current.get(sessionId)
      if (heartbeatIntervalId === undefined) {
        return
      }

      window.clearInterval(heartbeatIntervalId)
      dataChannelHeartbeatIntervalsRef.current.delete(sessionId)
    }

    const startHeartbeat = () => {
      stopHeartbeat()

      const heartbeatIntervalId = window.setInterval(() => {
        if (channel.readyState !== 'open') {
          stopHeartbeat()
          return
        }

        try {
          channel.send(
            JSON.stringify({
              type: 'heartbeat',
              createdAt: new Date().toISOString(),
            } satisfies ChannelMessage),
          )
        } catch (error) {
          debugLog('datachannel heartbeat failed', { sessionId, error })
          stopHeartbeat()
        }
      }, DATA_CHANNEL_HEARTBEAT_INTERVAL_MS)

      dataChannelHeartbeatIntervalsRef.current.set(sessionId, heartbeatIntervalId)
    }

    channel.addEventListener('open', () => {
      startHeartbeat()
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
      stopHeartbeat()
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
      restorePublicRoomMembership(event.payload)

      const reconnectCallbacks = reconnectCallbacksRef.current
      reconnectCallbacksRef.current = []
      for (const callback of reconnectCallbacks) {
        try {
          callback()
        } catch (error) {
          debugLog('manual reconnect callback failed', error)
        }
      }
      return
    }

    if (event.type === 'directory-snapshot') {
      applySnapshot(event.payload)
      return
    }

    if (event.type === 'history-recalled') {
      applyHistoryRecall(event.payload)
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

    if (event.type === 'private-room-created') {
      setLastCreatedPrivateRoomId(event.payload.roomId)
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
    const dataChannelHeartbeatIntervals = dataChannelHeartbeatIntervalsRef.current

    const connect = () => {
      if (disposed) {
        return
      }

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      setSocketState('connecting')
      const socket = new WebSocket(WS_URL)
      socketRef.current = socket

      socket.addEventListener('open', () => {
        if (disposed || socketRef.current !== socket) {
          return
        }

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
        if (disposed || socketRef.current !== socket) {
          return
        }

        try {
          const parsed = JSON.parse(String(event.data)) as ServerEvent
          void handleServerEvent(parsed)
        } catch {
          setErrorMessage('收到无法解析的服务端消息。')
        }
      })

      socket.addEventListener('close', () => {
        if (socketRef.current !== socket) {
          return
        }

        socketRef.current = null
        if (disposed) {
          return
        }

        setSocketState('closed')
        if (!disposed) {
          reconnectTimerRef.current = window.setTimeout(connect, 2_000)
        }
      })

      socket.addEventListener('error', () => {
        if (disposed || socketRef.current !== socket) {
          return
        }

        setSocketState('error')
      })
    }

    connectSocketRef.current = connect
    connect()

    return () => {
      disposed = true
      connectSocketRef.current = null
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      for (const url of objectUrls) {
        URL.revokeObjectURL(url)
      }

      for (const peerConnection of peerConnections.values()) {
        peerConnection.close()
      }

      for (const heartbeatIntervalId of dataChannelHeartbeatIntervals.values()) {
        window.clearInterval(heartbeatIntervalId)
      }
      dataChannelHeartbeatIntervals.clear()

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
    options?: { archiveHistory?: boolean },
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
          archiveHistory: options?.archiveHistory ?? true,
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
      if (ack.completed && transfer.archiveHistory !== false) {
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

  const createBotRoom = () => {
    sendEvent({
      type: 'create-bot-room',
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
    const heartbeatIntervalId = dataChannelHeartbeatIntervalsRef.current.get(sessionId)
    if (heartbeatIntervalId !== undefined) {
      window.clearInterval(heartbeatIntervalId)
      dataChannelHeartbeatIntervalsRef.current.delete(sessionId)
    }
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
    options?: { logLocalRecord?: boolean; recordId?: string; createdAt?: string; archiveHistory?: boolean },
  ) => {
    const channel = dataChannelsRef.current.get(sessionId)
    if (!channel || channel.readyState !== 'open') {
      throw new Error('当前会话还没有建立可用的数据通道。')
    }

    const record: TextRecord = {
      id: options?.recordId ?? crypto.randomUUID(),
      sessionId,
      roomId: sessionsRef.current[sessionId]?.roomId,
      sourceDeviceId: selfRef.current?.deviceId,
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

    if (options?.archiveHistory !== false) {
      void archiveTextHistory(record)
    }

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
                sourceDeviceId: activeSelf.deviceId,
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
      const { response, self: responseSelf } = await fetchWithHistoryAuthRetry(postRoomText, { roomId })
      if (!response) {
        throw new Error('当前设备尚未完成历史记录授权。')
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
        sourceDeviceId: responseSelf?.deviceId ?? activeSelf.deviceId,
        sourceDeviceName: responseSelf?.deviceName ?? activeSelf.deviceName,
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

  const recallText = async (recordId: string, options?: RecallHistoryOptions) => {
    const canRecallAny = options?.canRecallAny === true
    const activeSelf = selfRef.current
    const localRecord = textRecordsRef.current.find((record) => record.id === recordId)
    const historyRecord = historyTextsRef.current.find((record) => record.historyId === recordId)
    const isRemoteLocalRecord = Boolean(localRecord && !localRecord.fromSelf)
    const isRemoteHistoryRecord = Boolean(historyRecord && historyRecord.sourceDeviceId !== activeSelf?.deviceId)
    const requiresAdminAuthorization = canRecallAny && (isRemoteLocalRecord || isRemoteHistoryRecord)

    if (!canRecallAny && isRemoteLocalRecord) {
      throw new Error('只能撤回自己发送的消息。')
    }

    if (!canRecallAny && isRemoteHistoryRecord) {
      throw new Error('只能撤回自己发送的消息。')
    }

    const roomId = localRecord?.roomId ?? historyRecord?.roomId
    const directSessionId = localRecord?.sessionId || historyRecord?.sessionId
    const deleteStoredHistoryText = async () => {
      const { response } = await fetchWithHistoryAuthRetry((requestSelf) =>
        fetch(`${API_BASE_URL}/api/history/text/${encodeURIComponent(recordId)}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: buildHistoryAuthHeaders(requestSelf),
        }), {
          roomId,
        })

      if (!response) {
        return false
      }

      if (!response.ok && response.status !== 404) {
        throw new Error(await readApiError(response, '消息撤回失败。'))
      }

      return true
    }

    if (requiresAdminAuthorization) {
      const didRequestStoredDelete = await deleteStoredHistoryText()
      if (!didRequestStoredDelete) {
        throw new Error('当前设备尚未完成消息撤回授权。')
      }
    }

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

    if (!requiresAdminAuthorization) {
      await deleteStoredHistoryText()
    }

    archivedTextHistoryIdsRef.current.delete(recordId)
    archivingTextHistoryIdsRef.current.delete(recordId)
    startTransition(() => {
      setTextRecords((previous) => previous.filter((record) => record.id !== recordId))
      setHistoryTexts((previous) => previous.filter((record) => record.historyId !== recordId))
    })
  }

  const recallFile = async (historyId: string, options?: RecallHistoryOptions) => {
    const canRecallAny = options?.canRecallAny === true
    const activeSelf = selfRef.current
    const historyRecord = historyFilesRef.current.find((record) => record.historyId === historyId)
    const localTransfer = transferItemsRef.current.find((record) => record.historyId === historyId)
    const receivedFile = receivedFilesRef.current.find((record) => record.historyId === historyId)
    const isRemoteHistoryRecord = Boolean(historyRecord && historyRecord.sourceDeviceId !== activeSelf?.deviceId)
    const isRemoteReceivedFile = Boolean(receivedFile && receivedFile.fromDeviceId !== activeSelf?.deviceId)
    const isRemoteFile = isRemoteHistoryRecord || (!historyRecord && isRemoteReceivedFile)
    const roomId =
      historyRecord?.roomId ??
      localTransfer?.roomId ??
      (receivedFile ? sessionsRef.current[receivedFile.sessionId]?.roomId : undefined)

    if (!canRecallAny && isRemoteFile) {
      throw new Error('只能撤回自己发送的文件。')
    }

    const { response } = await fetchWithHistoryAuthRetry((requestSelf) =>
      fetch(`${API_BASE_URL}/api/history/file/${encodeURIComponent(historyId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: buildHistoryAuthHeaders(requestSelf),
      }), {
        roomId,
      })

    if (!response) {
      throw new Error('当前设备尚未完成文件撤回授权。')
    }

    if (!response.ok && response.status !== 404) {
      throw new Error(await readApiError(response, '文件撤回失败。'))
    }

    archivedHistoryIdsRef.current.delete(historyId)
    archivingHistoryIdsRef.current.delete(historyId)
    transferFilesRef.current.delete(historyId)
    startTransition(() => {
      setHistoryFiles((previous) => previous.filter((record) => record.historyId !== historyId))
      setTransferItems((previous) => previous.filter((record) => record.historyId !== historyId))
      setReceivedFiles((previous) => previous.filter((record) => record.historyId !== historyId))
    })
  }

  const askAi = async (
    prompt: string,
    options?: {
      roomId?: string
      replyToName?: string
      kind?: 'chat' | 'quota'
      historyId?: string
      createdAt?: string
      provider?: string
      model?: string
      images?: AiChatImageInput[]
      webSearch?: boolean
      signal?: AbortSignal
    },
  ): Promise<AiChatResponse> => {
    const activeSelf = selfRef.current
    const normalizedPrompt = prompt.trim()
    const images = options?.images ?? []

    if (!activeSelf?.historyAuthToken) {
      throw new Error('当前设备尚未完成 AI 请求授权。')
    }

    if (!normalizedPrompt && images.length === 0) {
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
        provider: options?.provider,
        model: options?.model,
        images,
        webSearch: options?.webSearch === true,
      }),
      signal: options?.signal,
    })

    if (!response.ok) {
      const message = await readApiError(
        response,
        `AI request failed with status ${response.status.toString()}`,
      )

      if (isHistoryAuthExpiredError(response.status, message)) {
        reconnectSocket()
      }

      throw new Error(message)
    }

    const payload = await response.json() as Partial<AiChatResponse>
    if (typeof payload.response !== 'string' || !payload.response.trim()) {
      throw new Error('AI 返回了空结果。')
    }

    return {
      response: payload.response,
      provider: payload.provider,
      model: typeof payload.model === 'string' ? payload.model : '',
      quota: payload.quota,
      historyText: payload.historyText,
      webSearch: payload.webSearch,
    }
  }

  const listAiChatConversations = async (): Promise<AiChatConversationRecord[]> => {
    const activeSelf = selfRef.current
    if (!activeSelf?.historyAuthToken) {
      throw new Error('当前设备尚未完成 AI 会话同步授权。')
    }

    const response = await fetch(`${API_BASE_URL}/api/ai/chat/conversations`, {
      method: 'GET',
      headers: buildHistoryAuthHeaders(activeSelf),
    })

    if (!response.ok) {
      const message = await readApiError(
        response,
        `AI chat conversations request failed with status ${response.status.toString()}`,
      )

      if (isHistoryAuthExpiredError(response.status, message)) {
        reconnectSocket()
      }

      throw new Error(message)
    }

    const payload = await response.json() as Partial<AiChatConversationSyncResponse>
    return Array.isArray(payload.conversations) ? payload.conversations : []
  }

  const saveAiChatConversations = async (
    conversations: AiChatConversationRecord[],
  ): Promise<AiChatConversationRecord[]> => {
    const activeSelf = selfRef.current
    if (!activeSelf?.historyAuthToken) {
      throw new Error('当前设备尚未完成 AI 会话同步授权。')
    }

    const response = await fetch(`${API_BASE_URL}/api/ai/chat/conversations`, {
      method: 'PUT',
      headers: {
        ...buildHistoryAuthHeaders(activeSelf),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ conversations }),
    })

    if (!response.ok) {
      const message = await readApiError(
        response,
        `AI chat conversations save failed with status ${response.status.toString()}`,
      )

      if (isHistoryAuthExpiredError(response.status, message)) {
        reconnectSocket()
      }

      throw new Error(message)
    }

    const payload = await response.json() as Partial<AiChatConversationSyncResponse>
    return Array.isArray(payload.conversations) ? payload.conversations : conversations
  }

  const deleteAiChatConversation = async (
    conversationId?: string,
  ): Promise<AiChatConversationRecord[]> => {
    const activeSelf = selfRef.current
    if (!activeSelf?.historyAuthToken) {
      throw new Error('当前设备尚未完成 AI 会话同步授权。')
    }

    const query = conversationId
      ? `?conversationId=${encodeURIComponent(conversationId)}`
      : ''
    const response = await fetch(`${API_BASE_URL}/api/ai/chat/conversations${query}`, {
      method: 'DELETE',
      headers: buildHistoryAuthHeaders(activeSelf),
    })

    if (!response.ok) {
      const message = await readApiError(
        response,
        `AI chat conversation delete failed with status ${response.status.toString()}`,
      )

      if (isHistoryAuthExpiredError(response.status, message)) {
        reconnectSocket()
      }

      throw new Error(message)
    }

    const payload = await response.json() as Partial<AiChatConversationSyncResponse>
    return Array.isArray(payload.conversations) ? payload.conversations : []
  }

  const generateImage = async (
    input: string | AiImageRequestInput,
    options?: {
      model?: string
      size?: string
      quality?: string
    },
  ): Promise<AiImageResponse> => {
    const normalizedPrompt = typeof input === 'string'
      ? input.trim()
      : input.prompt.trim()
    const referenceImages = typeof input === 'string' ? [] : input.images ?? []
    const requestModel = options?.model ?? (typeof input === 'string' ? undefined : input.model)
    const requestSize = options?.size ?? (typeof input === 'string' ? undefined : input.size)
    const requestQuality = options?.quality ?? (typeof input === 'string' ? undefined : input.quality)

    if (!normalizedPrompt) {
      throw new Error('请输入图片提示词。')
    }

    const body = referenceImages.length > 0
      ? new FormData()
      : JSON.stringify({
          prompt: normalizedPrompt,
          model: requestModel,
          size: requestSize,
          quality: requestQuality,
        })
    const headers: Record<string, string> = {}

    if (body instanceof FormData) {
      body.append('prompt', normalizedPrompt)

      if (requestModel) {
        body.append('model', requestModel)
      }

      if (requestSize) {
        body.append('size', requestSize)
      }

      if (requestQuality) {
        body.append('quality', requestQuality)
      }

      for (const image of referenceImages) {
        body.append('image[]', image, image.name)
      }
    } else {
      headers['content-type'] = 'application/json'
    }

    const response = await fetch(`${API_BASE_URL}/api/ai/image`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body,
    })

    if (!response.ok) {
      const message = await readApiError(
        response,
        `AI image request failed with status ${response.status.toString()}`,
      )

      if (isHistoryAuthExpiredError(response.status, message)) {
        reconnectSocket()
      }

      throw new Error(message)
    }

    const startPayload = await response.json() as Partial<AiImageJobResponse & AiImageResponse>
    if (Array.isArray(startPayload.images) && startPayload.images.length > 0) {
      return {
        provider: startPayload.provider,
        model: typeof startPayload.model === 'string' ? startPayload.model : '',
        images: startPayload.images,
        createdAt: typeof startPayload.createdAt === 'string' ? startPayload.createdAt : new Date().toISOString(),
        historyItem: startPayload.historyItem,
        quota: startPayload.quota,
      }
    }

    const jobId = typeof startPayload.jobId === 'string' ? startPayload.jobId.trim() : ''
    if (!jobId) {
      throw new Error('生图任务创建失败。')
    }

    const startedAt = Date.now()
    while (Date.now() - startedAt <= IMAGE_JOB_POLL_TIMEOUT_MS) {
      await delay(IMAGE_JOB_POLL_INTERVAL_MS)

      const jobResponse = await fetch(
        `${API_BASE_URL}/api/ai/image/jobs/${encodeURIComponent(jobId)}`,
        { credentials: 'include' },
      )

      if (!jobResponse.ok) {
        const message = await readApiError(
          jobResponse,
          `AI image job request failed with status ${jobResponse.status.toString()}`,
        )

        if (isHistoryAuthExpiredError(jobResponse.status, message)) {
          reconnectSocket()
        }

        throw new Error(message)
      }

      const jobPayload = await jobResponse.json() as Partial<AiImageJobResponse>
      if (jobPayload.status === 'complete') {
        const result = jobPayload.result
        if (!result || !Array.isArray(result.images) || result.images.length === 0) {
          throw new Error('AI 没有返回图片。')
        }

        return {
          provider: result.provider,
          model: typeof result.model === 'string' ? result.model : '',
          images: result.images,
          createdAt: typeof result.createdAt === 'string' ? result.createdAt : new Date().toISOString(),
          historyItem: result.historyItem,
          quota: result.quota ?? jobPayload.quota,
        }
      }

      if (jobPayload.status === 'failed') {
        throw new Error(
          typeof jobPayload.error === 'string' && jobPayload.error.trim()
            ? jobPayload.error
            : '图片生成失败。',
        )
      }
    }

    throw new Error('图片生成仍在后台处理中，请稍后刷新历史记录查看结果。')
  }

  const getOcrJob = useCallback(async (jobId: string): Promise<OcrJobResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/ocr/jobs/${encodeURIComponent(jobId)}`)

    if (!response.ok) {
      throw new Error(await readApiError(response, 'OCR 任务加载失败。'))
    }

    return response.json() as Promise<OcrJobResponse>
  }, [])

  const startOcrJob = useCallback(async (file: File): Promise<OcrJobResponse> => {
    const body = new FormData()
    body.append('image', file, file.name)

    const response = await fetch(`${API_BASE_URL}/api/ocr`, {
      method: 'POST',
      body,
    })

    if (!response.ok) {
      throw new Error(await readApiError(response, 'OCR 识别任务创建失败。'))
    }

    const startedJob = await response.json() as Partial<OcrJobResponse>
    const jobId = typeof startedJob.jobId === 'string' ? startedJob.jobId.trim() : ''
    if (!jobId) {
      throw new Error('OCR 识别任务创建失败。')
    }

    const startedAt = Date.now()
    let latestJob: OcrJobResponse = {
      jobId,
      status: startedJob.status ?? 'queued',
      pollUrl: startedJob.pollUrl,
    }

    while (Date.now() - startedAt <= OCR_JOB_POLL_TIMEOUT_MS) {
      if (latestJob.status === 'complete' || latestJob.status === 'failed') {
        return latestJob
      }

      await delay(OCR_JOB_POLL_INTERVAL_MS)
      latestJob = await getOcrJob(jobId)
    }

    throw new Error('OCR 识别仍在处理中，请稍后从历史记录查看结果。')
  }, [getOcrJob])

  const listOcrHistory = useCallback(async (): Promise<OcrHistoryResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/ocr/history`)

    if (!response.ok) {
      throw new Error(await readApiError(response, 'OCR 历史加载失败。'))
    }

    const payload = await response.json() as Partial<OcrHistoryResponse>
    return {
      items: Array.isArray(payload.items) ? payload.items : [],
    }
  }, [])

  const deleteOcrHistory = useCallback(async (jobId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/ocr/history/${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error(await readApiError(response, 'OCR 历史删除失败。'))
    }
  }, [])

  const listImageHistory = useCallback(async (
    options: AiImageHistoryRequestOptions = {},
  ): Promise<AiImageHistoryPage> => {
    const url = new URL('/api/ai/image/history', API_BASE_URL)
    url.searchParams.set('limit', Math.max(1, Math.min(options.limit ?? 12, 50)).toString())

    if (options.before) {
      url.searchParams.set('beforeCreatedAt', options.before.createdAt)
      url.searchParams.set('beforeGenerationId', options.before.generationId)
    }

    const response = await fetch(url, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(await readApiError(response, '生图历史加载失败。'))
    }

    const payload = await response.json() as Partial<AiImageHistoryPage>
    return {
      items: Array.isArray(payload.items) ? payload.items : [],
      hasMore: payload.hasMore === true,
      nextCursor: payload.nextCursor,
      quota: payload.quota,
    }
  }, [])

  const getImageQuota = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/api/ai/image/quota`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(await readApiError(response, '生图额度加载失败。'))
    }

    const payload = await response.json() as Partial<AiImageQuotaResponse>
    if (!payload.quota) {
      throw new Error('生图额度加载失败。')
    }

    return payload.quota
  }, [])

  const getAiQuota = useCallback(async (): Promise<AiQuotaStatus> => {
    const activeSelf = selfRef.current

    if (!activeSelf?.historyAuthToken) {
      throw new Error('当前设备尚未完成 AI 请求授权。')
    }

    const response = await fetch(`${API_BASE_URL}/api/ai/quota`, {
      headers: buildHistoryAuthHeaders(activeSelf),
    })

    if (!response.ok) {
      const message = await readApiError(
        response,
        `AI quota request failed with status ${response.status.toString()}`,
      )

      if (isHistoryAuthExpiredError(response.status, message)) {
        reconnectSocket()
      }

      throw new Error(message)
    }

    return response.json() as Promise<AiQuotaStatus>
  }, [reconnectSocket])

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
    historyTextPaginationByRoomId,
    errorMessage,
    lastCreatedPublicRoomId,
    lastCreatedPrivateRoomId,
    pairByShortCode,
    joinRoom,
    createPublicRoom,
    createBotRoom,
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
    recallFile,
    sendRoomText,
    ensureRoomHistoryLoaded: (roomId: string) => {
      const state = historyTextPaginationRef.current[roomId]
      if (state?.initialized || state?.isLoading) {
        return
      }
      void fetchRoomHistoryTexts(roomId, 'initial')
    },
    loadOlderRoomHistoryTexts: (roomId: string) => {
      void fetchRoomHistoryTexts(roomId, 'older')
    },
    askAi,
    listAiChatConversations,
    saveAiChatConversations,
    deleteAiChatConversation,
    generateImage,
    startOcrJob,
    getOcrJob,
    listOcrHistory,
    deleteOcrHistory,
    getImageQuota,
    listImageHistory,
    getAiQuota,
    sendRoomFiles,
    sendFiles,
    stateToUiStatus,
    reasonLabel,
  }
}
