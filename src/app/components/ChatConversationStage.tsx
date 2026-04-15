import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, MouseEvent as ReactMouseEvent } from 'react'
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
  { label: '默认字体', value: '' },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '黑体', value: '"Noto Sans SC", sans-serif' },
  { label: 'Jakarta', value: '"Plus Jakarta Sans", sans-serif' },
  { label: '等宽', value: '"IBM Plex Mono", monospace' },
]

const richTextSizes = [
  { label: '字号', value: '' },
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
  { label: '段落格式', value: '' },
  { label: '正文', value: 'p' },
  { label: '标题 1', value: 'h1' },
  { label: '标题 2', value: 'h2' },
  { label: '标题 3', value: 'h3' },
  { label: '引用', value: 'blockquote' },
  { label: '代码块', value: 'pre' },
]

const colorPresets = [
  '#111111',
  '#fa5151',
  '#07c160',
  '#1c7ed6',
  '#f59f00',
  '#845ef7',
]

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
  const editorRef = useRef<HTMLDivElement | null>(null)
  const emojiPickerRef = useRef<HTMLDivElement | null>(null)
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null)
  const savedRangeRef = useRef<Range | null>(null)

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

  const insertHtml = (html: string) => {
    restoreSelection()
    document.execCommand('insertHTML', false, html)
    syncDraftFromEditor()
  }

  const handleEmojiInsert = (emoji: string) => {
    restoreSelection()
    document.execCommand('insertText', false, emoji)
    syncDraftFromEditor()
    setIsEmojiPickerOpen(false)
    editorRef.current?.focus()
  }

  const handleInsertSpecialCharacter = () => {
    const value = window.prompt('输入要插入的特殊字符', '℃')
    if (!value) {
      return
    }

    restoreSelection()
    document.execCommand('insertText', false, value)
    syncDraftFromEditor()
  }

  const handleInsertTable = () => {
    const rows = Number.parseInt(window.prompt('表格行数', '2') ?? '', 10)
    const columns = Number.parseInt(window.prompt('表格列数', '3') ?? '', 10)
    if (!Number.isFinite(rows) || !Number.isFinite(columns) || rows <= 0 || columns <= 0) {
      return
    }

    const tableHtml = `<table style="width: 100%; border-collapse: collapse;"><tbody>${Array.from({ length: rows }, () => `<tr>${Array.from({ length: columns }, () => '<td style="border: 1px solid #d9d9d9; padding: 6px;">内容</td>').join('')}</tr>`).join('')}</tbody></table><p><br></p>`
    insertHtml(tableHtml)
  }

  const handleInsertImage = () => {
    const url = window.prompt('输入图片 URL')
    if (!url) {
      return
    }

    insertHtml(`<img src="${escapeInlineHtml(url)}" alt="插入图片" style="max-width: 100%;" />`)
  }

  const handleInsertAttachment = () => {
    const url = window.prompt('输入附件 URL')
    if (!url) {
      return
    }

    const label = window.prompt('输入附件名称', '附件下载') ?? '附件下载'
    insertHtml(`<a href="${escapeInlineHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeInlineHtml(label)}</a>`)
  }

  const handleInsertAudio = () => {
    const url = window.prompt('输入音频 URL')
    if (!url) {
      return
    }

    insertHtml(`<audio controls src="${escapeInlineHtml(url)}"></audio>`)
  }

  const handleInsertTex = () => {
    const value = window.prompt('输入 TEX 公式', '\\frac{a}{b}')
    if (!value) {
      return
    }

    insertHtml(`<code>\\(${escapeInlineHtml(value)}\\)</code>`)
  }

  const handleInsertCodeBlock = () => {
    const code = window.prompt('输入代码内容', 'const answer = 42;')
    if (!code) {
      return
    }

    insertHtml(`<pre><code>${escapeInlineHtml(code)}</code></pre>`)
  }

  const handlePlaceholderInsert = (label: string) => {
    insertHtml(`<span style="color: #666;">[${label} 待补充]</span>`)
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

              return (
                <div key={entry.id} className="pp-chatbox__entry">
                  {entry.entryType === 'notice' ? (
                    <div className="pp-chatbox__notice">
                      <span>{entry.text}</span>
                    </div>
                  ) : (
                    <>
                      {showDivider && (
                        <div className="pp-chatbox__divider">
                          <span>{formatChatDivider(entry.createdAt)}</span>
                        </div>
                      )}

                      <div className={`pp-chatbox__message${entry.fromSelf ? ' is-self' : ' is-peer'}`}>
                        {!entry.fromSelf && <div className="pp-chatbox__avatar">TA</div>}

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

                        {entry.fromSelf && <div className="pp-chatbox__avatar is-self">我</div>}
                      </div>
                    </>
                  )}
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
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('removeFormat')}>
                清除格式
              </button>
              <button type="button" className="pp-rich-toolbar__button is-disabled" disabled title="格式刷暂未接入">
                格式刷
              </button>
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
            </div>

            <div className="pp-rich-toolbar__group">
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('bold')}>
                加粗
              </button>
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('italic')}>
                斜体
              </button>
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('underline')}>
                下划线
              </button>
              {colorPresets.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="pp-rich-toolbar__color"
                  style={{ backgroundColor: color }}
                  title="字体颜色"
                  onMouseDown={preserveEditorFocus}
                  onClick={() => runCommand('foreColor', color)}
                />
              ))}
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('indent')}>
                缩进
              </button>
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('justifyLeft')}>
                左对齐
              </button>
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('justifyCenter')}>
                居中
              </button>
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('justifyRight')}>
                右对齐
              </button>
            </div>

            <div className="pp-rich-toolbar__group">
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={handleInsertSpecialCharacter}>
                特殊字符
              </button>
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={handleInsertTable}>
                插入表格
              </button>
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={handleInsertTex}>
                TEX
              </button>
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={() => handlePlaceholderInsert('公式beta')}>
                公式beta
              </button>
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={handleInsertImage}>
                图片
              </button>
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={handleInsertAttachment}>
                附件
              </button>
              <button type="button" className="pp-rich-toolbar__button is-disabled" disabled title="录音待接入">
                录音
              </button>
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={handleInsertAudio}>
                音频
              </button>
              <button type="button" className="pp-rich-toolbar__button is-disabled" disabled title="拍照上传待接入">
                拍照上传
              </button>
              <button type="button" className="pp-rich-toolbar__button is-disabled" disabled title="画板待接入">
                画板
              </button>
              <button type="button" className="pp-rich-toolbar__button" onMouseDown={preserveEditorFocus} onClick={handleInsertCodeBlock}>
                代码块
              </button>
            </div>
          </div>

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
                onClick={() => setIsEmojiPickerOpen((previous) => !previous)}
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
