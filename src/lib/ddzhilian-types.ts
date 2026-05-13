export type PairReason =
  | 'manual'
  | 'short-code'
  | 'pair-link'
  | 'account-auto'
  | 'lan-discovery'
  | 'bot-chat'

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

export type RoomMemberSummary = {
  deviceId: string
  deviceName: string
  platform: string
  online: boolean
}

export type RoomSummary = {
  roomId: string
  members: RoomMemberSummary[]
  isPublic: boolean
  reason: PairReason
  historyTextCount: number
  historyTextLatestAt?: string
  historyTextPreview?: string
  historyTextLatestSourceDeviceId?: string
  updatedAt: string
}

export type RoomStateSummary = {
  roomId: string
  pinned: boolean
  lastReadAt?: string
}

export type DevicePreferencesPayload = {
  enterToSend: boolean
}

export type HistoryFileSummary = {
  historyId: string
  roomId: string
  sessionId?: string
  isPublic: boolean
  sourceDeviceId: string
  sourceDeviceName: string
  fileName: string
  size: number
  mimeType?: string
  createdAt: string
  downloadPath: string
}

export type HistoryTextSummary = {
  historyId: string
  roomId: string
  sessionId?: string
  isPublic: boolean
  sourceDeviceId: string
  sourceDeviceName: string
  text: string
  createdAt: string
}

export type SessionSummary = {
  sessionId: string
  roomId: string
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
    historyAuthToken: string
    accountId?: string
    autoConnect: boolean
    discoverable: boolean
    allowShortCode: boolean
    platform: string
    preferences: DevicePreferencesPayload
  }
  peers: PeerSummary[]
  lanPeers: PeerSummary[]
  accountPeers: PeerSummary[]
  rooms: RoomSummary[]
  roomStates: RoomStateSummary[]
  historyFiles: HistoryFileSummary[]
  historyTexts: HistoryTextSummary[]
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
      type: 'update-room-state'
      payload: { roomId: string; pinned?: boolean; lastReadAt?: string }
    }
  | {
      type: 'update-preferences'
      payload: Partial<DevicePreferencesPayload>
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
      type: 'join-room'
      payload: { roomId: string }
    }
  | {
      type: 'create-public-room'
      payload?: undefined
    }
  | {
      type: 'create-bot-room'
      payload?: undefined
    }
  | {
      type: 'request-connect'
      payload: { targetDeviceId: string; reason?: PairReason; createNewRoom?: boolean }
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
        roomId: string
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
      type: 'public-room-created'
      payload: {
        roomId: string
      }
    }
  | {
      type: 'private-room-created'
      payload: {
        roomId: string
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
  | { type: 'text-recall'; id: string; createdAt: string }
  | {
      type: 'file-meta'
      id: string
      historyId?: string
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
  | {
      type: 'file-chunk-binary'
      id: string
      index: number
      total: number
    }
  | { type: 'file-resume'; id: string; receivedBytes: number; nextIndex: number }
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
  historyId: string
  fileName: string
  fileSize: number
  fileMimeType?: string
  previewUrl?: string
  targetDeviceId?: string
  targetDeviceName?: string
  sessionId?: string
  roomId?: string
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
  roomId?: string
  fromSelf: boolean
  senderName?: string
  status?: 'sending' | 'failed'
  text: string
  createdAt: string
}

export type AiChatImageInput = {
  url: string
  mimeType?: string
  alt?: string
}

export type AiChatResponse = {
  response: string
  provider?: 'cloudflare' | 'openrouter'
  model: string
  quota?: AiQuotaStatus
  historyText?: HistoryTextSummary
}

export type AiChatConversationMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  status?: 'streaming' | 'complete' | 'failed' | 'stopped'
  model?: string
  attachments?: AiChatMessageAttachmentSummary[]
}

export type AiChatMessageAttachmentSummary = {
  id: string
  kind: 'image' | 'text'
  name: string
  size: number
  mimeType?: string
  textPreview?: string
}

export type AiChatConversationRecord = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  pinned?: boolean
  archived?: boolean
  parentConversationId?: string
  messages: AiChatConversationMessage[]
}

export type AiChatConversationSyncResponse = {
  conversations: AiChatConversationRecord[]
}

export type AiImageResult = {
  b64Json?: string
  url?: string
  mimeType: string
  revisedPrompt?: string
}

export type AiImageResponse = {
  provider?: 'codex-reverse-proxy'
  model: string
  images: AiImageResult[]
  createdAt: string
  historyItem?: AiImageHistoryItem
  quota?: AiImageQuotaStatus
}

export type AiImageQuotaStatus = {
  date: string
  limit: number
  used: number
  remaining: number
  freeLimit: number
  freeUsed: number
  freeRemaining: number
  paidRemaining: number
  paidUsed: number
  totalRemaining: number
  periodStartedAt: string
  resetAt: string
  resetHour: number
  timezoneOffsetMinutes: number
}

export type AiImageRequestInput = {
  prompt: string
  images?: File[]
}

export type AiImageJobStatus = 'queued' | 'running' | 'complete' | 'failed'

export type AiImageJobResponse = {
  jobId: string
  status: AiImageJobStatus
  sourceImageCount?: number
  createdAt: string
  updatedAt: string
  error?: string
  quota?: AiImageQuotaStatus
  result?: AiImageResponse
}

