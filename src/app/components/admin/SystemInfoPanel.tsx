import type { AdminHistoryStats, AdminUsageSnapshot } from '../../../lib/ddzhilian-types'
import { formatDateTime } from './constants'

export function SystemInfoPanel({
  historyStats,
  usage,
}: {
  historyStats: AdminHistoryStats | null
  usage: AdminUsageSnapshot | null
}) {
  return (
    <section className="dd-admin-side-card dd-admin-system-info-card">
      <div className="dd-admin-card__head">
        <div>
          <p>系统信息</p>
          <h3>System Info</h3>
        </div>
      </div>
      <dl className="dd-admin-info-list">
        <div>
          <dt>系统版本</dt>
          <dd>v2.3.1</dd>
        </div>
        <div>
          <dt>部署环境</dt>
          <dd>生产环境</dd>
        </div>
        <div>
          <dt>服务状态</dt>
          <dd>{usage?.cloudflareBudget ? '正常' : '待检查'}</dd>
        </div>
        <div>
          <dt>最后活动</dt>
          <dd>{formatDateTime(historyStats?.lastActivityAt)}</dd>
        </div>
      </dl>
    </section>
  )
}

