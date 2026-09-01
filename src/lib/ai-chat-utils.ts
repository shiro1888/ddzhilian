import type { DragEvent } from 'react'
import type {
  AiChatConversationMessage,
  AiChatConversationRecord,
  AiChatImageInput,
  AiChatMessageAttachmentSummary,
} from './ddzhilian-types'
import { createBrowserId } from './create-browser-id'

export type ChatAiMessage = AiChatConversationMessage
export type ChatAiConversation = AiChatConversationRecord

export type ChatAiAttachment = {
  id: string
  kind: 'image' | 'text'
  name: string
  size: number
  mimeType?: string
  url?: string
  previewUrl?: string
  text?: string
}

export const AI_CHAT_STORAGE_KEY = 'ddzhilian-ai-chat-conversations'
export const MAX_STORED_CONVERSATIONS = 50
export const MAX_IMAGE_ATTACHMENTS = 99
export const MAX_TEXT_ATTACHMENTS = 99
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
export const MAX_TEXT_BYTES = 96 * 1024
export const MAX_TEXT_CONTEXT_CHARS = 18_000

const CONVERSATION_CONTEXT_MENU_WIDTH = 176
const CONVERSATION_CONTEXT_MENU_HEIGHT = 162
const CONVERSATION_CONTEXT_MENU_MARGIN = 8

export function clampContextMenuPosition(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function resolveContextMenuPosition(
  conversationRect: DOMRect,
  railRect: DOMRect,
) {
  const maxLeft = railRect.width - CONVERSATION_CONTEXT_MENU_WIDTH - CONVERSATION_CONTEXT_MENU_MARGIN
  const maxTop = railRect.height - CONVERSATION_CONTEXT_MENU_HEIGHT - CONVERSATION_CONTEXT_MENU_MARGIN
  const preferredLeft = conversationRect.right - railRect.left - CONVERSATION_CONTEXT_MENU_WIDTH - CONVERSATION_CONTEXT_MENU_MARGIN
  const fallbackLeft = conversationRect.left - railRect.left + CONVERSATION_CONTEXT_MENU_MARGIN
  const top = conversationRect.top - railRect.top + CONVERSATION_CONTEXT_MENU_MARGIN

  return {
    left: clampContextMenuPosition(
      preferredLeft >= CONVERSATION_CONTEXT_MENU_MARGIN ? preferredLeft : fallbackLeft,
      CONVERSATION_CONTEXT_MENU_MARGIN,
      maxLeft,
    ),
    top: clampContextMenuPosition(top, CONVERSATION_CONTEXT_MENU_MARGIN, maxTop),
  }
}

export function createId(prefix: string) {
  return createBrowserId(prefix)
}

export function buildConversationTitle(prompt: string) {
  const title = prompt.replace(/\s+/g, ' ').trim()
  if (!title) {
    return '新对话'
  }

  return title.length > 24 ? `${title.slice(0, 24)}...` : title
}

export function createEmptyConversation(): ChatAiConversation {
  const now = new Date().toISOString()
  return {
    id: createId('ai-conversation'),
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

export function createSampleMessages(modelLabel: string): ChatAiMessage[] {
  const now = Date.now()
  const timeAt = (offsetMs: number) => new Date(now + offsetMs).toISOString()
  const assistantModel = modelLabel || '默认模型'

  return [
    {
      id: createId('ai-message'),
      role: 'user',
      content: '帮我写一个 JS 防抖函数，并解释什么时候用。',
      createdAt: timeAt(0),
      status: 'complete',
    },
    {
      id: createId('ai-message'),
      role: 'assistant',
      content: [
        '可以。防抖适合处理高频触发但只需要最后一次结果的场景，例如搜索输入、窗口尺寸变化、表单自动保存。',
        '',
        '```js',
        'function debounce(fn, delay = 300) {',
        '  let timerId',
        '',
        '  return function debounced(...args) {',
        '    window.clearTimeout(timerId)',
        '    timerId = window.setTimeout(() => {',
        '      fn.apply(this, args)',
        '    }, delay)',
        '  }',
        '}',
        '```',
      ].join('\n'),
      createdAt: timeAt(700),
      status: 'complete',
      model: assistantModel,
    },
  ]
}

export function isStoredMessage(value: unknown): value is ChatAiMessage {
  if (!value || typeof value !== 'object') {
    return false
  }

  const message = value as Partial<ChatAiMessage>
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    typeof message.createdAt === 'string'
  )
}

export function isStoredConversation(value: unknown): value is ChatAiConversation {
  if (!value || typeof value !== 'object') {
    return false
  }

  const conversation = value as Partial<ChatAiConversation>
  return (
    typeof conversation.id === 'string' &&
    typeof conversation.title === 'string' &&
    typeof conversation.createdAt === 'string' &&
    typeof conversation.updatedAt === 'string' &&
    Array.isArray(conversation.messages) &&
    conversation.messages.every(isStoredMessage)
  )
}

export function normalizeConversations(conversations: ChatAiConversation[]) {
  const sanitized = conversations
    .filter(isStoredConversation)
    .map((conversation) => ({
      ...conversation,
      title: conversation.title.trim() || '新对话',
      messages: conversation.messages.map((message) => ({
        ...message,
        status: message.status === 'streaming' ? 'stopped' : message.status,
      })),
    }))
    .sort(compareConversationsForDisplay)
    .slice(0, MAX_STORED_CONVERSATIONS)

  return sanitized.length > 0 ? sanitized : [createEmptyConversation()]
}

export function compareConversationsForDisplay(left: ChatAiConversation, right: ChatAiConversation) {
  if (left.pinned !== right.pinned) {
    return left.pinned ? -1 : 1
  }

  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
}

export function readStoredConversations() {
  if (typeof window === 'undefined') {
    return [createEmptyConversation()]
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(AI_CHAT_STORAGE_KEY) ?? '[]') as unknown
    if (Array.isArray(parsed)) {
      return normalizeConversations(parsed.filter(isStoredConversation))
    }
  } catch {
    // Corrupt local storage should not block opening the chat page.
  }

  return [createEmptyConversation()]
}

export function formatConversationTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }

  return `${Math.max(1, Math.round(size / 1024)).toString()} KB`
}

