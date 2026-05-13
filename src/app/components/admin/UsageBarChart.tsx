import type { AdminModelUsage } from '../../../lib/ddzhilian-types'
import { formatInteger, USAGE_BAR_CHART_LIMIT } from './constants'

export function UsageBarChart({ items }: { items: AdminModelUsage[] }) {
  const topItems = [...items].sort((a, b) => b.totalCalls - a.totalCalls).slice(0, USAGE_BAR_CHART_LIMIT)
  const max = Math.max(...topItems.map((item) => item.totalCalls), 1)

  return (
    <section className="dd-admin-chart-card dd-admin-chart-card--bars">
      <div className="dd-admin-card__head">
        <div>
          <p>按模型调用量</p>
          <h3>TOP {USAGE_BAR_CHART_LIMIT}</h3>
        </div>
      </div>
      <div className="dd-admin-bar-list">
        {topItems.map((item) => (
          <div key={item.modelId} className="dd-admin-bar-row">
            <div className="dd-admin-bar-row__label">
              <strong>{item.modelLabel}</strong>
              <small>{item.modelId}</small>
            </div>
            <div className="dd-admin-bar-row__track">
              <span style={{ width: `${(item.totalCalls / max) * 100}%` }} />
            </div>
            <strong className="dd-admin-bar-row__value">{formatInteger(item.totalCalls)}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

