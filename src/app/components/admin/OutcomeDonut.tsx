import type { AdminModelUsage } from '../../../lib/ddzhilian-types'
import { formatInteger } from './constants'

export function OutcomeDonut({ items }: { items: AdminModelUsage[] }) {
  const success = items.reduce((sum, item) => sum + item.successCalls, 0)
  const failed = items.reduce((sum, item) => sum + item.failedCalls, 0)
  const quotaRejected = items.reduce((sum, item) => sum + item.quotaRejectedCalls, 0)
  const total = Math.max(1, success + failed + quotaRejected)
  const radius = 74
  const circumference = 2 * Math.PI * radius
  const successLength = (success / total) * circumference
  const failedLength = (failed / total) * circumference
  const rejectedLength = (quotaRejected / total) * circumference

  return (
    <section className="dd-admin-chart-card dd-admin-chart-card--donut">
      <div className="dd-admin-card__head">
        <div>
          <p>调用分布</p>
          <h3>按状态</h3>
        </div>
      </div>
      <div className="dd-admin-donut-wrap">
        <svg viewBox="0 0 220 220" className="dd-admin-donut-chart" role="img" aria-label="调用分布环图">
          <circle cx="110" cy="110" r={radius} className="track" />
          <circle cx="110" cy="110" r={radius} className="success" style={{ strokeDasharray: `${successLength} ${circumference - successLength}` }} />
          <circle
            cx="110"
            cy="110"
            r={radius}
            className="failed"
            style={{ strokeDasharray: `${failedLength} ${circumference - failedLength}`, strokeDashoffset: -successLength }}
          />
          <circle
            cx="110"
            cy="110"
            r={radius}
            className="rejected"
            style={{ strokeDasharray: `${rejectedLength} ${circumference - rejectedLength}`, strokeDashoffset: -(successLength + failedLength) }}
          />
          <text x="110" y="102">总计</text>
          <text x="110" y="126" className="value">{formatInteger(success + failed + quotaRejected)}</text>
        </svg>
        <div className="dd-admin-donut-legend">
          <span><i className="is-success" /> 成功 {formatInteger(success)}</span>
          <span><i className="is-failed" /> 失败 {formatInteger(failed)}</span>
          <span><i className="is-rejected" /> 拒绝 {formatInteger(quotaRejected)}</span>
        </div>
      </div>
    </section>
  )
}

