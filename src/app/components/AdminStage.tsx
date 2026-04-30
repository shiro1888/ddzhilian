import { Button } from '@base-ui/react/button'
import { Field } from '@base-ui/react/field'
import { Input } from '@base-ui/react/input'
import { Switch } from '@base-ui/react/switch'
import { Tabs } from '@base-ui/react/tabs'
import { useRef, useState } from 'react'
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type {
  AdminAiSettings,
  AdminCloudflareConfig,
  AdminHistoryStats,
  AdminModelToggleItem,
  AdminModelUsage,
  AdminOpenAiReasoningEffort,
  AdminOpenRouterConfig,
  AdminRolesSnapshot,
  AdminRoleSummary,
  AdminSessionInfo,
  AdminUsageTrendBucket,
  AdminUsageSnapshot,
  AdminUserQuotaUpdate,
  AdminUserSummary,
  AdminUsersSnapshot,
} from '../../lib/ddzhilian-types'

type AdminStageProps = {
  adminEmailDraft: string
  adminPasswordDraft: string
  adminSession: AdminSessionInfo | null
  isAdminAuthenticated: boolean
  isAdminLoading: boolean
  isAdminLoginTransitioning: boolean
  isAdminSaving: boolean
  isAdminClearingHistory: boolean
  isAdminUpdatingUser: boolean
  isAdminUpdatingRole: boolean
  adminError: string | null
  historyStats: AdminHistoryStats | null
  aiSettings: AdminAiSettings | null
  usage: AdminUsageSnapshot | null
  users: AdminUsersSnapshot | null
  roles: AdminRolesSnapshot | null
  onAdminEmailDraftChange: (value: string) => void
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
  onUserQuotaUpdate: (userId: string, quota: AdminUserQuotaUpdate) => Promise<void>
  onRoleCreate: (email: string) => Promise<void>
  onRoleDelete: (userId: string) => Promise<void>
}

const ADMIN_BRAND_NAME = 'ddzhilian管理系统'
const MODEL_PREVIEW_LIMIT = 5
const USAGE_BAR_CHART_LIMIT = 3
const OPENAI_COMPATIBLE_PROVIDER_LABEL = 'OpenAI 兼容接口'
const OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER = 'https://api.openai.com/v1'
const CLIPROXYAPI_PRESET = {
  label: 'CLIProxyAPI',
  baseUrl: 'http://127.0.0.1:8317/v1',
  wireApi: 'responses' as const,
  apiKey: 'sk-dummy',
  modelId: 'gpt-5-codex',
  reasoningEffort: 'high' as const,
}

type AdminSection = 'dashboard' | 'models' | 'providers' | 'users' | 'roles'

type ManualOpenAiApiDraft = {
  label: string
  baseUrl: string
  wireApi: AdminOpenRouterConfig['wireApi']
  reasoningEffort: AdminOpenAiReasoningEffort
  apiKey: string
  modelId: string
}

type ProviderConfigOption = 'params' | 'manual' | 'cliproxy'

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

const DASHBOARD_WIDGET_DRAG_MIME = 'application/x-ddzhilian-admin-widget'

const DASHBOARD_WIDGETS = [
  { key: 'kpiRooms', label: '活跃房间', description: '真实指标', span: 'compact' },
  { key: 'kpiTexts', label: '历史文本', description: '真实指标', span: 'compact' },
  { key: 'kpiCalls', label: 'API 调用量', description: '真实指标', span: 'compact' },
  { key: 'kpiErrors', label: '错误率', description: '真实指标', span: 'compact' },
  { key: 'businessRevenue', label: '总收入', description: '业务口径', span: 'compact' },
  { key: 'businessUsers', label: '活跃用户', description: '业务口径', span: 'compact' },
  { key: 'trendChart', label: '调用趋势', description: '近 24 小时曲线', span: 'wide' },
  { key: 'outcomeDonut', label: '调用分布', description: '按状态环图', span: 'compact' },
  { key: 'providerHealth', label: '模型供应商', description: 'Provider Health', span: 'wide' },
  { key: 'usageBar', label: '模型排行', description: '按模型调用量', span: 'wide' },
  { key: 'systemPrompt', label: 'System Prompt', description: '模型系统提示词', span: 'wide' },
  { key: 'providerConfig', label: '供应商配置', description: '供应商参数与 API 接入', span: 'full' },
  { key: 'usageTable', label: '调用明细', description: 'Usage Detail', span: 'full' },
  { key: 'modelList', label: '模型列表', description: '默认模型与启用状态', span: 'compact' },
  { key: 'dangerZone', label: '危险操作', description: '清空历史等高危动作', span: 'compact' },
  { key: 'systemInfo', label: '系统信息', description: '版本、环境与活动状态', span: 'compact' },
] as const

type DashboardWidgetKey = (typeof DASHBOARD_WIDGETS)[number]['key']
type DashboardWidgetSpan = (typeof DASHBOARD_WIDGETS)[number]['span']
type DashboardWidgetDragSource = 'grid' | 'tray'

const DASHBOARD_WIDGET_SIZE_OPTIONS = [
  { key: '1x1', columns: 1, rows: 1 },
  { key: '2x1', columns: 2, rows: 1 },
  { key: '3x1', columns: 3, rows: 1 },
  { key: '4x1', columns: 4, rows: 1 },
  { key: '1x2', columns: 1, rows: 2 },
  { key: '2x2', columns: 2, rows: 2 },
  { key: '3x2', columns: 3, rows: 2 },
  { key: '4x2', columns: 4, rows: 2 },
  { key: '1x3', columns: 1, rows: 3 },
  { key: '2x3', columns: 2, rows: 3 },
  { key: '3x3', columns: 3, rows: 3 },
  { key: '4x3', columns: 4, rows: 3 },
  { key: '1x4', columns: 1, rows: 4 },
  { key: '2x4', columns: 2, rows: 4 },
  { key: '3x4', columns: 3, rows: 4 },
  { key: '4x4', columns: 4, rows: 4 },
  { key: '5x4', columns: 5, rows: 4 },
] as const

type DashboardWidgetSizeKey = (typeof DASHBOARD_WIDGET_SIZE_OPTIONS)[number]['key']

type DashboardWidgetMeta = {
  key: DashboardWidgetKey
  label: string
  description: string
  span: DashboardWidgetSpan
}

const DASHBOARD_WIDGET_META_BY_KEY = Object.fromEntries(
  DASHBOARD_WIDGETS.map((widget) => [widget.key, widget]),
) as Record<DashboardWidgetKey, DashboardWidgetMeta>

const DASHBOARD_WIDGET_SIZE_BY_KEY = Object.fromEntries(
  DASHBOARD_WIDGET_SIZE_OPTIONS.map((size) => [size.key, size]),
) as Record<DashboardWidgetSizeKey, (typeof DASHBOARD_WIDGET_SIZE_OPTIONS)[number]>

const DEFAULT_DASHBOARD_WIDGET_SIZE_BY_SPAN: Record<DashboardWidgetSpan, DashboardWidgetSizeKey> = {
  compact: '1x1',
  wide: '3x2',
  full: '4x3',
}

const DASHBOARD_WIDGET_DEFAULT_SIZES: Record<DashboardWidgetKey, DashboardWidgetSizeKey> = {
  kpiRooms: '1x1',
  kpiTexts: '1x1',
  kpiCalls: '1x1',
  kpiErrors: '1x1',
  businessRevenue: '1x1',
  businessUsers: '1x1',
  trendChart: '4x2',
  outcomeDonut: '2x2',
  providerHealth: '3x2',
  usageBar: '3x2',
  systemPrompt: '4x2',
  providerConfig: '5x4',
  usageTable: '4x2',
  modelList: '2x2',
  dangerZone: '1x1',
  systemInfo: '2x2',
}

const DASHBOARD_WIDGET_SUPPORTED_SIZES: Record<DashboardWidgetKey, readonly DashboardWidgetSizeKey[]> = {
  kpiRooms: ['1x1', '2x1', '1x2', '2x2'],
  kpiTexts: ['1x1', '2x1', '1x2', '2x2'],
  kpiCalls: ['1x1', '2x1', '1x2', '2x2'],
  kpiErrors: ['1x1', '2x1', '1x2', '2x2'],
  businessRevenue: ['1x1', '2x1', '1x2', '2x2'],
  businessUsers: ['1x1', '2x1', '1x2', '2x2'],
  trendChart: ['3x2', '4x2', '3x3', '4x3', '4x4'],
  outcomeDonut: ['2x2', '3x2', '2x3', '3x3', '4x3', '4x4'],
  providerHealth: ['3x2', '4x2', '3x3', '4x3', '4x4'],
  usageBar: ['2x2', '3x2', '4x2', '3x3', '4x3'],
  systemPrompt: ['3x2', '4x2', '3x3', '4x3', '4x4'],
  providerConfig: ['4x3', '4x4', '5x4'],
  usageTable: ['4x2', '4x3', '4x4'],
  modelList: ['2x2', '3x2', '2x3', '3x3'],
  dangerZone: ['1x1', '2x1', '2x2'],
  systemInfo: ['1x1', '2x1', '1x2', '2x2'],
}

