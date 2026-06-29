import type { ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'

export type ToolContextPanelRow = {
  label: string
  value: ReactNode
}

export type ToolContextPanelAction = {
  label: string
  action: () => void
  disabled?: boolean
  title?: string
}

type ToolContextPanelProps = {
  title: string
  note: ReactNode
  rows: ToolContextPanelRow[]
  actions: ToolContextPanelAction[]
  transferCount: number
  activeTransferCount: number
  completedTransferCount: number
  failedTransferCount: number
  incomingNotice?: ReactNode
  transferCards: ReactNode[]
}

export function ToolContextPanel({
  title,
  note,
  rows,
  actions,
  transferCount,
  activeTransferCount,
  completedTransferCount,
  failedTransferCount,
  incomingNotice,
  transferCards,
}: ToolContextPanelProps) {
  return (
    <aside className="dd-snaplink__tool-side" aria-label="工具上下文与传输队列">
      <section className="dd-snaplink__tool-side-section">
        <div className="dd-snaplink__tool-side-head">
          <strong>当前上下文</strong>
          <span>{title}</span>
        </div>
        <div className="dd-snaplink__tool-side-list">
          {rows.map((row) => (
            <div key={row.label} className="dd-snaplink__tool-side-row">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
        <p className="dd-snaplink__tool-side-note">{note}</p>
        <div className="dd-snaplink__tool-side-actions" aria-label={`${title}快捷联动`}>
          {actions.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              title={item.title}
              onClick={item.action}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="dd-snaplink__tool-side-section is-transfer">
        <div className="dd-snaplink__tool-side-head">
          <strong>传输队列</strong>
          <span>{transferCount.toString()}</span>
        </div>
        <div className="dd-snaplink__tool-side-summary">
          <span>{activeTransferCount.toString()} 进行中</span>
          <span>{completedTransferCount.toString()} 已完成</span>
          {failedTransferCount > 0 ? (
            <span className="is-danger">{failedTransferCount.toString()} 失败</span>
          ) : null}
        </div>
        {incomingNotice}
        <div className="dd-snaplink__tool-side-queue">
          {transferCards.length > 0 ? (
            transferCards
          ) : (
            <div className="dd-snaplink__queue-empty">
              <FolderOpen size={24} strokeWidth={1.8} aria-hidden="true" />
              <strong>还没有传输任务</strong>
              <span>从附近设备或房间发送文件后，会在这里持续显示状态。</span>
            </div>
          )}
        </div>
      </section>
    </aside>
  )
}
