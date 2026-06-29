import type { ReactNode } from 'react'
import { CheckCircle2, Clock3, FolderOpen, Send, XCircle } from 'lucide-react'
import type { FileConversationEntry } from '../types'
import { EmptyState } from './EmptyState'

export type TransferQueuePageSection = {
  id: string
  label: string
  entries: FileConversationEntry[]
}

type TransferQueuePageProps = {
  sections: TransferQueuePageSection[]
  totalCount: number
  activeCount: number
  completedCount: number
  failedCount: number
  incomingNotice?: ReactNode
  renderTaskCard: (file: FileConversationEntry) => ReactNode
  onShowNearby: () => void
  onShowFiles: () => void
}

export function TransferQueuePage({
  sections,
  totalCount,
  activeCount,
  completedCount,
  failedCount,
  incomingNotice,
  renderTaskCard,
  onShowNearby,
  onShowFiles,
}: TransferQueuePageProps) {
  return (
    <section className="dd-snaplink__workbench-transfer-board dd-snaplink__workbench-page is-transfers" aria-label="传输队列">
      <div className="dd-snaplink__section-head">
        <span>
          <strong>传输队列</strong>
          <small>
            {activeCount.toString()} 进行中 · {completedCount.toString()} 已完成 · {failedCount.toString()} 失败
          </small>
        </span>
      </div>
      <div className="dd-snaplink__transfer-status-guide" aria-label="传输状态说明">
        <span>
          <Clock3 size={15} strokeWidth={1.9} aria-hidden="true" />
          <strong>建立/确认</strong>
          <small>连接和确认阶段保持 0%</small>
        </span>
        <span>
          <Send size={15} strokeWidth={1.9} aria-hidden="true" />
          <strong>正在发送</strong>
          <small>按对方确认字节显示</small>
        </span>
        <span>
          <CheckCircle2 size={15} strokeWidth={1.9} aria-hidden="true" />
          <strong>发送成功</strong>
          <small>收到完成确认后为 100%</small>
        </span>
        <span>
          <XCircle size={15} strokeWidth={1.9} aria-hidden="true" />
          <strong>失败可重试</strong>
          <small>保留失败前进度</small>
        </span>
      </div>
      {incomingNotice}
      {totalCount > 0 ? (
        <div className="dd-snaplink__transfer-groups">
          {sections.map((section) => (
            <section key={section.id} className="dd-snaplink__transfer-group" aria-label={section.label}>
              <div className="dd-snaplink__transfer-group-head">
                <strong>{section.label}</strong>
                <span>{section.entries.length.toString()}</span>
              </div>
              {section.entries.length > 0 ? (
                <div className="dd-snaplink__workbench-transfer-list">
                  {section.entries.map(renderTaskCard)}
                </div>
              ) : (
                <div className="dd-snaplink__transfer-group-empty">暂无{section.label}任务</div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          className="dd-snaplink__workbench-room-empty is-transfer-empty"
          icon={<FolderOpen size={24} strokeWidth={1.8} aria-hidden="true" />}
          title="还没有传输任务"
          description={<span>选择一个设备并发送文件，任务会出现在这里。</span>}
          actions={(
            <div className="dd-snaplink__transfer-empty-actions">
              <button type="button" onClick={onShowNearby}>
                选择附近设备
              </button>
              <button type="button" onClick={onShowFiles}>
                发送文件
              </button>
            </div>
          )}
        />
      )}
    </section>
  )
}