export type AiImageHistoryItem = {
  generationId: string
  prompt: string
  provider?: 'codex-reverse-proxy'
  model: string
  size: string
  quality: string
  images: AiImageResult[]
  createdAt: string
}

export type AiImageHistoryCursor = {
  createdAt: string
  generationId: string
}

export type AiImageHistoryPage = {
  items: AiImageHistoryItem[]
  hasMore: boolean
  nextCursor?: AiImageHistoryCursor
  quota?: AiImageQuotaStatus
}

export type AiImageQuotaResponse = {
  quota: AiImageQuotaStatus
}

export type AiImageHistoryRequestOptions = {
  limit?: number
  before?: AiImageHistoryCursor
}

export type AccountUser = {
  id: string
  email: string
  createdAt?: string
}

export type AccountSessionResponse = {
  authenticated: boolean
  configured?: boolean
  user?: AccountUser
}

export type AiModelOption = {
  id: string
  label: string
}

export type AiQuotaStatus = {
  date: string
  usedNeurons: number
  dailyNeuronBudget: number
  remainingNeurons: number
  freeOnly?: boolean
  provider?: 'cloudflare' | 'openrouter'
  limitLabel?: string
  model?: string
  models?: AiModelOption[]
}

export type AdminHistoryStats = {
  fileCount: number
  textCount: number
  totalBytes: number
  roomCount: number
  activeUserCount?: number
  lastFileAt?: string
  lastTextAt?: string
  lastActivityAt?: string
}

export type AdminCloudflareConfig = {
  accountId: string
  apiToken: string
  model: string
  models: AdminModelToggleItem[]
  freeOnly: boolean
  dailyNeuronBudget: number
  maxPromptChars: number
  maxOutputTokens: number
}

export type AdminOpenRouterConfig = {
  apiKey: string
  baseUrl: string
  wireApi: AdminOpenAiWireApi
  reasoningEffort: AdminOpenAiReasoningEffort
  siteUrl: string
  siteName: string
  model: string
  models: AdminModelToggleItem[]
  maxPromptChars: number
  maxOutputTokens: number
}

export type AdminOpenAiWireApi = 'chat_completions' | 'responses'
export type AdminOpenAiReasoningEffort = '' | 'low' | 'medium' | 'high'

export type AdminModelToggleItem = {
  id: string
  label: string
  enabled: boolean
}

export type AdminAiSettings = {
  provider: 'cloudflare' | 'openrouter'
  systemPrompt: string
  cloudflare: AdminCloudflareConfig
  openrouter: AdminOpenRouterConfig
}

export type AdminModelUsage = {
  provider: 'cloudflare' | 'openrouter'
  modelId: string
  modelLabel: string
  totalCalls: number
  successCalls: number
  failedCalls: number
  quotaRejectedCalls: number
  promptChars: number
  responseChars: number
  promptTokens: number
  completionTokens: number
  lastCalledAt?: string
}

export type AdminUsageTrendBucket = {
  provider: 'cloudflare' | 'openrouter'
  bucketStartAt: string
  totalCalls: number
  successCalls: number
  failedCalls: number
  quotaRejectedCalls: number
}

export type AdminCloudflareBudget = {
  date: string
  usedNeurons: number
  dailyNeuronBudget: number
  remainingNeurons: number
  freeOnly: boolean
}

export type AdminOpenRouterBalance = {
  available: boolean
  message?: string
  totalCredits?: number
  totalUsage?: number
  remainingCredits?: number
  keyLabel?: string
  keyUsage?: number
  keyLimit?: number | null
  keyLimitRemaining?: number | null
  freeTier?: boolean
}

export type AdminUsageSnapshot = {
  models: AdminModelUsage[]
  trendBuckets: AdminUsageTrendBucket[]
  cloudflareBudget: AdminCloudflareBudget
  openrouterBalance?: AdminOpenRouterBalance
}

export type AdminUserSummary = {
  id: string
  email: string
  imageQuotaUsed: number
  imagePaidQuotaRemaining: number
  imagePaidQuotaUsed: number
  imageQuotaPeriodStartedAt?: string
  createdAt?: string
  updatedAt?: string
}

export type AdminUserQuotaUpdate = {
  imageQuotaUsed: number
  imagePaidQuotaRemaining: number
  imagePaidQuotaUsed: number
}

export type AdminUsersSnapshot = {
  configured: boolean
  users: AdminUserSummary[]
  error?: string
  loadedAt: string
}

export type AdminRole = 'super_admin' | 'admin'

export type AdminRoleSource = 'env' | 'database'

export type AdminSessionInfo = {
  userId: string
  email: string
  role: AdminRole
  isSuperAdmin: boolean
}

export type AdminRoleSummary = AdminSessionInfo & {
  source: AdminRoleSource
  createdAt?: string
  updatedAt?: string
}

export type AdminRolesSnapshot = {
  configured: boolean
  roles: AdminRoleSummary[]
  error?: string
  loadedAt: string
}

export type AdminStateResponse = {
  authenticated?: boolean
  admin?: AdminSessionInfo
  history: AdminHistoryStats
  ai: AdminAiSettings
  usage: AdminUsageSnapshot
  users?: AdminUsersSnapshot
  roles?: AdminRolesSnapshot
  serverTime: string
}

export type ReceivedFile = {
  id: string
  historyId?: string
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
