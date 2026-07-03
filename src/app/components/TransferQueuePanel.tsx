import type { ReactNode } from 'react'
import type { FileConversationEntry } from '../types'

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
  onShowAllTransfers?: () => void
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
  onShowAllTransfers,
}: TransferQueuePanelProps) {
  const visibleEntries = entries.filter((entry) => entry.tone !== 'completed')
  const desktopToggleLabel = isDesktopCollapsed ? '展开传输' : '收起传输'
  const hasIncomingNotice = Boolean(incomingNotice)

  if (visibleEntries.length === 0 && !hasIncomingNotice) {
    return null
  }

  return (
    <aside
      className={[
        'dd-snaplink__queue',
        isMobileOpen ? 'is-mobile-open' : '',
        isDesktopCollapsed ? 'is-desktop-collapsed' : '',
      ].filter(Boolean).join(' ')}
      aria-label="正在传输"
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
          <span>传输</span>
          {visibleEntries.length > 0 ? <em>{visibleEntries.length.toString()}</em> : null}
        </button>
      ) : null}
      <div className="dd-snaplink__queue-head">
        <span>
          <strong>正在传输</strong>
          <em>{visibleEntries.length.toString()}</em>
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
        {visibleEntries.length > 0 ? visibleEntries.map(renderTaskCard) : null}
      </div>
      {onShowAllTransfers ? (
        <button type="button" className="dd-snaplink__queue-all" onClick={onShowAllTransfers}>
          查看全部传输记录
        </button>
      ) : null}
    </aside>
  )
}
