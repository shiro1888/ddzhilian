import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react'
import type {
  ChannelMessage,
  ClientEvent,
  ConnectedTarget,
  DeviceSettingsPayload,
  DirectorySnapshotPayload,
  HistoryFileSummary,
  HistoryTextSummary,
  LiveSession,
  PeerConnectionState,
  PeerSummary,
  ReceivedFile,
  RoomSummary,
  ServerEvent,
  SessionState,
  TextRecord,
  TransferItem,
  TransferStatus,
} from './ccconnect-types'

const DEFAULT_DEV_WS_URL = 'ws://localhost:8787/ws'
const STORAGE_KEY = 'ccconnect.identity.v1'
const CHUNK_SIZE = 16 * 1024
const CHANNEL_BUFFER_HIGH_WATER = 512 * 1024
const CHANNEL_BUFFER_LOW_WATER = 128 * 1024

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
    console.debug('[ccconnect]', ...parts)
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

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }

  return btoa(binary)
}

function base64ToUint8Array(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
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

export function useCcconnect() {
  const [socketState, setSocketState] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle')
  const [self, setSelf] = useState<DirectorySnapshotPayload['self'] | null>(null)
  const [onlinePeers, setOnlinePeers] = useState<PeerSummary[]>([])
  const [roomsById, setRoomsById] = useState<Record<string, RoomSummary>>({})
  const [historyFiles, setHistoryFiles] = useState<HistoryFileSummary[]>([])
  const [historyTexts, setHistoryTexts] = useState<HistoryTextSummary[]>([])
  const [sessionsById, setSessionsById] = useState<Record<string, LiveSession>>({})
  const [connectionStatesById, setConnectionStatesById] = useState<Record<string, PeerConnectionState>>({})
  const [textRecords, setTextRecords] = useState<TextRecord[]>([])
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([])
  const [transferItems, setTransferItems] = useState<TransferItem[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const identityRef = useRef<StoredIdentity>(readStoredIdentity())
  const selfRef = useRef<DirectorySnapshotPayload['self'] | null>(null)
  const rtcConfigRef = useRef<RTCConfiguration | null>(null)
  const peerConnectionsRef = useRef(new Map<string, RTCPeerConnection>())
  const dataChannelsRef = useRef(new Map<string, RTCDataChannel>())
  const sessionsRef = useRef<Record<string, LiveSession>>({})
  const connectionStatesRef = useRef<Record<string, PeerConnectionState>>({})
  const transferItemsRef = useRef<TransferItem[]>([])
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

    const peerIndex = new Map(normalizePeerLists(snapshot).map((peer) => [peer.deviceId, peer] as const))
    const snapshotIds = new Set(snapshot.sessions.map((session) => session.sessionId))

    startTransition(() => {
      setSelf(snapshot.self)
      setOnlinePeers(normalizePeerLists(snapshot))
      setRoomsById(
        Object.fromEntries(snapshot.rooms.map((room) => [room.roomId, room] as const)),
      )
      setHistoryFiles(snapshot.historyFiles)
      setHistoryTexts(snapshot.historyTexts)
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
    })

    archivedHistoryIdsRef.current = new Set(
      snapshot.historyFiles.map((file) => file.historyId),
    )
    archivedTextHistoryIdsRef.current = new Set(
      snapshot.historyTexts.map((text) => text.historyId),
    )
  }

  const handleChannelMessage = (sessionId: string, fromDeviceId: string, raw: string) => {
    let message: ChannelMessage

    try {
      message = JSON.parse(raw) as ChannelMessage
    } catch {
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
      incomingTransfersRef.current.set(message.id, {
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
      })

      startTransition(() => {
        setReceivedFiles((previous) => [
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
            receivedBytes: 0,
            completed: false,
          },
        ])
      })
      return
    }

    if (message.type === 'file-chunk') {
      const draft = incomingTransfersRef.current.get(message.id)
      if (!draft) {
        return
      }

      const chunk = base64ToUint8Array(message.data)
      draft.chunks[message.index] = chunk
      draft.receivedBytes += chunk.byteLength

      startTransition(() => {
        setReceivedFiles((previous) =>
          previous.map((file) =>
            file.id === message.id
              ? { ...file, receivedBytes: Math.min(draft.receivedBytes, file.size) }
              : file,
          ),
        )
      })
      return
    }

    if (message.type === 'file-complete') {
      const draft = incomingTransfersRef.current.get(message.id)
      if (!draft) {
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
      }
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
      const dataChannel = peerConnection.createDataChannel('ccconnect')
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

    if (!session?.roomId || !activeSelf?.deviceId) {
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
          'content-type': file.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name),
          'x-file-created-at': encodeURIComponent(new Date().toISOString()),
          'x-source-device-id': activeSelf.deviceId,
          'x-source-device-name': encodeURIComponent(activeSelf.deviceName),
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

  const archiveTextHistory = async (record: TextRecord) => {
    if (
      archivedTextHistoryIdsRef.current.has(record.id) ||
      archivingTextHistoryIdsRef.current.has(record.id)
    ) {
      return
    }

    const session = sessionsRef.current[record.sessionId]
    const activeSelf = selfRef.current

    if (!session?.roomId || !activeSelf?.deviceId) {
      return
    }

    archivingTextHistoryIdsRef.current.add(record.id)

    try {
      const response = await fetch(`${API_BASE_URL}/api/history/text`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          historyId: record.id,
          roomId: session.roomId,
          sessionId: record.sessionId,
          sourceDeviceId: activeSelf.deviceId,
          sourceDeviceName: activeSelf.deviceName,
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

      let sentBytes = 0
      updateTransfer(transferId, {
        status: 'transferring',
        progress: 0,
        sentBytes: 0,
        acknowledgedBytes: 0,
        startedAt: new Date().toISOString(),
        sessionId: target.sessionId,
        targetDeviceId: target.peerId,
        targetDeviceName: target.peerName,
      })
      debugLog('state transition', { transferId, status: 'transferring' })

      for (let index = 0; index < totalChunks; index += 1) {
        const currentTransfer = transferItemsRef.current.find((item) => item.id === transferId)
        if (currentTransfer?.status === 'cancelled') {
          throw new Error('传输已取消。')
        }

        const slice = file.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
        const buffer = await slice.arrayBuffer()
        sentBytes += buffer.byteLength

        channel.send(
          JSON.stringify({
            type: 'file-chunk',
            id: transferId,
            index,
            total: totalChunks,
            data: arrayBufferToBase64(buffer),
          } satisfies ChannelMessage),
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

  const requestConnect = (
    targetDeviceId: string,
    reason: 'manual' | 'lan-discovery' = 'manual',
  ) => {
    sendEvent({
      type: 'request-connect',
      payload: {
        targetDeviceId,
        reason,
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
      fromSelf: true,
      text,
      createdAt: options?.createdAt ?? new Date().toISOString(),
    }

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
    }

    void archiveTextHistory(record)

    mergeSession(sessionId, { kind: 'text' })
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
          JSON.stringify({
            type: 'file-chunk',
            id: transferId,
            index,
            total: totalChunks,
            data: arrayBufferToBase64(buffer),
          } satisfies ChannelMessage),
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
    onlinePeers,
    rooms: Object.values(roomsById).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    ),
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
    pairByShortCode,
    joinRoom,
    requestConnect,
    disconnectSession,
    requestSnapshot,
    updateSettings,
    createTransferItems,
    retryTransfer,
    cancelTransfer,
    startPendingTransfers,
    sendText,
    sendFiles,
    stateToUiStatus,
    reasonLabel,
  }
}
