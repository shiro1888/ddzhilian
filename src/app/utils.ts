import { THEME_STORAGE_KEY } from './config'
import type {
  DeviceBarStatus,
  FileConversationEntry,
  PeerConnectionStatus,
  ThemeId,
} from './types'

export function transferStatusLabel(
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

export function transferStatusTone(
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

export function deviceRelationText(peer: {
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

export function deviceBarStatus(status?: PeerConnectionStatus): DeviceBarStatus {
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

export function deviceBarStatusLabel(status: DeviceBarStatus) {
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

export function formatFileSize(bytes: number) {
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

export function formatRelativeTime(iso: string) {
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

export function formatChatDivider(iso: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function shouldInsertDivider(previousIso: string | null, currentIso: string) {
  if (!previousIso) {
    return true
  }

  const previousTime = new Date(previousIso).getTime()
  const currentTime = new Date(currentIso).getTime()
  return currentTime - previousTime > 15 * 60 * 1000
}

export function collapseBroadcastTextRecords<T extends { fromSelf: boolean; text: string; createdAt: string }>(
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

export function deviceConnectionLabel(status?: PeerConnectionStatus) {
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

export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
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

export function resolveInitialTheme(): ThemeId {
  if (typeof window === 'undefined') {
    return 'classic'
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return storedTheme === 'chat-desktop' || storedTheme === 'classic' ? storedTheme : 'classic'
}
