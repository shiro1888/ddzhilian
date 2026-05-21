import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CompositionEvent as ReactCompositionEvent, FormEvent, KeyboardEvent, MouseEvent } from 'react'
import type {
  AiChatConversationMessage,
  AiChatConversationRecord,
  AiChatImageInput,
  AiChatMessageAttachmentSummary,
  AiChatResponse,
  AiModelOption,
  AiQuotaStatus,
} from '../../lib/ddzhilian-types'
import { extractPlainTextFromRichText, sanitizeRichTextHtml } from '../utils'

const AI_CHAT_STORAGE_KEY = 'ddzhilian-ai-chat-conversations'
const MAX_STORED_CONVERSATIONS = 50
const MAX_IMAGE_ATTACHMENTS = 4
const MAX_TEXT_ATTACHMENTS = 4
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_TEXT_BYTES = 96 * 1024
const MAX_TEXT_CONTEXT_CHARS = 18_000
const REMOTE_SAVE_DEBOUNCE_MS = 700
const SHOW_SAMPLE_OUTPUT = process.env.NODE_ENV === 'development'
const quickPromptSuggestions = [
  {
    label: '总结文字',
    prompt: '请帮我总结下面这段内容，保留关键结论和行动项：\n\n',
  },
  {
    label: '写代码',
    prompt: '请帮我写一段清晰、可维护的代码，实现：',
  },
  {
    label: '分析图片',
    prompt: '请分析我上传的图片，指出重点信息和可能需要注意的问题。',
  },
]

type ChatAiMessage = AiChatConversationMessage
type ChatAiConversation = AiChatConversationRecord

type ChatAiAttachment = {
  id: string
  kind: 'image' | 'text'
  name: string
  size: number
  mimeType?: string
  url?: string
  previewUrl?: string
  text?: string
}

type ChatAiStageProps = {
  aiModelOptions: AiModelOption[]
  selectedAiModel: string
  selectedAiModelLabel: string
  isConversationSyncReady: boolean
  onAiModelChange: (model: string) => void
  onAskAi: (
    prompt: string,
    options?: {
      model?: string
      images?: AiChatImageInput[]
      webSearch?: boolean
      signal?: AbortSignal
    },
  ) => Promise<AiChatResponse>
  onListConversations: () => Promise<AiChatConversationRecord[]>
  onSaveConversations: (conversations: AiChatConversationRecord[]) => Promise<AiChatConversationRecord[]>
  onDeleteConversationRemote: (conversationId?: string) => Promise<AiChatConversationRecord[]>
  onQuotaStatusChange: (quota: AiQuotaStatus) => void
}

type ActiveGeneration = {
  conversationId: string
  messageId: string
  controller: AbortController
}

type ConversationContextMenu = {
  conversationId: string
  left: number
  top: number
}

const CONVERSATION_CONTEXT_MENU_WIDTH = 176
const CONVERSATION_CONTEXT_MENU_HEIGHT = 162
const CONVERSATION_CONTEXT_MENU_MARGIN = 8
const CONVERSATION_CONTEXT_MENU_OFFSET_X = -10
const CONVERSATION_CONTEXT_MENU_OFFSET_Y = -50

function clampContextMenuPosition(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function resolveContextMenuPosition(
  pointerX: number,
  pointerY: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const maxLeft = viewportWidth - CONVERSATION_CONTEXT_MENU_WIDTH - CONVERSATION_CONTEXT_MENU_MARGIN
  const maxTop = viewportHeight - CONVERSATION_CONTEXT_MENU_HEIGHT - CONVERSATION_CONTEXT_MENU_MARGIN
  const preferredLeft = pointerX + CONVERSATION_CONTEXT_MENU_OFFSET_X
  const preferredTop = pointerY + CONVERSATION_CONTEXT_MENU_OFFSET_Y
  const flippedLeft = pointerX - CONVERSATION_CONTEXT_MENU_WIDTH - CONVERSATION_CONTEXT_MENU_OFFSET_X
  const flippedTop = pointerY - CONVERSATION_CONTEXT_MENU_HEIGHT - CONVERSATION_CONTEXT_MENU_OFFSET_Y
  const left = preferredLeft > maxLeft ? flippedLeft : preferredLeft
  const top = preferredTop > maxTop ? flippedTop : preferredTop

  return {
    left: clampContextMenuPosition(left, CONVERSATION_CONTEXT_MENU_MARGIN, maxLeft),
    top: clampContextMenuPosition(top, CONVERSATION_CONTEXT_MENU_MARGIN, maxTop),
  }
}

function ConversationArchiveIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4.25 6.75h11.5" />
      <path d="M5.25 6.75v7.1c0 .9.73 1.63 1.63 1.63h6.24c.9 0 1.63-.73 1.63-1.63v-7.1" />
      <path d="M6.1 4.5h7.8c.49 0 .9.4.9.9v1.35H5.2V5.4c0-.5.4-.9.9-.9Z" />
      <path d="M8.2 9.25h3.6" />
    </svg>
  )
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function buildConversationTitle(prompt: string) {
  const title = prompt.replace(/\s+/g, ' ').trim()
  if (!title) {
    return '新对话'
  }

  return title.length > 24 ? `${title.slice(0, 24)}...` : title
}

