import { buildPolyline } from './constants'
import type { TrendPoint } from './constants'

export function TrendChart({ series }: { series: TrendPoint[] }) {
  const calls = series.map((item) => item.calls)
  const success = series.map((item) => item.successRate * 100)
  const callPath = buildPolyline(calls, 760, 270, 24)
  const successPath = buildPolyline(success, 760, 270, 24)

  return (
    <section className="dd-admin-chart-card dd-admin-chart-card--trend">
      <div className="dd-admin-card__head">
        <div>
          <p>调用趋势</p>
          <h3>近 24 小时</h3>
        </div>
        <div className="dd-admin-card__legend">
          <span><i className="is-green" /> 调用量</span>
          <span><i className="is-blue" /> 成功率</span>
        </div>
      </div>
      <svg viewBox="0 0 760 270" className="dd-admin-trend-chart" role="img" aria-label="调用趋势图">
        {[0, 1, 2, 3].map((line) => {
          const y = 36 + line * 56
          return <line key={line} x1="24" y1={y} x2="736" y2={y} />
        })}
        <polyline points={callPath} className="calls-line" />
        <polyline points={successPath} className="success-line" />
        {series.map((point, index) => {
          const x = 24 + (index / Math.max(1, series.length - 1)) * (760 - 48)
          const callsMin = Math.min(...calls)
          const callsRange = Math.max(1, Math.max(...calls) - callsMin)
          const successMin = Math.min(...success)
          const successRange = Math.max(1, Math.max(...success) - successMin)
          const callsY = 270 - 24 - ((point.calls - callsMin) / callsRange) * (270 - 48)
          const successY = 270 - 24 - (((point.successRate * 100) - successMin) / successRange) * (270 - 48)
          return (
            <g key={point.hour}>
              <circle cx={x} cy={callsY} r="3.8" className="calls-dot" />
              <circle cx={x} cy={successY} r="3.6" className="success-dot" />
              {index % 3 === 0 ? <text x={x} y="258">{point.hour.slice(0, 2)}</text> : null}
            </g>
          )
        })}
      </svg>
    </section>
  )
}

