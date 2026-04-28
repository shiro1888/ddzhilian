import { useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AdminAiSettings,
  AdminCloudflareConfig,
  AdminHistoryStats,
  AdminModelToggleItem,
  AdminModelUsage,
  AdminOpenRouterConfig,
  AdminUsageTrendBucket,
  AdminUsageSnapshot,
} from '../../lib/ddzhilian-types'

type AdminStageProps = {
  adminPasswordDraft: string
  isAdminAuthenticated: boolean
  isAdminLoading: boolean
  isAdminLoginTransitioning: boolean
  isAdminSaving: boolean
  isAdminClearingHistory: boolean
  adminError: string | null
  historyStats: AdminHistoryStats | null
  aiSettings: AdminAiSettings | null
  usage: AdminUsageSnapshot | null
  onAdminPasswordDraftChange: (value: string) => void
  onConnect: () => void
  onDisconnect: () => void
  onProviderChange: (provider: AdminAiSettings['provider']) => void
  onSystemPromptChange: (value: string) => void
  onCloudflareFieldChange: <Field extends keyof AdminCloudflareConfig>(
    field: Field,
    value: AdminCloudflareConfig[Field],
  ) => void
  onOpenRouterFieldChange: <Field extends keyof AdminOpenRouterConfig>(
    field: Field,
    value: AdminOpenRouterConfig[Field],
  ) => void
  onSave: () => void
  onClearHistory: () => void
}

const ADMIN_BRAND_NAME = 'ddzhilian管理系统'
const MODEL_PREVIEW_LIMIT = 5
const USAGE_BAR_CHART_LIMIT = 3
const OPENAI_COMPATIBLE_PROVIDER_LABEL = 'OpenAI 兼容接口'
const OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER = 'https://api.openai.com/v1'

type AdminSection = 'dashboard' | 'models' | 'providers'

type ManualOpenAiApiDraft = {
  label: string
  baseUrl: string
  wireApi: AdminOpenRouterConfig['wireApi']
  apiKey: string
  modelId: string
}

type AdminNavIconName =
  | 'audit'
  | 'config'
  | 'dashboard'
  | 'detail'
  | 'history'
  | 'limit'
  | 'log'
  | 'model'
  | 'provider'
  | 'role'
  | 'settings'
  | 'usage'
  | 'user'
  | 'logout'

const DASHBOARD_MODULES = [
  { key: 'kpis', label: '真实指标', description: '房间、历史、调用量、错误率' },
  { key: 'businessKpis', label: '业务口径', description: '收入、活跃用户等业务视图，可单独关闭' },
  { key: 'charts', label: '可视化图表', description: '趋势、模型排行、状态分布' },
  { key: 'config', label: '供应商配置', description: '模型供应商与接入配置' },
  { key: 'usage', label: '调用明细', description: '模型调用量与错误统计' },
  { key: 'models', label: '模型开关', description: '默认模型与启用状态' },
  { key: 'operations', label: '运维操作', description: '余额、历史与危险操作' },
] as const

type DashboardModuleKey = (typeof DASHBOARD_MODULES)[number]['key']

function createDefaultDashboardModules(): Record<DashboardModuleKey, boolean> {
  return Object.fromEntries(DASHBOARD_MODULES.map((module) => [module.key, true])) as Record<DashboardModuleKey, boolean>
}

type KpiCard = {
  label: string
  value: string
  detail: string
  tone: 'green' | 'blue' | 'violet' | 'orange'
}

type TrendPoint = {
  hour: string
  calls: number
  successRate: number
}

function AdminSidebarBrand() {
  return (
    <div className="dd-admin-sidebar__brand">
      <img className="dd-admin-sidebar__logo" src="/logo-dd-link.png" alt="" />
      <strong>{ADMIN_BRAND_NAME}</strong>
    </div>
  )
}

function AdminNavIcon({ name }: { name: AdminNavIconName }) {
  const icons: Record<AdminNavIconName, ReactNode> = {
    audit: <path d="M7 5h10M7 9h10M7 13h6M5 19l3-3 2 2 5-6 4 5" />,
    config: <path d="M5 7h14M8 7v10M16 7v10M5 17h14" />,
    dashboard: <path d="M4 12a8 8 0 1 1 16 0M12 12l4-4M7 17h10" />,
    detail: <path d="M6 5h12M6 10h12M6 15h8M6 19h5" />,
    history: <path d="M12 7v5l3 2M5 12a7 7 0 1 0 2-5.02M5 4v4h4" />,
    limit: <path d="M12 3l8 4v5c0 5-3.4 7.7-8 9-4.6-1.3-8-4-8-9V7l8-4ZM9 12h6" />,
    log: <path d="M7 4h8l3 3v13H7V4ZM14 4v4h4M9 12h6M9 16h6" />,
    logout: <path d="M10 5H6v14h4M14 8l4 4-4 4M8 12h10" />,
    model: <path d="M12 4l7 4v8l-7 4-7-4V8l7-4ZM5 8l7 4 7-4M12 12v8" />,
    provider: <path d="M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.5 7l2.2 9M15.5 7l-2.2 9" />,
    role: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0M16 13l2 2 3-4" />,
    settings: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4" />,
    usage: <path d="M5 19V5M5 19h14M9 16V9M13 16V6M17 16v-4" />,
    user: <path d="M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 21a7 7 0 0 1 14 0M17 8v6M14 11h6" />,
  }

  return (
    <svg className="dd-admin-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {icons[name]}
    </svg>
  )
}

function formatDateTime(value?: string) {
  if (!value) {
    return '无'
  }

  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return value
  }

  return new Date(parsed).toLocaleString('zh-CN', { hour12: false })
}

