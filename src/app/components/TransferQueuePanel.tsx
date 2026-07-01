import type { ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'
import type { FileConversationEntry } from '../types'
import { EmptyState } from './EmptyState'

type TransferQueuePanelProps = {
  entries: FileConversationEntry[]
  activeCount: number
  completedCount: number
  isMobileOpen: boolean
  isDesktopCollapsed?: boolean
  incomingNotice?: ReactNode
  renderTaskCard: (file: FileConversationEntry) => ReactNode
  onToggleMobileOpen: () => void
  onToggleDesktopCollapsed?: () => void
}

export function TransferQueuePanel({
  entries,
  activeCount,
  completedCount,
  isMobileOpen,
  isDesktopCollapsed = false,
  incomingNotice,
  renderTaskCard,
  onToggleMobileOpen,
  onToggleDesktopCollapsed,
}: TransferQueuePanelProps) {
  const desktopToggleLabel = isDesktopCollapsed ? '展开传输队列' : '收起传输队列'

  return (
    <aside
      className={[
        'dd-snaplink__queue',
        isMobileOpen ? 'is-mobile-open' : '',
        isDesktopCollapsed ? 'is-desktop-collapsed' : '',
      ].filter(Boolean).join(' ')}
      aria-label="传输队列"
    >
      {onToggleDesktopCollapsed ? (
        <button
          type="button"
          className="dd-snaplink__queue-collapsed-rail"
          aria-expanded={!isDesktopCollapsed}
          aria-label={desktopToggleLabel}
          title={desktopToggleLabel}
          onClick={onToggleDesktopCollapsed}
        >
          <span>传输队列</span>
          <em>{entries.length.toString()}</em>
        </button>
      ) : null}
      <div className="dd-snaplink__queue-head">
        <span>
          <strong>传输队列</strong>
          <em>{entries.length.toString()}</em>
        </span>
        <small>{activeCount.toString()} 进行中 · {completedCount.toString()} 已完成</small>
        {onToggleDesktopCollapsed ? (
          <button
            type="button"
            className="dd-snaplink__queue-desktop-toggle"
            aria-expanded={!isDesktopCollapsed}
            onClick={onToggleDesktopCollapsed}
          >
            收起
          </button>
        ) : null}
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
