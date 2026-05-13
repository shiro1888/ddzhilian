import type { AdminModelUsage } from '../../../lib/ddzhilian-types'
import { exportToCsv, formatInteger } from './constants'

export function UsageTable({ items }: { items: AdminModelUsage[] }) {
  const exportUsage = () => {
    exportToCsv('ddzhilian-usage.csv', items.map((item) => ({
      provider: item.provider,
      modelId: item.modelId,
      modelLabel: item.modelLabel,
      totalCalls: item.totalCalls,
      successCalls: item.successCalls,
      failedCalls: item.failedCalls,
      quotaRejectedCalls: item.quotaRejectedCalls,
      promptTokens: item.promptTokens || item.promptChars,
      completionTokens: item.completionTokens || item.responseChars,
    })))
  }

  return (
    <section className="dd-admin-table-card">
      <div className="dd-admin-card__head">
        <div>
          <p>使用统计</p>
          <h3>Usage Detail</h3>
        </div>
        <button type="button" className="dd-admin-link-button" disabled={items.length === 0} onClick={exportUsage}>
          导出 CSV
        </button>
      </div>
      <table className="dd-admin-usage-detail-table">
        <thead>
          <tr>
            <th>模型</th>
            <th>调用量</th>
            <th>成功</th>
            <th>失败</th>
            <th>Prompt Tokens</th>
            <th>Completion Tokens</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 6).map((item) => (
            <tr key={`${item.provider}:${item.modelId}`}>
              <td>{item.modelLabel}</td>
              <td>{formatInteger(item.totalCalls)}</td>
              <td>{formatInteger(item.successCalls)}</td>
              <td>{formatInteger(item.failedCalls + item.quotaRejectedCalls)}</td>
              <td>{formatInteger(item.promptTokens || item.promptChars)}</td>
              <td>{formatInteger(item.completionTokens || item.responseChars)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

