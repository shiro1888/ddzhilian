import type { ChangeEvent, DragEvent } from 'react'
import type { UnifiedConversationEntry } from '../types'
import { formatChatDivider, formatFileSize, shouldInsertDivider } from '../utils'

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
                          <div className="pp-chatbox__bubble">
                            <p>{entry.text}</p>
                          </div>
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
          <div className="pp-chatbox__textarea-wrap">
            <textarea
              className="pp-chatbox__textarea"
              placeholder="输入消息，Ctrl/Cmd + Enter 发送。"
              value={chatDraft}
              onChange={(event) => onChatDraftChange(event.target.value)}
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
              <button type="button" aria-label="表情">
                ☺
              </button>
              <button type="button" aria-label="文件夹">
                ▣
              </button>
              <button type="button" aria-label="剪贴板">
                ✂
              </button>
              <button type="button" aria-label="语音">
                ◉
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

          <div className="pp-chatbox__toolbar pp-chatbox__toolbar--meta">
            <span className="pp-chatbox__meta-note">文件、消息、接收进度都在同一条对话里</span>
            <span className="pp-chatbox__meta-note">当前目标：{activeTransferLabel}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
