import type { FormEventHandler, KeyboardEventHandler, ReactNode } from 'react'
import { FileText, Send } from 'lucide-react'
import { EmptyState } from './EmptyState'
import { SendTargetSelector } from './SendTargetSelector'

type TextSendPageProps = {
  header: ReactNode
  targetSummary: ReactNode
  deviceTargets: ReactNode[]
  roomTargets?: ReactNode[]
  draft: string
  draftLength: number
  enterToSend: boolean
  isSendDisabled: boolean
  historyCount: number
  historyList: ReactNode
  onDraftChange: (value: string) => void
  onDraftKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onSubmit: FormEventHandler<HTMLFormElement>
}

export function TextSendPage({
  header,
  targetSummary,
  deviceTargets,
  roomTargets,
  draft,
  draftLength,
  enterToSend,
  isSendDisabled,
  historyCount,
  historyList,
  onDraftChange,
  onDraftKeyDown,
  onSubmit,
}: TextSendPageProps) {
  return (
    <section className="dd-snaplink__workbench-page is-text" aria-label="发送文本">
      {header}
      <div className="dd-snaplink__text-send-layout">
        <form className="dd-snaplink__text-send-card" onSubmit={onSubmit}>
          <SendTargetSelector
            targetSummary={targetSummary}
            deviceTargets={deviceTargets}
            roomTargets={roomTargets}
            variant="compact"
            emptyText="暂无附近设备，也可以先进入房间后发送文本。"
          />
          <label className="dd-snaplink__text-send-input">
            <span>文本内容</span>
            <textarea
              value={draft}
              placeholder="输入文本、链接或一段消息"
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={onDraftKeyDown}
            />
          </label>
          <div className="dd-snaplink__text-send-footer">
            <small>
              {draftLength.toString()} 字 · {enterToSend ? 'Enter 发送，Shift + Enter 换行' : 'Ctrl / Command + Enter 发送'}
            </small>
            <button type="submit" disabled={isSendDisabled}>
              <Send size={15} strokeWidth={2} aria-hidden="true" />
              发送文本
            </button>
          </div>
        </form>
        <aside className="dd-snaplink__text-history-panel" aria-label="文本历史">
          <div className="dd-snaplink__section-head">
            <span>
              <strong>文本历史</strong>
              <small>{historyCount > 0 ? '最近发送和接收的文本' : '还没有发送过文本'}</small>
            </span>
          </div>
          {historyCount > 0 ? (
            <div className="dd-snaplink__text-history-list">{historyList}</div>
          ) : (
            <EmptyState
              className="dd-snaplink__workbench-room-empty"
              icon={<FileText size={23} strokeWidth={1.8} aria-hidden="true" />}
              title="还没有文本记录"
              description={<span>发送文字或链接后，会在这里快速复制和复用。</span>}
            />
          )}
        </aside>
      </div>
    </section>
  )
}