function createDefaultDashboardWidgetVisibility(): Record<DashboardWidgetKey, boolean> {
  return Object.fromEntries(DASHBOARD_WIDGETS.map((widget) => [widget.key, true])) as Record<DashboardWidgetKey, boolean>
}

function createDefaultDashboardWidgetOrder(): DashboardWidgetKey[] {
  return DASHBOARD_WIDGETS.map((widget) => widget.key)
}

function createDefaultDashboardWidgetSizes(): Record<DashboardWidgetKey, DashboardWidgetSizeKey> {
  return Object.fromEntries(
    DASHBOARD_WIDGETS.map((widget) => [
      widget.key,
      DASHBOARD_WIDGET_DEFAULT_SIZES[widget.key] ?? DEFAULT_DASHBOARD_WIDGET_SIZE_BY_SPAN[widget.span],
    ]),
  ) as Record<DashboardWidgetKey, DashboardWidgetSizeKey>
}

function isDashboardWidgetKey(value: string): value is DashboardWidgetKey {
  return value in DASHBOARD_WIDGET_META_BY_KEY
}

function isDashboardWidgetSizeKey(value: string): value is DashboardWidgetSizeKey {
  return value in DASHBOARD_WIDGET_SIZE_BY_KEY
}

function getDashboardWidgetSupportedSizes(widgetKey: DashboardWidgetKey) {
  return DASHBOARD_WIDGET_SUPPORTED_SIZES[widgetKey]
}

function getSafeDashboardWidgetSizeKey(
  widgetKey: DashboardWidgetKey,
  sizeKey: DashboardWidgetSizeKey,
): DashboardWidgetSizeKey {
  const supportedSizes = getDashboardWidgetSupportedSizes(widgetKey)
  return supportedSizes.includes(sizeKey) ? sizeKey : DASHBOARD_WIDGET_DEFAULT_SIZES[widgetKey]
}