export function formatSourceHostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function getFileExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export function isImageFile(file: File) {
  return ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)
}

export function isReadableTextFile(file: File) {
  if (file.type.startsWith('text/')) {
    return true
  }

  return [
    'csv',
    'json',
    'md',
    'txt',
    'ts',
    'tsx',
    'js',
    'jsx',
    'css',
    'html',
    'xml',
    'yaml',
    'yml',
    'log',
  ].includes(getFileExtension(file.name))
}

export function hasAiDraggedFiles(event: DragEvent<HTMLElement>) {
  const { dataTransfer } = event
  return dataTransfer.files.length > 0 || Array.from(dataTransfer.types).includes('Files')
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error(`${file.name} 读取失败。`))
    reader.readAsDataURL(file)
  })
}

export function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error(`${file.name} 读取失败。`))
    reader.readAsText(file)
  })
}

export function buildAttachmentDisplay(attachments: ChatAiAttachment[]) {
  if (attachments.length === 0) {
    return ''
  }

  return `\n\n附件：${attachments.map((attachment) => attachment.name).join('、')}`
}

export function buildPromptWithTextAttachments(prompt: string, attachments: ChatAiAttachment[]) {
  const textAttachments = attachments.filter((attachment) => attachment.kind === 'text' && attachment.text)
  if (textAttachments.length === 0) {
    return prompt
  }

  let usedChars = 0
  const sections = textAttachments.map((attachment) => {
    const remaining = MAX_TEXT_CONTEXT_CHARS - usedChars
    const content = (attachment.text ?? '').slice(0, Math.max(0, remaining))
    usedChars += content.length
    return [
      `文件：${attachment.name}`,
      '```text',
      content,
      '```',
    ].join('\n')
  })

  return [
    prompt,
    '',
    '下面是用户上传的文本附件内容，请作为上下文参考：',
    sections.join('\n\n'),
  ].join('\n')
}

export function buildImageInputs(attachments: ChatAiAttachment[]): AiChatImageInput[] {
  return attachments
    .filter((attachment) => attachment.kind === 'image' && attachment.url)
    .map((attachment) => ({
      url: attachment.url ?? '',
      mimeType: attachment.mimeType,
      alt: attachment.name,
    }))
}

export function buildAttachmentSummaries(attachments: ChatAiAttachment[]): AiChatMessageAttachmentSummary[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    size: attachment.size,
    mimeType: attachment.mimeType,
    ...(attachment.kind === 'text' && attachment.text
      ? { textPreview: attachment.text.replace(/\s+/g, ' ').trim().slice(0, 180) }
      : {}),
  }))
}

export function buildConversationMarkdown(conversation: ChatAiConversation) {
  const lines = [
    `# ${conversation.title}`,
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    '',
  ]

  for (const message of conversation.messages) {
    lines.push(`## ${message.role === 'user' ? '你' : 'DD助手'}`)
    lines.push('')
    lines.push(message.content || '正在生成...')

    if (message.attachments?.length) {
      lines.push('')
      lines.push('附件：')
      for (const attachment of message.attachments) {
        lines.push(`- ${attachment.kind === 'image' ? '图片' : '文件'}：${attachment.name}（${formatFileSize(attachment.size)}）`)
        if (attachment.textPreview) {
          lines.push(`  预览：${attachment.textPreview}`)
        }
      }
    }

    lines.push('')
  }

  return `${lines.join('\n').trim()}\n`
}

export function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // Fall back to the legacy textarea path below for older browsers or denied permissions.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.setAttribute('readonly', '')
  try {
    document.body.appendChild(textarea)
    textarea.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}

export function markCodeCopyButton(button: HTMLButtonElement, copied = true) {
  const previousText = button.textContent ?? '复制'
  button.textContent = copied ? '已复制' : '复制失败'
  button.classList.toggle('is-copied', copied)

  window.setTimeout(() => {
    button.textContent = previousText
    button.classList.remove('is-copied')
  }, 1200)
}