function createEmptyConversation(): ChatAiConversation {
  const now = new Date().toISOString()
  return {
    id: createId('ai-conversation'),
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

function createSampleMessages(modelLabel: string): ChatAiMessage[] {
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

function isStoredMessage(value: unknown): value is ChatAiMessage {
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

function isStoredConversation(value: unknown): value is ChatAiConversation {
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

function normalizeConversations(conversations: ChatAiConversation[]) {
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

function compareConversationsForDisplay(left: ChatAiConversation, right: ChatAiConversation) {
  if (left.pinned !== right.pinned) {
    return left.pinned ? -1 : 1
  }

  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
}

function readStoredConversations() {
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

function formatConversationTime(value: string) {
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

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }

  return `${Math.max(1, Math.round(size / 1024)).toString()} KB`
}

function formatSourceHostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function getFileExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function isImageFile(file: File) {
  return ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)
}

function isReadableTextFile(file: File) {
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error(`${file.name} 读取失败。`))
    reader.readAsDataURL(file)
  })
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error(`${file.name} 读取失败。`))
    reader.readAsText(file)
  })
}

function buildAttachmentDisplay(attachments: ChatAiAttachment[]) {
  if (attachments.length === 0) {
    return ''
  }

  return `\n\n附件：${attachments.map((attachment) => attachment.name).join('、')}`
}