function moveDashboardWidgetAroundTarget(
  order: DashboardWidgetKey[],
  widgetKey: DashboardWidgetKey,
  targetKey?: DashboardWidgetKey,
): DashboardWidgetKey[] {
  const normalizedOrder = order.includes(widgetKey) ? order : [...order, widgetKey]

  if (!targetKey || targetKey === widgetKey) {
    return normalizedOrder
  }

  const sourceIndex = normalizedOrder.indexOf(widgetKey)
  const originalTargetIndex = normalizedOrder.indexOf(targetKey)
  const nextOrder = normalizedOrder.filter((key) => key !== widgetKey)
  const targetIndex = nextOrder.indexOf(targetKey)

  if (targetIndex === -1) {
    return [...nextOrder, widgetKey]
  }

  const insertIndex = sourceIndex >= 0 && originalTargetIndex >= 0 && sourceIndex < originalTargetIndex
    ? targetIndex + 1
    : targetIndex

  return [
    ...nextOrder.slice(0, insertIndex),
    widgetKey,
    ...nextOrder.slice(insertIndex),
  ]
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

type AdminFieldProps = {
  label: string
  wide?: boolean
  children: ReactNode
}

function isAdminSection(value: unknown): value is AdminSection {
  return value === 'dashboard' || value === 'models' || value === 'providers' || value === 'users' || value === 'roles'
}

function isAdminAiProvider(value: unknown): value is AdminAiSettings['provider'] {
  return value === 'cloudflare' || value === 'openrouter'
}

function isProviderConfigOption(value: unknown): value is ProviderConfigOption {
  return value === 'params' || value === 'manual' || value === 'cliproxy'
}

function AdminConfigField({ label, wide = false, children }: AdminFieldProps) {
  return (
    <Field.Root className={`dd-admin-config-field${wide ? ' dd-admin-config-field--wide' : ''}`}>
      <Field.Label className="dd-admin-config-label">
        {label}
      </Field.Label>
      {children}
    </Field.Root>
  )
}

function AdminBaseSwitch({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <Switch.Root
      aria-label={label}
      checked={checked}
      className="dd-admin-base-switch"
      onCheckedChange={onCheckedChange}
    >
      <Switch.Thumb className="dd-admin-base-switch__thumb" />
    </Switch.Root>
  )
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

function formatTomlString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
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

function KpiCardView({ card }: { card: KpiCard }) {
  return (
    <article className={`dd-admin-kpi-card is-${card.tone}`}>
      <div className="dd-admin-kpi-card__icon" aria-hidden="true" />
      <div className="dd-admin-kpi-card__content">
        <span>{card.label}</span>
        <strong>{card.value}</strong>
        <small>{card.detail}</small>
      </div>
    </article>
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
              <AdminBaseSwitch
                checked={model.enabled}
                label={`${model.enabled ? '关闭' : '启用'} ${model.label}`}
                onCheckedChange={(checked) => onToggle(model.id, checked)}
              />
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
                <AdminBaseSwitch
                  checked={model.enabled}
                  label={`${model.enabled ? '关闭' : '启用'} ${model.label}`}
                  onCheckedChange={(checked) => onToggle(model.id, checked)}
                />
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

function SystemPromptPanel({
  settings,
  onSystemPromptChange,
  onSave,
  isSaving,
}: {
  settings: AdminAiSettings
  onSystemPromptChange: (value: string) => void
  onSave: () => void
  isSaving: boolean
}) {
  return (
    <section className="dd-admin-config-card dd-admin-system-prompt-card">
      <div className="dd-admin-card__head">
        <div>
          <p>System Prompt</p>
          <h3>系统提示词</h3>
        </div>
      </div>
      <div className="dd-admin-config-form dd-admin-config-form--system">
        <AdminConfigField label="System Prompt" wide>
          <textarea
            rows={7}
            maxLength={20_000}
            value={settings.systemPrompt ?? ''}
            placeholder="设置模型调用时注入的系统提示词；留空则不发送 system message。"
            onChange={(event) => onSystemPromptChange(event.target.value)}
          />
        </AdminConfigField>
      </div>
      <div className="dd-admin-config-actions">
        <Button type="button" className="dd-button dd-button--primary" onClick={onSave}>
          {isSaving ? '保存中...' : '保存配置'}
        </Button>
      </div>
    </section>
  )
}

function ProviderConfigPanel({
  settings,
  onCloudflareFieldChange,
  onOpenRouterFieldChange,
  onProviderChange,
  onSave,
  isSaving,
}: {
  settings: AdminAiSettings
  onCloudflareFieldChange: <Field extends keyof AdminCloudflareConfig>(field: Field, value: AdminCloudflareConfig[Field]) => void
  onOpenRouterFieldChange: <Field extends keyof AdminOpenRouterConfig>(field: Field, value: AdminOpenRouterConfig[Field]) => void
  onProviderChange: (provider: AdminAiSettings['provider']) => void
  onSave: () => void
  isSaving: boolean
}) {
  const [activeOption, setActiveOption] = useState<ProviderConfigOption>('params')
  const isOpenRouter = settings.provider === 'openrouter'

  return (
    <section className="dd-admin-config-card dd-admin-provider-config-card">
      <div className="dd-admin-card__head">
        <div>
          <p>供应商配置</p>
          <h3>{isOpenRouter ? OPENAI_COMPATIBLE_PROVIDER_LABEL : 'Cloudflare AI'}</h3>
        </div>
      </div>
      <Tabs.Root
        className="dd-admin-provider-config-options"
        value={activeOption}
        onValueChange={(value) => {
          if (isProviderConfigOption(value)) {
            setActiveOption(value)
          }
        }}
      >
        <Tabs.List className="dd-admin-provider-tabs dd-admin-provider-tabs--options" activateOnFocus>
          <Tabs.Tab value="params">供应商参数</Tabs.Tab>
          <Tabs.Tab value="manual">手动 API</Tabs.Tab>
          <Tabs.Tab value="cliproxy">CLIProxyAPI</Tabs.Tab>
          <Tabs.Indicator className="dd-admin-provider-tabs__indicator" />
        </Tabs.List>
        <Tabs.Panel className="dd-admin-provider-panel" value="params" keepMounted>
          <Tabs.Root
            className="dd-admin-provider-tabs-shell"
            value={settings.provider}
            onValueChange={(value) => {
              if (isAdminAiProvider(value)) {
                onProviderChange(value)
              }
            }}
          >
            <Tabs.List className="dd-admin-provider-tabs" activateOnFocus>
              <Tabs.Tab value="cloudflare">Cloudflare</Tabs.Tab>
              <Tabs.Tab value="openrouter">OpenAI 兼容</Tabs.Tab>
              <Tabs.Indicator className="dd-admin-provider-tabs__indicator" />
            </Tabs.List>
            <Tabs.Panel className="dd-admin-provider-panel" value="cloudflare" keepMounted>
              <div className="dd-admin-config-form">
                <AdminConfigField label="Account ID">
                  <Input type="text" value={settings.cloudflare.accountId} onChange={(event) => onCloudflareFieldChange('accountId', event.currentTarget.value)} />
                </AdminConfigField>
                <AdminConfigField label="API Token">
                  <Input type="password" value={settings.cloudflare.apiToken} onChange={(event) => onCloudflareFieldChange('apiToken', event.currentTarget.value)} />
                </AdminConfigField>
                <AdminConfigField label="默认模型" wide>
                  <Input type="text" value={settings.cloudflare.model} onChange={(event) => onCloudflareFieldChange('model', event.currentTarget.value)} />
                </AdminConfigField>
                <AdminConfigField label="免费额度保护">
                  <select value={settings.cloudflare.freeOnly ? 'true' : 'false'} onChange={(event) => onCloudflareFieldChange('freeOnly', event.currentTarget.value === 'true')}>
                    <option value="true">启用</option>
                    <option value="false">关闭</option>
                  </select>
                </AdminConfigField>
                <AdminConfigField label="每日预算">
                  <Input type="number" min="0" value={settings.cloudflare.dailyNeuronBudget} onChange={(event) => onCloudflareFieldChange('dailyNeuronBudget', Number(event.currentTarget.value) || 0)} />
                </AdminConfigField>
                <AdminConfigField label="最大 Prompt 字符">
                  <Input type="number" min="1" value={settings.cloudflare.maxPromptChars} onChange={(event) => onCloudflareFieldChange('maxPromptChars', Number(event.currentTarget.value) || 1)} />
                </AdminConfigField>
                <AdminConfigField label="最大输出 Token">
                  <Input type="number" min="1" value={settings.cloudflare.maxOutputTokens} onChange={(event) => onCloudflareFieldChange('maxOutputTokens', Number(event.currentTarget.value) || 1)} />
                </AdminConfigField>
              </div>
            </Tabs.Panel>
            <Tabs.Panel className="dd-admin-provider-panel" value="openrouter" keepMounted>
              <div className="dd-admin-config-form">
                <AdminConfigField label="API Key">
                  <Input type="password" value={settings.openrouter.apiKey} onChange={(event) => onOpenRouterFieldChange('apiKey', event.currentTarget.value)} />
                </AdminConfigField>
                <AdminConfigField label="Base URL">
                  <Input type="text" value={settings.openrouter.baseUrl} onChange={(event) => onOpenRouterFieldChange('baseUrl', event.currentTarget.value)} />
                </AdminConfigField>
                <AdminConfigField label="接口类型">
                  <select value={settings.openrouter.wireApi} onChange={(event) => onOpenRouterFieldChange('wireApi', event.currentTarget.value as AdminOpenRouterConfig['wireApi'])}>
                    <option value="chat_completions">Chat Completions</option>
                    <option value="responses">Responses</option>
                  </select>
                </AdminConfigField>
                <AdminConfigField label="推理强度">
                  <select
                    value={settings.openrouter.reasoningEffort}
                    onChange={(event) => onOpenRouterFieldChange('reasoningEffort', event.currentTarget.value as AdminOpenAiReasoningEffort)}
                  >
                    <option value="">不发送</option>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </AdminConfigField>
                <AdminConfigField label="站点 URL">
                  <Input type="text" value={settings.openrouter.siteUrl} onChange={(event) => onOpenRouterFieldChange('siteUrl', event.currentTarget.value)} />
                </AdminConfigField>
                <AdminConfigField label="站点名称">
                  <Input type="text" value={settings.openrouter.siteName} onChange={(event) => onOpenRouterFieldChange('siteName', event.currentTarget.value)} />
                </AdminConfigField>
                <AdminConfigField label="默认模型" wide>
                  <Input type="text" value={settings.openrouter.model} onChange={(event) => onOpenRouterFieldChange('model', event.currentTarget.value)} />
                </AdminConfigField>
                <AdminConfigField label="最大 Prompt 字符">
                  <Input type="number" min="1" value={settings.openrouter.maxPromptChars} onChange={(event) => onOpenRouterFieldChange('maxPromptChars', Number(event.currentTarget.value) || 1)} />
                </AdminConfigField>
                <AdminConfigField label="最大输出 Token">
                  <Input type="number" min="1" value={settings.openrouter.maxOutputTokens} onChange={(event) => onOpenRouterFieldChange('maxOutputTokens', Number(event.currentTarget.value) || 1)} />
                </AdminConfigField>
              </div>
            </Tabs.Panel>
          </Tabs.Root>
        </Tabs.Panel>
        <Tabs.Panel className="dd-admin-provider-panel" value="manual" keepMounted>
          <ManualOpenAiApiPanel
            settings={settings.openrouter}
            onProviderChange={onProviderChange}
            onOpenRouterFieldChange={onOpenRouterFieldChange}
          />
        </Tabs.Panel>
        <Tabs.Panel className="dd-admin-provider-panel" value="cliproxy" keepMounted>
          <CliProxyApiPresetPanel
            settings={settings.openrouter}
            onProviderChange={onProviderChange}
            onOpenRouterFieldChange={onOpenRouterFieldChange}
          />
        </Tabs.Panel>
      </Tabs.Root>
      <div className="dd-admin-config-actions">
        <Button type="button" className="dd-button dd-button--dark">取消</Button>
        <Button type="button" className="dd-button dd-button--primary" onClick={onSave}>
          {isSaving ? '保存中...' : '保存配置'}
        </Button>
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
    reasoningEffort: settings.reasoningEffort ?? '',
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
    onOpenRouterFieldChange('reasoningEffort', draft.reasoningEffort)
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
        <AdminConfigField label="模型显示名">
          <Input
            type="text"
            value={draft.label}
            placeholder="例如 GPT-4.1 或 DeepSeek V3"
            onChange={(event) => updateDraft('label', event.target.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="模型 ID">
          <Input
            type="text"
            value={draft.modelId}
            placeholder="例如 gpt-4.1-mini"
            onChange={(event) => updateDraft('modelId', event.target.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="接口类型">
          <select
            value={draft.wireApi}
            onChange={(event) => updateDraft('wireApi', event.target.value as AdminOpenRouterConfig['wireApi'])}
          >
            <option value="chat_completions">Chat Completions</option>
            <option value="responses">Responses</option>
          </select>
        </AdminConfigField>
        <AdminConfigField label="推理强度">
          <select
            value={draft.reasoningEffort}
            onChange={(event) => updateDraft('reasoningEffort', event.target.value as AdminOpenAiReasoningEffort)}
          >
            <option value="">不发送</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </AdminConfigField>
        <AdminConfigField label="Base URL" wide>
          <Input
            type="text"
            value={draft.baseUrl}
            placeholder={OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER}
            onChange={(event) => updateDraft('baseUrl', event.target.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="API Key" wide>
          <Input
            type="password"
            value={draft.apiKey}
            placeholder="sk-..."
            onChange={(event) => updateDraft('apiKey', event.target.value)}
          />
        </AdminConfigField>
      </div>
      <div className="dd-admin-manual-api-actions">
        {message ? (
          <p className={`dd-admin-manual-api-message is-${message.tone}`} aria-live="polite">
            {message.text}
          </p>
        ) : (
          <p className="dd-admin-manual-api-message">如果粘贴了完整 /chat/completions 地址，系统会自动截取到接口根路径。</p>
        )}
        <Button type="button" className="dd-button dd-button--primary" onClick={addManualApi}>
          加入配置
        </Button>
      </div>
    </section>
  )
}

function CliProxyApiPresetPanel({
  settings,
  onProviderChange,
  onOpenRouterFieldChange,
}: {
  settings: AdminOpenRouterConfig
  onProviderChange: (provider: AdminAiSettings['provider']) => void
  onOpenRouterFieldChange: <Field extends keyof AdminOpenRouterConfig>(field: Field, value: AdminOpenRouterConfig[Field]) => void
}) {
  const [draft, setDraft] = useState<ManualOpenAiApiDraft>(() => ({
    label: CLIPROXYAPI_PRESET.label,
    baseUrl: CLIPROXYAPI_PRESET.baseUrl,
    wireApi: CLIPROXYAPI_PRESET.wireApi,
    reasoningEffort: CLIPROXYAPI_PRESET.reasoningEffort,
    apiKey: CLIPROXYAPI_PRESET.apiKey,
    modelId: CLIPROXYAPI_PRESET.modelId,
  }))
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const previewBaseUrl = normalizeOpenAiCompatibleBaseUrl(draft.baseUrl) || CLIPROXYAPI_PRESET.baseUrl
  const previewModel = draft.modelId.trim() || CLIPROXYAPI_PRESET.modelId
  const previewReasoningEffort = draft.reasoningEffort || CLIPROXYAPI_PRESET.reasoningEffort
  const previewApiKey = draft.apiKey.trim() || CLIPROXYAPI_PRESET.apiKey
  const configPreview = [
    '# approval_policy = "never"',
    '# sandbox_mode = "danger-full-access"',
    '',
    'model_provider = "cliproxyapi"',
    `model = "${formatTomlString(previewModel)}"`,
    `model_reasoning_effort = "${formatTomlString(previewReasoningEffort)}"`,
    '',
    '[model_providers.cliproxyapi]',
    'name = "cliproxyapi"',
    `base_url = "${formatTomlString(previewBaseUrl)}"`,
    `wire_api = "${formatTomlString(draft.wireApi)}"`,
  ].join('\n')
  const authPreview = JSON.stringify({ OPENAI_API_KEY: previewApiKey }, null, 2)

  const updateDraft = (field: keyof ManualOpenAiApiDraft, value: string) => {
    setDraft((previous) => ({
      ...previous,
      [field]: value,
    }))
    setMessage(null)
  }

  const applyPreset = () => {
    const baseUrl = normalizeOpenAiCompatibleBaseUrl(draft.baseUrl)
    const apiKey = draft.apiKey.trim()
    const modelId = draft.modelId.trim()
    const label = draft.label.trim() || CLIPROXYAPI_PRESET.label

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
    onOpenRouterFieldChange('reasoningEffort', draft.reasoningEffort)
    onOpenRouterFieldChange('apiKey', apiKey)
    onOpenRouterFieldChange('model', modelId)
    onOpenRouterFieldChange('models', upsertOpenAiCompatibleModel(settings.models, modelId, label))
    setDraft((previous) => ({
      ...previous,
      label,
      baseUrl,
      apiKey,
      modelId,
    }))
    setMessage({ tone: 'success', text: '已套用 CLIProxyAPI 配置，点击保存配置后生效。' })
  }

  return (
    <section className="dd-admin-manual-api-card dd-admin-cliproxy-card">
      <div className="dd-admin-card__head">
        <div>
          <p>Codex 接入</p>
          <h3>CLIProxyAPI</h3>
          <span>按 Codex CLI 的 `config.toml` 与 `auth.json` 口径编辑，保存到当前网站的 OpenAI 兼容调用配置。</span>
        </div>
      </div>
      <div className="dd-admin-config-form">
        <AdminConfigField label="模型显示名">
          <Input
            type="text"
            value={draft.label}
            onChange={(event) => updateDraft('label', event.target.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="模型">
          <Input
            type="text"
            value={draft.modelId}
            onChange={(event) => updateDraft('modelId', event.target.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="接口类型">
          <select
            value={draft.wireApi}
            onChange={(event) => updateDraft('wireApi', event.target.value as AdminOpenRouterConfig['wireApi'])}
          >
            <option value="responses">Responses</option>
            <option value="chat_completions">Chat Completions</option>
          </select>
        </AdminConfigField>
        <AdminConfigField label="推理强度">
          <select
            value={draft.reasoningEffort}
            onChange={(event) => updateDraft('reasoningEffort', event.target.value as AdminOpenAiReasoningEffort)}
          >
            <option value="">不发送</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </AdminConfigField>
        <AdminConfigField label="Base URL" wide>
          <Input
            type="text"
            value={draft.baseUrl}
            onChange={(event) => updateDraft('baseUrl', event.target.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="API Key" wide>
          <Input
            type="password"
            value={draft.apiKey}
            onChange={(event) => updateDraft('apiKey', event.target.value)}
          />
        </AdminConfigField>
      </div>
      <div className="dd-admin-code-preview-grid">
        <div className="dd-admin-code-preview">
          <strong>config.toml</strong>
          <pre>{configPreview}</pre>
        </div>
        <div className="dd-admin-code-preview">
          <strong>auth.json</strong>
          <pre>{authPreview}</pre>
        </div>
      </div>
      <div className="dd-admin-manual-api-actions">
        {message ? (
          <p className={`dd-admin-manual-api-message is-${message.tone}`} aria-live="polite">
            {message.text}
          </p>
        ) : (
          <p className="dd-admin-manual-api-message">此模块不直接启动进程或写入服务器用户目录。</p>
        )}
        <Button type="button" className="dd-button dd-button--primary" onClick={applyPreset}>
          套用 CLIProxyAPI
        </Button>
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

function createUserQuotaDraft(user: AdminUserSummary): Record<keyof AdminUserQuotaUpdate, string> {
  return {
    imageQuotaUsed: String(user.imageQuotaUsed),
    imagePaidQuotaRemaining: String(user.imagePaidQuotaRemaining),
    imagePaidQuotaUsed: String(user.imagePaidQuotaUsed),
  }
}

function normalizeQuotaDraftValue(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function UserManagementWorkspace({
  users,
  isUpdatingUser,
  onUserQuotaUpdate,
}: {
  users: AdminUsersSnapshot | null
  isUpdatingUser: boolean
  onUserQuotaUpdate: (userId: string, quota: AdminUserQuotaUpdate) => Promise<void>
}) {
  const accountUsers = users?.users ?? []
  const freeQuotaUsed = accountUsers.reduce((sum, user) => sum + user.imageQuotaUsed, 0)
  const paidQuotaRemaining = accountUsers.reduce((sum, user) => sum + user.imagePaidQuotaRemaining, 0)

  return (
    <section className="dd-admin-page-stack">
      <section className="dd-admin-table-card dd-admin-user-management-card">
        <div className="dd-admin-card__head">
          <div>
            <p>用户管理</p>
            <h3>Supabase Users</h3>
            <span>
              {users?.configured
                ? `已从 Supabase Auth 加载 ${formatInteger(accountUsers.length)} 个账号，并合并 user_profiles 额度`
                : 'Supabase 未配置时不会读取账号列表'}
            </span>
          </div>
          <div className="dd-admin-user-summary">
            <span>
              <strong>{formatInteger(accountUsers.length)}</strong>
              账号
            </span>
            <span>
              <strong>{formatInteger(freeQuotaUsed)}</strong>
              免费已用
            </span>
            <span>
              <strong>{formatInteger(paidQuotaRemaining)}</strong>
              付费剩余
            </span>
          </div>
        </div>

        {!users ? (
          <p className="dd-admin-user-message">正在等待后台用户快照。</p>
        ) : !users.configured ? (
          <p className="dd-admin-user-message">当前后端未配置 Supabase，账号数据暂不可用。</p>
        ) : users.error ? (
          <p className="dd-admin-user-message is-error">{users.error}</p>
        ) : accountUsers.length === 0 ? (
          <p className="dd-admin-user-message">Supabase Auth 暂无账号记录。</p>
        ) : (
          <div className="dd-admin-user-table-wrap">
            <table className="dd-admin-user-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>免费额度已用</th>
                  <th>付费剩余</th>
                  <th>付费已用</th>
                  <th>额度周期</th>
                  <th>创建时间</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {accountUsers.map((user) => (
                  <AdminUserRow
                    key={`${user.id}:${user.imageQuotaUsed}:${user.imagePaidQuotaRemaining}:${user.imagePaidQuotaUsed}:${user.updatedAt ?? ''}`}
                    user={user}
                    isSaving={isUpdatingUser}
                    onUserQuotaUpdate={onUserQuotaUpdate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

function RoleManagementWorkspace({
  roles,
  isSuperAdmin,
  isUpdatingRole,
  onRoleCreate,
  onRoleDelete,
}: {
  roles: AdminRolesSnapshot | null
  isSuperAdmin: boolean
  isUpdatingRole: boolean
  onRoleCreate: (email: string) => Promise<void>
  onRoleDelete: (userId: string) => Promise<void>
}) {
  const [emailDraft, setEmailDraft] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const roleItems = roles?.roles ?? []
  const superAdminCount = roleItems.filter((role) => role.role === 'super_admin').length
  const adminCount = roleItems.filter((role) => role.role === 'admin').length
  const canSubmit = isSuperAdmin && emailDraft.trim().length > 0 && !isUpdatingRole

  const submitRole = () => {
    const email = emailDraft.trim()
    if (!email) {
      setMessage('请输入管理员邮箱。')
      return
    }

    void onRoleCreate(email)
      .then(() => {
        setEmailDraft('')
        setMessage('已添加')
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : '添加失败')
      })
  }

  return (
    <section className="dd-admin-page-stack">
      <section className="dd-admin-table-card dd-admin-user-management-card">
        <div className="dd-admin-card__head">
          <div>
            <p>角色管理</p>
            <h3>Admin Roles</h3>
            <span>
              {roles?.configured
                ? `已加载 ${formatInteger(roleItems.length)} 个后台账号`
                : 'Supabase 未配置时不会读取管理员角色'}
            </span>
          </div>
          <div className="dd-admin-user-summary">
            <span>
              <strong>{formatInteger(superAdminCount)}</strong>
              超级管理员
            </span>
            <span>
              <strong>{formatInteger(adminCount)}</strong>
              管理员
            </span>
          </div>
        </div>

        <div className="dd-admin-role-create">
          <Input
            type="email"
            placeholder="管理员邮箱"
            value={emailDraft}
            disabled={!isSuperAdmin || isUpdatingRole}
            onChange={(event) => {
              setEmailDraft(event.target.value)
              setMessage(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submitRole()
              }
            }}
          />
          <Button
            type="button"
            className="dd-button dd-button--primary"
            disabled={!canSubmit}
            onClick={submitRole}
          >
            {isUpdatingRole ? '保存中' : '添加管理员'}
          </Button>
          {message ? <small className={message === '已添加' ? 'is-success' : 'is-error'}>{message}</small> : null}
        </div>

        {!isSuperAdmin ? (
          <p className="dd-admin-user-message">当前账号没有角色管理权限。</p>
        ) : !roles ? (
          <p className="dd-admin-user-message">正在等待后台角色快照。</p>
        ) : !roles.configured ? (
          <p className="dd-admin-user-message">当前后端未配置 Supabase，管理员角色暂不可用。</p>
        ) : roles.error ? (
          <p className="dd-admin-user-message is-error">{roles.error}</p>
        ) : roleItems.length === 0 ? (
          <p className="dd-admin-user-message">暂无管理员角色记录。</p>
        ) : (
          <div className="dd-admin-user-table-wrap">
            <table className="dd-admin-user-table dd-admin-role-table">
              <thead>
                <tr>
                  <th>管理员</th>
                  <th>角色</th>
                  <th>来源</th>
                  <th>创建时间</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {roleItems.map((role) => (
                  <AdminRoleRow
                    key={`${role.role}:${role.userId || role.email}`}
                    role={role}
                    isSaving={isUpdatingRole}
                    onRoleDelete={onRoleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

function AdminRoleRow({
  role,
  isSaving,
  onRoleDelete,
}: {
  role: AdminRoleSummary
  isSaving: boolean
  onRoleDelete: (userId: string) => Promise<void>
}) {
  const [message, setMessage] = useState<string | null>(null)
  const canDelete = role.role === 'admin' && role.source === 'database' && Boolean(role.userId)

  const deleteRole = () => {
    if (!canDelete) {
      return
    }

    void onRoleDelete(role.userId)
      .then(() => {
        setMessage('已删除')
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : '删除失败')
      })
  }

  return (
    <tr>
      <td>
        <div className="dd-admin-user-cell">
          <strong>{role.email || '未记录邮箱'}</strong>
          <small>{role.userId || '账号未注册'}</small>
        </div>
      </td>
      <td>{role.role === 'super_admin' ? '超级管理员' : '管理员'}</td>
      <td>{role.source === 'env' ? '环境变量' : '数据库'}</td>
      <td>{formatDateTime(role.createdAt)}</td>
      <td>{formatDateTime(role.updatedAt)}</td>
      <td>
        <div className="dd-admin-user-row-actions">
          <Button
            type="button"
            className="dd-button dd-button--danger dd-admin-user-save"
            disabled={isSaving || !canDelete}
            onClick={deleteRole}
          >
            {isSaving ? '删除中' : '删除'}
          </Button>
          {message ? <small className={message === '已删除' ? 'is-success' : 'is-error'}>{message}</small> : null}
        </div>
      </td>
    </tr>
  )
}

function AdminUserRow({
  user,
  isSaving,
  onUserQuotaUpdate,
}: {
  user: AdminUserSummary
  isSaving: boolean
  onUserQuotaUpdate: (userId: string, quota: AdminUserQuotaUpdate) => Promise<void>
}) {
  const [draft, setDraft] = useState(createUserQuotaDraft(user))
  const [message, setMessage] = useState<string | null>(null)
  const nextQuota = {
    imageQuotaUsed: normalizeQuotaDraftValue(draft.imageQuotaUsed),
    imagePaidQuotaRemaining: normalizeQuotaDraftValue(draft.imagePaidQuotaRemaining),
    imagePaidQuotaUsed: normalizeQuotaDraftValue(draft.imagePaidQuotaUsed),
  }
  const isValid =
    nextQuota.imageQuotaUsed !== null &&
    nextQuota.imagePaidQuotaRemaining !== null &&
    nextQuota.imagePaidQuotaUsed !== null
  const isDirty =
    draft.imageQuotaUsed !== String(user.imageQuotaUsed) ||
    draft.imagePaidQuotaRemaining !== String(user.imagePaidQuotaRemaining) ||
    draft.imagePaidQuotaUsed !== String(user.imagePaidQuotaUsed)

  const updateDraft = (field: keyof AdminUserQuotaUpdate, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }))
    setMessage(null)
  }

  const saveQuota = () => {
    if (!isValid) {
      setMessage('额度只能填写非负整数。')
      return
    }

    void onUserQuotaUpdate(user.id, nextQuota as AdminUserQuotaUpdate)
      .then(() => {
        setMessage('已保存')
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : '保存失败')
      })
  }

  return (
    <tr>
      <td>
        <div className="dd-admin-user-cell">
          <strong>{user.email || '未记录邮箱'}</strong>
          <small>{user.id}</small>
        </div>
      </td>
      <td>
        <Input
          type="number"
          min="0"
          step="1"
          className="dd-admin-user-quota-input"
          value={draft.imageQuotaUsed}
          onChange={(event) => updateDraft('imageQuotaUsed', event.target.value)}
        />
      </td>
      <td>
        <Input
          type="number"
          min="0"
          step="1"
          className="dd-admin-user-quota-input"
          value={draft.imagePaidQuotaRemaining}
          onChange={(event) => updateDraft('imagePaidQuotaRemaining', event.target.value)}
        />
      </td>
      <td>
        <Input
          type="number"
          min="0"
          step="1"
          className="dd-admin-user-quota-input"
          value={draft.imagePaidQuotaUsed}
          onChange={(event) => updateDraft('imagePaidQuotaUsed', event.target.value)}
        />
      </td>
      <td>{formatDateTime(user.imageQuotaPeriodStartedAt)}</td>
      <td>{formatDateTime(user.createdAt)}</td>
      <td>{formatDateTime(user.updatedAt)}</td>
      <td>
        <div className="dd-admin-user-row-actions">
          <Button
            type="button"
            className="dd-button dd-button--primary dd-admin-user-save"
            disabled={isSaving || !isDirty || !isValid}
            onClick={saveQuota}
          >
            {isSaving ? '保存中' : '保存'}
          </Button>
          {message ? <small className={message === '已保存' ? 'is-success' : 'is-error'}>{message}</small> : null}
        </div>
      </td>
    </tr>
  )
}

function DangerZonePanel({
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

function SystemInfoPanel({
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

function DashboardGridWidget({
  widgetKey,
  sizeKey,
  isEditing,
  isDragging,
  isDropTarget,
  children,
  onClose,
  onSizeChange,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  widgetKey: DashboardWidgetKey
  sizeKey: DashboardWidgetSizeKey
  isEditing: boolean
  isDragging: boolean
  isDropTarget: boolean
  children: ReactNode
  onClose: (key: DashboardWidgetKey) => void
  onSizeChange: (key: DashboardWidgetKey, sizeKey: DashboardWidgetSizeKey) => void
  onDragStart: (event: DragEvent<HTMLElement>, key: DashboardWidgetKey, source: DashboardWidgetDragSource) => void
  onDragOver: (event: DragEvent<HTMLElement>, key: DashboardWidgetKey) => void
  onDrop: (event: DragEvent<HTMLElement>, key: DashboardWidgetKey) => void
  onDragEnd: () => void
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, key: DashboardWidgetKey, source: DashboardWidgetDragSource) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
}) {
  const meta = DASHBOARD_WIDGET_META_BY_KEY[widgetKey]
  const safeSizeKey = getSafeDashboardWidgetSizeKey(widgetKey, sizeKey)
  const size = DASHBOARD_WIDGET_SIZE_BY_KEY[safeSizeKey]
  const supportedSizes = getDashboardWidgetSupportedSizes(widgetKey)
  const widgetStyle = {
    '--dd-admin-widget-columns': String(size.columns),
    '--dd-admin-widget-rows': String(size.rows),
  } as CSSProperties & Record<string, string>

  return (
    <article
      className={[
        'dd-admin-widget-shell',
        isEditing ? 'is-editing' : 'is-static',
        isDragging ? 'is-dragging' : '',
        isDropTarget ? 'is-drop-target' : '',
      ].filter(Boolean).join(' ')}
      style={widgetStyle}
      data-admin-widget-key={widgetKey}
      data-admin-widget-size={size.key}
      draggable={false}
      onDragStart={isEditing ? (event) => onDragStart(event, widgetKey, 'grid') : undefined}
      onDragOver={isEditing ? (event) => onDragOver(event, widgetKey) : undefined}
      onDrop={isEditing ? (event) => onDrop(event, widgetKey) : undefined}
      onDragEnd={isEditing ? onDragEnd : undefined}
      onPointerDown={isEditing ? (event) => onPointerDown(event, widgetKey, 'grid') : undefined}
      onPointerMove={isEditing ? onPointerMove : undefined}
      onPointerUp={isEditing ? onPointerUp : undefined}
      onPointerCancel={isEditing ? onPointerCancel : undefined}
    >
      {isEditing ? (
        <>
          <button
            type="button"
            className="dd-admin-widget-shell__close"
            aria-label={`关闭${meta.label}`}
            title={`关闭${meta.label}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onClose(widgetKey)
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
          <div
            className="dd-admin-widget-shell__size"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <span>比例</span>
            <select
              aria-label={`调整${meta.label}比例`}
              value={size.key}
              onChange={(event) => {
                const nextSizeKey = event.target.value
                if (isDashboardWidgetSizeKey(nextSizeKey)) {
                  onSizeChange(widgetKey, nextSizeKey)
                }
              }}
            >
              {supportedSizes.map((optionKey) => (
                <option key={optionKey} value={optionKey}>
                  {optionKey}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}
      <div
        className="dd-admin-widget-shell__content"
        aria-label={meta.label}
      >
        {children}
      </div>
    </article>
  )
}

function HiddenDashboardWidget({
  widgetKey,
  sizeKey,
  isDragging,
  onRestore,
  onDragStart,
  onDragEnd,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  shouldSuppressClick,
}: {
  widgetKey: DashboardWidgetKey
  sizeKey: DashboardWidgetSizeKey
  isDragging: boolean
  onRestore: (key: DashboardWidgetKey) => void
  onDragStart: (event: DragEvent<HTMLElement>, key: DashboardWidgetKey, source: DashboardWidgetDragSource) => void
  onDragEnd: () => void
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, key: DashboardWidgetKey, source: DashboardWidgetDragSource) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
  shouldSuppressClick: () => boolean
}) {
  const meta = DASHBOARD_WIDGET_META_BY_KEY[widgetKey]
  const sizeKeyLabel = getSafeDashboardWidgetSizeKey(widgetKey, sizeKey)

  return (
    <div
      role="button"
      tabIndex={0}
      className={`dd-admin-hidden-widget${isDragging ? ' is-dragging' : ''}`}
      data-admin-widget-key={widgetKey}
      draggable={false}
      onClick={() => {
        if (!shouldSuppressClick()) {
          onRestore(widgetKey)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onRestore(widgetKey)
        }
      }}
      onDragStart={(event) => onDragStart(event, widgetKey, 'tray')}
      onDragEnd={onDragEnd}
      onPointerDown={(event) => onPointerDown(event, widgetKey, 'tray')}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <strong>{meta.label}</strong>
      <small>{meta.description} · {sizeKeyLabel}</small>
    </div>
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
  users: {
    title: '用户管理',
    searchPlaceholder: '搜索用户邮箱、用户 ID...',
  },
  roles: {
    title: '角色管理',
    searchPlaceholder: '搜索管理员邮箱、角色...',
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
      <ProviderTable settings={settings} activeProvider={activeProvider} />
      <SystemPromptPanel
        settings={settings}
        onSystemPromptChange={onSystemPromptChange}
        onSave={onSave}
        isSaving={isSaving}
      />
      <ProviderConfigPanel
        settings={settings}
        onCloudflareFieldChange={onCloudflareFieldChange}
        onOpenRouterFieldChange={onOpenRouterFieldChange}
        onProviderChange={onProviderChange}
        onSave={onSave}
        isSaving={isSaving}
      />
      <UsageTable items={usage} />
    </section>
  )
}

export function AdminStage({
  adminEmailDraft,
  adminPasswordDraft,
  adminSession,
  isAdminAuthenticated,
  isAdminLoading,
  isAdminLoginTransitioning,
  isAdminSaving,
  isAdminClearingHistory,
  isAdminUpdatingUser,
  isAdminUpdatingRole,
  adminError,
  historyStats,
  aiSettings,
  usage,
  users,
  roles,
  onAdminEmailDraftChange,
  onAdminPasswordDraftChange,
  onConnect,
  onDisconnect,
  onProviderChange,
  onSystemPromptChange,
  onCloudflareFieldChange,
  onOpenRouterFieldChange,
  onSave,
  onClearHistory,
  onUserQuotaUpdate,
  onRoleCreate,
  onRoleDelete,
}: AdminStageProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isModuleCustomizerOpen, setIsModuleCustomizerOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard')
  const [dashboardWidgetVisibility, setDashboardWidgetVisibility] = useState<Record<DashboardWidgetKey, boolean>>(createDefaultDashboardWidgetVisibility)
  const [dashboardWidgetOrder, setDashboardWidgetOrder] = useState<DashboardWidgetKey[]>(createDefaultDashboardWidgetOrder)
  const [dashboardWidgetSizes, setDashboardWidgetSizes] = useState<Record<DashboardWidgetKey, DashboardWidgetSizeKey>>(createDefaultDashboardWidgetSizes)
  const [draggingDashboardWidget, setDraggingDashboardWidget] = useState<{
    key: DashboardWidgetKey
    source: DashboardWidgetDragSource
  } | null>(null)
  const draggingDashboardWidgetRef = useRef<{
    key: DashboardWidgetKey
    source: DashboardWidgetDragSource
  } | null>(null)
  const pointerDashboardDragRef = useRef<{
    key: DashboardWidgetKey
    source: DashboardWidgetDragSource
    pointerId: number
    startX: number
    startY: number
    hasMoved: boolean
  } | null>(null)
  const suppressDashboardWidgetClickRef = useRef(false)
  const [dashboardDropTarget, setDashboardDropTarget] = useState<DashboardWidgetKey | null>(null)
  const [isDashboardTrayDropTarget, setIsDashboardTrayDropTarget] = useState(false)
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
  const kpis = buildKpiCards(historyStats, activeUsage, trendSeries)
  const businessKpis = buildBusinessKpiCards(historyStats, activeUsage)
  const visibleDashboardWidgetKeys = dashboardWidgetOrder.filter((key) => dashboardWidgetVisibility[key])
  const hiddenDashboardWidgetKeys = dashboardWidgetOrder.filter((key) => !dashboardWidgetVisibility[key])
  const activeSectionMeta = ADMIN_SECTION_META[activeSection]
  const isLoginLocked = isAdminLoading || isAdminLoginTransitioning
  const isSuperAdmin = Boolean(adminSession?.isSuperAdmin)
  const updateDashboardWidgetVisibility = (key: DashboardWidgetKey, visible: boolean) => {
    setDashboardWidgetVisibility((previous) => ({
      ...previous,
      [key]: visible,
    }))
  }
  const updateDashboardWidgetSize = (key: DashboardWidgetKey, sizeKey: DashboardWidgetSizeKey) => {
    if (!getDashboardWidgetSupportedSizes(key).includes(sizeKey)) {
      return
    }

    setDashboardWidgetSizes((previous) => ({
      ...previous,
      [key]: sizeKey,
    }))
  }
  const resetDashboardWidgets = () => {
    setDashboardWidgetVisibility(createDefaultDashboardWidgetVisibility())
    setDashboardWidgetOrder(createDefaultDashboardWidgetOrder())
    setDashboardWidgetSizes(createDefaultDashboardWidgetSizes())
    setDraggingDashboardWidget(null)
    setDashboardDropTarget(null)
    setIsDashboardTrayDropTarget(false)
  }
  const getDraggedDashboardWidget = (event: DragEvent<HTMLElement>) => {
    const explicitKey = event.dataTransfer.getData(DASHBOARD_WIDGET_DRAG_MIME)
    if (isDashboardWidgetKey(explicitKey)) {
      return explicitKey
    }

    return draggingDashboardWidgetRef.current?.key ?? draggingDashboardWidget?.key ?? null
  }
  const handleDashboardWidgetDragStart = (
    event: DragEvent<HTMLElement>,
    key: DashboardWidgetKey,
    source: DashboardWidgetDragSource,
  ) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(DASHBOARD_WIDGET_DRAG_MIME, key)
    event.dataTransfer.setData('text/plain', DASHBOARD_WIDGET_META_BY_KEY[key].label)
    const dragState = { key, source }
    draggingDashboardWidgetRef.current = dragState
    setDraggingDashboardWidget(dragState)
  }
  const clearDashboardWidgetDrag = () => {
    draggingDashboardWidgetRef.current = null
    pointerDashboardDragRef.current = null
    setDraggingDashboardWidget(null)
    setDashboardDropTarget(null)
    setIsDashboardTrayDropTarget(false)
  }
  const consumeDashboardWidgetClickSuppression = () => {
    if (!suppressDashboardWidgetClickRef.current) {
      return false
    }

    suppressDashboardWidgetClickRef.current = false
    return true
  }
  const readDashboardDropTargetAtPoint = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY)
    if (!element) {
      return { type: 'none' as const }
    }

    if (element.closest('.dd-admin-hidden-widget-tray')) {
      return { type: 'tray' as const }
    }

    const widgetElement = element.closest<HTMLElement>('[data-admin-widget-key]')
    const widgetKey = widgetElement?.dataset.adminWidgetKey
    if (widgetKey && isDashboardWidgetKey(widgetKey)) {
      return { type: 'widget' as const, key: widgetKey }
    }

    if (element.closest('.dd-admin-edit-grid')) {
      return { type: 'grid' as const }
    }

    return { type: 'none' as const }
  }
  const handleDashboardWidgetPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    key: DashboardWidgetKey,
    source: DashboardWidgetDragSource,
  ) => {
    if (event.button !== 0) {
      return
    }

    pointerDashboardDragRef.current = {
      key,
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      hasMoved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handleDashboardWidgetPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const pointerDrag = pointerDashboardDragRef.current
    if (!pointerDrag) {
      return
    }

    const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY)
    if (distance < 6 && !pointerDrag.hasMoved) {
      return
    }

    pointerDrag.hasMoved = true
    const dragState = { key: pointerDrag.key, source: pointerDrag.source }
    draggingDashboardWidgetRef.current = dragState
    setDraggingDashboardWidget(dragState)
  }
  const handleDashboardWidgetPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const pointerDrag = pointerDashboardDragRef.current
    if (!pointerDrag) {
      return
    }

    if (event.currentTarget.hasPointerCapture(pointerDrag.pointerId)) {
      event.currentTarget.releasePointerCapture(pointerDrag.pointerId)
    }

    pointerDashboardDragRef.current = null
    if (!pointerDrag.hasMoved) {
      clearDashboardWidgetDrag()
      return
    }

    event.preventDefault()
    suppressDashboardWidgetClickRef.current = true
    window.setTimeout(() => {
      suppressDashboardWidgetClickRef.current = false
    }, 0)

    const dropTarget = readDashboardDropTargetAtPoint(event.clientX, event.clientY)
    if (dropTarget.type === 'tray') {
      updateDashboardWidgetVisibility(pointerDrag.key, false)
      clearDashboardWidgetDrag()
      return
    }

    if (dropTarget.type === 'widget') {
      setDashboardWidgetOrder((previous) => moveDashboardWidgetAroundTarget(previous, pointerDrag.key, dropTarget.key))
      updateDashboardWidgetVisibility(pointerDrag.key, true)
      clearDashboardWidgetDrag()
      return
    }

    if (dropTarget.type === 'grid') {
      setDashboardWidgetOrder((previous) => {
        const nextOrder = previous.filter((key) => key !== pointerDrag.key)
        return [...nextOrder, pointerDrag.key]
      })
      updateDashboardWidgetVisibility(pointerDrag.key, true)
    }

    clearDashboardWidgetDrag()
  }
  const handleDashboardWidgetPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    const pointerDrag = pointerDashboardDragRef.current
    if (pointerDrag && event.currentTarget.hasPointerCapture(pointerDrag.pointerId)) {
      event.currentTarget.releasePointerCapture(pointerDrag.pointerId)
    }
    clearDashboardWidgetDrag()
  }
  const handleDashboardWidgetDragOver = (event: DragEvent<HTMLElement>, targetKey: DashboardWidgetKey) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDashboardDropTarget(targetKey)
    setIsDashboardTrayDropTarget(false)
  }
  const dropDashboardWidgetIntoGrid = (event: DragEvent<HTMLElement>, targetKey?: DashboardWidgetKey) => {
    event.preventDefault()
    const widgetKey = getDraggedDashboardWidget(event)

    if (!widgetKey) {
      clearDashboardWidgetDrag()
      return
    }

    setDashboardWidgetOrder((previous) => moveDashboardWidgetAroundTarget(previous, widgetKey, targetKey))
    updateDashboardWidgetVisibility(widgetKey, true)
    clearDashboardWidgetDrag()
  }
  const handleDashboardTrayDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDashboardDropTarget(null)
    setIsDashboardTrayDropTarget(true)
  }
  const dropDashboardWidgetIntoTray = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    const widgetKey = getDraggedDashboardWidget(event)

    if (widgetKey) {
      updateDashboardWidgetVisibility(widgetKey, false)
    }

    clearDashboardWidgetDrag()
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
  const renderDashboardWidget = (key: DashboardWidgetKey) => {
    switch (key) {
      case 'kpiRooms':
        return <KpiCardView card={kpis[0]} />
      case 'kpiTexts':
        return <KpiCardView card={kpis[1]} />
      case 'kpiCalls':
        return <KpiCardView card={kpis[2]} />
      case 'kpiErrors':
        return <KpiCardView card={kpis[3]} />
      case 'businessRevenue':
        return <KpiCardView card={businessKpis[0]} />
      case 'businessUsers':
        return <KpiCardView card={businessKpis[1]} />
      case 'trendChart':
        return <TrendChart series={trendSeries} />
      case 'outcomeDonut':
        return <OutcomeDonut items={activeUsage} />
      case 'providerHealth':
        return currentSettings ? (
          <ProviderTable
            settings={currentSettings}
            activeProvider={currentSettings.provider}
            action={{ label: '进入供应商页面', onClick: () => setActiveSection('providers') }}
          />
        ) : null
      case 'usageBar':
        return <UsageBarChart items={activeUsage} />
      case 'systemPrompt':
        return currentSettings ? (
          <SystemPromptPanel
            settings={currentSettings}
            onSystemPromptChange={onSystemPromptChange}
            onSave={onSave}
            isSaving={isAdminSaving}
          />
        ) : null
      case 'providerConfig':
        return currentSettings ? (
          <ProviderConfigPanel
            settings={currentSettings}
            onCloudflareFieldChange={onCloudflareFieldChange}
            onOpenRouterFieldChange={onOpenRouterFieldChange}
            onProviderChange={onProviderChange}
            onSave={onSave}
            isSaving={isAdminSaving}
          />
        ) : null
      case 'usageTable':
        return <UsageTable items={activeUsage} />
      case 'modelList':
        return (
          <ModelSwitchList
            models={modelList}
            defaultModel={defaultModel}
            onToggle={updateModelEnabled}
            onSetDefault={updateDefaultModel}
            onOpenCatalog={openModelCatalog}
          />
        )
      case 'dangerZone':
        return (
          <DangerZonePanel
            historyStats={historyStats}
            onClearHistory={onClearHistory}
            isClearingHistory={isAdminClearingHistory}
          />
        )
      case 'systemInfo':
        return <SystemInfoPanel historyStats={historyStats} usage={usage} />
      default:
        return null
    }
  }
  const renderDashboardGrid = (isEditing: boolean) => (
    <section
      className={`dd-admin-dashboard-grid${isEditing ? ' dd-admin-edit-grid' : ''}`}
      aria-label={isEditing ? '可拖动组件网格' : '仪表盘组件网格'}
      onDragOver={isEditing
        ? (event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }
        : undefined}
      onDrop={isEditing ? (event) => dropDashboardWidgetIntoGrid(event) : undefined}
    >
      {visibleDashboardWidgetKeys.map((key) => {
        const widget = renderDashboardWidget(key)

        if (!widget) {
          return null
        }

        return (
          <DashboardGridWidget
            key={key}
            widgetKey={key}
            sizeKey={dashboardWidgetSizes[key]}
            isEditing={isEditing}
            isDragging={draggingDashboardWidget?.key === key}
            isDropTarget={dashboardDropTarget === key}
            onClose={(widgetKey) => updateDashboardWidgetVisibility(widgetKey, false)}
            onSizeChange={updateDashboardWidgetSize}
            onDragStart={handleDashboardWidgetDragStart}
            onDragOver={handleDashboardWidgetDragOver}
            onDrop={dropDashboardWidgetIntoGrid}
            onDragEnd={clearDashboardWidgetDrag}
            onPointerDown={handleDashboardWidgetPointerDown}
            onPointerMove={handleDashboardWidgetPointerMove}
            onPointerUp={handleDashboardWidgetPointerUp}
            onPointerCancel={handleDashboardWidgetPointerCancel}
          >
            {widget}
          </DashboardGridWidget>
        )
      })}
    </section>
  )

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
                <Input
                  type="email"
                  placeholder="管理员邮箱"
                  value={adminEmailDraft}
                  onChange={(event) => onAdminEmailDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onConnect()
                    }
                  }}
                />
                <Input
                  type="password"
                  placeholder="账号密码"
                  value={adminPasswordDraft}
                  onChange={(event) => onAdminPasswordDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onConnect()
                    }
                  }}
                />
                <Button
                  type="button"
                  className="dd-button dd-button--primary"
                  disabled={isLoginLocked || !adminEmailDraft.trim() || !adminPasswordDraft.trim()}
                  onClick={onConnect}
                >
                  {isAdminLoginTransitioning ? '正在进入...' : isAdminLoading ? '登录中...' : '进入后台'}
                </Button>
              </div>
              {adminError ? <p className="dd-error-note">{adminError}</p> : null}
            </div>
          </div>
        </section>
      ) : (
        <Tabs.Root
          className={`dd-admin-dashboard-layout${isSidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}
          orientation="vertical"
          value={activeSection}
          onValueChange={(value) => {
            if (isAdminSection(value)) {
              if (!isSuperAdmin && (value === 'providers' || value === 'roles')) {
                return
              }

              setActiveSection(value)
            }
          }}
        >
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
                  className={isSuperAdmin && activeSection === 'providers' ? 'is-active' : 'is-subtle'}
                  title={isSuperAdmin ? '模型供应商' : '仅超级管理员可管理供应商配置'}
                  aria-label="模型供应商"
                  disabled={!isSuperAdmin}
                  onClick={() => {
                    if (isSuperAdmin) {
                      setActiveSection('providers')
                    }
                  }}
                >
                  <AdminNavIcon name="provider" />
                  <span className="dd-admin-nav-label">模型供应商</span>
                </button>
              </section>
              <section className="dd-admin-nav-group">
                <div className="dd-admin-nav-group__title">调用统计</div>
                <button type="button" className="is-subtle" title="调用概览" aria-label="调用概览" onClick={() => setActiveSection('dashboard')}>
                  <AdminNavIcon name="usage" />
                  <span className="dd-admin-nav-label">调用概览</span>
                </button>
                <button type="button" className="is-subtle" title="使用明细" aria-label="使用明细" onClick={() => setActiveSection('dashboard')}>
                  <AdminNavIcon name="detail" />
                  <span className="dd-admin-nav-label">使用明细</span>
                </button>
              </section>
              <section className="dd-admin-nav-group">
                <div className="dd-admin-nav-group__title">配置中心</div>
                <button
                  type="button"
                  className="is-subtle"
                  title={isSuperAdmin ? '系统配置' : '仅超级管理员可管理系统配置'}
                  aria-label="系统配置"
                  disabled={!isSuperAdmin}
                  onClick={() => {
                    if (isSuperAdmin) {
                      setActiveSection('providers')
                    }
                  }}
                >
                  <AdminNavIcon name="config" />
                  <span className="dd-admin-nav-label">系统配置</span>
                </button>
                <button
                  type="button"
                  className="is-subtle"
                  title={isSuperAdmin ? 'API 密钥管理' : '仅超级管理员可管理 API 密钥'}
                  aria-label="API 密钥管理"
                  disabled={!isSuperAdmin}
                  onClick={() => {
                    if (isSuperAdmin) {
                      setActiveSection('providers')
                    }
                  }}
                >
                  <AdminNavIcon name="settings" />
                  <span className="dd-admin-nav-label">API 密钥管理</span>
                </button>
                <button
                  type="button"
                  className="is-subtle"
                  title={isSuperAdmin ? '策略与限流' : '仅超级管理员可管理策略与限流'}
                  aria-label="策略与限流"
                  disabled={!isSuperAdmin}
                  onClick={() => {
                    if (isSuperAdmin) {
                      setActiveSection('providers')
                    }
                  }}
                >
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
                <button
                  type="button"
                  className={activeSection === 'users' ? 'is-active' : 'is-subtle'}
                  title="用户管理"
                  aria-label="用户管理"
                  onClick={() => setActiveSection('users')}
                >
                  <AdminNavIcon name="user" />
                  <span className="dd-admin-nav-label">用户管理</span>
                </button>
                <button
                  type="button"
                  className={activeSection === 'roles' ? 'is-active' : 'is-subtle'}
                  title={isSuperAdmin ? '角色管理' : '仅超级管理员可管理角色'}
                  aria-label="角色管理"
                  disabled={!isSuperAdmin}
                  onClick={() => {
                    if (isSuperAdmin) {
                      setActiveSection('roles')
                    }
                  }}
                >
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
                <Input type="text" placeholder={activeSectionMeta.searchPlaceholder} />
              </div>
              <Tabs.List className="dd-admin-topbar__tabs" activateOnFocus>
                <Tabs.Tab value="dashboard">仪表盘</Tabs.Tab>
                <Tabs.Tab value="models">模型</Tabs.Tab>
                {isSuperAdmin ? <Tabs.Tab value="providers">供应商</Tabs.Tab> : null}
                <Tabs.Tab value="users">用户</Tabs.Tab>
                {isSuperAdmin ? <Tabs.Tab value="roles">角色</Tabs.Tab> : null}
                <Tabs.Indicator className="dd-admin-topbar__tabs-indicator" />
              </Tabs.List>
              <div className="dd-admin-topbar__actions">
                <span>通知</span>
                <span>工单</span>
                <span>帮助</span>
                <button type="button" className="dd-admin-topbar__user" title={adminSession?.email}>
                  {adminSession?.email || '系统管理员'}
                </button>
              </div>
            </header>

            {isModuleCustomizerOpen ? (
              <section className="dd-admin-module-panel" aria-label="首页展示模块自定义">
                <div className="dd-admin-module-panel__head">
                  <div>
                    <p>组件编辑</p>
                    <h3>自定义仪表盘内容</h3>
                  </div>
                  <button type="button" onClick={resetDashboardWidgets}>恢复默认</button>
                </div>
              </section>
            ) : null}

            {adminError ? (
              <section className="dd-admin-banner">
                <p className="dd-error-note">{adminError}</p>
              </section>
            ) : null}

            <Tabs.Panel className="dd-admin-section-panel" value="dashboard" keepMounted>
              <div className="dd-admin-section-panel__inner">
                {isModuleCustomizerOpen ? (
                  <section className="dd-admin-edit-workspace" aria-label="仪表盘组件编辑区">
                    <section
                      className={`dd-admin-hidden-widget-tray${isDashboardTrayDropTarget ? ' is-drop-target' : ''}`}
                      aria-label="已关闭组件"
                      onDragOver={handleDashboardTrayDragOver}
                      onDragLeave={() => setIsDashboardTrayDropTarget(false)}
                      onDrop={dropDashboardWidgetIntoTray}
                    >
                      <div className="dd-admin-hidden-widget-tray__label">
                        <span>已关闭组件</span>
                        <strong>{hiddenDashboardWidgetKeys.length}</strong>
                      </div>
                      <div className="dd-admin-hidden-widget-tray__items">
                        {hiddenDashboardWidgetKeys.map((key) => (
                          <HiddenDashboardWidget
                            key={key}
                            widgetKey={key}
                            sizeKey={dashboardWidgetSizes[key]}
                            isDragging={draggingDashboardWidget?.key === key}
                            onRestore={(widgetKey) => updateDashboardWidgetVisibility(widgetKey, true)}
                            onDragStart={handleDashboardWidgetDragStart}
                            onDragEnd={clearDashboardWidgetDrag}
                            onPointerDown={handleDashboardWidgetPointerDown}
                            onPointerMove={handleDashboardWidgetPointerMove}
                            onPointerUp={handleDashboardWidgetPointerUp}
                            onPointerCancel={handleDashboardWidgetPointerCancel}
                            shouldSuppressClick={consumeDashboardWidgetClickSuppression}
                          />
                        ))}
                      </div>
                    </section>
                    {renderDashboardGrid(true)}
                  </section>
                ) : (
                  renderDashboardGrid(false)
                )}
              </div>
            </Tabs.Panel>

            <Tabs.Panel className="dd-admin-section-panel" value="models" keepMounted>
              <ModelsWorkspace
                models={modelList}
                defaultModel={defaultModel}
                onToggle={updateModelEnabled}
                onSetDefault={updateDefaultModel}
                onBackToDashboard={() => setActiveSection('dashboard')}
              />
            </Tabs.Panel>

            <Tabs.Panel className="dd-admin-section-panel" value="providers" keepMounted>
              {isSuperAdmin && currentSettings ? (
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
              ) : (
                <p className="dd-admin-user-message">当前账号没有 API 密钥管理权限。</p>
              )}
            </Tabs.Panel>

            <Tabs.Panel className="dd-admin-section-panel" value="users" keepMounted>
              <UserManagementWorkspace
                users={users}
                isUpdatingUser={isAdminUpdatingUser}
                onUserQuotaUpdate={onUserQuotaUpdate}
              />
            </Tabs.Panel>

            <Tabs.Panel className="dd-admin-section-panel" value="roles" keepMounted>
              <RoleManagementWorkspace
                roles={roles}
                isSuperAdmin={isSuperAdmin}
                isUpdatingRole={isAdminUpdatingRole}
                onRoleCreate={onRoleCreate}
                onRoleDelete={onRoleDelete}
              />
            </Tabs.Panel>
          </div>
        </Tabs.Root>
      )}
    </section>
  )
}