function formatInteger(value: number) {
  return value.toLocaleString('zh-CN')
}

function formatCurrency(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '无'
  }

  return `¥ ${value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatBytes(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '无'
  }

  if (value < 1024) {
    return `${value} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

function formatPercent(value: number, digits = 2) {
  return `${value.toFixed(digits)}%`
}

function buildTrendSeries(buckets: AdminUsageTrendBucket[]): TrendPoint[] {
  return buckets.map((bucket) => {
    const total = bucket.totalCalls
    const successRate = total > 0 ? bucket.successCalls / total : 0
    const parsed = Date.parse(bucket.bucketStartAt)
    const date = Number.isFinite(parsed) ? new Date(parsed) : null

    return {
      hour: date ? date.getHours().toString().padStart(2, '0') : '--',
      calls: total,
      successRate,
    }
  })
}

function buildKpiCards(historyStats: AdminHistoryStats | null, activeUsage: AdminModelUsage[], trendSeries: TrendPoint[]): KpiCard[] {
  const totalCalls = activeUsage.reduce((sum, item) => sum + item.totalCalls, 0)
  const totalPromptTokens = activeUsage.reduce((sum, item) => sum + item.promptTokens, 0)
  const totalCompletionTokens = activeUsage.reduce((sum, item) => sum + item.completionTokens, 0)
  const totalFailures = activeUsage.reduce((sum, item) => sum + item.failedCalls + item.quotaRejectedCalls, 0)
  const hourlyCalls = trendSeries.reduce((sum, point) => sum + point.calls, 0)
  const errorRate = totalCalls > 0 ? (totalFailures / totalCalls) * 100 : 0

  return [
    {
      label: '活跃房间',
      value: formatInteger(historyStats?.roomCount ?? 0),
      detail: `最近活跃：${formatDateTime(historyStats?.lastActivityAt)}`,
      tone: 'green',
    },
    {
      label: '历史文本',
      value: formatInteger(historyStats?.textCount ?? 0),
      detail: `历史文件 ${formatInteger(historyStats?.fileCount ?? 0)} 条`,
      tone: 'blue',
    },
    {
      label: 'API 调用量',
      value: formatInteger(totalCalls),
      detail: `近 24 小时 ${formatInteger(hourlyCalls)} 次`,
      tone: 'violet',
    },
    {
      label: '错误率',
      value: formatPercent(errorRate),
      detail:
        totalPromptTokens > 0 || totalCompletionTokens > 0
          ? `Tokens ${formatInteger(totalPromptTokens)} / ${formatInteger(totalCompletionTokens)}`
          : `历史体积 ${formatBytes(historyStats?.totalBytes ?? 0)}`,
      tone: 'orange',
    },
  ]
}

function buildBusinessKpiCards(historyStats: AdminHistoryStats | null, activeUsage: AdminModelUsage[]): KpiCard[] {
  const totalCalls = activeUsage.reduce((sum, item) => sum + item.totalCalls, 0)
  const totalPromptTokens = activeUsage.reduce((sum, item) => sum + item.promptTokens, 0)
  const totalCompletionTokens = activeUsage.reduce((sum, item) => sum + item.completionTokens, 0)
  const activeUserCount = historyStats?.activeUserCount
  const estimatedRevenue = totalCompletionTokens > 0
    ? totalCompletionTokens * 0.0012
    : totalPromptTokens > 0
      ? totalPromptTokens * 0.0008
      : totalCalls * 0.74
  const estimatedActiveUsers = activeUserCount ?? Math.max(historyStats?.roomCount ?? 0, historyStats?.textCount ?? 0, totalCalls > 0 ? 1 : 0)

  return [
    {
      label: '总收入（业务口径）',
      value: formatCurrency(estimatedRevenue),
      detail: totalCompletionTokens > 0 ? '按历史输出 Token 估算' : '当前为本地业务估算口径',
      tone: 'green',
    },
    {
      label: '活跃用户（业务口径）',
      value: formatInteger(estimatedActiveUsers),
      detail: activeUserCount === undefined ? '按当前活跃房间与文本交互折算' : '按历史用户名去重计算',
      tone: 'blue',
    },
  ]
}

function buildPolyline(values: number[], width: number, height: number, padding: number) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)

  return values
    .map((value, index) => {
      const x = padding + (index / Math.max(1, values.length - 1)) * (width - padding * 2)
      const y = height - padding - ((value - min) / range) * (height - padding * 2)
      return `${x},${y}`
    })
    .join(' ')
}

function labelFromOpenAiModelId(modelId: string) {
  return modelId.split('/').pop() || modelId
}

function normalizeOpenAiCompatibleBaseUrl(value: string) {
  return value
    .trim()
    .replace(/\/+$/g, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/+$/g, '')
}

function isHttpBaseUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function upsertOpenAiCompatibleModel(
  models: AdminModelToggleItem[],
  modelId: string,
  label: string,
) {
  const next = new Map(models.map((model) => [model.id, model]))
  const previous = next.get(modelId)

  next.set(modelId, {
    id: modelId,
    label: label || previous?.label || labelFromOpenAiModelId(modelId),
    enabled: true,
  })

  return [...next.values()]
}

function describeProviderStatus(settings: AdminAiSettings) {
  return [
    {
      name: 'Cloudflare AI',
      state: settings.cloudflare.accountId && settings.cloudflare.apiToken ? '健康' : '待配置',
      modelCount: settings.cloudflare.models.filter((model) => model.enabled).length,
      enabled: settings.provider === 'cloudflare',
    },
    {
      name: OPENAI_COMPATIBLE_PROVIDER_LABEL,
      state: settings.openrouter.apiKey ? '健康' : '待配置',
      modelCount: settings.openrouter.models.filter((model) => model.enabled).length,
      enabled: settings.provider === 'openrouter',
    },
  ]
}

