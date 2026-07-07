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
  Command,
  Delete,
  FileText,
  Image as ImageIcon,
  Paperclip,
  ScanText,
} from 'lucide-react'

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

const roomComposerQuickEmojis = [
  '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆',
  '😉', '😊', '😋', '😎', '😍', '😘', '🥰', '🤫',
  '🙂', '🤗', '🤔', '🧐', '😐', '😶', '🙄', '😏',
  '😣', '😢', '😮', '😬', '😯', '😪', '😫', '😴',
  '😌', '😛', '😜', '😝', '🤤', '😟', '😓', '😔',
  '☹️', '🙃', '🤑', '😲', '🙁', '😖', '😞', '😧',
  '😤', '😡', '😨', '😱', '😳', '🥺', '😇', '🤭',
  '👍', '👎', '👏', '🙏', '💪', '👌', '👋', '❤️',
]

const roomComposerBotMentionLabel = '@DD助手'

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
  onEmojiSend,
  onOpenImageTool,
  onOpenCommandTool,
}: RoomComposerProps) {
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false)
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
            +
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
                  <Paperclip size={17} strokeWidth={2} aria-hidden="true" />
                  <span>
                    <strong>文件</strong>
                    <small>文件、图片或压缩包</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="dd-snaplink__plus-item"
                  role="menuitem"
                  onClick={() => runPlusAction(() => imagePickerRef.current?.click())}
                >
                  <ImageIcon size={17} strokeWidth={2} aria-hidden="true" />
                  <span>
                    <strong>照片</strong>
                    <small>从相册选择图片</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="dd-snaplink__plus-item"
                  role="menuitem"
                  onClick={() => runPlusAction(() => cameraPickerRef.current?.click())}
                >
                  <Camera size={17} strokeWidth={2} aria-hidden="true" />
                  <span>
                    <strong>拍照</strong>
                    <small>手机端可直接调用相机</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="dd-snaplink__plus-item"
                  role="menuitem"
                  onClick={() => runPlusAction(() => inputRef.current?.focus())}
                >
                  <FileText size={17} strokeWidth={2} aria-hidden="true" />
                  <span>
                    <strong>文本</strong>
                    <small>回到输入框发送文字</small>
                  </span>
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
                  <Bot size={17} strokeWidth={2} aria-hidden="true" />
                  <span>
                    <strong>DD助手</strong>
                    <small>{isAiGenerating ? '正在回复中' : selectedAiModelLabel}</small>
                  </span>
                </button>
                {onOpenImageTool ? (
                  <button
                    type="button"
                    className="dd-snaplink__plus-item"
                    role="menuitem"
                    onClick={() => runPlusAction(onOpenImageTool)}
                  >
                    <ImageIcon size={17} strokeWidth={2} aria-hidden="true" />
                    <span>
                      <strong>图片工具</strong>
                      <small>生成或处理图片</small>
                    </span>
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
                  <ScanText size={17} strokeWidth={2} aria-hidden="true" />
                  <span>
                    <strong>提取文字</strong>
                    <small>从图片提取文本再发送</small>
                  </span>
                </button>
                {onOpenCommandTool ? (
                  <button
                    type="button"
                    className="dd-snaplink__plus-item"
                    role="menuitem"
                    onClick={() => runPlusAction(onOpenCommandTool)}
                  >
                    <Command size={17} strokeWidth={2} aria-hidden="true" />
                    <span>
                      <strong>命令行</strong>
                      <small>运行命令并发送结果</small>
                    </span>
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
            placeholder={targetName ? `发送给 ${targetName} · 拖文件到这里也能发送` : '输入消息...'}
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
            🙂
          </button>
          {isEmojiPickerOpen ? (
            <div
              ref={emojiPickerRef}
              className="dd-snaplink__emoji-picker"
              role="dialog"
              aria-label="Emoji 选择器"
            >
              <div className="dd-snaplink__emoji-picker-head">
                <strong>表情</strong>
                <small>点击输入到发送框</small>
              </div>
              <div className="dd-snaplink__emoji-grid">
                {roomComposerQuickEmojis.map((emoji) => (
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
              <div className="dd-snaplink__emoji-actions">
                <button
                  type="button"
                  className="dd-snaplink__emoji-backspace"
                  aria-label="删除一个表情"
                  title="删除一个表情"
                  onClick={onEmojiBackspace}
                >
                  <Delete size={18} strokeWidth={2.2} aria-hidden="true" />
                </button>
                <button type="button" className="is-primary" disabled={isSendDisabled} onClick={onEmojiSend}>
                  发送
                </button>
              </div>
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
