import type { DeviceBarStatus, FileConversationEntry, PeerConnectionStatus } from './types'

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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizePlainRichText(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, '<br />')
}

function isSafeUrl(value: string, kind: 'href' | 'src') {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return false
  }

  if (kind === 'src' && normalizedValue.startsWith('data:image/')) {
    return true
  }

  return /^(https?:|mailto:|tel:)/i.test(normalizedValue)
}

function sanitizeStyleAttribute(style: CSSStyleDeclaration) {
  const declarations: string[] = []
  const allowedProperties = ['color', 'font-family', 'font-size', 'text-align', 'text-indent', 'margin-left']

  for (const property of allowedProperties) {
    const value = style.getPropertyValue(property).trim()
    if (value) {
      declarations.push(`${property}: ${value}`)
    }
  }

  return declarations.join('; ')
}

export function extractPlainTextFromRichText(value: string) {
  if (!value) {
    return ''
  }

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return value.replace(/\u200B/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const text = documentFragment.body.textContent ?? ''
  return text.replace(/\u200B/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

export function sanitizeRichTextHtml(value: string) {
  if (!value) {
    return ''
  }

  if (!/[<>]/.test(value) || typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return normalizePlainRichText(value)
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const root = documentFragment.body.firstElementChild
  if (!root) {
    return normalizePlainRichText(value)
  }

  const allowedTags = new Set([
    'a',
    'audio',
    'b',
    'blockquote',
    'br',
    'code',
    'div',
    'em',
    'font',
    'h1',
    'h2',
    'h3',
    'i',
    'img',
    'li',
    'ol',
    'p',
    'pre',
    'span',
    'strong',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
  ])

  const sanitizeNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml((node.textContent ?? '').replace(/\u200B/g, ''))
    }

    if (!(node instanceof HTMLElement)) {
      return ''
    }

    const tagName = node.tagName.toLowerCase()
    const childrenHtml = Array.from(node.childNodes).map((childNode) => sanitizeNode(childNode)).join('')

    if (!allowedTags.has(tagName)) {
      return childrenHtml
    }

    const attributes: string[] = []
    const styleDeclarations: string[] = []
    const sanitizedStyle = sanitizeStyleAttribute(node.style)
    if (sanitizedStyle) {
      styleDeclarations.push(sanitizedStyle)
    }

    const align = node.getAttribute('align')?.trim()
    if (align && ['left', 'center', 'right', 'justify'].includes(align.toLowerCase())) {
      styleDeclarations.push(`text-align: ${align.toLowerCase()}`)
    }

    if (tagName === 'a') {
      const href = node.getAttribute('href')?.trim() ?? ''
      if (isSafeUrl(href, 'href')) {
        attributes.push(`href="${escapeHtml(href)}"`)
        attributes.push('target="_blank"')
        attributes.push('rel="noreferrer noopener"')
      }
    }

    if (tagName === 'img') {
      const src = node.getAttribute('src')?.trim() ?? ''
      if (!isSafeUrl(src, 'src')) {
        return ''
      }

      attributes.push(`src="${escapeHtml(src)}"`)
      const alt = node.getAttribute('alt')?.trim() ?? ''
      if (alt) {
        attributes.push(`alt="${escapeHtml(alt)}"`)
      }
    }

    if (tagName === 'audio') {
      const src = node.getAttribute('src')?.trim() ?? ''
      if (!isSafeUrl(src, 'src')) {
        return ''
      }

      attributes.push(`src="${escapeHtml(src)}"`)
      attributes.push('controls')
    }

    if (tagName === 'font') {
      const color = node.getAttribute('color')?.trim()
      if (color) {
        styleDeclarations.push(`color: ${color}`)
      }

      const face = node.getAttribute('face')?.trim()
      if (face) {
        styleDeclarations.push(`font-family: ${face}`)
      }

      const size = node.getAttribute('size')?.trim()
      const sizeMap: Record<string, string> = {
        '1': '12px',
        '2': '13px',
        '3': '14px',
        '4': '16px',
        '5': '18px',
        '6': '24px',
        '7': '32px',
      }
      if (size && sizeMap[size]) {
        styleDeclarations.push(`font-size: ${sizeMap[size]}`)
      }
    }

    if (tagName === 'td' || tagName === 'th') {
      const colspan = node.getAttribute('colspan')?.trim()
      if (colspan && /^\d+$/.test(colspan)) {
        attributes.push(`colspan="${colspan}"`)
      }

      const rowspan = node.getAttribute('rowspan')?.trim()
      if (rowspan && /^\d+$/.test(rowspan)) {
        attributes.push(`rowspan="${rowspan}"`)
      }
    }

    if (tagName === 'br') {
      return '<br />'
    }

    if (styleDeclarations.length > 0) {
      const mergedStyle = Array.from(new Set(styleDeclarations)).join('; ')
      attributes.push(`style="${escapeHtml(mergedStyle)}"`)
    }

    const attributeString = attributes.length > 0 ? ` ${attributes.join(' ')}` : ''
    return `<${tagName}${attributeString}>${childrenHtml}</${tagName}>`
  }

  return Array.from(root.childNodes).map((node) => sanitizeNode(node)).join('')
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
