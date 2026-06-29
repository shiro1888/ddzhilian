import type { ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'
import type { FileConversationEntry } from '../types'
import { EmptyState } from './EmptyState'

type TransferQueuePanelProps = {
  entries: FileConversationEntry[]
  activeCount: number
  completedCount: number
  isMobileOpen: boolean
  incomingNotice?: ReactNode
  renderTaskCard: (file: FileConversationEntry) => ReactNode
  onToggleMobileOpen: () => void
}

export function TransferQueuePanel({
  entries,
  activeCount,
  completedCount,
  isMobileOpen,
  incomingNotice,
  renderTaskCard,
  onToggleMobileOpen,
}: TransferQueuePanelProps) {
  return (
    <aside
      className={`dd-snaplink__queue${isMobileOpen ? ' is-mobile-open' : ''}`}
      aria-label="传输队列"
    >
      <div className="dd-snaplink__queue-head">
        <span>
          <strong>传输队列</strong>
          <em>{entries.length.toString()}</em>
        </span>
        <small>{activeCount.toString()} 进行中 · {completedCount.toString()} 已完成</small>
        <button
          type="button"
          className="dd-snaplink__queue-toggle"
          aria-expanded={isMobileOpen}
          onClick={onToggleMobileOpen}
        >
          {isMobileOpen ? '收起' : '展开'}
        </button>
      </div>
      {incomingNotice}
      <div className="dd-snaplink__queue-list">
        {entries.length > 0 ? (
          entries.map(renderTaskCard)
        ) : (
          <EmptyState
            className="dd-snaplink__queue-empty"
            icon={<FolderOpen size={24} strokeWidth={1.8} aria-hidden="true" />}
            title="还没有传输任务"
            description={<span>选择一个设备并发送文件，任务会出现在这里。</span>}
          />
        )}
      </div>
    </aside>
  )
}
