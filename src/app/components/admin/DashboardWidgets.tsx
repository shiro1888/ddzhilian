import type {
  AdminAiSettings,
  AdminCloudflareConfig,
  AdminFeedbackProviderConfig,
  AdminHistoryStats,
  AdminModelToggleItem,
  AdminModelUsage,
  AdminOpenRouterConfig,
  AdminUsageSnapshot,
} from '../../../lib/ddzhilian-types'
import type {
  AdminOpenAiCompatibleDetectInput,
  AdminOpenAiCompatibleDetectResult,
  AdminOpenAiCompatibleRefreshResult,
} from '../../../lib/use-admin'
import { DangerZonePanel } from './DangerZonePanel'
import type { DashboardWidgetKey, KpiCard, TrendPoint } from './constants'
import { KpiCardView } from './KpiCard'
import { ModelSwitchList } from './ModelSwitchList'
import { OutcomeDonut } from './OutcomeDonut'
import { ProviderConfigPanel } from './ProviderConfigPanel'
import { ProviderTable } from './ProviderTable'
import { SystemInfoPanel } from './SystemInfoPanel'
import { SystemPromptPanel } from './SystemPromptPanel'
import { UsageBarChart } from './UsageBarChart'
import { UsageTable } from './UsageTable'
import { TrendChart } from './TrendChart'
import { AdminSkeletonBlock } from './Skeleton'

export function DashboardWidgetContent({
  widgetKey,
  isLoading,
  kpis,
  businessKpis,
  trendSeries,
  activeUsage,
  currentSettings,
  historyStats,
  usage,
  modelList,
  defaultModel,
  isAdminSaving,
  isAdminClearingHistory,
  onClearHistory,
  onCloudflareFieldChange,
  onOpenCatalog,
  onOpenProviders,
  onOpenRouterFieldChange,
  onFeedbackProviderAdd,
  onFeedbackProviderChange,
  onFeedbackProviderDelete,
  onOpenRouterModelsDetect,
  onOpenRouterModelsRefresh,
  onProviderChange,
  onSave,
  onSetDefaultModel,
  onSystemPromptChange,
  onToggleModel,
}: {
  widgetKey: DashboardWidgetKey
  isLoading: boolean
  kpis: KpiCard[]
  businessKpis: KpiCard[]
  trendSeries: TrendPoint[]
  activeUsage: AdminModelUsage[]
  currentSettings: AdminAiSettings | null
  historyStats: AdminHistoryStats | null
  usage: AdminUsageSnapshot | null
  modelList: AdminModelToggleItem[]
  defaultModel: string
  isAdminSaving: boolean
  isAdminClearingHistory: boolean
  onClearHistory: () => void
  onCloudflareFieldChange: <Field extends keyof AdminCloudflareConfig>(field: Field, value: AdminCloudflareConfig[Field]) => void
  onOpenCatalog: () => void
  onOpenProviders: () => void
  onOpenRouterFieldChange: <Field extends keyof AdminOpenRouterConfig>(field: Field, value: AdminOpenRouterConfig[Field]) => void
  onFeedbackProviderAdd: (provider: AdminFeedbackProviderConfig) => void
  onFeedbackProviderChange: (providerId: string, provider: AdminFeedbackProviderConfig) => void
  onFeedbackProviderDelete: (providerId: string) => void
  onOpenRouterModelsDetect: (input: AdminOpenAiCompatibleDetectInput) => Promise<AdminOpenAiCompatibleDetectResult>
  onOpenRouterModelsRefresh: () => Promise<AdminOpenAiCompatibleRefreshResult>
  onProviderChange: (provider: AdminAiSettings['provider']) => void
  onSave: () => void
  onSetDefaultModel: (id: string) => void
  onSystemPromptChange: (value: string) => void
  onToggleModel: (id: string, enabled: boolean) => void
}) {
  if (isLoading) {
    return <AdminSkeletonBlock rows={widgetKey.startsWith('kpi') || widgetKey.startsWith('business') ? 2 : 5} />
  }

  switch (widgetKey) {
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
          action={{ label: '进入供应商页面', onClick: onOpenProviders }}
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
          onFeedbackProviderAdd={onFeedbackProviderAdd}
          onFeedbackProviderChange={onFeedbackProviderChange}
          onFeedbackProviderDelete={onFeedbackProviderDelete}
          onOpenRouterModelsDetect={onOpenRouterModelsDetect}
          onOpenRouterModelsRefresh={onOpenRouterModelsRefresh}
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
          onToggle={onToggleModel}
          onSetDefault={onSetDefaultModel}
          onOpenCatalog={onOpenCatalog}
          onSave={onSave}
          isSaving={isAdminSaving}
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

