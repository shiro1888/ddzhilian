import type { AdminAiSettings, AdminCloudflareConfig, AdminModelUsage, AdminOpenRouterConfig } from '../../../lib/ddzhilian-types'
import type { AdminOpenAiCompatibleDetectInput, AdminOpenAiCompatibleDetectResult } from '../../../lib/use-admin'
import { ProviderConfigPanel } from './ProviderConfigPanel'
import { ProviderTable } from './ProviderTable'
import { SystemPromptPanel } from './SystemPromptPanel'
import { UsageTable } from './UsageTable'

export function ProvidersWorkspace({
  settings,
  activeProvider,
  usage,
  onSystemPromptChange,
  onCloudflareFieldChange,
  onOpenRouterFieldChange,
  onOpenRouterModelsDetect,
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
  onOpenRouterModelsDetect: (input: AdminOpenAiCompatibleDetectInput) => Promise<AdminOpenAiCompatibleDetectResult>
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
        onOpenRouterModelsDetect={onOpenRouterModelsDetect}
        onProviderChange={onProviderChange}
        onSave={onSave}
        isSaving={isSaving}
      />
      <UsageTable items={usage} />
    </section>
  )
}

