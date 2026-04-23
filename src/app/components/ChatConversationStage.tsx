import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ClipboardEvent, DragEvent, FormEvent, MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { AttachmentDraft, FileConversationEntry, SharedContentTab, UnifiedConversationEntry } from '../types'
import {
  extractPlainTextFromRichText,
  formatChatDivider,
  formatFileSize,
  linkifyPlainTextUrls,
  readImageFileAsDataUrl,
  renderAppleMusicLyricShare,
  renderInlineImageHtml,
  sanitizeBotReplyHtml,
  sanitizeRichTextHtml,
  shouldInsertDivider,
} from '../utils'

type SelectOption = {
  label: string
  value: string
}

type FloatingPanelPosition = {
  left: number
  top: number
}

type ImagePreviewState = {
  src: string
  alt: string
}

type MessageContextMenuState = {
  entryId: string
  text: string
  senderName: string
  fromSelf: boolean
  left: number
  top: number
}

type QuoteDraftState = {
  senderName: string
  text: string
}

const quickEmojis = [
  '😀', '😄', '😁', '😂', '🤣', '😊', '🙂', '😉', '😍', '🥰', '😘', '😎',
  '🤔', '🫠', '😴', '😭', '😡', '🥳', '🤯', '😇', '🤖', '👀', '🙌', '👏',
  '👍', '👎', '🙏', '💪', '👋', '🤝', '🎉', '🎊', '✨', '🔥', '⭐', '🌈',
  '☀️', '🌙', '⚡', '🍀', '🍎', '🍕', '☕', '🎵', '🎮', '🏀', '🚀', '❤️',
]

type SharedPanelTab = Exclude<SharedContentTab, 'chat'>

const sharedPanelTabs: Array<{ id: SharedPanelTab; label: string }> = [
  { id: 'media', label: '媒体' },
  { id: 'files', label: '文件' },
  { id: 'links', label: '链接' },
]

const defaultRichTextFonts: SelectOption[] = [
  { label: '字体样式', value: '' },
  { label: 'Microsoft YaHei', value: '"Microsoft YaHei"' },
  { label: 'SimSun', value: 'SimSun' },
  { label: 'SimHei', value: 'SimHei' },
  { label: 'KaiTi', value: 'KaiTi' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Times New Roman', value: '"Times New Roman"' },
  { label: 'Segoe UI', value: '"Segoe UI"' },
  { label: 'Noto Sans SC', value: '"Noto Sans SC"' },
  { label: 'IBM Plex Mono', value: '"IBM Plex Mono"' },
]

const richTextSizes: SelectOption[] = [
  { label: '字体大小', value: '' },
  { label: '10 px', value: '10' },
  { label: '12 px', value: '12' },
  { label: '14 px', value: '14' },
  { label: '16 px', value: '16' },
  { label: '18 px', value: '18' },
  { label: '20 px', value: '20' },
  { label: '24 px', value: '24' },
  { label: '28 px', value: '28' },
  { label: '32 px', value: '32' },
  { label: '36 px', value: '36' },
  { label: '42 px', value: '42' },
  { label: '48 px', value: '48' },
]

function escapeInlineHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderPlainTextForEditor(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      escapeInlineHtml(line)
        .replace(/\t/g, '&nbsp;&nbsp;')
        .replace(/^ +/, (spaces) => '&nbsp;'.repeat(spaces.length)),
    )
    .join('<br />')
}

function shouldPasteCodeLikePlainText(value: string) {
  const lines = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return false
  }

  const hasCommentLine = lines.some((line) => /^(?:#|\/\/|\/\*)/.test(line))
  const hasAssignmentLine = lines.some((line) =>
    /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])?\s*=/.test(line),
  )
  const hasCallExpression = /\b[A-Za-z_$][\w$]*\s*\([^)\n]*\)/.test(value)
  const hasCodePunctuation = /[{}()[\];=<>]/.test(value)

  return hasCodePunctuation && (hasAssignmentLine || hasCallExpression || hasCommentLine)
}

const paragraphFormats: SelectOption[] = [
  { label: '段落', value: '' },
  { label: '正文', value: 'p' },
  { label: '标题 1', value: 'h1' },
  { label: '标题 2', value: 'h2' },
  { label: '标题 3', value: 'h3' },
  { label: '引用', value: 'blockquote' },
]

const themeRichTextColors: SelectOption[] = [
  { label: '炭黑 #111111', value: '#111111' },
  { label: '深灰 #434343', value: '#434343' },
  { label: '灰色 #666666', value: '#666666' },
  { label: '银灰 #999999', value: '#999999' },
  { label: '浅灰 #b7b7b7', value: '#b7b7b7' },
  { label: '雾白 #d9d9d9', value: '#d9d9d9' },
  { label: '米白 #efefef', value: '#efefef' },
  { label: '纯白 #ffffff', value: '#ffffff' },
  { label: '深红 #980000', value: '#980000' },
  { label: '红色 #ff0000', value: '#ff0000' },
  { label: '橘红 #ff5b00', value: '#ff5b00' },
  { label: '粉橘 #ff8c5a', value: '#ff8c5a' },
  { label: '棕色 #783f04', value: '#783f04' },
  { label: '赭色 #b45f06', value: '#b45f06' },
  { label: '金黄 #f1c232', value: '#f1c232' },
  { label: '亮黄 #ffff00', value: '#ffff00' },
]

const standardRichTextColors: SelectOption[] = [
  { label: '深绿 #274e13', value: '#274e13' },
  { label: '绿色 #38761d', value: '#38761d' },
  { label: '草绿 #6aa84f', value: '#6aa84f' },
  { label: '浅绿 #93c47d', value: '#93c47d' },
  { label: '青绿 #0c7f65', value: '#0c7f65' },
  { label: '青色 #00a2a8', value: '#00a2a8' },
  { label: '湖蓝 #00c0ff', value: '#00c0ff' },
  { label: '天蓝 #9fc5e8', value: '#9fc5e8' },
  { label: '海军蓝 #073763', value: '#073763' },
  { label: '蓝色 #1155cc', value: '#1155cc' },
  { label: '亮蓝 #3c78d8', value: '#3c78d8' },
  { label: '淡蓝 #6fa8dc', value: '#6fa8dc' },
  { label: '靛蓝 #20124d', value: '#20124d' },
  { label: '紫色 #674ea7', value: '#674ea7' },
  { label: '兰紫 #8e7cc3', value: '#8e7cc3' },
  { label: '粉紫 #c27ba0', value: '#c27ba0' },
]

type InsertPanelType = 'link'

type InsertPanelState = {
  type: InsertPanelType
  value?: string
  text?: string
}

