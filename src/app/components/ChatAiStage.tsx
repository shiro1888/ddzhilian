import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Plus, Send, X } from 'lucide-react'
import { navigateBackToText } from '../../lib/navigate-back-to-text'
import type {
  ChangeEvent,
  CompositionEvent as ReactCompositionEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
} from 'react'
import type {
  AiChatConversationMessage,
  AiChatConversationRecord,
  AiChatImageInput,
  AiChatResponse,
  AiAvailabilityState,
  AiModelOption,
  AiQuotaStatus,
} from '../../lib/ddzhilian-types'
import type { AiDraftContextPayload, AiDraftRequest } from '../types'
import { extractPlainTextFromRichText, openHtmlDocumentFullscreenPreview, sanitizeRichTextHtml } from '../utils'
import { TextThinkingMatrixLoader } from './TextThinkingMatrixLoader'
import {
  AI_CHAT_STORAGE_KEY,
  MAX_IMAGE_ATTACHMENTS,
  MAX_IMAGE_BYTES,
  MAX_STORED_CONVERSATIONS,
  MAX_TEXT_ATTACHMENTS,
  MAX_TEXT_BYTES,
  buildAttachmentDisplay,
  buildAttachmentSummaries,
  buildConversationMarkdown,
  buildConversationTitle,
  buildImageInputs,
  buildPromptWithTextAttachments,
  compareConversationsForDisplay,
  copyTextToClipboard,
  createEmptyConversation,
  createId,
  createSampleMessages,
  downloadTextFile,
  formatConversationTime,
  formatFileSize,
  formatSourceHostname,
  hasAiDraggedFiles,
  isImageFile,
  isReadableTextFile,
  markCodeCopyButton,
  normalizeConversations,
  readFileAsDataUrl,
  readFileAsText,
  readStoredConversations,
  resolveContextMenuPosition,
} from '../../lib/ai-chat-utils'
import type { ChatAiAttachment, ChatAiConversation, ChatAiMessage } from '../../lib/ai-chat-utils'
import { getAiModelOptionValue } from '../../lib/message-display'

const NEW_AI_MESSAGE_ANIMATION_MS = 500
const NEW_AI_MESSAGE_ANIMATION_CLEANUP_MS = NEW_AI_MESSAGE_ANIMATION_MS + 150
const REMOTE_SAVE_DEBOUNCE_MS = 700
const SHOW_SAMPLE_OUTPUT = process.env.NODE_ENV === 'development'
const quickPromptSuggestions = [
  {
    label: '总结文字',
    description: '粘贴长文或选择文件，提炼关键结论与行动项',
    prompt: '请帮我总结下面这段内容，保留关键结论和行动项：\n\n',
  },
  {
    label: '写代码',
    description: '描述需求，生成清晰、可维护的代码',
    prompt: '请帮我写一段清晰、可维护的代码，实现：',
  },
  {
    label: '分析图片',
    description: '上传截图或照片，识别重点与潜在问题',
    prompt: '请分析我上传的图片，指出重点信息和可能需要注意的问题。',
  },
  {
    label: '解释文件',
    description: '读取文本、日志或配置文件，解释结构和异常',
    prompt: '请解释我上传的文件内容，指出它的用途、关键字段和需要注意的问题。',
  },
  {
    label: '辅助生成传输说明',
    description: '为即将发送的文件生成简短清楚的说明',
    prompt: '请帮我为即将通过 DD直连发送的文件生成一段简短说明，包含文件内容、接收方需要做什么、注意事项：\n\n',
  },
]

export function resolveAiChatPendingStatusLabel(message: Pick<AiChatConversationMessage, 'webSearch'>) {
  return message.webSearch ? 'searching' : 'thinking'
}

