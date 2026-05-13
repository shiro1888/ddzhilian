import type { AdminHistoryStats } from '../../../lib/ddzhilian-types'
import { formatDateTime } from './constants'

export function DangerZonePanel({
  historyStats,
  onClearHistory,
  isClearingHistory,
}: {
  historyStats: AdminHistoryStats | null
  onClearHistory: () => void
  isClearingHistory: boolean
}) {
  return (
    <section className="dd-admin-side-card dd-admin-side-card--danger">
      <div className="dd-admin-card__head">
        <div>
          <p>危险操作</p>
          <h3>Danger Zone</h3>
        </div>
      </div>
      <div className="dd-admin-danger-box">
        <strong>清空全部历史记录</strong>
        <span>该操作会永久删除所有对话记录、调用日志与历史文件，无法恢复。</span>
        <small>最近活动：{formatDateTime(historyStats?.lastActivityAt)}</small>
        <button type="button" className="dd-button dd-button--danger" onClick={onClearHistory}>
          {isClearingHistory ? '正在清空...' : '清空所有历史记录'}
        </button>
      </div>
    </section>
  )
}

