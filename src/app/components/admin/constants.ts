import type {
  AdminAiSettings,
  AdminHistoryStats,
  AdminModelToggleItem,
  AdminModelUsage,
  AdminOpenAiReasoningEffort,
  AdminOpenRouterConfig,
  AdminUsageTrendBucket,
} from '../../../lib/ddzhilian-types'

export const ADMIN_BRAND_NAME = 'ddzhilian管理系统'
export const MODEL_PREVIEW_LIMIT = 5
export const USAGE_BAR_CHART_LIMIT = 3
export const OPENAI_COMPATIBLE_PROVIDER_LABEL = 'OpenAI 兼容接口'
export const OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER = 'https://api.openai.com/v1'
export const CLIPROXYAPI_PRESET = {
  label: 'CLIProxyAPI',
  baseUrl: 'http://127.0.0.1:8317/v1',
  wireApi: 'responses' as const,
  apiKey: 'sk-dummy',
  modelId: '',
  reasoningEffort: 'high' as const,
}

export type AdminSection = 'dashboard' | 'models' | 'providers' | 'users' | 'roles'

export type ManualOpenAiApiDraft = {
  label: string
  baseUrl: string
  wireApi: AdminOpenRouterConfig['wireApi']
  reasoningEffort: AdminOpenAiReasoningEffort
  apiKey: string
  modelId: string
}

export type AdminOpenAiCompatibleDetectedModel = {
  id: string
  label: string
}

export type ProviderConfigOption = 'params' | 'manual' | 'cliproxy'

export type AdminNavIconName =
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

export const DASHBOARD_WIDGET_DRAG_MIME = 'application/x-ddzhilian-admin-widget'