function KpiCards({ cards }: { cards: KpiCard[] }) {
  return (
    <section className="dd-admin-kpis">
      {cards.map((card) => (
        <article key={card.label} className={`dd-admin-kpi-card is-${card.tone}`}>
          <div className="dd-admin-kpi-card__icon" aria-hidden="true" />
          <div className="dd-admin-kpi-card__content">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </div>
        </article>
      ))}
    </section>
  )
}

function TrendChart({ series }: { series: TrendPoint[] }) {
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

function UsageBarChart({ items }: { items: AdminModelUsage[] }) {
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

function OutcomeDonut({ items }: { items: AdminModelUsage[] }) {
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

function ModelSwitchList({
  models,
  defaultModel,
  onToggle,
  onSetDefault,
  onOpenCatalog,
}: {
  models: AdminModelToggleItem[]
  defaultModel: string
  onToggle: (id: string, enabled: boolean) => void
  onSetDefault: (id: string) => void
  onOpenCatalog: () => void
}) {
  const hasHiddenModels = models.length > MODEL_PREVIEW_LIMIT

  return (
    <section className="dd-admin-side-card">
      <div className="dd-admin-card__head">
        <div>
          <p>模型列表</p>
          <h3>全部模型</h3>
        </div>
        <button type="button" className="dd-admin-link-button" onClick={onOpenCatalog}>全部模型</button>
      </div>
      <div className={`dd-admin-model-side-list${hasHiddenModels ? ' has-hidden-models' : ''}`}>
        {models.map((model) => (
          <div key={model.id} className="dd-admin-model-side-item">
            <div className="dd-admin-model-side-item__meta">
              <strong>{model.label}</strong>
              <small>{model.id}</small>
            </div>
            <div className="dd-admin-model-side-item__actions">
              <label className="dd-admin-inline-radio">
                <input type="radio" name="default-model-side" checked={defaultModel === model.id} onChange={() => onSetDefault(model.id)} />
              </label>
              <label className="dd-admin-inline-switch">
                <input type="checkbox" checked={model.enabled} onChange={(event) => onToggle(model.id, event.target.checked)} />
                <span />
              </label>
            </div>
          </div>
        ))}
      </div>
      {hasHiddenModels ? (
        <p className="dd-admin-model-side-hint">已显示 {MODEL_PREVIEW_LIMIT} / {models.length}，点击全部模型查看完整列表</p>
      ) : null}
    </section>
  )
}

function ModelCatalog({
  models,
  defaultModel,
  onToggle,
  onSetDefault,
  action,
}: {
  models: AdminModelToggleItem[]
  defaultModel: string
  onToggle: (id: string, enabled: boolean) => void
  onSetDefault: (id: string) => void
  action?: {
    label: string
    onClick: () => void
  }
}) {
  return (
    <section className="dd-admin-model-catalog" id="admin-model-catalog" aria-label="全部模型">
      <div className="dd-admin-card__head">
        <div>
          <p>模型模块</p>
          <h3>全部模型</h3>
          <span>{models.length} 个模型，可直接切换默认项与启用状态</span>
        </div>
        {action ? (
          <button type="button" className="dd-admin-link-button" onClick={action.onClick}>{action.label}</button>
        ) : null}
      </div>
      <div className="dd-admin-model-catalog__masonry">
        {models.map((model) => (
          <article key={model.id} className="dd-admin-model-catalog-card">
            <div className="dd-admin-model-catalog-card__copy">
              <strong>{model.label}</strong>
              <small>{model.id}</small>
            </div>
            <div className="dd-admin-model-catalog-card__actions">
              <label className="dd-admin-model-catalog-card__radio">
                <span>默认</span>
                <input type="radio" name="default-model-catalog" checked={defaultModel === model.id} onChange={() => onSetDefault(model.id)} />
              </label>
              <label className="dd-admin-model-catalog-card__switch">
                <span>{model.enabled ? '启用' : '关闭'}</span>
                <span className="dd-admin-inline-switch">
                  <input type="checkbox" checked={model.enabled} onChange={(event) => onToggle(model.id, event.target.checked)} />
                  <span />
                </span>
              </label>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ProviderTable({
  settings,
  activeProvider,
  action,
}: {
  settings: AdminAiSettings
  activeProvider: AdminAiSettings['provider']
  action?: {
    label: string
    onClick: () => void
  }
}) {
  const providers = describeProviderStatus(settings)

  return (
    <section className="dd-admin-table-card">
      <div className="dd-admin-card__head">
        <div>
          <p>模型供应商</p>
          <h3>Provider Health</h3>
        </div>
        {action ? (
          <button type="button" className="dd-admin-link-button" onClick={action.onClick}>{action.label}</button>
        ) : null}
      </div>
      <table className="dd-admin-provider-table">
        <thead>
          <tr>
            <th>供应商</th>
            <th>状态</th>
            <th>可用模型</th>
            <th>当前接管</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((provider) => (
            <tr key={provider.name}>
              <td>{provider.name}</td>
              <td><span className={`dd-admin-status-dot ${provider.state === '健康' ? 'is-green' : 'is-amber'}`}>{provider.state}</span></td>
              <td>{provider.modelCount}</td>
              <td>{provider.enabled ? (activeProvider === 'openrouter' ? OPENAI_COMPATIBLE_PROVIDER_LABEL : 'Cloudflare') : '待切换'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function ConfigPanel({
  settings,
  onSystemPromptChange,
  onCloudflareFieldChange,
  onOpenRouterFieldChange,
  onProviderChange,
  onSave,
  isSaving,
}: {
  settings: AdminAiSettings
  onSystemPromptChange: (value: string) => void
  onCloudflareFieldChange: <Field extends keyof AdminCloudflareConfig>(field: Field, value: AdminCloudflareConfig[Field]) => void
  onOpenRouterFieldChange: <Field extends keyof AdminOpenRouterConfig>(field: Field, value: AdminOpenRouterConfig[Field]) => void
  onProviderChange: (provider: AdminAiSettings['provider']) => void
  onSave: () => void
  isSaving: boolean
}) {
  const isOpenRouter = settings.provider === 'openrouter'

  return (
    <section className="dd-admin-config-card">
      <div className="dd-admin-card__head">
        <div>
          <p>配置中心</p>
          <h3>{isOpenRouter ? OPENAI_COMPATIBLE_PROVIDER_LABEL : 'Cloudflare AI'}</h3>
        </div>
        <div className="dd-admin-provider-tabs">
          <button type="button" className={!isOpenRouter ? 'is-active' : ''} onClick={() => onProviderChange('cloudflare')}>
            Cloudflare
          </button>
          <button type="button" className={isOpenRouter ? 'is-active' : ''} onClick={() => onProviderChange('openrouter')}>
            OpenAI 兼容
          </button>
        </div>
      </div>
      <div className="dd-admin-config-form dd-admin-config-form--system">
        <label className="dd-admin-config-field dd-admin-config-field--wide">
          <span>System Prompt</span>
          <textarea
            rows={7}
            maxLength={20_000}
            value={settings.systemPrompt ?? ''}
            placeholder="设置模型调用时注入的系统提示词；留空则不发送 system message。"
            onChange={(event) => onSystemPromptChange(event.target.value)}
          />
        </label>
      </div>
      {!isOpenRouter ? (
        <div className="dd-admin-config-form">
          <label className="dd-admin-config-field">
            <span>Account ID</span>
            <input type="text" value={settings.cloudflare.accountId} onChange={(event) => onCloudflareFieldChange('accountId', event.target.value)} />
          </label>
          <label className="dd-admin-config-field">
            <span>API Token</span>
            <input type="password" value={settings.cloudflare.apiToken} onChange={(event) => onCloudflareFieldChange('apiToken', event.target.value)} />
          </label>
          <label className="dd-admin-config-field dd-admin-config-field--wide">
            <span>默认模型</span>
            <input type="text" value={settings.cloudflare.model} onChange={(event) => onCloudflareFieldChange('model', event.target.value)} />
          </label>
          <label className="dd-admin-config-field">
            <span>免费额度保护</span>
            <select value={settings.cloudflare.freeOnly ? 'true' : 'false'} onChange={(event) => onCloudflareFieldChange('freeOnly', event.target.value === 'true')}>
              <option value="true">启用</option>
              <option value="false">关闭</option>
            </select>
          </label>
          <label className="dd-admin-config-field">
            <span>每日预算</span>
            <input type="number" min="0" value={settings.cloudflare.dailyNeuronBudget} onChange={(event) => onCloudflareFieldChange('dailyNeuronBudget', Number(event.target.value) || 0)} />
          </label>
          <label className="dd-admin-config-field">
            <span>最大 Prompt 字符</span>
            <input type="number" min="1" value={settings.cloudflare.maxPromptChars} onChange={(event) => onCloudflareFieldChange('maxPromptChars', Number(event.target.value) || 1)} />
          </label>
          <label className="dd-admin-config-field">
            <span>最大输出 Token</span>
            <input type="number" min="1" value={settings.cloudflare.maxOutputTokens} onChange={(event) => onCloudflareFieldChange('maxOutputTokens', Number(event.target.value) || 1)} />
          </label>
        </div>
      ) : (
        <div className="dd-admin-config-form">
          <label className="dd-admin-config-field">
            <span>API Key</span>
            <input type="password" value={settings.openrouter.apiKey} onChange={(event) => onOpenRouterFieldChange('apiKey', event.target.value)} />
          </label>
          <label className="dd-admin-config-field">
            <span>Base URL</span>
            <input type="text" value={settings.openrouter.baseUrl} onChange={(event) => onOpenRouterFieldChange('baseUrl', event.target.value)} />
          </label>
          <label className="dd-admin-config-field">
            <span>接口类型</span>
            <select value={settings.openrouter.wireApi} onChange={(event) => onOpenRouterFieldChange('wireApi', event.target.value as AdminOpenRouterConfig['wireApi'])}>
              <option value="chat_completions">Chat Completions</option>
              <option value="responses">Responses</option>
            </select>
          </label>
          <label className="dd-admin-config-field">
            <span>站点 URL</span>
            <input type="text" value={settings.openrouter.siteUrl} onChange={(event) => onOpenRouterFieldChange('siteUrl', event.target.value)} />
          </label>
          <label className="dd-admin-config-field">
            <span>站点名称</span>
            <input type="text" value={settings.openrouter.siteName} onChange={(event) => onOpenRouterFieldChange('siteName', event.target.value)} />
          </label>
          <label className="dd-admin-config-field dd-admin-config-field--wide">
            <span>默认模型</span>
            <input type="text" value={settings.openrouter.model} onChange={(event) => onOpenRouterFieldChange('model', event.target.value)} />
          </label>
          <label className="dd-admin-config-field">
            <span>最大 Prompt 字符</span>
            <input type="number" min="1" value={settings.openrouter.maxPromptChars} onChange={(event) => onOpenRouterFieldChange('maxPromptChars', Number(event.target.value) || 1)} />
          </label>
          <label className="dd-admin-config-field">
            <span>最大输出 Token</span>
            <input type="number" min="1" value={settings.openrouter.maxOutputTokens} onChange={(event) => onOpenRouterFieldChange('maxOutputTokens', Number(event.target.value) || 1)} />
          </label>
        </div>
      )}
      <ManualOpenAiApiPanel
        settings={settings.openrouter}
        onProviderChange={onProviderChange}
        onOpenRouterFieldChange={onOpenRouterFieldChange}
      />
      <div className="dd-admin-config-actions">
        <button type="button" className="dd-button dd-button--dark">取消</button>
        <button type="button" className="dd-button dd-button--primary" onClick={onSave}>
          {isSaving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </section>
  )
}

function ManualOpenAiApiPanel({
  settings,
  onProviderChange,
  onOpenRouterFieldChange,
}: {
  settings: AdminOpenRouterConfig
  onProviderChange: (provider: AdminAiSettings['provider']) => void
  onOpenRouterFieldChange: <Field extends keyof AdminOpenRouterConfig>(field: Field, value: AdminOpenRouterConfig[Field]) => void
}) {
  const [draft, setDraft] = useState<ManualOpenAiApiDraft>(() => ({
    label: '',
    baseUrl: settings.baseUrl || OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER,
    wireApi: settings.wireApi ?? 'chat_completions',
    apiKey: '',
    modelId: settings.model,
  }))
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const updateDraft = (field: keyof ManualOpenAiApiDraft, value: string) => {
    setDraft((previous) => ({
      ...previous,
      [field]: value,
    }))
    setMessage(null)
  }

  const addManualApi = () => {
    const baseUrl = normalizeOpenAiCompatibleBaseUrl(draft.baseUrl)
    const apiKey = draft.apiKey.trim()
    const modelId = draft.modelId.trim()
    const label = draft.label.trim() || labelFromOpenAiModelId(modelId)

    if (!baseUrl || !apiKey || !modelId) {
      setMessage({ tone: 'error', text: 'Base URL、API Key 和模型 ID 都需要填写。' })
      return
    }

    if (!isHttpBaseUrl(baseUrl)) {
      setMessage({ tone: 'error', text: 'Base URL 需要是 http 或 https 地址。' })
      return
    }

    onProviderChange('openrouter')
    onOpenRouterFieldChange('baseUrl', baseUrl)
    onOpenRouterFieldChange('wireApi', draft.wireApi)
    onOpenRouterFieldChange('apiKey', apiKey)
    onOpenRouterFieldChange('model', modelId)
    onOpenRouterFieldChange('models', upsertOpenAiCompatibleModel(settings.models, modelId, label))
    setDraft((previous) => ({
      ...previous,
      baseUrl,
      modelId,
      label,
    }))
    setMessage({ tone: 'success', text: '已加入 OpenAI 兼容接口配置，点击保存配置后生效。' })
  }

  return (
    <section className="dd-admin-manual-api-card">
      <div className="dd-admin-card__head">
        <div>
          <p>手动添加 API</p>
          <h3>OpenAI 兼容接口</h3>
          <span>填写兼容 Chat Completions 的 Base URL、API Key 和模型 ID，会同步加入模型列表并切换为当前接口。</span>
        </div>
      </div>
      <div className="dd-admin-config-form">
        <label className="dd-admin-config-field">
          <span>模型显示名</span>
          <input
            type="text"
            value={draft.label}
            placeholder="例如 GPT-4.1 或 DeepSeek V3"
            onChange={(event) => updateDraft('label', event.target.value)}
          />
        </label>
        <label className="dd-admin-config-field">
          <span>模型 ID</span>
          <input
            type="text"
            value={draft.modelId}
            placeholder="例如 gpt-4.1-mini"
            onChange={(event) => updateDraft('modelId', event.target.value)}
          />
        </label>
        <label className="dd-admin-config-field">
          <span>接口类型</span>
          <select
            value={draft.wireApi}
            onChange={(event) => updateDraft('wireApi', event.target.value as AdminOpenRouterConfig['wireApi'])}
          >
            <option value="chat_completions">Chat Completions</option>
            <option value="responses">Responses</option>
          </select>
        </label>
        <label className="dd-admin-config-field dd-admin-config-field--wide">
          <span>Base URL</span>
          <input
            type="text"
            value={draft.baseUrl}
            placeholder={OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER}
            onChange={(event) => updateDraft('baseUrl', event.target.value)}
          />
        </label>
        <label className="dd-admin-config-field dd-admin-config-field--wide">
          <span>API Key</span>
          <input
            type="password"
            value={draft.apiKey}
            placeholder="sk-..."
            onChange={(event) => updateDraft('apiKey', event.target.value)}
          />
        </label>
      </div>
      <div className="dd-admin-manual-api-actions">
        {message ? (
          <p className={`dd-admin-manual-api-message is-${message.tone}`} aria-live="polite">
            {message.text}
          </p>
        ) : (
          <p className="dd-admin-manual-api-message">如果粘贴了完整 /chat/completions 地址，系统会自动截取到接口根路径。</p>
        )}
        <button type="button" className="dd-button dd-button--primary" onClick={addManualApi}>
          加入配置
        </button>
      </div>
    </section>
  )
}

function UsageTable({ items }: { items: AdminModelUsage[] }) {
  return (
    <section className="dd-admin-table-card">
      <div className="dd-admin-card__head">
        <div>
          <p>使用统计</p>
          <h3>Usage Detail</h3>
        </div>
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

function SideInfo({
  historyStats,
  usage,
  onClearHistory,
  isClearingHistory,
}: {
  historyStats: AdminHistoryStats | null
  usage: AdminUsageSnapshot | null
  onClearHistory: () => void
  isClearingHistory: boolean
}) {
  return (
    <>
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
      <section className="dd-admin-side-card">
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
    </>
  )
}

const ADMIN_SECTION_META: Record<AdminSection, { title: string; searchPlaceholder: string }> = {
  dashboard: {
    title: '仪表盘',
    searchPlaceholder: '搜索统计、模型、文档...',
  },
  models: {
    title: '模型列表',
    searchPlaceholder: '搜索模型名称、模型 ID...',
  },
  providers: {
    title: '模型供应商',
    searchPlaceholder: '搜索供应商、配置项、密钥...',
  },
}

function ModelsWorkspace({
  models,
  defaultModel,
  onToggle,
  onSetDefault,
  onBackToDashboard,
}: {
  models: AdminModelToggleItem[]
  defaultModel: string
  onToggle: (id: string, enabled: boolean) => void
  onSetDefault: (id: string) => void
  onBackToDashboard: () => void
}) {
  return (
    <section className="dd-admin-page-stack">
      <ModelCatalog
        models={models}
        defaultModel={defaultModel}
        onToggle={onToggle}
        onSetDefault={onSetDefault}
        action={{ label: '返回仪表盘', onClick: onBackToDashboard }}
      />
    </section>
  )
}

function ProvidersWorkspace({
  settings,
  activeProvider,
  usage,
  onSystemPromptChange,
  onCloudflareFieldChange,
  onOpenRouterFieldChange,
  onProviderChange,
  onSave,
  isSaving,
}: {
  settings: AdminAiSettings
  activeProvider: AdminAiSettings['provider']
  usage: AdminModelUsage[]
  onSystemPromptChange: (value: string) => void
  onCloudflareFieldChange: <Field extends keyof AdminCloudflareConfig>(field: Field, value: AdminCloudflareConfig[Field]) => void
  onOpenRouterFieldChange: <Field extends keyof AdminOpenRouterConfig>(field: Field, value: AdminOpenRouterConfig[Field]) => void
  onProviderChange: (provider: AdminAiSettings['provider']) => void
  onSave: () => void
  isSaving: boolean
}) {
  return (
    <section className="dd-admin-page-stack">
      <div className="dd-admin-lower-grid dd-admin-lower-grid--providers">
        <ProviderTable settings={settings} activeProvider={activeProvider} />
        <ConfigPanel
          settings={settings}
          onSystemPromptChange={onSystemPromptChange}
          onCloudflareFieldChange={onCloudflareFieldChange}
          onOpenRouterFieldChange={onOpenRouterFieldChange}
          onProviderChange={onProviderChange}
          onSave={onSave}
          isSaving={isSaving}
        />
      </div>
      <UsageTable items={usage} />
    </section>
  )
}

export function AdminStage({
  adminPasswordDraft,
  isAdminAuthenticated,
  isAdminLoading,
  isAdminLoginTransitioning,
  isAdminSaving,
  isAdminClearingHistory,
  adminError,
  historyStats,
  aiSettings,
  usage,
  onAdminPasswordDraftChange,
  onConnect,
  onDisconnect,
  onProviderChange,
  onSystemPromptChange,
  onCloudflareFieldChange,
  onOpenRouterFieldChange,
  onSave,
  onClearHistory,
}: AdminStageProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isModuleCustomizerOpen, setIsModuleCustomizerOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard')
  const [dashboardModules, setDashboardModules] = useState<Record<DashboardModuleKey, boolean>>(createDefaultDashboardModules)
  const currentSettings = aiSettings
  const allUsage = usage?.models ?? []
  const allTrendBuckets = usage?.trendBuckets ?? []
  const activeUsage = currentSettings
    ? allUsage.filter((item) => item.provider === currentSettings.provider)
    : []
  const activeTrendBuckets = currentSettings
    ? allTrendBuckets.filter((bucket) => bucket.provider === currentSettings.provider)
    : []
  const trendSeries = buildTrendSeries(activeTrendBuckets)
  const modelList = currentSettings
    ? currentSettings.provider === 'openrouter'
      ? currentSettings.openrouter.models
      : currentSettings.cloudflare.models
    : []
  const defaultModel = currentSettings
    ? currentSettings.provider === 'openrouter'
      ? currentSettings.openrouter.model
      : currentSettings.cloudflare.model
    : ''
  const hasSideColumn = dashboardModules.models || dashboardModules.operations
  const kpis = buildKpiCards(historyStats, activeUsage, trendSeries)
  const businessKpis = buildBusinessKpiCards(historyStats, activeUsage)
  const activeSectionMeta = ADMIN_SECTION_META[activeSection]
  const isLoginLocked = isAdminLoading || isAdminLoginTransitioning
  const updateDashboardModule = (key: DashboardModuleKey, visible: boolean) => {
    setDashboardModules((previous) => ({
      ...previous,
      [key]: visible,
    }))
  }
  const updateModelEnabled = (id: string, enabled: boolean) => {
    if (!currentSettings) {
      return
    }

    if (currentSettings.provider === 'openrouter') {
      onOpenRouterFieldChange(
        'models',
        currentSettings.openrouter.models.map((model) => model.id === id ? { ...model, enabled } : model),
      )
      return
    }

      onCloudflareFieldChange(
        'models',
        currentSettings.cloudflare.models.map((model) => model.id === id ? { ...model, enabled } : model),
      )
  }
  const updateDefaultModel = (id: string) => {
    if (!currentSettings) {
      return
    }

    if (currentSettings.provider === 'openrouter') {
      onOpenRouterFieldChange('model', id)
      return
    }

    onCloudflareFieldChange('model', id)
  }
  const openModelCatalog = () => {
    setActiveSection('models')
  }

  return (
    <section className="dd-admin-workbench">
      {!isAdminAuthenticated ? (
        <section className={`dd-admin-login-layout${isAdminLoginTransitioning ? ' is-auth-exiting' : ''}`}>
          <aside className="dd-admin-sidebar dd-admin-sidebar--login">
            <AdminSidebarBrand />
          </aside>
          <div className="dd-admin-login-surface">
            <div className="dd-admin-login-card dd-admin-login-card--full">
              <div className="dd-admin-login-card__copy">
                <h2>进入后台控制台</h2>
              </div>
              <div className="dd-admin-login-card__form">
                <input
                  type="password"
                  placeholder="输入管理员密码"
                  value={adminPasswordDraft}
                  onChange={(event) => onAdminPasswordDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onConnect()
                    }
                  }}
                />
                <button type="button" className="dd-button dd-button--primary" disabled={isLoginLocked || !adminPasswordDraft.trim()} onClick={onConnect}>
                  {isAdminLoginTransitioning ? '正在进入...' : isAdminLoading ? '登录中...' : '进入后台'}
                </button>
              </div>
              {adminError ? <p className="dd-error-note">{adminError}</p> : null}
            </div>
          </div>
        </section>
      ) : (
        <div className={`dd-admin-dashboard-layout${isSidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
          <aside className="dd-admin-sidebar">
            <AdminSidebarBrand />
            <button
              type="button"
              className="dd-admin-sidebar__toggle"
              aria-label={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
              title={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
              onClick={() => setIsSidebarCollapsed((previous) => !previous)}
            >
              <span />
              <span />
              <span />
            </button>
            <nav className="dd-admin-sidebar__nav" aria-label="后台导航">
              <section className="dd-admin-nav-group">
                <button
                  type="button"
                  className={activeSection === 'dashboard' ? 'is-active' : 'is-subtle'}
                  title="仪表盘"
                  aria-label="仪表盘"
                  onClick={() => setActiveSection('dashboard')}
                >
                  <AdminNavIcon name="dashboard" />
                  <span className="dd-admin-nav-label">仪表盘</span>
                </button>
              </section>
              <section className="dd-admin-nav-group">
                <div className="dd-admin-nav-group__title">模型管理</div>
                <button
                  type="button"
                  className={activeSection === 'models' ? 'is-active' : 'is-subtle'}
                  title="模型列表"
                  aria-label="模型列表"
                  onClick={() => setActiveSection('models')}
                >
                  <AdminNavIcon name="model" />
                  <span className="dd-admin-nav-label">模型列表</span>
                </button>
                <button
                  type="button"
                  className={activeSection === 'providers' ? 'is-active' : 'is-subtle'}
                  title="模型供应商"
                  aria-label="模型供应商"
                  onClick={() => setActiveSection('providers')}
                >
                  <AdminNavIcon name="provider" />
                  <span className="dd-admin-nav-label">模型供应商</span>
                </button>
              </section>
              <section className="dd-admin-nav-group">
                <div className="dd-admin-nav-group__title">调用统计</div>
                <button type="button" className={activeSection === 'dashboard' ? 'is-active' : 'is-subtle'} title="调用概览" aria-label="调用概览" onClick={() => setActiveSection('dashboard')}>
                  <AdminNavIcon name="usage" />
                  <span className="dd-admin-nav-label">调用概览</span>
                </button>
                <button type="button" className={activeSection === 'providers' ? 'is-active' : 'is-subtle'} title="使用明细" aria-label="使用明细" onClick={() => setActiveSection('providers')}>
                  <AdminNavIcon name="detail" />
                  <span className="dd-admin-nav-label">使用明细</span>
                </button>
              </section>
              <section className="dd-admin-nav-group">
                <div className="dd-admin-nav-group__title">配置中心</div>
                <button type="button" className={activeSection === 'providers' ? 'is-active' : 'is-subtle'} title="系统配置" aria-label="系统配置" onClick={() => setActiveSection('providers')}>
                  <AdminNavIcon name="config" />
                  <span className="dd-admin-nav-label">系统配置</span>
                </button>
                <button type="button" className={activeSection === 'providers' ? 'is-active' : 'is-subtle'} title="API 密钥管理" aria-label="API 密钥管理" onClick={() => setActiveSection('providers')}>
                  <AdminNavIcon name="settings" />
                  <span className="dd-admin-nav-label">API 密钥管理</span>
                </button>
                <button type="button" className={activeSection === 'providers' ? 'is-active' : 'is-subtle'} title="策略与限流" aria-label="策略与限流" onClick={() => setActiveSection('providers')}>
                  <AdminNavIcon name="limit" />
                  <span className="dd-admin-nav-label">策略与限流</span>
                </button>
              </section>
              <section className="dd-admin-nav-group">
                <div className="dd-admin-nav-group__title">历史记录</div>
                <button type="button" className="is-subtle" title="对话记录" aria-label="对话记录">
                  <AdminNavIcon name="history" />
                  <span className="dd-admin-nav-label">对话记录</span>
                </button>
                <button type="button" className="is-subtle" title="调用日志" aria-label="调用日志">
                  <AdminNavIcon name="log" />
                  <span className="dd-admin-nav-label">调用日志</span>
                </button>
              </section>
              <section className="dd-admin-nav-group">
                <div className="dd-admin-nav-group__title">用户与权限</div>
                <button type="button" className="is-subtle" title="用户管理" aria-label="用户管理">
                  <AdminNavIcon name="user" />
                  <span className="dd-admin-nav-label">用户管理</span>
                </button>
                <button type="button" className="is-subtle" title="角色管理" aria-label="角色管理">
                  <AdminNavIcon name="role" />
                  <span className="dd-admin-nav-label">角色管理</span>
                </button>
              </section>
              <section className="dd-admin-nav-group">
                <div className="dd-admin-nav-group__title">系统管理</div>
                <button type="button" className="is-subtle" title="审计日志" aria-label="审计日志">
                  <AdminNavIcon name="audit" />
                  <span className="dd-admin-nav-label">审计日志</span>
                </button>
                <button type="button" className="is-subtle" title="系统设置" aria-label="系统设置">
                  <AdminNavIcon name="settings" />
                  <span className="dd-admin-nav-label">系统设置</span>
                </button>
              </section>
            </nav>
            <button type="button" className="dd-admin-sidebar__collapse" title="退出后台" aria-label="退出后台" onClick={onDisconnect}>
              <AdminNavIcon name="logout" />
              <span className="dd-admin-nav-label">退出后台</span>
            </button>
          </aside>

          <div className="dd-admin-content">
            <header className="dd-admin-topbar">
              <div className="dd-admin-topbar__title">
                {activeSection === 'dashboard' ? (
                  <button
                    type="button"
                    className={`dd-admin-topbar__menu${isModuleCustomizerOpen ? ' is-active' : ''}`}
                    aria-label="自定义首页展示模块"
                    title="自定义首页展示模块"
                    onClick={() => setIsModuleCustomizerOpen((previous) => !previous)}
                  >
                    <span />
                    <span />
                    <span />
                  </button>
                ) : null}
                <strong>{activeSectionMeta.title}</strong>
              </div>
              <div className="dd-admin-topbar__search">
                <input type="text" placeholder={activeSectionMeta.searchPlaceholder} />
              </div>
              <div className="dd-admin-topbar__actions">
                <span>通知</span>
                <span>工单</span>
                <span>帮助</span>
                <button type="button" className="dd-admin-topbar__user">系统管理员</button>
              </div>
            </header>

            {isModuleCustomizerOpen ? (
              <section className="dd-admin-module-panel" aria-label="首页展示模块自定义">
                <div className="dd-admin-module-panel__head">
                  <div>
                    <p>首页展示模块</p>
                    <h3>自定义仪表盘内容</h3>
                  </div>
                  <button type="button" onClick={() => setDashboardModules(createDefaultDashboardModules())}>恢复默认</button>
                </div>
                <div className="dd-admin-module-panel__grid">
                  {DASHBOARD_MODULES.map((module) => (
                    <label key={module.key} className="dd-admin-module-option">
                      <input
                        type="checkbox"
                        checked={dashboardModules[module.key]}
                        onChange={(event) => updateDashboardModule(module.key, event.target.checked)}
                      />
                      <span>
                        <strong>{module.label}</strong>
                        <small>{module.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            {adminError ? (
              <section className="dd-admin-banner">
                <p className="dd-error-note">{adminError}</p>
              </section>
            ) : null}

            {activeSection === 'dashboard' ? (
              <>
                {dashboardModules.kpis ? <KpiCards cards={kpis} /> : null}
                {dashboardModules.businessKpis ? <KpiCards cards={businessKpis} /> : null}

                <section className={`dd-admin-main-grid${hasSideColumn ? '' : ' dd-admin-main-grid--single'}`}>
                  <div className="dd-admin-main-column">
                    {dashboardModules.charts ? (
                      <div className="dd-admin-chart-grid">
                        <TrendChart series={trendSeries} />
                        <OutcomeDonut items={activeUsage} />
                      </div>
                    ) : null}

                    {currentSettings && dashboardModules.config ? (
                      <div className="dd-admin-lower-grid">
                        <div className="dd-admin-provider-stack">
                          <ProviderTable
                            settings={currentSettings}
                            activeProvider={currentSettings.provider}
                            action={{ label: '进入供应商页面', onClick: () => setActiveSection('providers') }}
                          />
                          {dashboardModules.charts ? <UsageBarChart items={activeUsage} /> : null}
                        </div>
                        <ConfigPanel
                          settings={currentSettings}
                          onSystemPromptChange={onSystemPromptChange}
                          onCloudflareFieldChange={onCloudflareFieldChange}
                          onOpenRouterFieldChange={onOpenRouterFieldChange}
                          onProviderChange={onProviderChange}
                          onSave={onSave}
                          isSaving={isAdminSaving}
                        />
                      </div>
                    ) : null}

                    {dashboardModules.usage ? <UsageTable items={activeUsage} /> : null}
                  </div>

                  {hasSideColumn ? (
                    <div className="dd-admin-side-column">
                      {dashboardModules.models ? (
                        <ModelSwitchList
                          models={modelList}
                          defaultModel={defaultModel}
                          onToggle={updateModelEnabled}
                          onSetDefault={updateDefaultModel}
                          onOpenCatalog={openModelCatalog}
                        />
                      ) : null}
                      {dashboardModules.operations ? (
                        <SideInfo
                          historyStats={historyStats}
                          usage={usage}
                          onClearHistory={onClearHistory}
                          isClearingHistory={isAdminClearingHistory}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}

            {activeSection === 'models' ? (
              <ModelsWorkspace
                models={modelList}
                defaultModel={defaultModel}
                onToggle={updateModelEnabled}
                onSetDefault={updateDefaultModel}
                onBackToDashboard={() => setActiveSection('dashboard')}
              />
            ) : null}

            {activeSection === 'providers' && currentSettings ? (
              <ProvidersWorkspace
                settings={currentSettings}
                activeProvider={currentSettings.provider}
                usage={activeUsage}
                onSystemPromptChange={onSystemPromptChange}
                onCloudflareFieldChange={onCloudflareFieldChange}
                onOpenRouterFieldChange={onOpenRouterFieldChange}
                onProviderChange={onProviderChange}
                onSave={onSave}
                isSaving={isAdminSaving}
              />
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
