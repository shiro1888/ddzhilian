import type { TextRecord } from '../../lib/ddzhilian-types'
import type { TextMode } from '../types'
import { formatChatDivider, formatRelativeTime, sanitizeRichTextHtml, shouldInsertDivider } from '../utils'

type TextStageProps = {
  textMode: TextMode
  draftText: string
  chatDraft: string
  activeTransferLabel: string
  connectedTargetCount: number
  sortedChatRecords: TextRecord[]
  textRecords: TextRecord[]
  onTextModeChange: (mode: TextMode) => void
  onDraftTextChange: (value: string) => void
  onChatDraftChange: (value: string) => void
  onSendText: () => void
}

export function TextStage({
  textMode,
  draftText,
  chatDraft,
  activeTransferLabel,
  connectedTargetCount,
  sortedChatRecords,
  textRecords,
  onTextModeChange,
  onDraftTextChange,
  onChatDraftChange,
  onSendText,
}: TextStageProps) {
  return (
    <section className="dd-view dd-view--single dd-view--text">
      <div className="dd-text-topbar">
        <div className="dd-text-mode">
          <button type="button" className={textMode === 'long' ? 'is-active' : ''} onClick={() => onTextModeChange('long')}>
            长文模式
          </button>
          <button type="button" className={textMode === 'chat' ? 'is-active' : ''} onClick={() => onTextModeChange('chat')}>
            对话模式
          </button>
        </div>
      </div>

      {textMode === 'long' ? (
        <div className="dd-text-editor">
          <textarea
            value={draftText}
            onChange={(event) => onDraftTextChange(event.target.value)}
            placeholder="在这里输入要发送到另一台设备的长文本。"
          />

          <div className="dd-text-editor__toolbar">
            <div className="dd-text-tools">
              <button type="button">📋</button>
              <button type="button">A</button>
              <button type="button">&lt;&gt;</button>
              <button type="button">≡</button>
              <button type="button">↶</button>
              <button type="button">↷</button>
            </div>

            <div className="dd-text-send">
              <span>当前目标：{activeTransferLabel}</span>
              <button
                type="button"
                className="dd-button dd-button--primary"
                onClick={onSendText}
                disabled={draftText.trim().length === 0 || connectedTargetCount === 0}
              >
                发送
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="dd-chatbox">
          <div className="dd-chatbox__thread">
            {sortedChatRecords.length > 0 ? (
              sortedChatRecords.map((record, index) => {
                const previousIso = index > 0 ? sortedChatRecords[index - 1].createdAt : null
                const showDivider = shouldInsertDivider(previousIso, record.createdAt)

                return (
                  <div key={record.id} className="dd-chatbox__entry">
                    {showDivider && (
                      <div className="dd-chatbox__divider">
                        <span>{formatChatDivider(record.createdAt)}</span>
                      </div>
                    )}

                    <div className={`dd-chatbox__message${record.fromSelf ? ' is-self' : ' is-peer'}`}>
                      {!record.fromSelf && <div className="dd-chatbox__avatar">TA</div>}

                      <div
                        className="dd-chatbox__bubble dd-chatbox__bubble--rich"
                        dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(record.text) }}
                      />

                      {record.fromSelf && <div className="dd-chatbox__avatar is-self">我</div>}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="dd-chatbox__empty">当前暂无内容</div>
            )}
          </div>

          <div className="dd-chatbox__composer">
            <div className="dd-chatbox__toolbar">
              <button type="button" aria-label="表情">
                ☺
              </button>
              <button type="button" aria-label="文件">
                □
              </button>
              <button type="button" aria-label="目录">
                ▣
              </button>
              <button type="button" aria-label="剪贴板">
                ✂
              </button>
              <button type="button" aria-label="语音">
                ◉
              </button>
            </div>

            <div className="dd-chatbox__input-row">
              <input
                type="text"
                placeholder="输入消息"
                value={chatDraft}
                onChange={(event) => onChatDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    onSendText()
                  }
                }}
              />
              <button
                type="button"
                className="dd-button dd-button--primary"
                onClick={onSendText}
                disabled={chatDraft.trim().length === 0 || connectedTargetCount === 0}
              >
                发送
              </button>
            </div>

            <p className="dd-inline-note">当前目标：{activeTransferLabel}</p>
          </div>
        </div>
      )}

      {textMode === 'long' && (
        <div className="dd-section-block">
          <div className="dd-section-block__head">
            <h3>消息记录</h3>
          </div>

          {textRecords.length > 0 ? (
            <ul className="dd-record-list">
              {[...textRecords]
                .reverse()
                .slice(0, 12)
                .map((record) => (
                  <li key={record.id}>
                    <strong>{record.fromSelf ? '我' : '对方'}</strong>
                    <span>{record.text}</span>
                    <small>{formatRelativeTime(record.createdAt)}</small>
                  </li>
                ))}
            </ul>
          ) : (
            <div className="dd-empty">当前暂无内容</div>
          )}
        </div>
      )}
    </section>
  )
}
