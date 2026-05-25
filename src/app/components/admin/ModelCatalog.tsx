import { Button } from '@base-ui/react/button'
import { useMemo, useState } from 'react'
import type { AdminAiSettings, AdminModelToggleItem } from '../../../lib/ddzhilian-types'
import { AdminBaseSwitch } from './FormControls'

type ModelCatalogApiProvider = AdminAiSettings['provider']
type ModelCatalogApiProviderFilter = ModelCatalogApiProvider | 'all'

export type AdminModelCatalogEntry = AdminModelToggleItem & {
  apiProvider: ModelCatalogApiProvider
  apiProviderLabel: string
}

const API_PROVIDER_FILTER_OPTIONS: Array<{ value: ModelCatalogApiProviderFilter, label: string }> = [
  { value: 'all', label: '全部 API 供应商' },
  { value: 'cloudflare', label: 'Cloudflare AI' },
  { value: 'openrouter', label: 'OpenAI 兼容接口' },
]

function getModelProviderKey(modelId: string) {
  if (modelId.startsWith('@cf/')) {
    return modelId.split('/')[1] || 'cloudflare'
  }

  return modelId.split('/')[0] || 'unknown'
}

function getModelProviderLabel(providerKey: string) {
  if (providerKey === 'unknown') {
    return '未标记'
  }

  return providerKey
}

export function ModelCatalog({
  models,
  defaultModels,
  onToggle,
  onSetDefault,
  action,
  onSave,
  isSaving,
}: {
  models: AdminModelCatalogEntry[]
  defaultModels: Record<ModelCatalogApiProvider, string>
  onToggle: (provider: ModelCatalogApiProvider, id: string, enabled: boolean) => void
  onSetDefault: (provider: ModelCatalogApiProvider, id: string) => void
  action?: {
    label: string
    onClick: () => void
  }
  onSave: () => void
  isSaving: boolean
}) {
  const [apiProviderFilter, setApiProviderFilter] = useState<ModelCatalogApiProviderFilter>('all')
  const [modelProviderFilter, setModelProviderFilter] = useState('all')
  const apiProviderOptions = useMemo(() => {
    const options = new Map<ModelCatalogApiProviderFilter, string>(
      API_PROVIDER_FILTER_OPTIONS.map((option) => [option.value, option.label]),
    )

    for (const model of models) {
      options.set(model.apiProvider, model.apiProviderLabel)
    }

    return [...options.entries()].map(([value, label]) => ({ value, label }))
  }, [models])
  const modelsMatchingApiProvider = useMemo(
    () => models.filter((model) => apiProviderFilter === 'all' || model.apiProvider === apiProviderFilter),
    [apiProviderFilter, models],
  )
  const modelProviderOptions = useMemo(() => {
    const options = new Map<string, string>()

    for (const model of modelsMatchingApiProvider) {
      const key = getModelProviderKey(model.id)
      options.set(key, getModelProviderLabel(key))
    }

    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((first, second) => first.label.localeCompare(second.label))
  }, [modelsMatchingApiProvider])
  const effectiveModelProviderFilter = modelProviderOptions.some((option) => option.value === modelProviderFilter)
    ? modelProviderFilter
    : 'all'
  const visibleModels = modelsMatchingApiProvider.filter(
    (model) => effectiveModelProviderFilter === 'all' || getModelProviderKey(model.id) === effectiveModelProviderFilter,
  )

  return (
    <section className="dd-admin-model-catalog" id="admin-model-catalog" aria-label="全部模型">
      <div className="dd-admin-card__head">
        <div>
          <p>模型模块</p>
          <h3>全部模型</h3>
          <span>{visibleModels.length} / {models.length} 个模型，可按模型供应商与 API 供应商筛选后切换默认项与启用状态</span>
        </div>
        {action ? (
          <button type="button" className="dd-admin-link-button" onClick={action.onClick}>{action.label}</button>
        ) : null}
      </div>

      <div className="dd-admin-model-catalog__filters" aria-label="模型筛选">
        <label>
          <span>API 供应商</span>
          <select
            value={apiProviderFilter}
            onChange={(event) => {
              setApiProviderFilter(event.currentTarget.value as ModelCatalogApiProviderFilter)
              setModelProviderFilter('all')
            }}
          >
            {apiProviderOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>模型供应商</span>
          <select
            value={effectiveModelProviderFilter}
            onChange={(event) => setModelProviderFilter(event.currentTarget.value)}
          >
            <option value="all">全部模型供应商</option>
            {modelProviderOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {visibleModels.length > 0 ? (
        <div className="dd-admin-model-catalog__masonry">
          {visibleModels.map((model) => (
            <article key={`${model.apiProvider}:${model.id}`} className="dd-admin-model-catalog-card">
              <div className="dd-admin-model-catalog-card__copy">
                <div className="dd-admin-model-catalog-card__meta">
                  <span>{model.apiProviderLabel}</span>
                  <span>{getModelProviderLabel(getModelProviderKey(model.id))}</span>
                </div>
                <strong>{model.label}</strong>
                <small>{model.id}</small>
              </div>
              <div className="dd-admin-model-catalog-card__actions">
                <label className="dd-admin-model-catalog-card__radio">
                  <span>默认</span>
                  <input
                    type="radio"
                    name={`default-model-catalog-${model.apiProvider}`}
                    checked={defaultModels[model.apiProvider] === model.id}
                    onChange={() => onSetDefault(model.apiProvider, model.id)}
                  />
                </label>
                <label className="dd-admin-model-catalog-card__switch">
                  <span>{model.enabled ? '启用' : '关闭'}</span>
                  <AdminBaseSwitch
                    checked={model.enabled}
                    label={`${model.enabled ? '关闭' : '启用'} ${model.label}`}
                    onCheckedChange={(checked) => onToggle(model.apiProvider, model.id, checked)}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="dd-admin-empty-note">当前筛选条件下没有模型。</p>
      )}

      <div className="dd-admin-config-actions">
        <Button type="button" className="dd-button dd-button--primary" disabled={isSaving} onClick={onSave}>
          {isSaving ? '保存中...' : '保存配置'}
        </Button>
      </div>
    </section>
  )
}
