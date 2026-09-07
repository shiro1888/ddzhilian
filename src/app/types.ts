import type { DocumentPreviewKind, DocumentPreviewPayload } from '../lib/document-preview'
import type { TransferStatus } from '../lib/ddzhilian-types'

export type NavView = 'text' | 'chat' | 'image' | 'admin' | 'command'
export type PeerConnectionStatus = 'connecting' | 'connected' | 'failed' | 'closed'
export type RoomListStatus = 'connected' | 'online' | 'history'
export type SharedContentTab = 'chat' | 'media' | 'files' | 'links'

export type FileConversationEntry = {
  id: string
  historyId?: string
  sessionId?: string
  kind: 'outgoing' | 'incoming'
  fromSelf: boolean
  createdAt: string
  fileName: string
  fileSize: number
  mimeType?: string
  previewUrl?: string
  subtitle: string
  detail: string
  statusLabel: string
  transferStatus?: TransferStatus
  transferSpeedLabel?: string
  transferEtaLabel?: string
  tone: 'pending' | 'active' | 'completed' | 'failed'
  progress: number
  downloadUrl?: string
  downloadName?: string
  onDownload?: () => void
  isDownloadDisabled?: boolean
  documentPreviewKind?: DocumentPreviewKind
  documentPreviewHref?: string
  onOpenDocumentPreview?: () => DocumentPreviewPayload | Promise<DocumentPreviewPayload>
  isDocumentPreviewDisabled?: boolean
  action?: 'retry' | 'cancel'
  canRecall?: boolean
}

export type ComposerImageDraft = {
  id: string
  name: string
  size: number
  mimeType?: string
  dataUrl: string
}

export type AiDraftContextItem = {
  id: string
  label: string
  meta?: string
}

export type AiDraftContextPayload = {
  contextLabel?: string
  contextItems?: AiDraftContextItem[]
}

export type AiDraftRequest = AiDraftContextPayload & {
  id: string
  text: string
}

export type ConversationNotice = {
  id: string
  sessionId: string
  deviceId: string
  createdAt: string
  text: string
}

export type UnifiedConversationEntry =
  | {
      id: string
      entryType: 'text'
      sessionId: string
      sourceDeviceId?: string
      fromSelf: boolean
      senderName: string
      status?: 'sending' | 'failed'
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
      senderName: string
      createdAt: string
      file: FileConversationEntry
    }

export type RoomListMemberItem = {
  deviceId: string
  deviceName: string
  platform: string
  online: boolean
  isSelf: boolean
}

export type RoomListItem = {
  roomId: string
  title: string
  previewText: string
  updatedAt: string
  updatedAtLabel: string
  isPublic: boolean
  publicIndex?: number
  memberCount: number
  onlineCount: number
  members: RoomListMemberItem[]
  status: RoomListStatus
  pinned: boolean
  unreadCount: number
  isAssistant?: boolean
}

export type OnlineDeviceListItem = {
  deviceId: string
  deviceName: string
  platform: string
  shortCode?: string
  pairToken?: string
  scopeLabel: string
  lastSeenLabel: string
}
