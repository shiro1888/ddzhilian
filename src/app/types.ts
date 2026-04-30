import type { ReactNode } from 'react'

export type TransferMode = 'file' | 'text'
export type SessionStatus = 'waiting' | 'active' | 'completed'
export type NavView = 'connect' | 'send' | 'receive' | 'text' | 'image' | 'sessions' | 'admin'
export type InterfaceMode = 'classic' | 'snaplink'
export type TextMode = 'long' | 'chat'
export type PeerConnectionStatus = 'connecting' | 'connected' | 'failed' | 'closed'
export type RoomListStatus = 'connected' | 'online' | 'history'
export type SharedContentTab = 'chat' | 'media' | 'files' | 'links'

export type AttachmentDraft = {
  id: string
  file: File
  objectUrl: string
  kind: 'image' | 'video' | 'file'
  name: string
  size: number
  mimeType?: string
}

export type UiSession = {
  id: string
  roomId: string
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

export type FileConversationEntry = {
  id: string
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
  tone: 'pending' | 'active' | 'completed' | 'failed'
  progress: number
  downloadUrl?: string
  downloadName?: string
  onDownload?: () => void
  isDownloadDisabled?: boolean
  action?: 'retry' | 'cancel'
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

export type NavItem = {
  id: NavView
  label: string
  hint: string
  icon: ReactNode
}

export type StageMeta = {
  title: string
  description: string
  primaryAction: string
  secondaryAction: string
}

export type QuickPanel = {
  title: string
  body: string
}

export type SessionArtifact = {
  kind: TransferMode
  summary: string
}

export type RoomListItem = {
  roomId: string
  title: string
  previewText: string
  updatedAt: string
  updatedAtLabel: string
  isPublic: boolean
  memberCount: number
  onlineCount: number
  status: RoomListStatus
  pinned: boolean
  unreadCount: number
}
