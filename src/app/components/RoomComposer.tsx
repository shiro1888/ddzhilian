import type {
  ChangeEventHandler,
  ClipboardEventHandler,
  CompositionEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  RefObject,
} from 'react'
import { ScanText } from 'lucide-react'

import type { ComposerImageDraft } from '../types'
import type { AiModelOption } from '../../lib/ddzhilian-types'
import { ComposerImageDraftStrip } from './ComposerImageDraftStrip'

type RoomComposerQuoteDraft = {
  senderName: string
  text: string
}

type RoomComposerProps = {
  quoteDraft: RoomComposerQuoteDraft | null
  images: ComposerImageDraft[]
  fileInputId: string
  ocrPanelId: string
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
}

const roomComposerQuickEmojis = [
  '😀', '😄', '😁', '😂', '🤣', '😊', '🙂', '😉', '😍', '🥰', '😘', '😎',
  '🤔', '🫠', '😴', '😭', '😡', '🥳', '🤯', '😇', '🤖', '👀', '🙌', '👏',
  '👍', '👎', '🙏', '💪', '👋', '🤝', '🎉', '🎊', '✨', '🔥', '⭐', '🌈',
  '☀️', '🌙', '⚡', '🍀', '🍎', '🍕', '☕', '🎵', '🎮', '🏀', '🚀', '❤️',
]

const roomComposerBotMentionLabel = '@DD直连小助手'

export function RoomComposer({
  quoteDraft,
  images,
  fileInputId,
  ocrPanelId,
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
}: RoomComposerProps) {
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
        <label className="dd-snaplink__attach" htmlFor={fileInputId} title="发送文件">
          +
          <input
            id={fileInputId}
            type="file"
            multiple
            hidden
            onChange={onDirectFileInputChange}
          />
        </label>
        <button
          ref={ocrTriggerRef}
          type="button"
          className={`dd-snaplink__ocr${isOcrPanelOpen ? ' is-active' : ''}`}
          aria-label="识别图片文字"
          aria-expanded={isOcrPanelOpen}
          aria-controls={ocrPanelId}
          title="识别图片文字"
          onClick={onOcrTriggerClick}
        >
          <ScanText size={16} strokeWidth={2.1} aria-hidden="true" />
        </button>
        <input
          ref={ocrFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={onOcrFileSelection}
        />
        <button
          ref={botTriggerRef}
          type="button"
          className={`dd-snaplink__bot${isBotDraft || isBotPanelOpen ? ' is-active' : ''}`}
          aria-label="输入 @DD直连小助手"
          aria-expanded={isBotPanelOpen}
          aria-haspopup="dialog"
          title="输入 @DD直连小助手"
          disabled={isAiGenerating}
          onClick={onBotTriggerClick}
        >
          {isAiGenerating ? '...' : '@'}
        </button>
        {isBotPanelOpen ? (
          <div
            ref={botPanelRef}
            className="dd-snaplink__bot-panel"
            role="dialog"
            aria-label="@DD直连小助手 模型选择"
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
            placeholder="输入消息..."
            autoComplete="off"
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
            🙂
          </button>
          {isEmojiPickerOpen ? (
            <div
              ref={emojiPickerRef}
              className="dd-snaplink__emoji-picker"
              role="dialog"
              aria-label="Emoji 选择器"
            >
              {roomComposerQuickEmojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="dd-snaplink__emoji-item"
                  onClick={() => onEmojiInsert(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button type="submit" className="dd-snaplink__send" disabled={isSendDisabled} title="发送">
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
