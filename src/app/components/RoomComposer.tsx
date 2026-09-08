import type {
  ChangeEventHandler,
  ClipboardEventHandler,
  CompositionEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  RefObject,
} from 'react'
import { useRef, useState } from 'react'
import {
  Bot,
  Camera,
  Clipboard,
  Command,
  Delete,
  Image as ImageIcon,
  Palette,
  Paperclip,
  Plus,
  ScanText,
  Smile,
} from 'lucide-react'

import type { ComposerImageDraft } from '../types'
import type { AiModelOption } from '../../lib/ddzhilian-types'
import { ComposerImageDraftStrip } from './ComposerImageDraftStrip'

type RoomComposerQuoteDraft = {
  senderName: string
  text: string
}

type EmojiCategory = {
  id: string
  name: string
  icon: string
  emojis: string[]
}

const emojiCategories: EmojiCategory[] = [
  {
    id: 'smileys',
    name: '表情',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
      '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
      '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '😝',
      '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐',
      '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌',
      '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢',
      '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠',
      '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮',
      '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰',
      '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓',
      '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈',
    ],
  },
  {
    id: 'gestures',
    name: '手势',
    icon: '👍',
    emojis: [
      '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🫰',
      '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇',
      '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👏', '🙌',
      '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿',
      '🫡', '🫶', '❤️', '🧡', '💛', '💚', '💙', '💜',
    ],
  },
  {
    id: 'objects',
    name: '生活',
    icon: '🎉',
    emojis: [
      '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉',
      '🔥', '⚡', '✨', '🌟', '💫', '💥', '💯', '💢',
      '☕', '🍵', '🧋', '🍺', '🍻', '🍷', '🥂', '🍾',
      '🍕', '🍔', '🍟', '🍜', '🍱', '🍙', '🍰', '🍦',
      '🚀', '✈️', '🚗', '🛵', '🚲', '🛴', '💻', '📱',
      '📷', '🎬', '🎧', '🎮', '💡', '⏰', '📌', '📦',
    ],
  },
  {
    id: 'symbols',
    name: '符号',
    icon: '❤️',
    emojis: [
      '❤️', '💖', '💘', '💝', '💗', '💓', '💞', '💕',
      '💟', '❣️', '💔', '❤️‍🔥', '❤️‍🩹', '💌', '💤', '💢',
      '✅', '✔️', '☑️', '❌', '❎', '❓', '❗', '❕',
      '⚠️', '🚫', '⛔', '💬', '💭', '🗯️', '👀', '👁️',
    ],
  },
]

const roomComposerBotMentionLabel = '@DD助手'