type ChatConversationStageProps = {
  isDragging: boolean
  unifiedConversationEntries: UnifiedConversationEntry[]
  fileConversationEmptyState: string
  chatDraft: string
  fileInputId: string
  activeTransferLabel: string
  isSendDisabled: boolean
  isAiGenerating: boolean
  aiQuotaLabel: string
  enterToSend: boolean
  attachments: AttachmentDraft[]
  isSharedPanelOpen: boolean
  sharedContentTab: SharedContentTab
  sharedMediaEntries: FileConversationEntry[]
  sharedFileEntries: FileConversationEntry[]
  sharedLinkEntries: Array<{
    id: string
    url: string
    label: string
    sourceName: string
    createdAt: string
  }>
  onChatDraftChange: (value: string) => void
  onFileSelection: (event: ChangeEvent<HTMLInputElement>) => void
  onRetryTransfer: (id: string) => void
  onCancelTransfer: (id: string) => void
  onSendText: (quoteHtml?: string) => void
  onRecallText: (entryId: string) => Promise<void> | void
  onRemoveAttachment: (id: string) => void
  onEnterToSendChange: (value: boolean) => void
  onSharedPanelOpenChange: (value: boolean) => void
  onSharedContentTabChange: (tab: SharedContentTab) => void
  onDragEnter: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

function normalizeEditorHtml(value: string) {
  const normalizedValue = value
    .replace(/^(<div><br><\/div>|<p><br><\/p>|<br>)+$/gi, '')
    .replace(/\u200B/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
  return normalizedValue
}

function resolveAvatarLabel(senderName: string, fromSelf: boolean) {
  if (fromSelf) {
    return '我'
  }

  const compactName = senderName.replace(/\s+/g, '').trim()
  if (!compactName) {
    return 'TA'
  }

  return compactName.slice(0, 2)
}

function resolveMediaPreviewKind(mimeType: string | undefined, fileName: string) {
  const normalizedMimeType = mimeType?.toLowerCase() ?? ''
  const normalizedName = fileName.toLowerCase()

  if (
    normalizedMimeType.startsWith('image/') ||
    /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(normalizedName)
  ) {
    return 'image' as const
  }

  if (
    normalizedMimeType.startsWith('video/') ||
    /\.(m4v|mov|mp4|ogv|webm)$/i.test(normalizedName)
  ) {
    return 'video' as const
  }

  return null
}

function legacyFontSizeForPixels(sizeInPixels: number) {
  if (sizeInPixels <= 10) {
    return '1'
  }
  if (sizeInPixels <= 12) {
    return '2'
  }
  if (sizeInPixels <= 14) {
    return '3'
  }
  if (sizeInPixels <= 18) {
    return '4'
  }
  if (sizeInPixels <= 24) {
    return '5'
  }
  if (sizeInPixels <= 32) {
    return '6'
  }

  return '7'
}

function createInsertPanelState(type: InsertPanelType): InsertPanelState {
  return { type, value: 'https://', text: '' }
}

function normalizeLinkHref(value: string) {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return null
  }

  const href = /^[a-z][a-z0-9+.-]*:/i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`

  try {
    const url = new URL(href)
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' || url.protocol === 'tel:') {
      return url.toString()
    }
  } catch {
    return null
  }

  return null
}

export function ChatConversationStage({
  isDragging,
  unifiedConversationEntries,
  fileConversationEmptyState,
  chatDraft,
  fileInputId,
  activeTransferLabel,
  isSendDisabled,
  isAiGenerating,
  aiQuotaLabel,
  enterToSend,
  attachments,
  isSharedPanelOpen,
  sharedContentTab,
  sharedMediaEntries,
  sharedFileEntries,
  sharedLinkEntries,
  onChatDraftChange,
  onFileSelection,
  onRetryTransfer,
  onCancelTransfer,
  onSendText,
  onRecallText,
  onRemoveAttachment,
  onEnterToSendChange,
  onSharedPanelOpenChange,
  onSharedContentTabChange,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: ChatConversationStageProps) {
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
  const [isFormatToolbarOpen, setIsFormatToolbarOpen] = useState(false)
  const [insertPanel, setInsertPanel] = useState<InsertPanelState | null>(null)
  const [insertPanelError, setInsertPanelError] = useState<string | null>(null)
  const [isColorPaletteOpen, setIsColorPaletteOpen] = useState(false)
  const [activeTextColor, setActiveTextColor] = useState<string | null>(null)
  const [activeParagraphFormat, setActiveParagraphFormat] = useState('')
  const [activeFontFamily, setActiveFontFamily] = useState('')
  const [activeFontSize, setActiveFontSize] = useState('')
  const [fontOptions, setFontOptions] = useState<SelectOption[]>(defaultRichTextFonts)
  const [colorPalettePosition, setColorPalettePosition] = useState<FloatingPanelPosition | null>(null)
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null)
  const [isImagePreviewZoomed, setIsImagePreviewZoomed] = useState(false)
  const [messageContextMenu, setMessageContextMenu] = useState<MessageContextMenuState | null>(null)
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraftState | null>(null)
  const [hiddenTextEntryIds, setHiddenTextEntryIds] = useState<Set<string>>(() => new Set())
  const [isBotMentionOpen, setIsBotMentionOpen] = useState(false)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const conversationThreadRef = useRef<HTMLDivElement | null>(null)
  const emojiPickerRef = useRef<HTMLDivElement | null>(null)
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null)
  const botMentionRef = useRef<HTMLDivElement | null>(null)
  const colorPaletteRef = useRef<HTMLDivElement | null>(null)
  const colorPaletteTriggerRef = useRef<HTMLButtonElement | null>(null)
  const insertPanelInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const activeSharedContentTab: SharedPanelTab = sharedContentTab === 'chat' ? 'media' : sharedContentTab

  const setInsertPanelInputElement = (element: HTMLInputElement | null) => {
    insertPanelInputRef.current = element
  }

  const latestConversationEntryId =
    unifiedConversationEntries[unifiedConversationEntries.length - 1]?.id ?? ''

  useEffect(() => {
    if (!editorRef.current) {
      return
    }

    const nextHtml = chatDraft || ''
    if (editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml
    }
  }, [chatDraft])

  useEffect(() => {
    if (isSharedPanelOpen || !latestConversationEntryId) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const thread = conversationThreadRef.current
      if (!thread) {
        return
      }

      thread.scrollTo({
        top: thread.scrollHeight,
        behavior: 'smooth',
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [isSharedPanelOpen, latestConversationEntryId])

  useEffect(() => {
    if (!isBotMentionOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (botMentionRef.current?.contains(target) || editorRef.current?.contains(target)) {
        return
      }

      setIsBotMentionOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsBotMentionOpen(false)
        editorRef.current?.focus()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isBotMentionOpen])

  useEffect(() => {
    if (!isSharedPanelOpen) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      setIsEmojiPickerOpen(false)
      setIsColorPaletteOpen(false)
      setInsertPanel(null)
      setInsertPanelError(null)
      setIsFormatToolbarOpen(false)
      setIsBotMentionOpen(false)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [isSharedPanelOpen])

  useEffect(() => {
    let isCancelled = false

    const loadSystemFonts = async () => {
      const api = (
        window as Window & {
          queryLocalFonts?: () => Promise<Array<{ family: string }>>
        }
      ).queryLocalFonts

      if (!api) {
        return
      }

      try {
        const localFonts = await api()
        const families = [...new Set(
          localFonts
            .map((font) => font.family?.trim())
            .filter((family): family is string => Boolean(family)),
        )].sort((left, right) => left.localeCompare(right, 'zh-CN'))

        if (families.length === 0 || isCancelled) {
          return
        }

        const mergedOptions = [
          defaultRichTextFonts[0],
          ...[...new Set([
            ...defaultRichTextFonts.slice(1).map((option) => option.label),
            ...families,
          ])].map((family) => ({
            label: family,
            value: family.includes(' ') ? `"${family}"` : family,
          })),
        ]

        setFontOptions(mergedOptions)
      } catch {
        // Fall back to the bundled common font list when local fonts are unavailable.
      }
    }

    void loadSystemFonts()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || !editorRef.current) {
        return
      }

      const range = selection.getRangeAt(0)
      if (editorRef.current.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange()
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [])

  useEffect(() => {
    if (!isEmojiPickerOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (emojiPickerRef.current?.contains(target) || emojiTriggerRef.current?.contains(target)) {
        return
      }

      setIsEmojiPickerOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsEmojiPickerOpen(false)
        editorRef.current?.focus()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isEmojiPickerOpen])

  useEffect(() => {
    if (!isColorPaletteOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (colorPaletteRef.current?.contains(target) || colorPaletteTriggerRef.current?.contains(target)) {
        return
      }

      setIsColorPaletteOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsColorPaletteOpen(false)
        editorRef.current?.focus()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isColorPaletteOpen])

  useEffect(() => {
    if (!isColorPaletteOpen) {
      return
    }

    const updateColorPalettePosition = () => {
      const trigger = colorPaletteTriggerRef.current
      const palette = colorPaletteRef.current
      if (!trigger || !palette) {
        return
      }

      const triggerRect = trigger.getBoundingClientRect()
      const paletteRect = palette.getBoundingClientRect()
      const horizontalMargin = 12
      const verticalGap = 8
      const paletteWidth = paletteRect.width || 214
      const paletteHeight = paletteRect.height || 232

      let left = triggerRect.left
      const maxLeft = window.innerWidth - paletteWidth - horizontalMargin
      left = Math.min(Math.max(horizontalMargin, left), Math.max(horizontalMargin, maxLeft))

      let top = triggerRect.top - paletteHeight - verticalGap
      if (top < horizontalMargin) {
        top = triggerRect.bottom + verticalGap
      }

      const maxTop = window.innerHeight - paletteHeight - horizontalMargin
      top = Math.min(Math.max(horizontalMargin, top), Math.max(horizontalMargin, maxTop))

      setColorPalettePosition({ left, top })
    }

    const frameId = window.requestAnimationFrame(updateColorPalettePosition)
    window.addEventListener('resize', updateColorPalettePosition)
    window.addEventListener('scroll', updateColorPalettePosition, true)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updateColorPalettePosition)
      window.removeEventListener('scroll', updateColorPalettePosition, true)
    }
  }, [isColorPaletteOpen])

  useEffect(() => {
    if (!insertPanel) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      insertPanelInputRef.current?.focus()
      insertPanelInputRef.current?.select?.()
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [insertPanel])

  useEffect(() => {
    if (!imagePreview) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImagePreview(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [imagePreview])

  useEffect(() => {
    if (!messageContextMenu) {
      return
    }

    const closeMessageContextMenu = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.dd-message-menu')) {
        return
      }

      setMessageContextMenu(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMessageContextMenu(null)
      }
    }

    const handleScroll = () => {
      setMessageContextMenu(null)
    }

    window.addEventListener('pointerdown', closeMessageContextMenu)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      window.removeEventListener('pointerdown', closeMessageContextMenu)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [messageContextMenu])

  const syncDraftFromEditor = () => {
    onChatDraftChange(normalizeEditorHtml(editorRef.current?.innerHTML ?? ''))
    const plainText = editorRef.current?.innerText.replace(/\u00a0/g, ' ') ?? ''
    setIsBotMentionOpen(/(^|\s)@$/.test(plainText))
  }

  const preserveEditorFocus = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
  }

  const handleFormatToolbarToggle = () => {
    const nextIsOpen = !isFormatToolbarOpen
    setIsFormatToolbarOpen(nextIsOpen)
    setIsEmojiPickerOpen(false)
    setIsBotMentionOpen(false)

    if (!nextIsOpen) {
      setIsColorPaletteOpen(false)
      setInsertPanel(null)
      setInsertPanelError(null)
    }
  }

  const restoreSelection = () => {
    const selection = window.getSelection()
    const editor = editorRef.current
    if (!selection || !editor) {
      return
    }

    editor.focus()
    selection.removeAllRanges()
    if (savedRangeRef.current) {
      selection.addRange(savedRangeRef.current)
      return
    }

    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    selection.addRange(range)
    savedRangeRef.current = range.cloneRange()
  }

  const runCommand = (command: string, value?: string) => {
    restoreSelection()
    document.execCommand(command, false, value)
    syncDraftFromEditor()
  }

  const handleParagraphFormatChange = (value: string) => {
    setActiveParagraphFormat(value)
    if (value) {
      runCommand('formatBlock', value)
    }
  }

  const handleFontFamilyChange = (value: string) => {
    setActiveFontFamily(value)
    if (value) {
      applyInlineStyle(
        [['font-family', value]],
        { command: 'fontName', value },
      )
    }
  }

  const handleFontSizeChange = (value: string) => {
    setActiveFontSize(value)
    if (value) {
      const fontSize = Number.parseInt(value, 10)
      applyInlineStyle(
        [['font-size', `${fontSize.toString()}px`]],
        {
          command: 'fontSize',
          value: legacyFontSizeForPixels(fontSize),
        },
      )
    }
  }

  const insertText = (value: string) => {
    restoreSelection()
    document.execCommand('insertText', false, value)
    syncDraftFromEditor()
  }

  const insertHtml = (html: string) => {
    restoreSelection()
    document.execCommand('insertHTML', false, html)
    syncDraftFromEditor()
  }

  const openImagePreview = (src: string, alt = '图片预览') => {
    if (!src) {
      return
    }

    setIsImagePreviewZoomed(false)
    setImagePreview({ src, alt })
  }

  const openInlineImageFromTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLImageElement)) {
      return false
    }

    openImagePreview(target.currentSrc || target.src, target.alt || '图片预览')
    return true
  }

  const copyTextToClipboard = async (value: string) => {
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(value)
        return
      } catch {
        // Fall back to a temporary textarea when clipboard permissions are unavailable.
      }
    }

    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.setAttribute('readonly', '')
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }

  const markCodeCopyButton = (button: HTMLButtonElement) => {
    button.classList.add('is-copied')
    button.textContent = '已复制'

    window.setTimeout(() => {
      button.classList.remove('is-copied')
      button.textContent = '复制'
    }, 1600)
  }

  const markMessageCopyButton = (button: HTMLButtonElement) => {
    button.classList.add('is-copied')
    button.setAttribute('title', '已复制')
    button.setAttribute('aria-label', '已复制')

    window.setTimeout(() => {
      button.classList.remove('is-copied')
      button.setAttribute('title', '复制')
      button.setAttribute('aria-label', '复制消息')
    }, 1600)
  }

  const handleMessageCopyClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
    value: string,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const button = event.currentTarget
    const copyText = extractPlainTextFromRichText(value) || value
    if (!copyText) {
      return
    }

    void copyTextToClipboard(copyText).then(() => markMessageCopyButton(button))
  }

  const openMessageContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    entry: Extract<UnifiedConversationEntry, { entryType: 'text' }>,
    senderName: string,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const menuWidth = 148
    const menuHeight = 156
    const margin = 8
    setMessageContextMenu({
      entryId: entry.id,
      text: entry.text,
      senderName,
      fromSelf: entry.fromSelf,
      left: Math.min(event.clientX, window.innerWidth - menuWidth - margin),
      top: Math.min(event.clientY, window.innerHeight - menuHeight - margin),
    })
  }

  const copyContextMessage = () => {
    if (!messageContextMenu) {
      return
    }

    const copyText = extractPlainTextFromRichText(messageContextMenu.text) || messageContextMenu.text
    if (copyText) {
      void copyTextToClipboard(copyText)
    }
    setMessageContextMenu(null)
  }

  const quoteContextMessage = () => {
    if (!messageContextMenu) {
      return
    }

    const quoteText = extractPlainTextFromRichText(messageContextMenu.text) || messageContextMenu.text
    if (quoteText) {
      setQuoteDraft({
        senderName: messageContextMenu.senderName,
        text: quoteText,
      })
      editorRef.current?.focus()
    }
    setMessageContextMenu(null)
  }

  const deleteContextMessage = () => {
    if (!messageContextMenu) {
      return
    }

    const deletedEntryId = messageContextMenu.entryId
    setHiddenTextEntryIds((current) => {
      const next = new Set(current)
      next.add(deletedEntryId)
      return next
    })
    setMessageContextMenu(null)
  }

  const recallContextMessage = () => {
    if (!messageContextMenu?.fromSelf) {
      return
    }

    const recalledEntryId = messageContextMenu.entryId
    setMessageContextMenu(null)
    void Promise.resolve(onRecallText(recalledEntryId)).catch(() => {
      // The parent surface reports the recall failure.
    })
  }

  const handleInlineImageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!openInlineImageFromTarget(event.target)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
  }

  const handleRichBubbleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target

    if (target instanceof HTMLElement) {
      const copyButton = target.closest<HTMLButtonElement>('.dd-code-copy')
      if (copyButton && event.currentTarget.contains(copyButton)) {
        event.preventDefault()
        event.stopPropagation()

        const codeText = copyButton.closest('pre')?.querySelector('code')?.textContent ?? ''
        if (codeText) {
          void copyTextToClipboard(codeText).then(() => markCodeCopyButton(copyButton))
        }
        return
      }
    }

    if (!openInlineImageFromTarget(target)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
  }

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof HTMLImageElement)) {
        return
      }

      const owner = target.closest('.dd-chatbox__editor, .dd-chatbox__bubble--rich')
      if (!owner) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      openImagePreview(target.currentSrc || target.src, target.alt || '图片预览')
    }

    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
    }
  })

  const readImageHtmlFromClipboardHtml = (html: string) => {
    if (!html || typeof DOMParser === 'undefined') {
      return ''
    }

    const parser = new DOMParser()
    const documentFragment = parser.parseFromString(html, 'text/html')

    return Array.from(documentFragment.querySelectorAll('img[src]'))
      .map((image) => renderInlineImageHtml(
        image.getAttribute('src') ?? '',
        image.getAttribute('alt') ?? '图片',
      ))
      .join('')
  }

  const insertImageFilesAsInlineImages = async (files: File[]) => {
    const imageHtml = (await Promise.all(
      files.map(async (file) => renderInlineImageHtml(await readImageFileAsDataUrl(file), file.name)),
    )).join('')

    if (imageHtml) {
      insertHtml(imageHtml)
    }
  }

  const handleEditorPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))
    const html = event.clipboardData.getData('text/html')
    const text = event.clipboardData.getData('text/plain')

    if (imageFiles.length > 0) {
      event.preventDefault()
      void insertImageFilesAsInlineImages(imageFiles)
      return
    }

    const htmlImageHtml = readImageHtmlFromClipboardHtml(html)
    if (htmlImageHtml) {
      event.preventDefault()
      insertHtml(htmlImageHtml)
      return
    }

    if (text && shouldPasteCodeLikePlainText(text)) {
      event.preventDefault()
      insertHtml(renderPlainTextForEditor(text))
      return
    }

    if (html || !/(https?:\/\/|www\.)/i.test(text)) {
      return
    }

    event.preventDefault()
    insertHtml(text.split(/\r?\n/).map((line) => linkifyPlainTextUrls(line)).join('<br />'))
  }

  const handleSend = () => {
    const quoteHtml = quoteDraft
      ? [
          '<blockquote class="dd-chatbox__quote">',
          `<strong>${escapeInlineHtml(quoteDraft.senderName)}：</strong>`,
          escapeInlineHtml(quoteDraft.text),
          '</blockquote>',
        ].join('')
      : undefined

    onSendText(quoteHtml)
    setQuoteDraft(null)
  }

  const insertBotMentionAtCursor = (replaceTrigger: boolean) => {
    restoreSelection()

    if (replaceTrigger) {
      const selection = window.getSelection()
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null
      const container = range?.startContainer

      if (range && container?.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
        const textNode = container as Text
        if (textNode.data.charAt(range.startOffset - 1) === '@') {
          range.setStart(textNode, range.startOffset - 1)
          range.deleteContents()
        }
      }
    }

    const mention = document.createElement('span')
    mention.className = 'dd-chatbox__mention'
    mention.contentEditable = 'false'
    mention.dataset.mention = 'bot'
    mention.textContent = '@bot'

    const space = document.createTextNode(' ')
    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : document.createRange()

    if (!selection) {
      return
    }

    range.deleteContents()
    range.insertNode(space)
    range.insertNode(mention)
    range.setStart(space, space.data.length)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    savedRangeRef.current = range.cloneRange()
    syncDraftFromEditor()
  }

  const handleBotMentionSelect = () => {
    insertBotMentionAtCursor(true)
    setIsBotMentionOpen(false)
  }

  const handleBotMentionButtonClick = () => {
    insertBotMentionAtCursor(false)
    setIsBotMentionOpen(false)
  }

  const removeAdjacentBotMention = (direction: 'backward' | 'forward') => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
      return false
    }

    const range = selection.getRangeAt(0)
    const container = range.startContainer
    const offset = range.startOffset
    let candidate: ChildNode | null = null

    if (container.nodeType === Node.TEXT_NODE) {
      const textNode = container as Text
      if (direction === 'backward') {
        if (offset < textNode.data.length) {
          return false
        }
        candidate = textNode.previousSibling
      } else {
        if (offset > 0) {
          return false
        }
        candidate = textNode.nextSibling
      }
    } else {
      const parent = container as Node
      candidate = parent.childNodes.item(direction === 'backward' ? offset - 1 : offset)
    }

    if (
      candidate instanceof HTMLElement &&
      candidate.classList.contains('dd-chatbox__mention') &&
      candidate.dataset.mention === 'bot'
    ) {
      candidate.remove()
      syncDraftFromEditor()
      return true
    }

    return false
  }

  const applyInlineStyle = (
    styles: Array<[property: string, value: string]>,
    fallbackCommand?: { command: string; value: string },
  ) => {
    restoreSelection()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !editorRef.current) {
      return
    }

    const range = selection.getRangeAt(0)
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      return
    }

    if (range.collapsed) {
      const wrapper = document.createElement('span')
      for (const [property, value] of styles) {
        wrapper.style.setProperty(property, value)
      }

      const marker = document.createTextNode('\u200B')
      wrapper.appendChild(marker)
      range.insertNode(wrapper)

      const nextRange = document.createRange()
      nextRange.setStart(marker, 1)
      nextRange.setEnd(marker, 1)
      selection.removeAllRanges()
      selection.addRange(nextRange)
      savedRangeRef.current = nextRange.cloneRange()

      if (fallbackCommand) {
        document.execCommand('styleWithCSS', false, 'true')
        document.execCommand(fallbackCommand.command, false, fallbackCommand.value)
      }

      editorRef.current?.focus()
      return
    }

    const wrapper = document.createElement('span')
    for (const [property, value] of styles) {
      wrapper.style.setProperty(property, value)
    }

    wrapper.appendChild(range.extractContents())
    range.insertNode(wrapper)

    const nextRange = document.createRange()
    nextRange.selectNodeContents(wrapper)
    selection.removeAllRanges()
    selection.addRange(nextRange)
    savedRangeRef.current = nextRange.cloneRange()
    syncDraftFromEditor()
  }

  const handleEmojiInsert = (emoji: string) => {
    insertText(emoji)
    setIsEmojiPickerOpen(false)
    editorRef.current?.focus()
  }

  const getSelectedEditorText = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !editorRef.current) {
      return ''
    }

    const range = selection.getRangeAt(0)
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      return ''
    }

    return selection.toString().trim()
  }

  const openInsertPanel = (type: InsertPanelType) => {
    setIsEmojiPickerOpen(false)
    setIsColorPaletteOpen(false)
    setIsBotMentionOpen(false)
    setInsertPanelError(null)
    setInsertPanel(
      {
        ...createInsertPanelState(type),
        text: getSelectedEditorText(),
      },
    )
  }

  const toggleColorPalette = () => {
    setIsEmojiPickerOpen(false)
    setInsertPanel(null)
    setInsertPanelError(null)
    setIsBotMentionOpen(false)
    setIsColorPaletteOpen((current) => !current)
  }

  const handleColorPaletteTriggerMouseDown = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    toggleColorPalette()
  }

  const closeInsertPanel = () => {
    setInsertPanel(null)
    setInsertPanelError(null)
    window.requestAnimationFrame(() => {
      editorRef.current?.focus()
    })
  }

  const updateInsertPanel = (patch: Partial<InsertPanelState>) => {
    setInsertPanel((current) => (current ? { ...current, ...patch } : current))
    setInsertPanelError(null)
  }

  const applyTextColor = (color: string | null) => {
    if (color) {
      applyInlineStyle(
        [['color', color]],
        { command: 'foreColor', value: color },
      )
      setActiveTextColor(color)
      return
    }

    applyInlineStyle([['color', 'inherit']])
    setActiveTextColor(null)
  }

  const handleClearTextColorMouseDown = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    applyTextColor(null)
    setIsColorPaletteOpen(false)
  }

  const handleColorSwatchMouseDown = (
    event: ReactMouseEvent<HTMLButtonElement>,
    color: string,
  ) => {
    event.preventDefault()
    applyTextColor(color)
    setIsColorPaletteOpen(false)
  }

  const handleInsertPanelSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!insertPanel) {
      return
    }

    switch (insertPanel.type) {
      case 'link': {
        const href = normalizeLinkHref(insertPanel.value ?? '')
        if (!href) {
          setInsertPanelError('请输入有效链接，支持 http、https、mailto 或 tel。')
          return
        }

        const label = (insertPanel.text?.trim() || href).slice(0, 200)
        insertHtml(`<a href="${escapeInlineHtml(href)}" target="_blank" rel="noreferrer noopener">${escapeInlineHtml(label)}</a>`)
        closeInsertPanel()
        return
      }
    }
  }

  return (
    <section className="dd-view dd-view--single dd-view--files">
      <div
        className={`dd-chatbox dd-chatbox--files${isDragging ? ' is-dragging' : ''}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div ref={conversationThreadRef} className={`dd-chatbox__thread${isSharedPanelOpen ? ' is-shared-panel' : ''}`}>
          {isSharedPanelOpen && (
            <div className="dd-shared-panel__header">
              <div className="dd-shared-panel__tabs" role="tablist" aria-label="共享内容">
                {sharedPanelTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeSharedContentTab === tab.id}
                    className={activeSharedContentTab === tab.id ? 'is-active' : ''}
                    onClick={() => onSharedContentTabChange(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="dd-shared-panel__close"
                onClick={() => onSharedPanelOpenChange(false)}
              >
                关闭
              </button>
            </div>
          )}

          {!isSharedPanelOpen && unifiedConversationEntries.length > 0 ? (
            unifiedConversationEntries.map((entry, index) => {
              const previousIso = index > 0 ? unifiedConversationEntries[index - 1].createdAt : null
              const showDivider = shouldInsertDivider(previousIso, entry.createdAt)

              if (entry.entryType === 'notice') {
                return (
                  <div key={entry.id} className="dd-chatbox__entry">
                    <div className="dd-chatbox__notice">
                      <span>{entry.text}</span>
                    </div>
                  </div>
                )
              }

              const senderName = entry.senderName.trim() || (entry.fromSelf ? '我' : '对方设备')
              const isBotMessage = entry.entryType === 'text' && entry.sourceDeviceId === 'bot_cloudflare_ai'
              const previewKind = entry.entryType === 'file'
                ? resolveMediaPreviewKind(entry.file.mimeType, entry.file.fileName)
                : null
              const textHtml = entry.entryType === 'text'
                ? renderAppleMusicLyricShare(entry.text) || sanitizeRichTextHtml(entry.text)
                : ''

              if (entry.entryType === 'text' && hiddenTextEntryIds.has(entry.id)) {
                return null
              }

              return (
                <div key={entry.id} className="dd-chatbox__entry">
                  <>
                    {showDivider && (
                      <div className="dd-chatbox__divider">
                        <span>{formatChatDivider(entry.createdAt)}</span>
                      </div>
                    )}

                    <div className={`dd-chatbox__message${entry.fromSelf ? ' is-self' : ' is-peer'}`}>
                      <div className="dd-chatbox__sender">
                        <div className={`dd-chatbox__avatar${entry.fromSelf ? ' is-self' : ''}`}>
                          {resolveAvatarLabel(senderName, entry.fromSelf)}
                        </div>
                        <span className="dd-chatbox__sender-name" title={senderName}>
                          {senderName}
                        </span>
                      </div>

                      {entry.entryType === 'text' ? (
                        <div className="dd-chatbox__text-stack">
                          <div className="dd-chatbox__text-row">
                            <div
                              className="dd-chatbox__bubble dd-chatbox__bubble--rich"
                              onClick={handleRichBubbleClick}
                              onContextMenu={(event) => openMessageContextMenu(event, entry, senderName)}
                              dangerouslySetInnerHTML={{
                                __html: isBotMessage
                                  ? sanitizeBotReplyHtml(entry.text)
                                  : textHtml,
                              }}
                            />
                            <button
                              type="button"
                              className="dd-chatbox__copy"
                              aria-label="复制消息"
                              title="复制"
                              onClick={(event) => handleMessageCopyClick(event, entry.text)}
                            >
                              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                                <path d="M7 7.5h8v9H7z" />
                                <path d="M5 12.5H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1" />
                              </svg>
                            </button>
                          </div>
                          {entry.fromSelf && entry.status && (
                            <span className={`dd-chatbox__text-status is-${entry.status}`}>
                              {entry.status === 'sending' ? '发送中...' : '发送失败'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className={`dd-file-bubble is-${entry.file.tone}`}>
                          <small className="dd-file-bubble__eyebrow">
                            {entry.file.kind === 'outgoing' ? '我发送的文件' : '收到的文件'}
                          </small>
                          <strong>{entry.file.fileName}</strong>
                          <span className="dd-file-bubble__meta">
                            {formatFileSize(entry.file.fileSize)} · {entry.file.subtitle}
                          </span>
                          {entry.file.previewUrl && previewKind === 'image' ? (
                            <button
                              type="button"
                              className="dd-file-bubble__preview dd-file-bubble__preview--image"
                              aria-label={`预览图片 ${entry.file.fileName}`}
                              onClick={() => openImagePreview(entry.file.previewUrl ?? '', entry.file.fileName)}
                            >
                              <img
                                src={entry.file.previewUrl}
                                alt={entry.file.fileName}
                                loading="lazy"
                              />
                            </button>
                          ) : null}
                          {entry.file.previewUrl && previewKind === 'video' ? (
                            <video
                              className="dd-file-bubble__preview dd-file-bubble__preview--video"
                              src={entry.file.previewUrl}
                              controls
                              preload="metadata"
                              aria-label={`预览视频 ${entry.file.fileName}`}
                            />
                          ) : null}
                          <div className="dd-file-bubble__progress">
                            <div
                              className={`dd-file-bubble__bar is-${entry.file.tone}`}
                              style={{ width: `${Math.round(entry.file.progress * 100)}%` }}
                            />
                          </div>
                          <div className="dd-file-bubble__footer">
                            <span>{entry.file.statusLabel}</span>
                            <span>{entry.file.detail}</span>
                          </div>
                          {(entry.file.downloadUrl || entry.file.onDownload || entry.file.action) && (
                            <div className="dd-file-bubble__actions">
                              {entry.file.onDownload ? (
                                <button
                                  type="button"
                                  className="dd-file-bubble__action"
                                  onClick={entry.file.onDownload}
                                  disabled={entry.file.isDownloadDisabled}
                                >
                                  {entry.file.isDownloadDisabled ? '下载中' : '下载文件'}
                                </button>
                              ) : null}
                              {entry.file.downloadUrl ? (
                                <a
                                  className="dd-file-bubble__action"
                                  href={entry.file.downloadUrl}
                                  download={entry.file.downloadName}
                                >
                                  下载文件
                                </a>
                              ) : null}
                              {entry.file.action === 'retry' ? (
                                <button
                                  type="button"
                                  className="dd-file-bubble__action"
                                  onClick={() => onRetryTransfer(entry.file.id)}
                                >
                                  继续传输
                                </button>
                              ) : null}
                              {entry.file.action === 'cancel' ? (
                                <button
                                  type="button"
                                  className="dd-file-bubble__action"
                                  onClick={() => onCancelTransfer(entry.file.id)}
                                >
                                  取消
                                </button>
                              ) : null}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                </div>
              )
            })
          ) : !isSharedPanelOpen ? (
            <div className="dd-chatbox__empty dd-chatbox__empty--files">{fileConversationEmptyState}</div>
          ) : activeSharedContentTab === 'media' ? (
            sharedMediaEntries.length > 0 ? (
              <div className="dd-shared-grid">
                {sharedMediaEntries.map((entry) => {
                  const previewKind = resolveMediaPreviewKind(entry.mimeType, entry.fileName)

                  return (
                    <article key={entry.id} className="dd-shared-card">
                      {entry.previewUrl && previewKind === 'image' ? (
                        <button
                          type="button"
                          className="dd-shared-card__preview dd-shared-card__preview--image"
                          onClick={() => openImagePreview(entry.previewUrl ?? '', entry.fileName)}
                        >
                          <img src={entry.previewUrl} alt={entry.fileName} loading="lazy" />
                        </button>
                      ) : entry.previewUrl && previewKind === 'video' ? (
                        <video className="dd-shared-card__preview" src={entry.previewUrl} controls preload="metadata" />
                      ) : (
                        <div className="dd-shared-card__placeholder">媒体</div>
                      )}
                      <strong>{entry.fileName}</strong>
                      <span>{formatFileSize(entry.fileSize)} · {entry.statusLabel}</span>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="dd-chatbox__empty dd-chatbox__empty--files">当前对话暂无媒体。</div>
            )
          ) : activeSharedContentTab === 'files' ? (
            sharedFileEntries.length > 0 ? (
              <div className="dd-shared-list">
                {sharedFileEntries.map((entry) => (
                  <article key={entry.id} className="dd-shared-row">
                    <div>
                      <strong>{entry.fileName}</strong>
                      <span>{formatFileSize(entry.fileSize)} · {entry.statusLabel} · {entry.detail}</span>
                      {entry.isDownloadDisabled ? (
                        <div
                          className="dd-shared-row__progress"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(entry.progress * 100)}
                        >
                          <div style={{ width: `${Math.round(entry.progress * 100)}%` }} />
                        </div>
                      ) : null}
                    </div>
                    <div className="dd-shared-row__actions">
                      {entry.onDownload ? (
                        <button type="button" onClick={entry.onDownload} disabled={entry.isDownloadDisabled}>
                          {entry.isDownloadDisabled ? '下载中' : '下载'}
                        </button>
                      ) : null}
                      {entry.downloadUrl ? (
                        <a href={entry.downloadUrl} download={entry.downloadName}>下载</a>
                      ) : null}
                      {entry.action === 'retry' ? (
                        <button type="button" onClick={() => onRetryTransfer(entry.id)}>继续传输</button>
                      ) : null}
                      {entry.action === 'cancel' ? (
                        <button type="button" onClick={() => onCancelTransfer(entry.id)}>取消</button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="dd-chatbox__empty dd-chatbox__empty--files">当前对话暂无文件。</div>
            )
          ) : sharedLinkEntries.length > 0 ? (
            <div className="dd-shared-list">
              {sharedLinkEntries.map((entry) => (
                <article key={entry.id} className="dd-shared-row">
                  <div>
                    <strong>{entry.label}</strong>
                    <span>{entry.sourceName} · {formatChatDivider(entry.createdAt)}</span>
                  </div>
                  <a href={entry.url} target="_blank" rel="noreferrer">打开</a>
                </article>
              ))}
            </div>
          ) : (
            <div className="dd-chatbox__empty dd-chatbox__empty--files">当前对话暂无链接。</div>
          )}
        </div>

        {!isSharedPanelOpen && (
        <div className="dd-chatbox__composer">
          {isFormatToolbarOpen && (
          <div className="dd-rich-toolbar-scroll">
            <div className="dd-rich-toolbar">
              <div className="dd-rich-toolbar__group">
              <select
                className="dd-rich-toolbar__select"
                value={activeParagraphFormat}
                onChange={(event) => handleParagraphFormatChange(event.target.value)}
              >
                {paragraphFormats.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="dd-rich-toolbar__select"
                value={activeFontFamily}
                onChange={(event) => handleFontFamilyChange(event.target.value)}
              >
                {fontOptions.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="dd-rich-toolbar__select"
                value={activeFontSize}
                onChange={(event) => handleFontSizeChange(event.target.value)}
              >
                {richTextSizes.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="dd-rich-toolbar__color-field">
                <button
                  ref={colorPaletteTriggerRef}
                  type="button"
                  className={`dd-rich-toolbar__button dd-rich-toolbar__color-trigger${isColorPaletteOpen ? ' is-active' : ''}`}
                  aria-label="字体颜色"
                  aria-expanded={isColorPaletteOpen}
                  aria-haspopup="dialog"
                  title="字体颜色"
                  onMouseDown={handleColorPaletteTriggerMouseDown}
                >
                  <span className="dd-rich-toolbar__color-glyph" aria-hidden="true">
                    A
                  </span>
                  <span
                    className="dd-rich-toolbar__color-line"
                    style={{ backgroundColor: activeTextColor ?? '#111111' }}
                    aria-hidden="true"
                  />
                  <span className="dd-rich-toolbar__color-caret" aria-hidden="true">
                    ▼
                  </span>
                </button>

              </div>
              </div>

              <div className="dd-rich-toolbar__group">
                <button
                  type="button"
                  className="dd-rich-toolbar__button dd-rich-toolbar__button--icon"
                  aria-label="加粗"
                  title="加粗"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => runCommand('bold')}
                >
                  <span className="dd-rich-toolbar__glyph dd-rich-toolbar__glyph--bold" aria-hidden="true">B</span>
                </button>
                <button
                  type="button"
                  className="dd-rich-toolbar__button dd-rich-toolbar__button--icon"
                  aria-label="斜体"
                  title="斜体"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => runCommand('italic')}
                >
                  <span className="dd-rich-toolbar__glyph dd-rich-toolbar__glyph--italic" aria-hidden="true">I</span>
                </button>
                <button
                  type="button"
                  className="dd-rich-toolbar__button dd-rich-toolbar__button--icon"
                  aria-label="下划线"
                  title="下划线"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => runCommand('underline')}
                >
                  <span className="dd-rich-toolbar__glyph dd-rich-toolbar__glyph--underline" aria-hidden="true">U</span>
                </button>
                <button
                  type="button"
                  className={`dd-rich-toolbar__button dd-rich-toolbar__button--icon${insertPanel?.type === 'link' ? ' is-active' : ''}`}
                  aria-label="插入链接"
                  title="插入链接"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => openInsertPanel('link')}
                >
                  <span className="dd-rich-toolbar__glyph" aria-hidden="true">↗</span>
                </button>
              </div>
            </div>
          </div>
          )}

          {isFormatToolbarOpen && isColorPaletteOpen && createPortal(
            <div
              ref={colorPaletteRef}
              className="dd-color-palette"
              role="dialog"
              aria-label="字体颜色面板"
              style={
                colorPalettePosition
                  ? {
                      left: `${colorPalettePosition.left.toString()}px`,
                      top: `${colorPalettePosition.top.toString()}px`,
                    }
                  : undefined
              }
            >
              <div className="dd-color-palette__topbar">
                <div
                  className="dd-color-palette__preview"
                  style={{ backgroundColor: activeTextColor ?? '#ffffff' }}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className="dd-color-palette__clear"
                  onMouseDown={handleClearTextColorMouseDown}
                >
                  清空颜色
                </button>
              </div>

              <div className="dd-color-palette__section">
                <span className="dd-color-palette__label">主题颜色</span>
                <div className="dd-color-palette__grid">
                  {themeRichTextColors.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="dd-color-palette__swatch"
                      style={{ backgroundColor: option.value }}
                      title={option.label}
                      aria-label={option.label}
                      onMouseDown={(event) => handleColorSwatchMouseDown(event, option.value)}
                    />
                  ))}
                </div>
              </div>

              <div className="dd-color-palette__section">
                <span className="dd-color-palette__label">标准颜色</span>
                <div className="dd-color-palette__grid">
                  {standardRichTextColors.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="dd-color-palette__swatch"
                      style={{ backgroundColor: option.value }}
                      title={option.label}
                      aria-label={option.label}
                      onMouseDown={(event) => handleColorSwatchMouseDown(event, option.value)}
                    />
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )}

          {isFormatToolbarOpen && insertPanel && (
            <form className="dd-rich-insert-panel" onSubmit={handleInsertPanelSubmit}>
              <div className="dd-rich-insert-panel__header">
                <strong>插入链接</strong>
                <button type="button" className="dd-rich-insert-panel__dismiss" onClick={closeInsertPanel}>
                  关闭
                </button>
              </div>

              <div className="dd-rich-insert-panel__body">
                <div className="dd-rich-insert-panel__grid">
                  <label className="dd-rich-insert-panel__field">
                    <span>链接地址</span>
                    <input
                      ref={setInsertPanelInputElement}
                      className="dd-rich-insert-panel__input"
                      value={insertPanel.value ?? ''}
                      onChange={(event) => updateInsertPanel({ value: event.target.value })}
                      placeholder="https://example.com"
                    />
                  </label>
                  <label className="dd-rich-insert-panel__field">
                    <span>显示文本</span>
                    <input
                      className="dd-rich-insert-panel__input"
                      value={insertPanel.text ?? ''}
                      onChange={(event) => updateInsertPanel({ text: event.target.value })}
                      placeholder="留空则显示链接地址"
                    />
                  </label>
                </div>

                {insertPanelError && <p className="dd-rich-insert-panel__error">{insertPanelError}</p>}

                <div className="dd-rich-insert-panel__actions">
                  <span className="dd-rich-insert-panel__hint">填写后直接插入到当前光标位置</span>
                  <div className="dd-rich-insert-panel__action-group">
                    <button type="button" className="dd-rich-insert-panel__ghost" onClick={closeInsertPanel}>
                      取消
                    </button>
                    <button type="submit" className="dd-rich-insert-panel__primary">
                      插入
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}

          {attachments.length > 0 && (
            <div className="dd-attachment-rail" aria-label="待发送附件">
              {attachments.map((attachment) => (
                <article key={attachment.id} className="dd-attachment-card">
                  {attachment.kind === 'image' ? (
                    <button
                      type="button"
                      className="dd-attachment-card__preview"
                      onClick={() => openImagePreview(attachment.objectUrl, attachment.name)}
                    >
                      <img src={attachment.objectUrl} alt={attachment.name} />
                    </button>
                  ) : attachment.kind === 'video' ? (
                    <video className="dd-attachment-card__preview" src={attachment.objectUrl} preload="metadata" />
                  ) : (
                    <div className="dd-attachment-card__placeholder">文件</div>
                  )}
                  <div className="dd-attachment-card__body">
                    <strong>{attachment.name}</strong>
                    <span>{formatFileSize(attachment.size)}</span>
                  </div>
                  <button
                    type="button"
                    className="dd-attachment-card__remove"
                    aria-label={`移除 ${attachment.name}`}
                    onClick={() => onRemoveAttachment(attachment.id)}
                  >
                    ×
                  </button>
                </article>
              ))}
            </div>
          )}

          {quoteDraft && (
            <div className="dd-chatbox__quote-preview">
              <div className="dd-chatbox__quote-preview-body">
                <span>{quoteDraft.senderName}: {quoteDraft.text}</span>
                <button
                  type="button"
                  aria-label="取消引用"
                  title="取消引用"
                  onClick={() => setQuoteDraft(null)}
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {isBotMentionOpen && (
            <div ref={botMentionRef} className="dd-bot-mention-panel" role="listbox" aria-label="@ bot">
              <button
                type="button"
                className="dd-bot-mention-option"
                role="option"
                aria-selected="true"
                onMouseDown={preserveEditorFocus}
                onClick={handleBotMentionSelect}
              >
                <strong>@bot</strong>
                <span>{aiQuotaLabel}</span>
              </button>
            </div>
          )}

          <div className="dd-chatbox__textarea-wrap">
            <div
              ref={editorRef}
              className="dd-chatbox__editor"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="输入消息"
              onClick={handleInlineImageClick}
              onInput={syncDraftFromEditor}
              onPaste={handleEditorPaste}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' && removeAdjacentBotMention('backward')) {
                  event.preventDefault()
                  return
                }

                if (event.key === 'Delete' && removeAdjacentBotMention('forward')) {
                  event.preventDefault()
                  return
                }

                if (
                  event.key === 'Enter' &&
                  ((enterToSend && !event.shiftKey) || event.metaKey || event.ctrlKey)
                ) {
                  event.preventDefault()
                  handleSend()
                }
              }}
            />
          </div>

          <div className="dd-chatbox__composer-footer">
            <div className="dd-chatbox__toolbar dd-chatbox__toolbar--files">
              <button
                ref={emojiTriggerRef}
                type="button"
                aria-label="表情"
                aria-expanded={isEmojiPickerOpen}
                aria-haspopup="dialog"
                className={`dd-chatbox__emoji-trigger${isEmojiPickerOpen ? ' is-open' : ''}`}
                onMouseDown={preserveEditorFocus}
                onClick={() => {
                  setInsertPanel(null)
                  setInsertPanelError(null)
                  setIsBotMentionOpen(false)
                  setIsEmojiPickerOpen((previous) => !previous)
                }}
              >
                🙂
              </button>
              <button
                type="button"
                aria-label={isFormatToolbarOpen ? '收起格式工具' : '展开格式工具'}
                aria-expanded={isFormatToolbarOpen}
                title="格式"
                className={`dd-chatbox__format-trigger${isFormatToolbarOpen ? ' is-open' : ''}`}
                onMouseDown={preserveEditorFocus}
                onClick={handleFormatToolbarToggle}
              >
                Aa
              </button>
              <button
                type="button"
                aria-label="Insert @bot"
                title="Insert @bot"
                className={`dd-chatbox__ai-trigger${isAiGenerating ? ' is-loading' : ''}`}
                disabled={isAiGenerating}
                onMouseDown={preserveEditorFocus}
                onClick={handleBotMentionButtonClick}
              >
                {isAiGenerating ? '...' : '@'}
              </button>
            </div>

            <div className="dd-chatbox__composer-actions">
              <label className="dd-enter-toggle">
                <input
                  type="checkbox"
                  checked={enterToSend}
                  onChange={(event) => onEnterToSendChange(event.target.checked)}
                />
                Enter 发送
              </label>
              <label className="dd-chatbox__file-trigger" htmlFor={fileInputId}>
                <input id={fileInputId} className="sr-only" type="file" multiple onChange={onFileSelection} />
                选择文件
              </label>
              <button
                type="button"
                className="dd-button dd-button--primary"
                onClick={handleSend}
                disabled={isSendDisabled}
                title={`当前目标：${activeTransferLabel}`}
              >
                发送
              </button>
            </div>
          </div>

          {isEmojiPickerOpen && (
            <div
              ref={emojiPickerRef}
              className="dd-emoji-picker"
              role="dialog"
              aria-label="Emoji 选择器"
            >
              <div className="dd-emoji-picker__header">
                <strong>表情</strong>
                <span>点击即可插入到输入框</span>
              </div>
              <div className="dd-emoji-picker__grid">
                {quickEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="dd-emoji-picker__item"
                    onMouseDown={preserveEditorFocus}
                    onClick={() => handleEmojiInsert(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        )}

        {imagePreview && (
          <div
            className={`dd-image-preview-dialog${isImagePreviewZoomed ? ' is-zoomed' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
          >
            <button
              type="button"
              className="dd-image-preview-dialog__backdrop"
              aria-label="关闭图片预览"
              onClick={() => setImagePreview(null)}
            />
            <div className="dd-image-preview-dialog__panel">
              <div className="dd-image-preview-dialog__titlebar">
                <span>{imagePreview.alt}</span>
                <button
                  type="button"
                  className="dd-image-preview-dialog__close"
                  aria-label="关闭图片预览"
                  onClick={() => setImagePreview(null)}
                >
                  ×
                </button>
              </div>
              <div className="dd-image-preview-dialog__body">
                <button
                  type="button"
                  className="dd-image-preview-dialog__image-button"
                  aria-label={isImagePreviewZoomed ? '缩小图片' : '放大图片'}
                  onClick={() => setIsImagePreviewZoomed((current) => !current)}
                >
                  <img src={imagePreview.src} alt={imagePreview.alt} />
                </button>
              </div>
            </div>
          </div>
        )}

        {messageContextMenu && createPortal(
          <div
            className="dd-message-menu"
            role="menu"
            aria-label="消息操作"
            style={{
              left: `${messageContextMenu.left.toString()}px`,
              top: `${messageContextMenu.top.toString()}px`,
            }}
          >
            <button type="button" role="menuitem" onClick={copyContextMessage}>
              复制
            </button>
            <button type="button" role="menuitem" onClick={quoteContextMessage}>
              引用
            </button>
            <button type="button" role="menuitem" className="is-danger" onClick={deleteContextMessage}>
              删除
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!messageContextMenu.fromSelf}
              title={messageContextMenu.fromSelf ? '撤回这条消息' : '只能撤回自己发送的消息'}
              onClick={recallContextMessage}
            >
              撤回
            </button>
          </div>,
          document.body,
        )}
      </div>
    </section>
  )
}