export const DASHBOARD_WIDGETS = [
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

export type DashboardWidgetKey = (typeof DASHBOARD_WIDGETS)[number]['key']
export type DashboardWidgetSpan = (typeof DASHBOARD_WIDGETS)[number]['span']
export type DashboardWidgetDragSource = 'grid' | 'tray'

export const DASHBOARD_WIDGET_SIZE_OPTIONS = [
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

export type DashboardWidgetSizeKey = (typeof DASHBOARD_WIDGET_SIZE_OPTIONS)[number]['key']

export type DashboardWidgetMeta = {
  key: DashboardWidgetKey
  label: string
  description: string
  span: DashboardWidgetSpan
}

export const DASHBOARD_WIDGET_META_BY_KEY = Object.fromEntries(
  DASHBOARD_WIDGETS.map((widget) => [widget.key, widget]),
) as Record<DashboardWidgetKey, DashboardWidgetMeta>

export const DASHBOARD_WIDGET_SIZE_BY_KEY = Object.fromEntries(
  DASHBOARD_WIDGET_SIZE_OPTIONS.map((size) => [size.key, size]),
) as Record<DashboardWidgetSizeKey, (typeof DASHBOARD_WIDGET_SIZE_OPTIONS)[number]>

export const DEFAULT_DASHBOARD_WIDGET_SIZE_BY_SPAN: Record<DashboardWidgetSpan, DashboardWidgetSizeKey> = {
  compact: '1x1',
  wide: '3x2',
  full: '4x3',
}

export const DASHBOARD_WIDGET_DEFAULT_SIZES: Record<DashboardWidgetKey, DashboardWidgetSizeKey> = {
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

export const DASHBOARD_WIDGET_SUPPORTED_SIZES: Record<DashboardWidgetKey, readonly DashboardWidgetSizeKey[]> = {
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

export function createDefaultDashboardWidgetVisibility(): Record<DashboardWidgetKey, boolean> {
  const hiddenByDefault = new Set<DashboardWidgetKey>([
    'businessRevenue',
    'businessUsers',
    'systemPrompt',
    'providerConfig',
    'usageTable',
    'modelList',
    'dangerZone',
    'systemInfo',
  ])

  return Object.fromEntries(DASHBOARD_WIDGETS.map((widget) => [widget.key, !hiddenByDefault.has(widget.key)])) as Record<DashboardWidgetKey, boolean>
}

export function createDefaultDashboardWidgetOrder(): DashboardWidgetKey[] {
  return DASHBOARD_WIDGETS.map((widget) => widget.key)
}

export function createDefaultDashboardWidgetSizes(): Record<DashboardWidgetKey, DashboardWidgetSizeKey> {
  return Object.fromEntries(
    DASHBOARD_WIDGETS.map((widget) => [
      widget.key,
      DASHBOARD_WIDGET_DEFAULT_SIZES[widget.key] ?? DEFAULT_DASHBOARD_WIDGET_SIZE_BY_SPAN[widget.span],
    ]),
  ) as Record<DashboardWidgetKey, DashboardWidgetSizeKey>
}

export function isDashboardWidgetKey(value: string): value is DashboardWidgetKey {
  return value in DASHBOARD_WIDGET_META_BY_KEY
}

export function isDashboardWidgetSizeKey(value: string): value is DashboardWidgetSizeKey {
  return value in DASHBOARD_WIDGET_SIZE_BY_KEY
}

export function getDashboardWidgetSupportedSizes(widgetKey: DashboardWidgetKey) {
  return DASHBOARD_WIDGET_SUPPORTED_SIZES[widgetKey]
}

export function getSafeDashboardWidgetSizeKey(
  widgetKey: DashboardWidgetKey,
  sizeKey: DashboardWidgetSizeKey,
): DashboardWidgetSizeKey {
  const supportedSizes = getDashboardWidgetSupportedSizes(widgetKey)
  return supportedSizes.includes(sizeKey) ? sizeKey : DASHBOARD_WIDGET_DEFAULT_SIZES[widgetKey]
}

export function moveDashboardWidgetAroundTarget(
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

export type KpiCard = {
  label: string
  value: string
  detail: string
  tone: 'green' | 'blue' | 'violet' | 'orange'
}

export type TrendPoint = {
  hour: string
  calls: number
  successRate: number
}

export function isAdminSection(value: unknown): value is AdminSection {
  return value === 'dashboard' || value === 'models' || value === 'providers' || value === 'users' || value === 'roles'
}

export function isProviderConfigOption(value: unknown): value is ProviderConfigOption {
  return value === 'params' || value === 'manual' || value === 'cliproxy'
}

export function formatDateTime(value?: string) {
  if (!value) {
    return '无'
  }

  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return value
  }

  return new Date(parsed).toLocaleString('zh-CN', { hour12: false })
}

export function formatInteger(value: number) {
  return value.toLocaleString('zh-CN')
}

export function formatCurrency(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '无'
  }

  return `¥ ${value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatBytes(value?: number | null) {
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

export function formatPercent(value: number, digits = 2) {
  return `${value.toFixed(digits)}%`
}

export function buildTrendSeries(buckets: AdminUsageTrendBucket[]): TrendPoint[] {
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

export function buildKpiCards(historyStats: AdminHistoryStats | null, activeUsage: AdminModelUsage[], trendSeries: TrendPoint[]): KpiCard[] {
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

export function buildBusinessKpiCards(historyStats: AdminHistoryStats | null, activeUsage: AdminModelUsage[]): KpiCard[] {
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

export function buildPolyline(values: number[], width: number, height: number, padding: number) {
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

export function labelFromOpenAiModelId(modelId: string) {
  return modelId.split('/').pop() || modelId
}

export function normalizeOpenAiCompatibleBaseUrl(value: string) {
  return value
    .trim()
    .replace(/\/+$/g, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/+$/g, '')
}

export function isHttpBaseUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function formatTomlString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function upsertOpenAiCompatibleModel(
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

export function describeProviderStatus(settings: AdminAiSettings) {
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

export const ADMIN_SECTION_META: Record<AdminSection, { title: string; subtitle: string; eyebrow: string }> = {
  dashboard: {
    title: '运行概览',
    subtitle: '集中查看房间、历史、AI 调用和供应商健康状态。',
    eyebrow: 'Overview',
  },
  models: {
    title: '模型',
    subtitle: '管理当前供应商可用模型和默认模型。',
    eyebrow: 'Models',
  },
  providers: {
    title: '供应商与 API',
    subtitle: '配置 AI 提供方、System Prompt、API Key 和模型检测。',
    eyebrow: 'Provider',
  },
  users: {
    title: '用户',
    subtitle: '查看账号、额度和图片生成配额。',
    eyebrow: 'Users',
  },
  roles: {
    title: '角色',
    subtitle: '管理后台管理员名单。',
    eyebrow: 'Roles',
  },
}

export const ADMIN_PRIMARY_NAV_ITEMS: Array<{
  section: AdminSection
  label: string
  description: string
  icon: AdminNavIconName
  superAdminOnly?: boolean
}> = [
  {
    section: 'dashboard',
    label: '运行概览',
    description: '数据与健康状态',
    icon: 'dashboard',
  },
  {
    section: 'models',
    label: '模型',
    description: '启用与默认模型',
    icon: 'model',
  },
  {
    section: 'providers',
    label: '供应商与 API',
    description: '密钥、检测、Prompt',
    icon: 'provider',
    superAdminOnly: true,
  },
  {
    section: 'users',
    label: '用户',
    description: '账号与额度',
    icon: 'user',
  },
  {
    section: 'roles',
    label: '角色',
    description: '后台权限',
    icon: 'role',
    superAdminOnly: true,
  },
]

export function exportToCsv(fileName: string, rows: Array<Record<string, string | number | null | undefined>>) {
  if (rows.length === 0) {
    return
  }

  const headers = Object.keys(rows[0] ?? {})
  const escapeCell = (value: string | number | null | undefined) => {
    const normalized = value === null || value === undefined ? '' : String(value)
    return /[",\r\n]/.test(normalized) ? '"' + normalized.replace(/"/g, '""') + '"' : normalized
  }
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(',')),
  ].join('\r\n')
  const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