type RoomComposerProps = {
  quoteDraft: RoomComposerQuoteDraft | null
  images: ComposerImageDraft[]
  fileInputId: string
  ocrPanelId: string
  targetName?: string
  defaultDraft: string
  isOcrPanelOpen: boolean
  isBotDraft: boolean
  isBotPanelOpen: boolean
  isAiGenerating: boolean
  selectedAiModel: string
  selectedAiModelLabel: string
  aiQuotaLabel: string
  aiModelOptions: AiModelOption[]
  isEmojiPickerOpen: boolean
  isSendDisabled: boolean
  enterToSend: boolean
  ocrTriggerRef: RefObject<HTMLButtonElement | null>
  ocrFileInputRef: RefObject<HTMLInputElement | null>
  botTriggerRef: RefObject<HTMLButtonElement | null>
  botPanelRef: RefObject<HTMLDivElement | null>
  inputRef: RefObject<HTMLTextAreaElement | null>
  emojiTriggerRef: RefObject<HTMLButtonElement | null>
  emojiPickerRef: RefObject<HTMLDivElement | null>
  getAiModelOptionValue: (option: AiModelOption) => string
  onCancelQuote: () => void
  onImageRemove: (id: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
  onDirectFileInputChange: ChangeEventHandler<HTMLInputElement>
  onOcrTriggerClick: () => void
  onOcrFileSelection: ChangeEventHandler<HTMLInputElement>
  onBotTriggerClick: () => void
  onBotMentionSelect: () => void
  onAiModelChange: (value: string) => void
  onDraftChange: ChangeEventHandler<HTMLTextAreaElement>
  onDraftCompositionStart: CompositionEventHandler<HTMLTextAreaElement>
  onDraftCompositionEnd: CompositionEventHandler<HTMLTextAreaElement>
  onComposerPaste: ClipboardEventHandler<HTMLTextAreaElement>
  onComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onEmojiToggle: () => void
  onEmojiInsert: (emoji: string) => void
  onEmojiBackspace: () => void
  onEmojiSend: () => void
  onOpenImageTool?: () => void
  onOpenCommandTool?: () => void
}

export function RoomComposer({
  quoteDraft,
  images,
  fileInputId,
  ocrPanelId,
  targetName,
  defaultDraft,
  isOcrPanelOpen,
  isBotDraft,
  isBotPanelOpen,
  isAiGenerating,
  selectedAiModel,
  selectedAiModelLabel,
  aiQuotaLabel,
  aiModelOptions,
  isEmojiPickerOpen,
  isSendDisabled,
  enterToSend,
  ocrTriggerRef,
  ocrFileInputRef,
  botTriggerRef,
  botPanelRef,
  inputRef,
  emojiTriggerRef,
  emojiPickerRef,
  getAiModelOptionValue,
  onCancelQuote,
  onImageRemove,
  onSubmit,
  onDirectFileInputChange,
  onOcrTriggerClick,
  onOcrFileSelection,
  onBotTriggerClick,
  onBotMentionSelect,
  onAiModelChange,
  onDraftChange,
  onDraftCompositionStart,
  onDraftCompositionEnd,
  onComposerPaste,
  onComposerKeyDown,
  onEmojiToggle,
  onEmojiInsert,
  onEmojiBackspace,
  onOpenImageTool,
  onOpenCommandTool,
}: RoomComposerProps) {
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('smileys')
  const currentCategory = emojiCategories.find((c) => c.id === activeCategory) ?? emojiCategories[0]

  const filePickerRef = useRef<HTMLInputElement | null>(null)
  const imagePickerRef = useRef<HTMLInputElement | null>(null)
  const cameraPickerRef = useRef<HTMLInputElement | null>(null)

  const runPlusAction = (action: () => void) => {
    setIsPlusMenuOpen(false)
    action()
  }

  const handleFileInputChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    setIsPlusMenuOpen(false)
    onDirectFileInputChange(event)
  }

  const handlePasteClipboard = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        if (text && inputRef.current) {
          const textarea = inputRef.current
          const start = textarea.selectionStart ?? textarea.value.length
          const end = textarea.selectionEnd ?? textarea.value.length
          const currentVal = textarea.value
          const newVal = currentVal.substring(0, start) + text + currentVal.substring(end)

          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
          )?.set
          if (nativeSetter) {
            nativeSetter.call(textarea, newVal)
          } else {
            textarea.value = newVal
          }
          textarea.dispatchEvent(new Event('input', { bubbles: true }))
          const newPos = start + text.length
          textarea.focus()
          textarea.setSelectionRange(newPos, newPos)
          return
        }
      }
    } catch {
      // clipboard access denied or unsupported
    }
    inputRef.current?.focus()
  }

  return (
    <>
      {quoteDraft ? (
        <div className="dd-snaplink__quote-preview">
          <div className="dd-snaplink__quote-preview-body">
            <div className="dd-snaplink__quote-preview-copy">
              <strong>{quoteDraft.senderName}</strong>
              <span>{quoteDraft.text}</span>
            </div>
            <button type="button" aria-label="取消引用" onClick={onCancelQuote}>
              ×
            </button>
          </div>
        </div>
      ) : null}

      <ComposerImageDraftStrip images={images} onRemove={onImageRemove} />

      <form className="dd-snaplink__compose" onSubmit={onSubmit}>
        <span className="dd-snaplink__plus-wrap">
          <button
            type="button"
            className={`dd-snaplink__attach${isPlusMenuOpen ? ' is-active' : ''}`}
            aria-label="打开发送菜单"
            aria-expanded={isPlusMenuOpen}
            aria-haspopup="menu"
            title="更多发送方式"
            onClick={() => {
              if (isEmojiPickerOpen) {
                onEmojiToggle()
              }
              setIsPlusMenuOpen((current) => !current)
            }}
          >
            <Plus size={19} strokeWidth={2} aria-hidden="true" />
          </button>
          {isPlusMenuOpen ? (
            <>
              <button
                type="button"
                className="dd-snaplink__plus-backdrop"
                aria-label="关闭发送菜单"
                onClick={() => setIsPlusMenuOpen(false)}
              />
              <span className="dd-snaplink__plus-menu" role="menu" aria-label="发送菜单">
                <button
                  type="button"
                  className="dd-snaplink__plus-item"
                  role="menuitem"
                  onClick={() => runPlusAction(() => filePickerRef.current?.click())}
                >
                  <span className="dd-snaplink__plus-icon is-file">
                    <Paperclip size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <strong className="dd-snaplink__plus-label">文件</strong>
                </button>
                <button
                  type="button"
                  className="dd-snaplink__plus-item"
                  role="menuitem"
                  onClick={() => runPlusAction(() => imagePickerRef.current?.click())}
                >
                  <span className="dd-snaplink__plus-icon is-album">
                    <ImageIcon size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <strong className="dd-snaplink__plus-label">相册</strong>
                </button>
                <button
                  type="button"
                  className="dd-snaplink__plus-item"
                  role="menuitem"
                  onClick={() => runPlusAction(() => cameraPickerRef.current?.click())}
                >
                  <span className="dd-snaplink__plus-icon is-camera">
                    <Camera size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <strong className="dd-snaplink__plus-label">拍照</strong>
                </button>
                <button
                  type="button"
                  className="dd-snaplink__plus-item"
                  role="menuitem"
                  onClick={() => runPlusAction(handlePasteClipboard)}
                >
                  <span className="dd-snaplink__plus-icon is-clipboard">
                    <Clipboard size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <strong className="dd-snaplink__plus-label">剪贴板</strong>
                </button>
                <button
                  ref={botTriggerRef}
                  type="button"
                  className={`dd-snaplink__plus-item${isBotDraft || isBotPanelOpen ? ' is-active' : ''}`}
                  role="menuitem"
                  disabled={isAiGenerating}
                  aria-expanded={isBotPanelOpen}
                  aria-haspopup="dialog"
                  onClick={() => runPlusAction(onBotTriggerClick)}
                >
                  <span className="dd-snaplink__plus-icon is-assistant">
                    <Bot size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <strong className="dd-snaplink__plus-label">DD助手</strong>
                </button>
                {onOpenImageTool ? (
                  <button
                    type="button"
                    className="dd-snaplink__plus-item"
                    role="menuitem"
                    onClick={() => runPlusAction(onOpenImageTool)}
                  >
                    <span className="dd-snaplink__plus-icon is-palette">
                      <Palette size={20} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <strong className="dd-snaplink__plus-label">AI生图</strong>
                  </button>
                ) : null}
                <button
                  ref={ocrTriggerRef}
                  type="button"
                  className={`dd-snaplink__plus-item${isOcrPanelOpen ? ' is-active' : ''}`}
                  role="menuitem"
                  aria-expanded={isOcrPanelOpen}
                  aria-controls={ocrPanelId}
                  onClick={() => runPlusAction(onOcrTriggerClick)}
                >
                  <span className="dd-snaplink__plus-icon is-ocr">
                    <ScanText size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <strong className="dd-snaplink__plus-label">提取文字</strong>
                </button>
                {onOpenCommandTool ? (
                  <button
                    type="button"
                    className="dd-snaplink__plus-item"
                    role="menuitem"
                    onClick={() => runPlusAction(onOpenCommandTool)}
                  >
                    <span className="dd-snaplink__plus-icon is-command">
                      <Command size={20} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <strong className="dd-snaplink__plus-label">命令行</strong>
                  </button>
                ) : null}
              </span>
            </>
          ) : null}
        </span>
        <input
          ref={filePickerRef}
          id={fileInputId}
          type="file"
          multiple
          hidden
          onChange={handleFileInputChange}
        />
        <input
          ref={imagePickerRef}
          id={`${fileInputId}-image`}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleFileInputChange}
        />
        <input
          ref={cameraPickerRef}
          id={`${fileInputId}-camera`}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={handleFileInputChange}
        />
        <input
          ref={ocrFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={onOcrFileSelection}
        />
        {isBotPanelOpen ? (
          <div
            ref={botPanelRef}
            className="dd-snaplink__bot-panel"
            role="dialog"
            aria-label="@DD助手 模型选择"
          >
            <button type="button" className="dd-snaplink__bot-option" onClick={onBotMentionSelect}>
              <strong>{roomComposerBotMentionLabel}</strong>
              <span>{selectedAiModelLabel} · {aiQuotaLabel}</span>
            </button>
            <label className="dd-snaplink__bot-model">
              <span>模型</span>
              <select
                value={selectedAiModel}
                disabled={isAiGenerating || aiModelOptions.length === 0}
                onChange={(event) => onAiModelChange(event.target.value)}
              >
                {aiModelOptions.length > 0 ? (
                  aiModelOptions.map((model) => (
                    <option key={getAiModelOptionValue(model)} value={getAiModelOptionValue(model)}>
                      {model.label}
                    </option>
                  ))
                ) : (
                  <option value={selectedAiModel}>{selectedAiModelLabel}</option>
                )}
              </select>
            </label>
          </div>
        ) : null}
        <div className="dd-snaplink__input-wrap">
          <textarea
            ref={inputRef}
            defaultValue={defaultDraft}
            /* The drag hint is meaningless on touch and pushed the placeholder
               to three lines on a phone; dragging already has its own overlay. */
            placeholder={targetName ? `发送给 ${targetName}` : '输入消息'}
            aria-label={targetName ? `发送给 ${targetName}` : '消息输入'}
            autoComplete="off"
            enterKeyHint={enterToSend ? 'send' : 'enter'}
            rows={1}
            onChange={onDraftChange}
            onCompositionStart={onDraftCompositionStart}
            onCompositionEnd={onDraftCompositionEnd}
            onPaste={onComposerPaste}
            onKeyDown={onComposerKeyDown}
          />
          <button
            ref={emojiTriggerRef}
            type="button"
            className={`dd-snaplink__emoji-trigger${isEmojiPickerOpen ? ' is-open' : ''}`}
            aria-label="选择 emoji"
            aria-expanded={isEmojiPickerOpen}
            aria-haspopup="dialog"
            title="选择 emoji"
            onClick={onEmojiToggle}
          >
            <Smile size={18} strokeWidth={1.9} aria-hidden="true" />
          </button>
          {isEmojiPickerOpen ? (
            <div
              ref={emojiPickerRef}
              className="dd-snaplink__emoji-picker"
              role="dialog"
              aria-label="Emoji 选择器"
            >
              <div className="dd-snaplink__emoji-picker-nav" role="tablist" aria-label="表情分类">
                <div className="dd-snaplink__emoji-tabs">
                  {emojiCategories.map((category) => {
                    const isSelected = category.id === activeCategory
                    return (
                      <button
                        key={category.id}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        className={`dd-snaplink__emoji-tab${isSelected ? ' is-active' : ''}`}
                        onClick={() => setActiveCategory(category.id)}
                      >
                        <span aria-hidden="true">{category.icon}</span>
                        <span>{category.name}</span>
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  className="dd-snaplink__emoji-backspace-btn"
                  aria-label="退格删除"
                  title="退格删除"
                  onClick={onEmojiBackspace}
                >
                  <Delete size={15} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
              <div className="dd-snaplink__emoji-grid" role="tabpanel">
                {currentCategory.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="dd-snaplink__emoji-item"
                    aria-label={`插入表情 ${emoji}`}
                    onClick={() => onEmojiInsert(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <button
          type="submit"
          className="dd-snaplink__send"
          disabled={isSendDisabled}
          title={enterToSend ? "发送消息 (Enter · Shift+Enter 换行)" : "发送消息 (Ctrl + Enter)"}
          aria-label={enterToSend ? "发送 (Enter)" : "发送 (Ctrl+Enter)"}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </form>
    </>
  )
}
