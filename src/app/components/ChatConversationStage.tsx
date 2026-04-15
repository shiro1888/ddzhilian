import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { UnifiedConversationEntry } from '../types'
import {
  formatChatDivider,
  formatFileSize,
  sanitizeRichTextHtml,
  shouldInsertDivider,
} from '../utils'

const quickEmojis = [
  '😀', '😄', '😁', '😂', '🤣', '😊', '🙂', '😉', '😍', '🥰', '😘', '😎',
  '🤔', '🫠', '😴', '😭', '😡', '🥳', '🤯', '😇', '🤖', '👀', '🙌', '👏',
  '👍', '👎', '🙏', '💪', '👋', '🤝', '🎉', '🎊', '✨', '🔥', '⭐', '🌈',
  '☀️', '🌙', '⚡', '🍀', '🍎', '🍕', '☕', '🎵', '🎮', '🏀', '🚀', '❤️',
]

const richTextFonts = [
  { label: '字体样式', value: '' },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '黑体', value: '"Noto Sans SC", sans-serif' },
  { label: 'Jakarta', value: '"Plus Jakarta Sans", sans-serif' },
  { label: '等宽', value: '"IBM Plex Mono", monospace' },
]

const richTextSizes = [
  { label: '字体大小', value: '' },
  { label: '小五', value: '2' },
  { label: '五号', value: '3' },
  { label: '小四', value: '4' },
  { label: '四号', value: '5' },
  { label: '小三', value: '6' },
  { label: '三号', value: '7' },
]

function escapeInlineHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

const paragraphFormats = [
  { label: '段落', value: '' },
  { label: '正文', value: 'p' },
  { label: '标题 1', value: 'h1' },
  { label: '标题 2', value: 'h2' },
  { label: '标题 3', value: 'h3' },
  { label: '引用', value: 'blockquote' },
  { label: '代码块', value: 'pre' },
]

const richTextColors = [
  { label: '字体颜色', value: '' },
  { label: '黑色', value: '#111111' },
  { label: '红色', value: '#fa5151' },
  { label: '绿色', value: '#07c160' },
  { label: '蓝色', value: '#1c7ed6' },
  { label: '橙色', value: '#f59f00' },
  { label: '紫色', value: '#845ef7' },
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
  const editorRef = useRef<HTMLDivElement | null>(null)
  const emojiPickerRef = useRef<HTMLDivElement | null>(null)
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null)
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
    setInsertPanelError(null)
    setInsertPanel(createInsertPanelState(type))
  }

  const openFormulaBetaDialog = () => {
    setIsEmojiPickerOpen(false)
    setInsertPanel(null)
    setInsertPanelError(null)
    setIsFormulaBetaDialogOpen(true)
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
                          {(entry.file.downloadUrl || entry.file.action) && (
                            <div className="pp-file-bubble__actions">
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
          <div className="pp-rich-toolbar">
            <div className="pp-rich-toolbar__group">
              <select
                className="pp-rich-toolbar__select"
                defaultValue=""
                onMouseDown={preserveEditorFocus}
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
                onMouseDown={preserveEditorFocus}
                onChange={(event) => {
                  if (event.target.value) {
                    runCommand('fontName', event.target.value)
                    event.target.value = ''
                  }
                }}
              >
                {richTextFonts.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="pp-rich-toolbar__select"
                defaultValue=""
                onMouseDown={preserveEditorFocus}
                onChange={(event) => {
                  if (event.target.value) {
                    runCommand('fontSize', event.target.value)
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
              <select
                className="pp-rich-toolbar__select"
                defaultValue=""
                onMouseDown={preserveEditorFocus}
                onChange={(event) => {
                  if (event.target.value) {
                    runCommand('foreColor', event.target.value)
                    event.target.value = ''
                  }
                }}
              >
                {richTextColors.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
