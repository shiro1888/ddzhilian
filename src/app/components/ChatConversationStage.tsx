import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent, MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { UnifiedConversationEntry } from '../types'
import {
  formatChatDivider,
  formatFileSize,
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

const quickEmojis = [
  '😀', '😄', '😁', '😂', '🤣', '😊', '🙂', '😉', '😍', '🥰', '😘', '😎',
  '🤔', '🫠', '😴', '😭', '😡', '🥳', '🤯', '😇', '🤖', '👀', '🙌', '👏',
  '👍', '👎', '🙏', '💪', '👋', '🤝', '🎉', '🎊', '✨', '🔥', '⭐', '🌈',
  '☀️', '🌙', '⚡', '🍀', '🍎', '🍕', '☕', '🎵', '🎮', '🏀', '🚀', '❤️',
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

const paragraphFormats: SelectOption[] = [
  { label: '段落', value: '' },
  { label: '正文', value: 'p' },
  { label: '标题 1', value: 'h1' },
  { label: '标题 2', value: 'h2' },
  { label: '标题 3', value: 'h3' },
  { label: '引用', value: 'blockquote' },
  { label: '代码块', value: 'pre' },
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

const specialCharacterPresets = [
  '℃',
  '°',
  '±',
  '×',
  '÷',
  '√',
  '≈',
  '≠',
  '≤',
  '≥',
  '∞',
  '→',
]

const formulaBetaFrameSrcDoc = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: light;
        font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
        color: #122033;
      }
      .shell {
        display: grid;
        gap: 16px;
        min-height: 100vh;
        padding: 18px;
      }
      .hero {
        display: grid;
        gap: 8px;
        padding: 18px;
        border-radius: 16px;
        background: linear-gradient(135deg, #ffffff, #eef5ff);
        border: 1px solid #d8e4f4;
      }
      .hero strong {
        font-size: 20px;
      }
      .hero p,
      .hint {
        margin: 0;
        color: #53657d;
        line-height: 1.6;
      }
      .quick,
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .quick button,
      .actions button {
        min-height: 34px;
        padding: 0 12px;
        border: 1px solid #cfdae8;
        border-radius: 999px;
        background: #ffffff;
        color: #203247;
        cursor: pointer;
        font: inherit;
      }
      textarea {
        width: 100%;
        min-height: 240px;
        padding: 16px;
        border: 1px solid #cfdae8;
        border-radius: 16px;
        background: #ffffff;
        color: #122033;
        font: 16px/1.7 "Cambria Math", "Times New Roman", serif;
        resize: vertical;
      }
      .actions {
        justify-content: flex-end;
      }
      .actions button.primary {
        border-color: #0f6ab4;
        background: #0f6ab4;
        color: #ffffff;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="hero">
        <strong>公式 beta</strong>
        <p>输入公式表达式后点击“插入公式”。这里先用 iframe 容器承载编辑区，后续可替换成真实公式编辑器页面。</p>
      </div>

      <div class="quick">
        <button type="button" data-value="\\\\frac{a}{b}">分式</button>
        <button type="button" data-value="x^2+y^2=z^2">平方和</button>
        <button type="button" data-value="\\\\sqrt{a^2+b^2}">根式</button>
        <button type="button" data-value="\\\\int_a^b f(x)\\\\,dx">积分</button>
        <button type="button" data-value="\\\\sum_{i=1}^{n} i">求和</button>
      </div>

      <textarea id="formula-input">\\frac{a}{b}</textarea>
      <p class="hint">支持直接输入 LaTeX 风格表达式，例如 \\frac、\\sqrt、\\sum、\\int。</p>

      <div class="actions">
        <button type="button" id="close-btn">关闭</button>
        <button type="button" class="primary" id="insert-btn">插入公式</button>
      </div>
    </div>

    <script>
      const input = document.getElementById('formula-input');
      document.querySelectorAll('[data-value]').forEach((button) => {
        button.addEventListener('click', () => {
          input.value = button.dataset.value || '';
          input.focus();
        });
      });

      document.getElementById('insert-btn').addEventListener('click', () => {
        parent.postMessage({
          source: 'ccconnect-formula-beta',
          type: 'insert',
          value: input.value
        }, '*');
      });

      document.getElementById('close-btn').addEventListener('click', () => {
        parent.postMessage({
          source: 'ccconnect-formula-beta',
          type: 'close'
        }, '*');
      });
    </script>
  </body>
</html>`

type InsertPanelType =
  | 'special-character'
  | 'table'
  | 'tex'
  | 'code'

type InsertPanelState = {
  type: InsertPanelType
  value?: string
  rows?: string
  columns?: string
}

type ChatConversationStageProps = {
  isDragging: boolean
  unifiedConversationEntries: UnifiedConversationEntry[]
  fileConversationEmptyState: string
  chatDraft: string
  fileInputId: string
  activeTransferLabel: string
  isSendDisabled: boolean
  onChatDraftChange: (value: string) => void
  onFileSelection: (event: ChangeEvent<HTMLInputElement>) => void
  onRetryTransfer: (id: string) => void
  onCancelTransfer: (id: string) => void
  onSendText: () => void
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
  switch (type) {
    case 'special-character':
      return { type, value: '℃' }
    case 'table':
      return { type, rows: '2', columns: '3' }
    case 'tex':
      return { type, value: '\\frac{a}{b}' }
    case 'code':
      return { type, value: 'const answer = 42;' }
  }
}

export function ChatConversationStage({
  isDragging,
  unifiedConversationEntries,
  fileConversationEmptyState,
  chatDraft,
  fileInputId,
  activeTransferLabel,
  isSendDisabled,
  onChatDraftChange,
  onFileSelection,
  onRetryTransfer,
  onCancelTransfer,
  onSendText,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: ChatConversationStageProps) {
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
  const [insertPanel, setInsertPanel] = useState<InsertPanelState | null>(null)
  const [insertPanelError, setInsertPanelError] = useState<string | null>(null)
  const [isFormulaBetaDialogOpen, setIsFormulaBetaDialogOpen] = useState(false)
  const [isColorPaletteOpen, setIsColorPaletteOpen] = useState(false)
  const [activeTextColor, setActiveTextColor] = useState<string | null>(null)
  const [fontOptions, setFontOptions] = useState<SelectOption[]>(defaultRichTextFonts)
  const [colorPalettePosition, setColorPalettePosition] = useState<FloatingPanelPosition | null>(null)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const emojiPickerRef = useRef<HTMLDivElement | null>(null)
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null)
  const colorPaletteRef = useRef<HTMLDivElement | null>(null)
  const colorPaletteTriggerRef = useRef<HTMLButtonElement | null>(null)
  const insertPanelInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const savedRangeRef = useRef<Range | null>(null)

  const setInsertPanelInputElement = (element: HTMLInputElement | null) => {
    insertPanelInputRef.current = element
  }

  const setInsertPanelTextareaElement = (element: HTMLTextAreaElement | null) => {
    insertPanelInputRef.current = element
  }

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

  const syncDraftFromEditor = () => {
    onChatDraftChange(normalizeEditorHtml(editorRef.current?.innerHTML ?? ''))
  }

  const preserveEditorFocus = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
  }

  const restoreSelection = () => {
    const selection = window.getSelection()
    if (!selection) {
      return
    }

    editorRef.current?.focus()
    selection.removeAllRanges()
    if (savedRangeRef.current) {
      selection.addRange(savedRangeRef.current)
    }
  }

  const runCommand = (command: string, value?: string) => {
    restoreSelection()
    document.execCommand(command, false, value)
    syncDraftFromEditor()
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

  const handleFormulaBetaMessage = useEffectEvent((payload: unknown) => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('source' in payload) ||
      payload.source !== 'ccconnect-formula-beta' ||
      !('type' in payload)
    ) {
      return
    }

    if (payload.type === 'close') {
      setIsFormulaBetaDialogOpen(false)
      editorRef.current?.focus()
      return
    }

    if (payload.type === 'insert' && 'value' in payload && typeof payload.value === 'string') {
      const value = payload.value.trim()
      if (!value) {
        return
      }

      insertHtml(`<code>\\(${escapeInlineHtml(value)}\\)</code>`)
      setIsFormulaBetaDialogOpen(false)
      editorRef.current?.focus()
    }
  })

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      handleFormulaBetaMessage(event.data)
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  const handleEmojiInsert = (emoji: string) => {
    insertText(emoji)
    setIsEmojiPickerOpen(false)
    editorRef.current?.focus()
  }

  const openInsertPanel = (type: InsertPanelType) => {
    setIsEmojiPickerOpen(false)
    setIsFormulaBetaDialogOpen(false)
    setIsColorPaletteOpen(false)
    setInsertPanelError(null)
    setInsertPanel(createInsertPanelState(type))
  }

  const openFormulaBetaDialog = () => {
    setIsEmojiPickerOpen(false)
    setIsColorPaletteOpen(false)
    setInsertPanel(null)
    setInsertPanelError(null)
    setIsFormulaBetaDialogOpen(true)
  }

  const toggleColorPalette = () => {
    setIsEmojiPickerOpen(false)
    setInsertPanel(null)
    setInsertPanelError(null)
    setIsFormulaBetaDialogOpen(false)
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
      case 'special-character': {
        const value = insertPanel.value?.trim() ?? ''
        if (!value) {
          setInsertPanelError('先输入要插入的字符。')
          return
        }

        insertText(value)
        closeInsertPanel()
        return
      }
      case 'table': {
        const rows = Number.parseInt(insertPanel.rows ?? '', 10)
        const columns = Number.parseInt(insertPanel.columns ?? '', 10)
        if (!Number.isFinite(rows) || !Number.isFinite(columns) || rows <= 0 || columns <= 0) {
          setInsertPanelError('表格行数和列数需要是大于 0 的整数。')
          return
        }

        const tableHtml = `<table style="width: 100%; border-collapse: collapse;"><tbody>${Array.from({ length: rows }, () => `<tr>${Array.from({ length: columns }, () => '<td style="border: 1px solid #d9d9d9; padding: 6px;">内容</td>').join('')}</tr>`).join('')}</tbody></table><p><br></p>`
        insertHtml(tableHtml)
        closeInsertPanel()
        return
      }
      case 'tex': {
        const value = insertPanel.value?.trim() ?? ''
        if (!value) {
          setInsertPanelError('先输入 TEX 公式。')
          return
        }

        insertHtml(`<code>\\(${escapeInlineHtml(value)}\\)</code>`)
        closeInsertPanel()
        return
      }
      case 'code': {
        const value = insertPanel.value ?? ''
        if (!value.trim()) {
          setInsertPanelError('先输入代码内容。')
          return
        }

        insertHtml(`<pre><code>${escapeInlineHtml(value)}</code></pre>`)
        closeInsertPanel()
      }
    }
  }

  return (
    <section className="pp-view pp-view--single pp-view--files">
      <div
        className={`pp-chatbox pp-chatbox--files${isDragging ? ' is-dragging' : ''}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="pp-chatbox__thread">
          {unifiedConversationEntries.length > 0 ? (
            unifiedConversationEntries.map((entry, index) => {
              const previousIso = index > 0 ? unifiedConversationEntries[index - 1].createdAt : null
              const showDivider = shouldInsertDivider(previousIso, entry.createdAt)

              if (entry.entryType === 'notice') {
                return (
                  <div key={entry.id} className="pp-chatbox__entry">
                    <div className="pp-chatbox__notice">
                      <span>{entry.text}</span>
                    </div>
                  </div>
                )
              }

              const senderName = entry.senderName.trim() || (entry.fromSelf ? '我' : '对方设备')

              return (
                <div key={entry.id} className="pp-chatbox__entry">
                  <>
                    {showDivider && (
                      <div className="pp-chatbox__divider">
                        <span>{formatChatDivider(entry.createdAt)}</span>
                      </div>
                    )}

                    <div className={`pp-chatbox__message${entry.fromSelf ? ' is-self' : ' is-peer'}`}>
                      <div className="pp-chatbox__sender">
                        <div className={`pp-chatbox__avatar${entry.fromSelf ? ' is-self' : ''}`}>
                          {resolveAvatarLabel(senderName, entry.fromSelf)}
                        </div>
                        <span className="pp-chatbox__sender-name" title={senderName}>
                          {senderName}
                        </span>
                      </div>

                      {entry.entryType === 'text' ? (
                        <div
                          className="pp-chatbox__bubble pp-chatbox__bubble--rich"
                          dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(entry.text) }}
                        />
                      ) : (
                        <div className={`pp-file-bubble is-${entry.file.tone}`}>
                          <small className="pp-file-bubble__eyebrow">
                            {entry.file.kind === 'outgoing' ? '我发送的文件' : '收到的文件'}
                          </small>
                          <strong>{entry.file.fileName}</strong>
                          <span className="pp-file-bubble__meta">
                            {formatFileSize(entry.file.fileSize)} · {entry.file.subtitle}
                          </span>
                          <div className="pp-file-bubble__progress">
                            <div
                              className={`pp-file-bubble__bar is-${entry.file.tone}`}
                              style={{ width: `${Math.round(entry.file.progress * 100)}%` }}
                            />
                          </div>
                          <div className="pp-file-bubble__footer">
                            <span>{entry.file.statusLabel}</span>
                            <span>{entry.file.detail}</span>
                          </div>
                          {(entry.file.downloadUrl || entry.file.onDownload || entry.file.action) && (
                            <div className="pp-file-bubble__actions">
                              {entry.file.onDownload ? (
                                <button
                                  type="button"
                                  className="pp-file-bubble__action"
                                  onClick={entry.file.onDownload}
                                >
                                  下载文件
                                </button>
                              ) : null}
                              {entry.file.downloadUrl ? (
                                <a
                                  className="pp-file-bubble__action"
                                  href={entry.file.downloadUrl}
                                  download={entry.file.downloadName}
                                >
                                  下载文件
                                </a>
                              ) : null}
                              {entry.file.action === 'retry' ? (
                                <button
                                  type="button"
                                  className="pp-file-bubble__action"
                                  onClick={() => onRetryTransfer(entry.file.id)}
                                >
                                  重试
                                </button>
                              ) : null}
                              {entry.file.action === 'cancel' ? (
                                <button
                                  type="button"
                                  className="pp-file-bubble__action"
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
          ) : (
            <div className="pp-chatbox__empty pp-chatbox__empty--files">{fileConversationEmptyState}</div>
          )}
        </div>

        <div className="pp-chatbox__composer">
          <div className="pp-rich-toolbar-scroll">
            <div className="pp-rich-toolbar">
              <div className="pp-rich-toolbar__group">
              <select
                className="pp-rich-toolbar__select"
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) {
                    runCommand('formatBlock', event.target.value)
                    event.target.value = ''
                  }
                }}
              >
                {paragraphFormats.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="pp-rich-toolbar__select"
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) {
                    applyInlineStyle(
                      [['font-family', event.target.value]],
                      { command: 'fontName', value: event.target.value },
                    )
                    event.target.value = ''
                  }
                }}
              >
                {fontOptions.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="pp-rich-toolbar__select"
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) {
                    const fontSize = Number.parseInt(event.target.value, 10)
                    applyInlineStyle(
                      [['font-size', `${fontSize.toString()}px`]],
                      {
                        command: 'fontSize',
                        value: legacyFontSizeForPixels(fontSize),
                      },
                    )
                    event.target.value = ''
                  }
                }}
              >
                {richTextSizes.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="pp-rich-toolbar__color-field">
                <button
                  ref={colorPaletteTriggerRef}
                  type="button"
                  className={`pp-rich-toolbar__button pp-rich-toolbar__color-trigger${isColorPaletteOpen ? ' is-active' : ''}`}
                  aria-label="字体颜色"
                  aria-expanded={isColorPaletteOpen}
                  aria-haspopup="dialog"
                  title="字体颜色"
                  onMouseDown={handleColorPaletteTriggerMouseDown}
                >
                  <span className="pp-rich-toolbar__color-glyph" aria-hidden="true">
                    A
                  </span>
                  <span
                    className="pp-rich-toolbar__color-line"
                    style={{ backgroundColor: activeTextColor ?? '#111111' }}
                    aria-hidden="true"
                  />
                  <span className="pp-rich-toolbar__color-caret" aria-hidden="true">
                    ▼
                  </span>
                </button>

              </div>
              </div>

              <div className="pp-rich-toolbar__group">
                <button
                  type="button"
                  className="pp-rich-toolbar__button pp-rich-toolbar__button--icon"
                  aria-label="清除格式"
                  title="清除格式"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => runCommand('removeFormat')}
                >
                  <span className="pp-rich-toolbar__glyph pp-rich-toolbar__glyph--compact" aria-hidden="true">Tx</span>
                </button>
                <button
                  type="button"
                  className="pp-rich-toolbar__button pp-rich-toolbar__button--icon is-disabled"
                  aria-label="格式刷暂未接入"
                  title="格式刷暂未接入"
                  disabled
                >
                  <span className="pp-rich-toolbar__glyph" aria-hidden="true">Fb</span>
                </button>
                <button
                  type="button"
                  className="pp-rich-toolbar__button pp-rich-toolbar__button--icon"
                  aria-label="加粗"
                  title="加粗"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => runCommand('bold')}
                >
                  <span className="pp-rich-toolbar__glyph pp-rich-toolbar__glyph--bold" aria-hidden="true">B</span>
                </button>
                <button
                  type="button"
                  className="pp-rich-toolbar__button pp-rich-toolbar__button--icon"
                  aria-label="斜体"
                  title="斜体"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => runCommand('italic')}
                >
                  <span className="pp-rich-toolbar__glyph pp-rich-toolbar__glyph--italic" aria-hidden="true">I</span>
                </button>
                <button
                  type="button"
                  className="pp-rich-toolbar__button pp-rich-toolbar__button--icon"
                  aria-label="下划线"
                  title="下划线"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => runCommand('underline')}
                >
                  <span className="pp-rich-toolbar__glyph pp-rich-toolbar__glyph--underline" aria-hidden="true">U</span>
                </button>
                <button
                  type="button"
                  className="pp-rich-toolbar__button pp-rich-toolbar__button--icon"
                  aria-label="缩进"
                  title="缩进"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => runCommand('indent')}
                >
                  <span className="pp-rich-toolbar__glyph" aria-hidden="true">⇥</span>
                </button>
                <button
                  type="button"
                  className="pp-rich-toolbar__button pp-rich-toolbar__button--icon"
                  aria-label="左对齐"
                  title="左对齐"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => runCommand('justifyLeft')}
                >
                  <span className="pp-rich-toolbar__glyph" aria-hidden="true">L</span>
                </button>
                <button
                  type="button"
                  className="pp-rich-toolbar__button pp-rich-toolbar__button--icon"
                  aria-label="居中"
                  title="居中"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => runCommand('justifyCenter')}
                >
                  <span className="pp-rich-toolbar__glyph" aria-hidden="true">C</span>
                </button>
                <button
                  type="button"
                  className="pp-rich-toolbar__button pp-rich-toolbar__button--icon"
                  aria-label="右对齐"
                  title="右对齐"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => runCommand('justifyRight')}
                >
                  <span className="pp-rich-toolbar__glyph" aria-hidden="true">R</span>
                </button>
              </div>

              <div className="pp-rich-toolbar__group">
                <button
                  type="button"
                  className={`pp-rich-toolbar__button pp-rich-toolbar__button--icon${insertPanel?.type === 'special-character' ? ' is-active' : ''}`}
                  aria-label="特殊字符"
                  title="特殊字符"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => openInsertPanel('special-character')}
                >
                  <span className="pp-rich-toolbar__glyph" aria-hidden="true">Ω</span>
                </button>
                <button
                  type="button"
                  className={`pp-rich-toolbar__button pp-rich-toolbar__button--icon${insertPanel?.type === 'table' ? ' is-active' : ''}`}
                  aria-label="插入表格"
                  title="插入表格"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => openInsertPanel('table')}
                >
                  <span className="pp-rich-toolbar__glyph" aria-hidden="true">▦</span>
                </button>
                <button
                  type="button"
                  className={`pp-rich-toolbar__button pp-rich-toolbar__button--icon${insertPanel?.type === 'tex' ? ' is-active' : ''}`}
                  aria-label="TEX 公式"
                  title="TEX 公式"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => openInsertPanel('tex')}
                >
                  <span className="pp-rich-toolbar__glyph" aria-hidden="true">∑</span>
                </button>
                <button
                  type="button"
                  className="pp-rich-toolbar__button pp-rich-toolbar__button--icon"
                  aria-label="公式 beta"
                  title="公式 beta"
                  onMouseDown={preserveEditorFocus}
                  onClick={openFormulaBetaDialog}
                >
                  <span className="pp-rich-toolbar__glyph" aria-hidden="true">β</span>
                </button>
                <button
                  type="button"
                  className="pp-rich-toolbar__button pp-rich-toolbar__button--icon is-disabled"
                  aria-label="画板待接入"
                  title="画板待接入"
                  disabled
                >
                  <span className="pp-rich-toolbar__glyph" aria-hidden="true">✎</span>
                </button>
                <button
                  type="button"
                  className={`pp-rich-toolbar__button pp-rich-toolbar__button--icon${insertPanel?.type === 'code' ? ' is-active' : ''}`}
                  aria-label="代码块"
                  title="代码块"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => openInsertPanel('code')}
                >
                  <span className="pp-rich-toolbar__glyph pp-rich-toolbar__glyph--code" aria-hidden="true">&lt;/&gt;</span>
                </button>
              </div>
            </div>
          </div>

          {isFormulaBetaDialogOpen && (
            <div className="pp-formula-dialog" role="dialog" aria-modal="true" aria-label="公式beta">
              <button
                type="button"
                className="pp-formula-dialog__backdrop"
                aria-label="关闭公式 beta 对话框"
                onClick={() => setIsFormulaBetaDialogOpen(false)}
              />
              <div className="pp-formula-dialog__panel">
                <div className="pp-formula-dialog__titlebar">
                  <div className="pp-formula-dialog__draghandle">
                    <span className="pp-formula-dialog__caption">公式beta</span>
                  </div>
                  <button
                    type="button"
                    className="pp-formula-dialog__close"
                    aria-label="关闭对话框"
                    title="关闭对话框"
                    onClick={() => setIsFormulaBetaDialogOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="pp-formula-dialog__content">
                  <iframe
                    className="pp-formula-dialog__iframe"
                    title="公式 beta 编辑器"
                    srcDoc={formulaBetaFrameSrcDoc}
                  />
                </div>
              </div>
            </div>
          )}

          {isColorPaletteOpen && createPortal(
            <div
              ref={colorPaletteRef}
              className="pp-color-palette"
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
              <div className="pp-color-palette__topbar">
                <div
                  className="pp-color-palette__preview"
                  style={{ backgroundColor: activeTextColor ?? '#ffffff' }}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className="pp-color-palette__clear"
                  onMouseDown={handleClearTextColorMouseDown}
                >
                  清空颜色
                </button>
              </div>

              <div className="pp-color-palette__section">
                <span className="pp-color-palette__label">主题颜色</span>
                <div className="pp-color-palette__grid">
                  {themeRichTextColors.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="pp-color-palette__swatch"
                      style={{ backgroundColor: option.value }}
                      title={option.label}
                      aria-label={option.label}
                      onMouseDown={(event) => handleColorSwatchMouseDown(event, option.value)}
                    />
                  ))}
                </div>
              </div>

              <div className="pp-color-palette__section">
                <span className="pp-color-palette__label">标准颜色</span>
                <div className="pp-color-palette__grid">
                  {standardRichTextColors.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="pp-color-palette__swatch"
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

          {insertPanel && (
            <form className="pp-rich-insert-panel" onSubmit={handleInsertPanelSubmit}>
              <div className="pp-rich-insert-panel__header">
                <strong>
                  {insertPanel.type === 'special-character' && '插入特殊字符'}
                  {insertPanel.type === 'table' && '插入表格'}
                  {insertPanel.type === 'tex' && '插入 TEX 公式'}
                  {insertPanel.type === 'code' && '插入代码块'}
                </strong>
                <button type="button" className="pp-rich-insert-panel__dismiss" onClick={closeInsertPanel}>
                  关闭
                </button>
              </div>

              <div className="pp-rich-insert-panel__body">
                {insertPanel.type === 'special-character' && (
                  <>
                    <label className="pp-rich-insert-panel__field">
                      <span>字符内容</span>
                      <input
                        ref={setInsertPanelInputElement}
                        className="pp-rich-insert-panel__input"
                        value={insertPanel.value ?? ''}
                        onChange={(event) => updateInsertPanel({ value: event.target.value })}
                        placeholder="输入要插入的字符"
                      />
                    </label>
                    <div className="pp-rich-insert-panel__chips" aria-label="常用特殊字符">
                      {specialCharacterPresets.map((character) => (
                        <button
                          key={character}
                          type="button"
                          className="pp-rich-insert-panel__chip"
                          onClick={() => updateInsertPanel({ value: character })}
                        >
                          {character}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {insertPanel.type === 'table' && (
                  <div className="pp-rich-insert-panel__grid">
                    <label className="pp-rich-insert-panel__field">
                      <span>行数</span>
                      <input
                        ref={setInsertPanelInputElement}
                        className="pp-rich-insert-panel__input"
                        inputMode="numeric"
                        value={insertPanel.rows ?? ''}
                        onChange={(event) => updateInsertPanel({ rows: event.target.value })}
                        placeholder="2"
                      />
                    </label>
                    <label className="pp-rich-insert-panel__field">
                      <span>列数</span>
                      <input
                        className="pp-rich-insert-panel__input"
                        inputMode="numeric"
                        value={insertPanel.columns ?? ''}
                        onChange={(event) => updateInsertPanel({ columns: event.target.value })}
                        placeholder="3"
                      />
                    </label>
                  </div>
                )}

                {insertPanel.type === 'tex' && (
                  <label className="pp-rich-insert-panel__field">
                    <span>TEX 公式</span>
                    <textarea
                      ref={setInsertPanelTextareaElement}
                      className="pp-rich-insert-panel__textarea"
                      value={insertPanel.value ?? ''}
                      onChange={(event) => updateInsertPanel({ value: event.target.value })}
                      placeholder="\\frac{a}{b}"
                      rows={3}
                    />
                  </label>
                )}

                {insertPanel.type === 'code' && (
                  <label className="pp-rich-insert-panel__field">
                    <span>代码内容</span>
                    <textarea
                      ref={setInsertPanelTextareaElement}
                      className="pp-rich-insert-panel__textarea"
                      value={insertPanel.value ?? ''}
                      onChange={(event) => updateInsertPanel({ value: event.target.value })}
                      placeholder="const answer = 42;"
                      rows={5}
                    />
                  </label>
                )}

                {insertPanelError && <p className="pp-rich-insert-panel__error">{insertPanelError}</p>}

                <div className="pp-rich-insert-panel__actions">
                  <span className="pp-rich-insert-panel__hint">填写后直接插入到当前光标位置</span>
                  <div className="pp-rich-insert-panel__action-group">
                    <button type="button" className="pp-rich-insert-panel__ghost" onClick={closeInsertPanel}>
                      取消
                    </button>
                    <button type="submit" className="pp-rich-insert-panel__primary">
                      插入
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}

          <div className="pp-chatbox__textarea-wrap">
            <div
              ref={editorRef}
              className="pp-chatbox__editor"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="输入消息，支持富文本和 Ctrl/Cmd + Enter 发送。"
              onInput={syncDraftFromEditor}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  onSendText()
                }
              }}
            />
          </div>

          <div className="pp-chatbox__composer-footer">
            <div className="pp-chatbox__toolbar pp-chatbox__toolbar--files">
              <button
                ref={emojiTriggerRef}
                type="button"
                aria-label="表情"
                aria-expanded={isEmojiPickerOpen}
                aria-haspopup="dialog"
                className={`pp-chatbox__emoji-trigger${isEmojiPickerOpen ? ' is-open' : ''}`}
                onMouseDown={preserveEditorFocus}
                onClick={() => {
                  setInsertPanel(null)
                  setInsertPanelError(null)
                  setIsEmojiPickerOpen((previous) => !previous)
                }}
              >
                🙂
              </button>
            </div>

            <div className="pp-chatbox__composer-actions">
              <label className="pp-chatbox__file-trigger" htmlFor={fileInputId}>
                <input id={fileInputId} className="sr-only" type="file" multiple onChange={onFileSelection} />
                选择文件
              </label>
              <button
                type="button"
                className="pp-button pp-button--primary"
                onClick={onSendText}
                disabled={isSendDisabled}
              >
                发送
              </button>
            </div>
          </div>

          {isEmojiPickerOpen && (
            <div
              ref={emojiPickerRef}
              className="pp-emoji-picker"
              role="dialog"
              aria-label="Emoji 选择器"
            >
              <div className="pp-emoji-picker__header">
                <strong>表情</strong>
                <span>点击即可插入到输入框</span>
              </div>
              <div className="pp-emoji-picker__grid">
                {quickEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="pp-emoji-picker__item"
                    onMouseDown={preserveEditorFocus}
                    onClick={() => handleEmojiInsert(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pp-chatbox__toolbar pp-chatbox__toolbar--meta">
            <span className="pp-chatbox__meta-note">支持富文本、表格、附件链接、音频和代码块</span>
            <span className="pp-chatbox__meta-note">当前目标：{activeTransferLabel}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