function buildPromptWithTextAttachments(prompt: string, attachments: ChatAiAttachment[]) {
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

function buildImageInputs(attachments: ChatAiAttachment[]): AiChatImageInput[] {
  return attachments
    .filter((attachment) => attachment.kind === 'image' && attachment.url)
    .map((attachment) => ({
      url: attachment.url ?? '',
      mimeType: attachment.mimeType,
      alt: attachment.name,
    }))
}

function buildAttachmentSummaries(attachments: ChatAiAttachment[]): AiChatMessageAttachmentSummary[] {
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

function buildConversationMarkdown(conversation: ChatAiConversation) {
  const lines = [
    `# ${conversation.title}`,
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    '',
  ]

  for (const message of conversation.messages) {
    lines.push(`## ${message.role === 'user' ? '你' : 'DD直连 AI'}`)
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

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

async function copyTextToClipboard(value: string) {
  if (!navigator.clipboard) {
    return
  }

  await navigator.clipboard.writeText(value)
}

function markCodeCopyButton(button: HTMLButtonElement) {
  const previousText = button.textContent ?? '复制'
  button.textContent = '已复制'
  button.classList.add('is-copied')

  window.setTimeout(() => {
    button.textContent = previousText
    button.classList.remove('is-copied')
  }, 1200)
}

function openHtmlDocumentFullscreen(button: HTMLElement) {
  const dialog = button.closest('.dd-html-document')?.querySelector<HTMLDialogElement>('.dd-html-document__dialog')
  if (!dialog) {
    return false
  }

  if (!dialog.dataset.backdropClickLocked) {
    dialog.dataset.backdropClickLocked = 'true'
    dialog.addEventListener('click', (dialogEvent) => {
      if (dialogEvent.target !== dialog) {
        return
      }

      dialogEvent.preventDefault()
      dialogEvent.stopPropagation()
    })
  }

  if (!dialog.open) {
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    } else {
      dialog.setAttribute('open', '')
    }
  }

  return true
}

export function ChatAiStage({
  aiModelOptions,
  selectedAiModel,
  selectedAiModelLabel,
  isConversationSyncReady,
  onAiModelChange,
  onAskAi,
  onListConversations,
  onSaveConversations,
  onDeleteConversationRemote,
  onQuotaStatusChange,
}: ChatAiStageProps) {
  const [conversations, setConversations] = useState<ChatAiConversation[]>(readStoredConversations)
  const [activeConversationId, setActiveConversationId] = useState(() => conversations[0]?.id ?? '')
  const [draft, setDraft] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false)
  const [attachments, setAttachments] = useState<ChatAiAttachment[]>([])
  const [localError, setLocalError] = useState<string | null>(null)
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [pendingDeleteConversationId, setPendingDeleteConversationId] = useState<string | null>(null)
  const [conversationContextMenu, setConversationContextMenu] = useState<ConversationContextMenu | null>(null)
  const [activeGeneration, setActiveGeneration] = useState<ActiveGeneration | null>(null)
  const activeGenerationRef = useRef<ActiveGeneration | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const hasLoadedRemoteRef = useRef(false)
  const isApplyingRemoteRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isDraftComposingRef = useRef(false)

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0],
    [activeConversationId, conversations],
  )
  const contextMenuConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === conversationContextMenu?.conversationId),
    [conversationContextMenu?.conversationId, conversations],
  )
  const filteredConversations = useMemo(() => {
    const visibleConversations = conversations
      .filter((conversation) => showArchived ? conversation.archived : !conversation.archived)
      .sort(compareConversationsForDisplay)
    const keyword = searchDraft.trim().toLowerCase()
    if (!keyword) {
      return visibleConversations
    }

    return visibleConversations.filter((conversation) => {
      const lastMessage = conversation.messages.at(-1)?.content ?? ''
      return `${conversation.title}\n${extractPlainTextFromRichText(lastMessage)}`
        .toLowerCase()
        .includes(keyword)
    })
  }, [conversations, searchDraft, showArchived])
  const isGenerating = Boolean(activeGeneration)
  const trimmedDraft = draft.trim()
  const canSubmit = (Boolean(trimmedDraft) || attachments.length > 0) && !isGenerating
  const isSyncAuthNotice = localError?.includes('AI 会话同步授权') ?? false

  useEffect(() => {
    activeGenerationRef.current = activeGeneration
  }, [activeGeneration])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      AI_CHAT_STORAGE_KEY,
      JSON.stringify(conversations.slice(0, MAX_STORED_CONVERSATIONS)),
    )
  }, [conversations])

  useEffect(() => {
    if (!isConversationSyncReady || hasLoadedRemoteRef.current) {
      return
    }

    let disposed = false
    void onListConversations()
      .then((remoteConversations) => {
        if (disposed) {
          return
        }

        hasLoadedRemoteRef.current = true
        if (remoteConversations.length === 0) {
          return
        }

        const normalized = normalizeConversations(remoteConversations)
        isApplyingRemoteRef.current = true
        setConversations(normalized)
        setActiveConversationId((current) =>
          normalized.some((conversation) => conversation.id === current)
            ? current
            : normalized[0]?.id ?? '',
        )
      })
      .catch((error) => {
        if (disposed) {
          return
        }

        hasLoadedRemoteRef.current = true
        const message = error instanceof Error ? error.message : 'AI 会话同步失败。'
        setLocalError(message)
      })

    return () => {
      disposed = true
    }
  }, [isConversationSyncReady, onListConversations])

  useEffect(() => {
    if (!hasLoadedRemoteRef.current || isApplyingRemoteRef.current || !isConversationSyncReady) {
      isApplyingRemoteRef.current = false
      return
    }

    const timerId = window.setTimeout(() => {
      void onSaveConversations(conversations).catch((error) => {
        const message = error instanceof Error ? error.message : 'AI 会话保存失败。'
        setLocalError(message)
      })
    }, REMOTE_SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timerId)
  }, [conversations, isConversationSyncReady, onSaveConversations])

  useEffect(() => {
    const thread = threadRef.current
    if (!thread) {
      return
    }

    const distanceFromBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight
    if (distanceFromBottom < 220) {
      thread.scrollTop = thread.scrollHeight
    }
  }, [activeConversation?.messages])

  useEffect(() => {
    if (!conversationContextMenu) {
      return
    }

    const closeMenu = () => setConversationContextMenu(null)
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    window.addEventListener('click', closeMenu)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', closeMenu, true)

    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [conversationContextMenu])

  const updateConversation = (
    conversationId: string,
    updater: (conversation: ChatAiConversation) => ChatAiConversation,
  ) => {
    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === conversationId ? updater(conversation) : conversation,
      ),
    )
  }

  const updateAssistantMessage = (
    conversationId: string,
    messageId: string,
    updater: (message: ChatAiMessage) => ChatAiMessage,
  ) => {
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      updatedAt: new Date().toISOString(),
      messages: conversation.messages.map((message) =>
        message.id === messageId ? updater(message) : message,
      ),
    }))
  }

  const createConversation = () => {
    const conversation = createEmptyConversation()
    setConversations((previous) => [conversation, ...previous].slice(0, MAX_STORED_CONVERSATIONS))
    setActiveConversationId(conversation.id)
    setDraft('')
    setAttachments([])
    setPendingDeleteConversationId(null)
    setConversationContextMenu(null)
    setLocalError(null)
  }

  const deleteConversation = (conversationId: string) => {
    if (isGenerating) {
      setLocalError('请先停止当前生成，再删除对话。')
      return
    }

    setConversations((previous) => {
      const next = previous.filter((conversation) => conversation.id !== conversationId)
      if (next.length === 0) {
        const emptyConversation = createEmptyConversation()
        setActiveConversationId(emptyConversation.id)
        return [emptyConversation]
      }

      if (conversationId === activeConversationId) {
        setActiveConversationId(next[0]?.id ?? '')
      }

      return next
    })
    setPendingDeleteConversationId(null)
    setConversationContextMenu(null)

    if (isConversationSyncReady) {
      void onDeleteConversationRemote(conversationId).catch((error) => {
        const message = error instanceof Error ? error.message : '远端删除失败。'
        setLocalError(message)
      })
    }
  }

  const startRename = (conversation = activeConversation) => {
    if (!conversation) {
      return
    }

    setActiveConversationId(conversation.id)
    setRenamingConversationId(conversation.id)
    setTitleDraft(conversation.title)
    setConversationContextMenu(null)
  }

  const commitRename = () => {
    if (!activeConversation || renamingConversationId !== activeConversation.id) {
      return
    }

    const nextTitle = titleDraft.trim()
    if (!nextTitle) {
      setLocalError('会话标题不能为空。')
      return
    }

    updateConversation(activeConversation.id, (conversation) => ({
      ...conversation,
      title: nextTitle.slice(0, 80),
      updatedAt: new Date().toISOString(),
    }))
    setRenamingConversationId(null)
    setTitleDraft('')
    setLocalError(null)
  }

  const toggleConversationPinned = (conversationId: string) => {
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      pinned: !conversation.pinned,
      updatedAt: new Date().toISOString(),
    }))
  }

  const toggleConversationArchived = (conversationId: string) => {
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      archived: !conversation.archived,
      pinned: conversation.archived ? conversation.pinned : false,
      updatedAt: new Date().toISOString(),
    }))
  }

  const openConversationContextMenu = (
    event: MouseEvent<HTMLElement>,
    conversation: ChatAiConversation,
  ) => {
    event.preventDefault()
    const position = resolveContextMenuPosition(
      event.clientX,
      event.clientY,
      window.innerWidth,
      window.innerHeight,
    )

    setActiveConversationId(conversation.id)
    setPendingDeleteConversationId(null)
    setConversationContextMenu({
      conversationId: conversation.id,
      left: position.left,
      top: position.top,
    })
  }

  const exportConversation = (conversation: ChatAiConversation) => {
    const fileName = `${conversation.title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 48) || 'ai-chat'}.md`
    downloadTextFile(fileName, buildConversationMarkdown(conversation))
    setConversationContextMenu(null)
  }

  const branchConversationFromMessage = (messageId: string) => {
    if (!activeConversation || isGenerating) {
      return
    }

    const messageIndex = activeConversation.messages.findIndex((message) => message.id === messageId)
    if (messageIndex < 0) {
      return
    }

    const now = new Date().toISOString()
    const branch: ChatAiConversation = {
      id: createId('ai-conversation'),
      title: `${activeConversation.title.replace(/\s+分支$/, '')} 分支`,
      createdAt: now,
      updatedAt: now,
      parentConversationId: activeConversation.id,
      messages: activeConversation.messages.slice(0, messageIndex + 1),
    }

    setConversations((previous) => [branch, ...previous].slice(0, MAX_STORED_CONVERSATIONS))
    setActiveConversationId(branch.id)
    setLocalError(null)
  }

  const handleAttachmentSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) {
      return
    }

    void (async () => {
      const currentImageCount = attachments.filter((attachment) => attachment.kind === 'image').length
      const currentTextCount = attachments.filter((attachment) => attachment.kind === 'text').length
      let nextImageCount = currentImageCount
      let nextTextCount = currentTextCount
      const nextAttachments: ChatAiAttachment[] = []

      for (const file of files) {
        if (isImageFile(file)) {
          if (nextImageCount >= MAX_IMAGE_ATTACHMENTS) {
            setLocalError(`最多上传 ${MAX_IMAGE_ATTACHMENTS.toString()} 张图片。`)
            continue
          }

          if (file.size > MAX_IMAGE_BYTES) {
            setLocalError(`${file.name} 超过 4MB，已跳过。`)
            continue
          }

          const dataUrl = await readFileAsDataUrl(file)
          nextAttachments.push({
            id: createId('ai-attachment'),
            kind: 'image',
            name: file.name,
            size: file.size,
            mimeType: file.type,
            url: dataUrl,
            previewUrl: dataUrl,
          })
          nextImageCount += 1
          continue
        }

        if (isReadableTextFile(file)) {
          if (nextTextCount >= MAX_TEXT_ATTACHMENTS) {
            setLocalError(`最多上传 ${MAX_TEXT_ATTACHMENTS.toString()} 个文本文件。`)
            continue
          }

          if (file.size > MAX_TEXT_BYTES) {
            setLocalError(`${file.name} 超过 96KB，已跳过。`)
            continue
          }

          const text = await readFileAsText(file)
          nextAttachments.push({
            id: createId('ai-attachment'),
            kind: 'text',
            name: file.name,
            size: file.size,
            mimeType: file.type,
            text,
          })
          nextTextCount += 1
          continue
        }

        setLocalError(`${file.name} 暂不支持，只能上传图片或文本/代码文件。`)
      }

      if (nextAttachments.length > 0) {
        setAttachments((previous) => [...previous, ...nextAttachments])
        setLocalError(null)
      }
    })().catch((error) => {
      const message = error instanceof Error ? error.message : '附件读取失败。'
      setLocalError(message)
    })
  }

  const requestAssistantResponse = async (
    conversationId: string,
    prompt: string,
    assistantMessageId: string,
    images: AiChatImageInput[],
    webSearch: boolean,
  ) => {
    const controller = new AbortController()
    const generation = { conversationId, messageId: assistantMessageId, controller }
    setActiveGeneration(generation)
    setLocalError(null)

    try {
      const answer = await onAskAi(prompt, {
        model: selectedAiModel || undefined,
        images,
        webSearch,
        signal: controller.signal,
      })

      if (answer.quota) {
        onQuotaStatusChange(answer.quota)
      }

      updateAssistantMessage(conversationId, assistantMessageId, (message) => ({
        ...message,
        content: answer.response,
        status: 'complete',
        model: answer.model || message.model,
        webSearch: answer.webSearch,
      }))
    } catch (error) {
      if (controller.signal.aborted) {
        updateAssistantMessage(conversationId, assistantMessageId, (message) => ({
          ...message,
          content: message.content || '已停止生成。',
          status: 'stopped',
        }))
        return
      }

      const message = error instanceof Error ? error.message : 'AI 请求失败。'
      setLocalError(message)
      updateAssistantMessage(conversationId, assistantMessageId, (assistantMessage) => ({
        ...assistantMessage,
        content: message,
        status: 'failed',
      }))
    } finally {
      if (activeGenerationRef.current?.messageId === assistantMessageId) {
        setActiveGeneration(null)
      }
    }
  }

  const sendPrompt = (prompt: string, options?: { appendUserMessage?: boolean }) => {
    const normalizedPrompt = prompt.trim()
    if (!activeConversation || (!normalizedPrompt && attachments.length === 0) || isGenerating) {
      return
    }

    const attachmentsForRequest = attachments
    const attachmentSummaries = buildAttachmentSummaries(attachmentsForRequest)
    const displayPrompt = `${normalizedPrompt || '请分析附件。'}${buildAttachmentDisplay(attachmentsForRequest)}`
    const promptWithFiles = buildPromptWithTextAttachments(
      normalizedPrompt || '请分析附件。',
      attachmentsForRequest,
    )
    const images = buildImageInputs(attachmentsForRequest)
    const shouldUseWebSearch = isWebSearchEnabled && Boolean(normalizedPrompt)
    const now = new Date().toISOString()
    const assistantMessageId = createId('ai-message')
    const nextMessages: ChatAiMessage[] = [
      ...(options?.appendUserMessage === false
        ? []
        : [{
            id: createId('ai-message'),
            role: 'user' as const,
            content: displayPrompt,
            createdAt: now,
            status: 'complete' as const,
            attachments: attachmentSummaries,
          }]),
      {
        id: assistantMessageId,
        role: 'assistant' as const,
        content: '',
        createdAt: now,
        status: 'streaming' as const,
        model: selectedAiModelLabel,
      },
    ]

    updateConversation(activeConversation.id, (conversation) => ({
      ...conversation,
      title: conversation.messages.length === 0 ? buildConversationTitle(normalizedPrompt || displayPrompt) : conversation.title,
      updatedAt: now,
      messages: [...conversation.messages, ...nextMessages],
    }))

    setDraft('')
    setAttachments([])
    void requestAssistantResponse(activeConversation.id, promptWithFiles, assistantMessageId, images, shouldUseWebSearch)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isDraftComposingRef.current) {
      return
    }

    sendPrompt(trimmedDraft)
  }

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || isDraftComposingRef.current) {
      return
    }

    event.preventDefault()
    sendPrompt(trimmedDraft)
  }

  const handleDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value)
  }

  const handleDraftCompositionStart = () => {
    isDraftComposingRef.current = true
  }

  const handleDraftCompositionEnd = (event: ReactCompositionEvent<HTMLTextAreaElement>) => {
    isDraftComposingRef.current = false
    setDraft(event.currentTarget.value)
  }

  const handleStopGeneration = () => {
    activeGenerationRef.current?.controller.abort()
  }

  const handleRegenerate = () => {
    if (!activeConversation || isGenerating) {
      return
    }

    const messages = activeConversation.messages
    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')
    if (!lastUserMessage) {
      setLocalError('没有可重新生成的问题。')
      return
    }

    const assistantMessageId = createId('ai-message')
    const now = new Date().toISOString()

    updateConversation(activeConversation.id, (conversation) => {
      const lastAssistantIndex = [...conversation.messages].reverse().findIndex((message) => message.role === 'assistant')
      const removeIndex =
        lastAssistantIndex >= 0
          ? conversation.messages.length - 1 - lastAssistantIndex
          : -1
      const retainedMessages =
        removeIndex >= 0
          ? conversation.messages.filter((_, index) => index !== removeIndex)
          : conversation.messages

      return {
        ...conversation,
        updatedAt: now,
        messages: [
          ...retainedMessages,
          {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            createdAt: now,
            status: 'streaming',
            model: selectedAiModelLabel,
          },
        ],
      }
    })

    void requestAssistantResponse(
      activeConversation.id,
      lastUserMessage.content,
      assistantMessageId,
      [],
      isWebSearchEnabled,
    )
  }

  const handleRichMessageClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }

    const fullscreenButton = target.closest<HTMLElement>('.dd-html-document__fullscreen')
    if (fullscreenButton && event.currentTarget.contains(fullscreenButton)) {
      event.preventDefault()
      event.stopPropagation()
      openHtmlDocumentFullscreen(fullscreenButton)
      return
    }

    const copyButton = target.closest<HTMLButtonElement>('.dd-code-copy')
    if (!copyButton || !event.currentTarget.contains(copyButton)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const codeText = copyButton.closest('pre')?.querySelector('code')?.textContent ?? ''
    if (codeText) {
      void copyTextToClipboard(codeText).then(() => markCodeCopyButton(copyButton))
    }
  }

  const handleCopyMessage = (message: ChatAiMessage) => {
    void copyTextToClipboard(extractPlainTextFromRichText(message.content) || message.content)
  }

  const insertSampleMessages = () => {
    if (!activeConversation || isGenerating) {
      return
    }

    const now = new Date().toISOString()
    updateConversation(activeConversation.id, (conversation) => ({
      ...conversation,
      title: conversation.messages.length === 0 ? '示例：代码输出' : conversation.title,
      updatedAt: now,
      messages: [
        ...conversation.messages,
        ...createSampleMessages(selectedAiModelLabel),
      ],
    }))
    setLocalError(null)
  }

  return (
    <section className="dd-ai-chat" aria-label="AI 聊天">
      <aside className="dd-ai-chat__rail">
        <div className="dd-ai-chat__rail-head">
          <strong>AI 聊天</strong>
          <button type="button" onClick={createConversation}>
            新建
          </button>
        </div>

        <label className="dd-ai-chat__search">
          <span>搜索</span>
          <input
            value={searchDraft}
            placeholder="搜索会话"
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          <button
            type="button"
            className={showArchived ? 'is-active' : ''}
            onClick={() => setShowArchived((previous) => !previous)}
          >
            {showArchived ? '查看未归档' : '查看归档'}
          </button>
        </label>

        <div className="dd-ai-chat__conversation-list" aria-label="AI 会话列表">
          {filteredConversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`dd-ai-chat__conversation-item${conversation.id === activeConversation?.id ? ' is-active' : ''}`}
              onContextMenu={(event) => openConversationContextMenu(event, conversation)}
            >
              <button
                type="button"
                className="dd-ai-chat__conversation-main"
                onClick={() => {
                  setActiveConversationId(conversation.id)
                  setPendingDeleteConversationId(null)
                  setConversationContextMenu(null)
                }}
              >
                <span>
                  <strong>
                    {conversation.pinned ? '置顶 · ' : ''}
                    {conversation.archived ? '归档 · ' : ''}
                    {conversation.parentConversationId ? '分支 · ' : ''}
                    {conversation.title}
                  </strong>
                  <small>{conversation.messages.at(-1)?.content || '还没有消息'}</small>
                </span>
                <time>{formatConversationTime(conversation.updatedAt)}</time>
              </button>
              <button
                type="button"
                className={`dd-ai-chat__conversation-archive${conversation.archived ? ' is-archived' : ''}`}
                aria-label={conversation.archived ? '取消归档' : '归档'}
                title={conversation.archived ? '取消归档' : '归档'}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleConversationArchived(conversation.id)
                }}
              >
                <ConversationArchiveIcon />
              </button>
            </div>
          ))}
          {filteredConversations.length === 0 ? (
            <div className="dd-ai-chat__no-results">没有匹配的会话</div>
          ) : null}
        </div>
        {conversationContextMenu && contextMenuConversation ? (
          <div
            className="dd-ai-chat__context-menu"
            style={{ left: conversationContextMenu.left, top: conversationContextMenu.top }}
            role="menu"
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button type="button" role="menuitem" onClick={() => startRename(contextMenuConversation)}>
              重命名
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                toggleConversationPinned(contextMenuConversation.id)
                setConversationContextMenu(null)
              }}
            >
              {contextMenuConversation.pinned ? '取消置顶' : '置顶'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => exportConversation(contextMenuConversation)}
              disabled={contextMenuConversation.messages.length === 0}
            >
              导出
            </button>
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={() => {
                setPendingDeleteConversationId(contextMenuConversation.id)
                setConversationContextMenu(null)
              }}
              disabled={isGenerating}
            >
              删除
            </button>
          </div>
        ) : null}
      </aside>

      <div className="dd-ai-chat__workspace">
        <header className="dd-ai-chat__topbar">
          <div>
            {renamingConversationId === activeConversation?.id ? (
              <form
                className="dd-ai-chat__rename"
                onSubmit={(event) => {
                  event.preventDefault()
                  commitRename()
                }}
              >
                <input
                  value={titleDraft}
                  autoFocus
                  maxLength={80}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setRenamingConversationId(null)
                      setTitleDraft('')
                    }
                  }}
                />
              </form>
            ) : (
              <h1>{activeConversation?.title ?? '新对话'}</h1>
            )}
          </div>
          <div className="dd-ai-chat__topbar-actions">
            {renamingConversationId === activeConversation?.id ? (
              <>
                <button type="button" onClick={commitRename}>
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRenamingConversationId(null)
                    setTitleDraft('')
                  }}
                >
                  取消
                </button>
              </>
            ) : null}
            <details className="dd-ai-chat__more">
              <summary aria-label="更多操作" title="更多操作">
                <span className="dd-ai-chat__more-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </summary>
              <div className="dd-ai-chat__more-menu">
                <details className="dd-ai-chat__advanced">
                  <summary>高级设置</summary>
                  <label className="dd-ai-chat__model-field">
                    <span>模型</span>
                    <select
                      value={selectedAiModel}
                      disabled={aiModelOptions.length === 0 || isGenerating}
                      aria-label="选择 AI 模型"
                      onChange={(event) => onAiModelChange(event.target.value)}
                    >
                      {aiModelOptions.length > 0 ? (
                        aiModelOptions.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.label}
                          </option>
                        ))
                      ) : (
                        <option value="">默认模型</option>
                      )}
                    </select>
                  </label>
                  <label className="dd-ai-chat__toggle-field">
                    <input
                      type="checkbox"
                      checked={isWebSearchEnabled}
                      disabled={isGenerating}
                      onChange={(event) => setIsWebSearchEnabled(event.currentTarget.checked)}
                    />
                    <span>联网搜索</span>
                  </label>
                </details>
                <button type="button" onClick={handleRegenerate} disabled={isGenerating || !activeConversation?.messages.length}>
                  重新生成
                </button>
                {SHOW_SAMPLE_OUTPUT ? (
                  <button type="button" onClick={insertSampleMessages} disabled={isGenerating}>
                    示例输出
                  </button>
                ) : null}
              </div>
            </details>
          </div>
        </header>

        {pendingDeleteConversationId === activeConversation?.id ? (
          <div className="dd-ai-chat__confirm">
            <span>确认删除当前会话？</span>
            <button type="button" onClick={() => deleteConversation(activeConversation.id)}>
              删除
            </button>
            <button type="button" onClick={() => setPendingDeleteConversationId(null)}>
              取消
            </button>
          </div>
        ) : null}

        <div className="dd-ai-chat__thread" ref={threadRef}>
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <div className="dd-ai-chat__empty">
              <strong>开始一段 AI 对话</strong>
              <span>可以直接问问题，也可以要求它输出 Markdown、代码块或结构化说明。</span>
              <div className="dd-ai-chat__quick-prompts" aria-label="常用提示">
                {quickPromptSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => setDraft(suggestion.prompt)}
                    disabled={isGenerating}
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
              {SHOW_SAMPLE_OUTPUT ? (
                <button type="button" onClick={insertSampleMessages}>
                  示例输出
                </button>
              ) : null}
            </div>
          ) : (
            activeConversation.messages.map((message) => (
              <article
                key={message.id}
                className={`dd-ai-chat__message is-${message.role}${message.status ? ` is-${message.status}` : ''}`}
              >
                <div className="dd-ai-chat__avatar" aria-hidden="true">
                  {message.role === 'user' ? '我' : 'AI'}
                </div>
                <div className="dd-ai-chat__message-body">
                  <div className="dd-ai-chat__message-meta">
                    <strong>{message.role === 'user' ? '你' : 'DD直连 AI'}</strong>
                    <span>{formatConversationTime(message.createdAt)}</span>
                  </div>
                  <div
                    className="dd-ai-chat__bubble dd-chatbox__bubble--rich"
                    onClick={handleRichMessageClick}
                    dangerouslySetInnerHTML={{
                      __html: message.content
                        ? sanitizeRichTextHtml(message.content)
                        : '<p>正在生成...</p>',
                    }}
                  />
                  {message.attachments?.length ? (
                    <div className="dd-ai-chat__message-attachments">
                      {message.attachments.map((attachment) => (
                        <span key={attachment.id}>
                          <strong>{attachment.kind === 'image' ? '图片' : '文件'}</strong>
                          {attachment.name}
                          <small>{formatFileSize(attachment.size)}</small>
                          {attachment.textPreview ? <em>{attachment.textPreview}</em> : null}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {message.webSearch?.sources.length ? (
                    <div className="dd-ai-chat__sources" aria-label="联网搜索来源">
                      <strong>来源</strong>
                      {message.webSearch.sources.map((source) => (
                        <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                          <span>{source.title}</span>
                          <small>{formatSourceHostname(source.url)}</small>
                          {source.snippet ? <em>{source.snippet}</em> : null}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  <div className="dd-ai-chat__message-actions">
                    <button type="button" onClick={() => handleCopyMessage(message)}>
                      复制
                    </button>
                    <button type="button" onClick={() => branchConversationFromMessage(message.id)} disabled={isGenerating}>
                      分支
                    </button>
                    {message.status === 'failed' ? <span>请求失败</span> : null}
                    {message.status === 'stopped' ? <span>已停止</span> : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        {localError ? (
          <div className={`dd-ai-chat__error${isSyncAuthNotice ? ' is-status' : ''}`}>{localError}</div>
        ) : null}

        <form className="dd-ai-chat__composer" onSubmit={handleSubmit}>
          <input
            ref={fileInputRef}
            className="dd-ai-chat__file-input"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,text/*,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.css,.html,.xml,.yaml,.yml,.log"
            onChange={handleAttachmentSelection}
          />
          <button
            type="button"
            className="dd-ai-chat__attach"
            aria-label="添加附件"
            onClick={() => fileInputRef.current?.click()}
            disabled={isGenerating}
          >
            +
          </button>
          <div className="dd-ai-chat__composer-main">
            {attachments.length > 0 ? (
              <div className="dd-ai-chat__attachments">
                {attachments.map((attachment) => (
                  <span key={attachment.id} className="dd-ai-chat__attachment">
                    {attachment.previewUrl ? (
                      <img src={attachment.previewUrl} alt="" />
                    ) : null}
                    <span>{attachment.name}</span>
                    <small>{formatFileSize(attachment.size)}</small>
                    <button
                      type="button"
                      aria-label={`移除 ${attachment.name}`}
                      onClick={() => {
                        setAttachments((previous) => previous.filter((item) => item.id !== attachment.id))
                      }}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <textarea
              value={draft}
              placeholder="给 DD直连 AI 发送消息"
              rows={attachments.length > 0 ? 2 : 3}
              onChange={handleDraftChange}
              onCompositionStart={handleDraftCompositionStart}
              onCompositionEnd={handleDraftCompositionEnd}
              onKeyDown={handleDraftKeyDown}
            />
          </div>
          <div className="dd-ai-chat__composer-footer">
            <span>Enter 发送，Shift + Enter 换行</span>
            <div>
              {isGenerating ? (
                <button type="button" className="is-secondary" onClick={handleStopGeneration}>
                  停止生成
                </button>
              ) : null}
              <button type="submit" disabled={!canSubmit}>
                发送
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}
