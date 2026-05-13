import type { AdminAiSettings } from '../../../lib/ddzhilian-types'
import type { AdminModelCatalogEntry } from './ModelCatalog'
import { ModelCatalog } from './ModelCatalog'

export function ModelsWorkspace({
  onBackToDashboard,
  catalogModels,
  catalogDefaultModels,
  onCatalogToggle,
  onCatalogSetDefault,
  onSave,
  isSaving,
}: {
  onBackToDashboard: () => void
  catalogModels: AdminModelCatalogEntry[]
  catalogDefaultModels: Record<AdminAiSettings['provider'], string>
  onCatalogToggle: (provider: AdminAiSettings['provider'], id: string, enabled: boolean) => void
  onCatalogSetDefault: (provider: AdminAiSettings['provider'], id: string) => void
  onSave: () => void
  isSaving: boolean
}) {
  return (
    <section className="dd-admin-page-stack">
      <ModelCatalog
        models={catalogModels}
        defaultModels={catalogDefaultModels}
        onToggle={onCatalogToggle}
        onSetDefault={onCatalogSetDefault}
        action={{ label: '返回仪表盘', onClick: onBackToDashboard }}
        onSave={onSave}
        isSaving={isSaving}
      />
    </section>
  )
}

