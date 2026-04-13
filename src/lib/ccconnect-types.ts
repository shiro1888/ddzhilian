export type PairReason =
  | 'manual'
  | 'short-code'
  | 'pair-link'
  | 'account-auto'
  | 'lan-discovery'

export type SessionState = 'connecting' | 'connected' | 'failed' | 'closed'

export type SignalEnvelope =
  | {
      kind: 'offer' | 'answer'
      description: {
        sdp: string
        type: 'offer' | 'answer'
      }
    }
  | {
      kind: 'ice-candidate'
      candidate: {
        candidate: string
        sdpMid?: string | null
        sdpMLineIndex?: number | null
        usernameFragment?: string | null
      }
    }

export type DeviceSettingsPayload = {
  deviceId?: string
  deviceName?: string
  platform?: string
  accountId?: string
  autoConnect?: boolean
  discoverable?: boolean
  allowShortCode?: boolean
  requestedPairToken?: string | null
}

export type PeerSummary = {
  deviceId: string
  deviceName: string
  platform: string
  shortCode: string
  pairToken: string
  online: boolean
  relation: {
    sameAccount: boolean
    sameLan: boolean
    autoConnectEligible: boolean
    discoverable: boolean
  }
  lastSeenAt: string
}

export type SessionSummary = {
  sessionId: string
  peerId: string
  state: SessionState
  reason: PairReason
  initiator: boolean
  updatedAt: string
}

export type DirectorySnapshotPayload = {
  self: {
    deviceId: string
    deviceName: string
    shortCode: string
    pairToken: string
    accountId?: string
    autoConnect: boolean
    discoverable: boolean
    allowShortCode: boolean
    platform: string
  }
  peers: PeerSummary[]
  lanPeers: PeerSummary[]
  accountPeers: PeerSummary[]
  sessions: SessionSummary[]
  rtcConfig: RTCConfiguration
  publicWsUrl: string
  serverTime: string
}

export type ClientEvent =
  | {
      type: 'hello'
      payload: DeviceSettingsPayload
    }
  | {
      type: 'update-settings'
      payload: DeviceSettingsPayload
    }
  | {
      type: 'pair-by-short-code'
      payload: { shortCode: string }
    }
  | {
      type: 'pair-by-token'
      payload: { pairToken: string }
    }
  | {
      type: 'request-connect'
      payload: { targetDeviceId: string; reason?: PairReason }
    }
  | {
      type: 'signal'
      payload: {
        sessionId: string
        targetDeviceId: string
        signal: SignalEnvelope
      }
    }
  | {
      type: 'session-state'
      payload: {
        sessionId: string
        targetDeviceId: string
        state: SessionState
      }
    }
  | {
      type: 'request-snapshot'
      payload?: undefined
    }

export type ServerEvent =
  | {
      type: 'welcome'
      payload: DirectorySnapshotPayload
    }
  | {
      type: 'directory-snapshot'
      payload: DirectorySnapshotPayload
    }
  | {
      type: 'session-created'
      payload: {
        sessionId: string
        peer: PeerSummary
        reason: PairReason
        initiator: boolean
      }
    }
  | {
      type: 'signal'
      payload: {
        sessionId: string
        fromDeviceId: string
        signal: SignalEnvelope
      }
    }
  | {
      type: 'peer-state'
      payload: {
        sessionId: string
        peerId: string
        state: SessionState
      }
    }
  | {
      type: 'error'
      payload: {
        code: string
        message: string
      }
    }

export type ChannelMessage =
  | { type: 'text'; id: string; text: string; createdAt: string }
  | {
      type: 'file-meta'
      id: string
      name: string
      size: number
      mimeType?: string
      chunkSize: number
      createdAt: string
    }
  | {
      type: 'file-chunk'
      id: string
      index: number
      total: number
      data: string
    }
  | { type: 'file-complete'; id: string }
  | { type: 'file-ack'; id: string; receivedBytes: number; completed: boolean }

export type LiveSession = SessionSummary & {
  peer?: PeerSummary
  channelState: 'idle' | 'opening' | 'open' | 'closed'
  kind?: 'file' | 'text'
}

export type PeerConnectionState = {
  sessionId: string
  peerId: string
  peerName: string
  reason: PairReason
  status: 'connecting' | 'connected' | 'failed' | 'closed'
}

export type ConnectedTarget = PeerConnectionState & {
  session: LiveSession
}

export type TransferStatus =
  | 'queued'
  | 'waiting_for_target'
  | 'connecting'
  | 'ready'
  | 'transferring'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type TransferItem = {
  id: string
  fileName: string
  fileSize: number
  targetDeviceId?: string
  targetDeviceName?: string
  sessionId?: string
  status: TransferStatus
  progress: number
  sentBytes: number
  acknowledgedBytes: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  errorMessage?: string
}

export type TextRecord = {
  id: string
  sessionId: string
  fromSelf: boolean
  text: string
  createdAt: string
}

export type ReceivedFile = {
  id: string
  sessionId: string
  name: string
  size: number
  mimeType?: string
  fromDeviceId: string
  createdAt: string
  receivedBytes: number
  completed: boolean
  objectUrl?: string
}
