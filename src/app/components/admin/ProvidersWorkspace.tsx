import type {
  AdminAiSettings,
  AdminCloudflareConfig,
  AdminFeedbackProviderConfig,
  AdminModelUsage,
  AdminOpenRouterConfig,
} from '../../../lib/ddzhilian-types'
import type {
  AdminAnthropicDetectInput,
  AdminAnthropicDetectResult,
  AdminOpenAiCompatibleDetectInput,
  AdminOpenAiCompatibleDetectResult,
} from '../../../lib/use-admin'
import { ProviderConfigPanel } from './ProviderConfigPanel'
import { ProviderTable } from './ProviderTable'
import { SystemPromptPanel } from './SystemPromptPanel'
import { UsageTable } from './UsageTable'

export function ProvidersWorkspace({
  settings,
  usage,
  onSystemPromptChange,
  onCloudflareFieldChange,
  onOpenRouterFieldChange,
  onFeedbackProviderAdd,
  onFeedbackProviderChange,
  onFeedbackProviderDelete,
  onOpenRouterModelsDetect,
  onAnthropicModelsDetect,
  onProviderChange,
  onSave,
  isSaving,
}: {
  settings: AdminAiSettings
  usage: AdminModelUsage[]
  onSystemPromptChange: (value: string) => void
  onCloudflareFieldChange: <Field extends keyof AdminCloudflareConfig>(field: Field, value: AdminCloudflareConfig[Field]) => void
  onOpenRouterFieldChange: <Field extends keyof AdminOpenRouterConfig>(field: Field, value: AdminOpenRouterConfig[Field]) => void
  onFeedbackProviderAdd: (provider: AdminFeedbackProviderConfig) => void
  onFeedbackProviderChange: (providerId: string, provider: AdminFeedbackProviderConfig) => void
  onFeedbackProviderDelete: (providerId: string) => void
  onOpenRouterModelsDetect: (input: AdminOpenAiCompatibleDetectInput) => Promise<AdminOpenAiCompatibleDetectResult>
  onAnthropicModelsDetect: (input: AdminAnthropicDetectInput) => Promise<AdminAnthropicDetectResult>
  onProviderChange: (provider: string) => void
  onSave: () => void
  isSaving: boolean
}) {
  return (
    <section className="dd-admin-page-stack">
      <ProviderTable settings={settings} />
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
        onFeedbackProviderAdd={onFeedbackProviderAdd}
        onFeedbackProviderChange={onFeedbackProviderChange}
        onFeedbackProviderDelete={onFeedbackProviderDelete}
        onOpenRouterModelsDetect={onOpenRouterModelsDetect}
        onAnthropicModelsDetect={onAnthropicModelsDetect}
        onProviderChange={onProviderChange}
        onSave={onSave}
        isSaving={isSaving}
      />
      <UsageTable items={usage} />
    </section>
  )
}

