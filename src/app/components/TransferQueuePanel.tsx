import { useEffect, useRef, useState } from 'react'
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
  const [recentlyCompletedIds, setRecentlyCompletedIds] = useState<string[]>([])
  const prevEntryTonesRef = useRef<Map<string, string>>(new Map())
  const timersRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const prevTones = prevEntryTonesRef.current
    const currentTones = new Map<string, string>()

    entries.forEach((entry) => {
      currentTones.set(entry.id, entry.tone)
      const prevTone = prevTones.get(entry.id)
      if (entry.tone === 'completed' && prevTone && prevTone !== 'completed') {
        setRecentlyCompletedIds((current) => Array.from(new Set([...current, entry.id])))
        if (timersRef.current.has(entry.id)) {
          window.clearTimeout(timersRef.current.get(entry.id)!)
        }
        const timerId = window.setTimeout(() => {
          setRecentlyCompletedIds((current) => current.filter((id) => id !== entry.id))
          timersRef.current.delete(entry.id)
        }, 2500)
        timersRef.current.set(entry.id, timerId)
      }
    })

    prevEntryTonesRef.current = currentTones
  }, [entries])

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timerId) => window.clearTimeout(timerId))
      timersRef.current.clear()
    }
  }, [])

  const visibleEntries = entries.filter(
    (entry) => entry.tone !== 'completed' || recentlyCompletedIds.includes(entry.id),
  )
  const desktopToggleLabel = isDesktopCollapsed ? '展开传输' : '收起传输'
  const hasIncomingNotice = Boolean(incomingNotice)
  const hasTransferBadge = activeCount > 0

  if (visibleEntries.length === 0 && !hasIncomingNotice) {
    return null
  }

  return (
    <aside
      className={[
        'dd-snaplink__queue',
        isMobileOpen ? 'is-mobile-open' : '',
        isDesktopCollapsed ? 'is-desktop-collapsed' : '',
        hasTransferBadge ? 'has-transfer-badge' : '',
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
          {activeCount > 0 ? <em>{activeCount.toString()}</em> : null}
        </button>
      ) : null}
      <div className="dd-snaplink__queue-head">
        <span>
          <strong>{activeCount > 0 ? '正在传输' : '传输已完成'}</strong>
          {activeCount > 0 ? <em>{activeCount.toString()}</em> : null}
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