type ChatAiStageProps = {
  aiModelOptions: AiModelOption[]
  selectedAiModel: string
  selectedAiModelLabel: string
  aiAvailability?: AiAvailabilityState
  aiAvailabilityMessage?: string
  isConversationSyncReady: boolean
  onAiModelChange: (model: string) => void
  onAskAi: (
    prompt: string,
    options?: {
      provider?: string
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
  draftRequest?: AiDraftRequest | null
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

export function ChatAiStage({
  aiModelOptions,
  selectedAiModel,
  selectedAiModelLabel,
  aiAvailability = 'available',
  aiAvailabilityMessage,
  isConversationSyncReady,
  onAiModelChange,
  onAskAi,
  onListConversations,
  onSaveConversations,
  onDeleteConversationRemote,
  onQuotaStatusChange,
  draftRequest,
}: ChatAiStageProps) {
  const [conversations, setConversations] = useState<ChatAiConversation[]>(readStoredConversations)
  const [activeConversationId, setActiveConversationId] = useState(() => conversations[0]?.id ?? '')
  const [draft, setDraft] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false)
  const [attachments, setAttachments] = useState<ChatAiAttachment[]>([])
  const [draftContext, setDraftContext] = useState<AiDraftContextPayload | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [pendingDeleteConversationId, setPendingDeleteConversationId] = useState<string | null>(null)
  const [conversationContextMenu, setConversationContextMenu] = useState<ConversationContextMenu | null>(null)
  const [activeGeneration, setActiveGeneration] = useState<ActiveGeneration | null>(null)
  const [animatedMessageIds, setAnimatedMessageIds] = useState<Set<string>>(() => new Set())
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const activeGenerationRef = useRef<ActiveGeneration | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const messageAnimationTimeoutsRef = useRef<Map<string, number>>(new Map())
  const hasLoadedRemoteRef = useRef(false)
  const isApplyingRemoteRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isDraftComposingRef = useRef(false)
  const handledDraftRequestIdRef = useRef<string | null>(null)

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0],
    [activeConversationId, conversations],
  )
  const contextMenuConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === conversationContextMenu?.conversationId),
    [conversationContextMenu?.conversationId, conversations],
  )
  const pendingDeleteConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === pendingDeleteConversationId) ?? null,
    [conversations, pendingDeleteConversationId],
  )
  const isPendingDeleteConversation = Boolean(pendingDeleteConversation)
  const isActiveConversationEmpty = !activeConversation || activeConversation.messages.length === 0
  const filteredConversations = useMemo(() => {
    const visibleConversations = conversations
      .filter((conversation) => showArchived ? conversation.archived : !conversation.archived)
      .sort(compareConversationsForDisplay)
    const keyword = searchDraft.trim().toLowerCase()
    if (!keyword) {
      return visibleConversations
    }

    return visibleConversations.filter((conversation) => {
      const lastMessage = conversation.messages[conversation.messages.length - 1]?.content ?? ''
      return `${conversation.title}\n${extractPlainTextFromRichText(lastMessage)}`
        .toLowerCase()
        .includes(keyword)
    })
  }, [conversations, searchDraft, showArchived])
  const isGenerating = Boolean(activeGeneration)
  const isAiAvailable = aiAvailability === 'available'
  const trimmedDraft = draft.trim()
  const canSubmit = isAiAvailable && (Boolean(trimmedDraft) || attachments.length > 0) && !isGenerating
  const aiAvailabilityTitle = aiAvailability === 'checking'
    ? '正在检查 DD助手'
    : 'DD助手暂不可用'
  const aiAvailabilityDescription = aiAvailabilityMessage || (
    aiAvailability === 'checking'
      ? '正在确认服务器是否已经配置 AI 服务，请稍候。'
      : '管理员尚未配置 AI 服务。'
  )
  const isSyncAuthNotice = localError?.includes('AI 会话同步授权') ?? false

  useEffect(() => {
    activeGenerationRef.current = activeGeneration
  }, [activeGeneration])

  useEffect(() => {
    if (!draftRequest || handledDraftRequestIdRef.current === draftRequest.id) {
      return
    }

    handledDraftRequestIdRef.current = draftRequest.id
    setDraft(draftRequest.text)
    setDraftContext(
      draftRequest.contextLabel || draftRequest.contextItems?.length
        ? {
            contextLabel: draftRequest.contextLabel,
            contextItems: draftRequest.contextItems,
          }
        : null,
    )
    setLocalError(null)
  }, [draftRequest])

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

    if (!activeConversation?.messages.length) {
      thread.scrollTop = 0
      return
    }

    const distanceFromBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight
    if (distanceFromBottom < 220) {
      thread.scrollTop = thread.scrollHeight
    }
  }, [activeConversation?.messages])

  useEffect(() => {
    const animationTimeouts = messageAnimationTimeoutsRef.current

    return () => {
      for (const timeoutId of animationTimeouts.values()) {
        window.clearTimeout(timeoutId)
      }
      animationTimeouts.clear()
    }
  }, [])

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
    setDraftContext(null)
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
    const rail = event.currentTarget.closest('.dd-ai-chat__rail')
    const railRect = rail?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect()
    const position = resolveContextMenuPosition(event.currentTarget.getBoundingClientRect(), railRect)

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

  const addAiAttachments = (files: File[]) => {
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

  const handleAttachmentSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    addAiAttachments(files)
  }

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!hasAiDraggedFiles(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setIsDraggingFiles(true)
  }

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!hasAiDraggedFiles(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (!isDraggingFiles) {
      setIsDraggingFiles(true)
    }
  }

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!hasAiDraggedFiles(event)) {
      return
    }

    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }

    event.stopPropagation()
    setIsDraggingFiles(false)
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasAiDraggedFiles(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setIsDraggingFiles(false)

    if (!isAiAvailable) {
      setLocalError(aiAvailabilityDescription)
      return
    }

    if (isGenerating) {
      setLocalError('请先停止当前生成，再添加附件。')
      return
    }

    addAiAttachments(Array.from(event.dataTransfer.files))
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

  const armAiMessageAnimations = (messageIds: string[]) => {
    if (messageIds.length === 0) {
      return
    }

    setAnimatedMessageIds((current) => {
      const nextIds = new Set(current)
      for (const messageId of messageIds) {
        nextIds.add(messageId)
      }
      return nextIds
    })

    for (const messageId of messageIds) {
      const previousTimeoutId = messageAnimationTimeoutsRef.current.get(messageId)
      if (previousTimeoutId !== undefined) {
        window.clearTimeout(previousTimeoutId)
      }

      const timeoutId = window.setTimeout(() => {
        messageAnimationTimeoutsRef.current.delete(messageId)
        setAnimatedMessageIds((current) => {
          if (!current.has(messageId)) {
            return current
          }

          const nextIds = new Set(current)
          nextIds.delete(messageId)
          return nextIds
        })
      }, NEW_AI_MESSAGE_ANIMATION_CLEANUP_MS)

      messageAnimationTimeoutsRef.current.set(messageId, timeoutId)
    }
  }

  const sendPrompt = (prompt: string, options?: { appendUserMessage?: boolean }) => {
    const normalizedPrompt = prompt.trim()
    if (!isAiAvailable) {
      setLocalError(aiAvailabilityDescription)
      return
    }

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
    const userMessageId = createId('ai-message')
    const assistantMessageId = createId('ai-message')
    const nextMessages: ChatAiMessage[] = [
      ...(options?.appendUserMessage === false
        ? []
        : [{
            id: userMessageId,
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
        webSearch: shouldUseWebSearch ? { query: normalizedPrompt, sources: [] } : undefined,
      },
    ]
    const nextAnimatedMessageIds = nextMessages.map((message) => message.id)
    armAiMessageAnimations(nextAnimatedMessageIds)

    updateConversation(activeConversation.id, (conversation) => ({
      ...conversation,
      title: conversation.messages.length === 0 ? buildConversationTitle(normalizedPrompt || displayPrompt) : conversation.title,
      updatedAt: now,
      messages: [...conversation.messages, ...nextMessages],
    }))

    setDraft('')
    setAttachments([])
    setDraftContext(null)
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

  const handleRichMessageClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }

    const fullscreenButton = target.closest<HTMLElement>('.dd-html-document__fullscreen')
    if (fullscreenButton && event.currentTarget.contains(fullscreenButton)) {
      event.preventDefault()
      event.stopPropagation()
      openHtmlDocumentFullscreenPreview(fullscreenButton)
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
      void copyTextToClipboard(codeText).then((copied) => markCodeCopyButton(copyButton, copied))
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

  const activeConversationMessages = activeConversation?.messages ?? []
  const activeConversationAttachmentCount = activeConversationMessages.reduce(
    (count, message) => count + (message.attachments?.length ?? 0),
    0,
  )
  const latestAssistantMessage = [...activeConversationMessages]
    .reverse()
    .find((message) => message.role === 'assistant')
  const latestWebSearchSourceCount = latestAssistantMessage?.webSearch?.sources.length ?? 0
  const draftContextItems = draftContext?.contextItems ?? []
  const currentContextLabel = attachments.length > 0
    ? `${attachments.length.toString()} 个待发送附件`
    : draftContext?.contextLabel
      ? draftContext.contextLabel
      : activeConversationAttachmentCount > 0
        ? `${activeConversationAttachmentCount.toString()} 个会话附件`
        : '本地输入与当前会话'

  return (
    <section
      className={`dd-ai-chat${isDraggingFiles ? ' is-dragging-files' : ''}`}
      aria-label="AI 聊天"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
                  <small>{conversation.messages[conversation.messages.length - 1]?.content || '还没有消息'}</small>
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
                if (isGenerating) {
                  setLocalError('请先停止当前生成，再删除对话。')
                  setConversationContextMenu(null)
                  return
                }

                setPendingDeleteConversationId(contextMenuConversation.id)
                setConversationContextMenu(null)
              }}
            >
              删除
            </button>
          </div>
        ) : null}
      </aside>

      <div
        className={[
          'dd-ai-chat__workspace',
          isPendingDeleteConversation ? 'is-confirm-open' : '',
        ].filter(Boolean).join(' ')}
      >
        {isDraggingFiles ? (
          <div className="dd-ai-chat__drag-overlay" role="status" aria-live="polite">
            <div className="dd-ai-chat__drag-panel">
              <span className="dd-ai-chat__drag-icon" aria-hidden="true">
                <Plus size={24} strokeWidth={2.5} aria-hidden="true" />
              </span>
              <strong>{isGenerating ? '生成中暂不能添加附件' : '松开添加附件'}</strong>
              <span>{isGenerating ? '请先停止当前生成' : '支持图片、文本和代码文件'}</span>
            </div>
          </div>
        ) : null}
        <header className="dd-ai-chat__topbar">
          <div className="dd-ai-chat__title-wrap">
            <button
              type="button"
              className="dd-ai-chat__back-btn"
              aria-label="返回"
              onClick={navigateBackToText}
            >
              <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
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
            <div className="dd-ai-chat__control-strip" aria-label="AI 模型与上下文">
              <label className="dd-ai-chat__model-pill">
                <span>模型</span>
                <select
                  value={selectedAiModel}
                  disabled={!isAiAvailable || aiModelOptions.length === 0 || isGenerating}
                  aria-label="选择 AI 模型"
                  onChange={(event) => onAiModelChange(event.target.value)}
                >
                  {aiModelOptions.length > 0 ? (
                    aiModelOptions.map((model) => (
                      <option key={getAiModelOptionValue(model)} value={getAiModelOptionValue(model)}>
                        {model.label}
                      </option>
                    ))
                  ) : (
                    <option value="">默认模型</option>
                  )}
                </select>
              </label>
              <button
                type="button"
                className={`dd-ai-chat__search-pill${isWebSearchEnabled ? ' is-on' : ''}`}
                disabled={!isAiAvailable || isGenerating}
                aria-pressed={isWebSearchEnabled}
                onClick={() => setIsWebSearchEnabled((current) => !current)}
              >
                联网搜索 · {isWebSearchEnabled ? '开启' : '关闭'}
              </button>
              <span className="dd-ai-chat__context-pill" title={currentContextLabel}>
                上下文：{currentContextLabel}
              </span>
            </div>
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
                      disabled={!isAiAvailable || aiModelOptions.length === 0 || isGenerating}
                      aria-label="选择 AI 模型"
                      onChange={(event) => onAiModelChange(event.target.value)}
                    >
                      {aiModelOptions.length > 0 ? (
                        aiModelOptions.map((model) => (
                          <option key={getAiModelOptionValue(model)} value={getAiModelOptionValue(model)}>
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
                      disabled={!isAiAvailable || isGenerating}
                      onChange={(event) => setIsWebSearchEnabled(event.currentTarget.checked)}
                    />
                    <span>联网搜索</span>
                  </label>
                </details>
                {SHOW_SAMPLE_OUTPUT ? (
                  <button type="button" onClick={insertSampleMessages} disabled={!isAiAvailable || isGenerating}>
                    示例输出
                  </button>
                ) : null}
              </div>
            </details>
          </div>
          <div className="dd-ai-chat__mobile-context" aria-label="AI 当前状态">
            <span>
              <em>模型</em>
              <strong title={selectedAiModelLabel || '默认模型'}>{selectedAiModelLabel || '默认模型'}</strong>
            </span>
            <span>
              <em>同步</em>
              <strong>{isConversationSyncReady ? '已开启' : '仅本机'}</strong>
            </span>
            <span>
              <em>搜索</em>
              <strong>{isWebSearchEnabled ? '开启' : '关闭'}</strong>
            </span>
            <span>
              <em>附件</em>
              <strong>{attachments.length.toString()} 项</strong>
            </span>
          </div>
        </header>

        {pendingDeleteConversation ? (
          <div className="dd-ai-chat__confirm">
            <span>确认删除这条会话？</span>
            <button type="button" onClick={() => deleteConversation(pendingDeleteConversation.id)}>
              删除
            </button>
            <button type="button" onClick={() => setPendingDeleteConversationId(null)}>
              取消
            </button>
          </div>
        ) : null}

        <div className={['dd-ai-chat__thread', isActiveConversationEmpty ? 'is-empty' : ''].filter(Boolean).join(' ')} ref={threadRef}>
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <div className="dd-ai-chat__empty">
              <span className="dd-ai-chat__empty-badge" aria-hidden="true">DD</span>
              <strong>{isAiAvailable ? '你好，我是 DD助手' : aiAvailabilityTitle}</strong>
              <span>
                {isAiAvailable
                  ? '把文件拖进来，或选择一个常用任务开始。仅向模型服务发送你明确提交的内容和上下文。'
                  : aiAvailabilityDescription}
              </span>
              {isAiAvailable ? (
                <div className="dd-ai-chat__quick-prompts" aria-label="常用提示">
                  {quickPromptSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.label}
                      type="button"
                      onClick={() => {
                        setDraft(suggestion.prompt)
                        setDraftContext(null)
                      }}
                      disabled={isGenerating}
                    >
                      <strong>{suggestion.label}</strong>
                      <span>{suggestion.description}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {SHOW_SAMPLE_OUTPUT ? (
                <button type="button" onClick={insertSampleMessages} disabled={!isAiAvailable || isGenerating}>
                  示例输出
                </button>
              ) : null}
            </div>
          ) : (
            activeConversation.messages.map((message) => (
              <article
                key={message.id}
                className={[
                  'dd-ai-chat__message',
                  `is-${message.role}`,
                  message.status ? `is-${message.status}` : '',
                  animatedMessageIds.has(message.id) ? 'is-new-message' : '',
                ].filter(Boolean).join(' ')}
                data-ai-chat-message-id={message.id}
              >
                <div className="dd-ai-chat__avatar" aria-hidden="true">
                  {message.role === 'user' ? '我' : 'AI'}
                </div>
                <div className="dd-ai-chat__message-body">
                  <div className="dd-ai-chat__message-meta">
                    <strong>{message.role === 'user' ? '你' : 'DD助手'}</strong>
                    <span>{formatConversationTime(message.createdAt)}</span>
                  </div>
                  {message.status === 'streaming' && !message.content ? (
                    <div className="dd-ai-chat__bubble dd-ai-chat__thinking" role="status" aria-live="polite">
                      <TextThinkingMatrixLoader />
                      <span className="dd-ai-chat__thinking-label">{resolveAiChatPendingStatusLabel(message)}</span>
                    </div>
                  ) : (
                    <div
                      className="dd-ai-chat__bubble dd-chatbox__bubble--rich"
                      onClick={handleRichMessageClick}
                      dangerouslySetInnerHTML={{
                        __html: message.content
                          ? sanitizeRichTextHtml(message.content)
                          : '<p>正在生成...</p>',
                      }}
                    />
                  )}
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
                    <details className="dd-ai-chat__sources" aria-label="联网搜索来源">
                      <summary>
                        <span>联网搜索来源</span>
                        <small>{message.webSearch.sources.length} 个</small>
                      </summary>
                      <div className="dd-ai-chat__sources-list">
                        {message.webSearch.sources.map((source) => (
                          <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                            <span>{source.title}</span>
                            <small>{formatSourceHostname(source.url)}</small>
                            {source.snippet ? <em>{source.snippet}</em> : null}
                          </a>
                        ))}
                      </div>
                    </details>
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
            hidden
            disabled={!isAiAvailable || isGenerating}
            accept="image/png,image/jpeg,image/webp,image/gif,text/*,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.css,.html,.xml,.yaml,.yml,.log"
            onChange={handleAttachmentSelection}
          />
          <button
            type="button"
            className="dd-ai-chat__attach"
            aria-label="添加附件"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isAiAvailable || isGenerating}
          >
            <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
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
                      <X size={12} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <textarea
              value={draft}
              placeholder="给 DD助手发消息，或把文件拖到这里…"
              aria-label="给 DD助手发消息"
              enterKeyHint="send"
              rows={attachments.length > 0 ? 2 : 3}
              disabled={!isAiAvailable}
              onChange={handleDraftChange}
              onCompositionStart={handleDraftCompositionStart}
              onCompositionEnd={handleDraftCompositionEnd}
              onKeyDown={handleDraftKeyDown}
            />
          </div>
          <div className="dd-ai-chat__composer-footer">
            <span>
              {isAiAvailable
                ? 'Enter 发送 · Shift + Enter 换行 · 会话记录默认保存在本机'
                : aiAvailabilityDescription}
            </span>
            <div>
              {isGenerating ? (
                <button type="button" className="is-secondary" onClick={handleStopGeneration}>
                  停止生成
                </button>
              ) : null}
              <button type="submit" disabled={!canSubmit} className="dd-ai-chat__submit-btn">
                <Send size={13} strokeWidth={2.2} aria-hidden="true" />
                <span>发送</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      <aside className="dd-ai-chat__context" aria-label="AI 上下文">
        <section className="dd-ai-chat__context-section">
          <div className="dd-ai-chat__context-head">
            <strong>当前上下文</strong>
            <span>{currentContextLabel}</span>
          </div>
          <div className="dd-ai-chat__context-list">
            <div className="dd-ai-chat__context-row">
              <span>模型</span>
              <strong>{selectedAiModelLabel || '默认模型'}</strong>
            </div>
            <div className="dd-ai-chat__context-row">
              <span>会话同步</span>
              <strong>{isConversationSyncReady ? '已开启' : '仅本机'}</strong>
            </div>
            <div className="dd-ai-chat__context-row">
              <span>联网搜索</span>
              <strong>{isWebSearchEnabled ? '开启' : '关闭'}</strong>
            </div>
            <div className="dd-ai-chat__context-row">
              <span>生成状态</span>
              <strong>{isGenerating ? '生成中' : '空闲'}</strong>
            </div>
          </div>
          {draftContextItems.length > 0 ? (
            <div className="dd-ai-chat__context-files is-transfer-context" aria-label="传输文件上下文">
              {draftContextItems.map((item) => (
                <div key={item.id} className="dd-ai-chat__context-file">
                  <span>DD</span>
                  <div>
                    <strong title={item.label}>{item.label}</strong>
                    {item.meta ? <small>{item.meta}</small> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="dd-ai-chat__context-section">
          <div className="dd-ai-chat__context-head">
            <strong>待发送附件</strong>
            <span>{attachments.length.toString()} 项</span>
          </div>
          {attachments.length > 0 ? (
            <div className="dd-ai-chat__context-files">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="dd-ai-chat__context-file">
                  <span>{attachment.kind === 'image' ? 'IMG' : 'TXT'}</span>
                  <div>
                    <strong>{attachment.name}</strong>
                    <small>{formatFileSize(attachment.size)}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="dd-ai-chat__context-empty">还没有附件。可拖拽图片、文本或代码文件到页面。</p>
          )}
        </section>

        <section className="dd-ai-chat__context-section">
          <div className="dd-ai-chat__context-head">
            <strong>会话状态</strong>
            <span>{activeConversationMessages.length.toString()} 条消息</span>
          </div>
          <div className="dd-ai-chat__context-list">
            <div className="dd-ai-chat__context-row">
              <span>历史附件</span>
              <strong>{activeConversationAttachmentCount.toString()}</strong>
            </div>
            <div className="dd-ai-chat__context-row">
              <span>搜索来源</span>
              <strong>{latestWebSearchSourceCount.toString()}</strong>
            </div>
          </div>
          <p className="dd-ai-chat__context-note">DD助手只会向模型服务发送你明确提交的内容；未选择的本机文件不会上传。</p>
        </section>
      </aside>
    </section>
  )
}
