import { Button } from '@base-ui/react/button'
import type { AdminModelToggleItem } from '../../../lib/ddzhilian-types'
import { MODEL_PREVIEW_LIMIT } from './constants'
import { AdminBaseSwitch } from './FormControls'

export function ModelSwitchList({
  models,
  defaultModel,
  onToggle,
  onSetDefault,
  onOpenCatalog,
  onSave,
  isSaving,
}: {
  models: AdminModelToggleItem[]
  defaultModel: string
  onToggle: (id: string, enabled: boolean) => void
  onSetDefault: (id: string) => void
  onOpenCatalog: () => void
  onSave: () => void
  isSaving: boolean
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
      <div className="dd-admin-config-actions">
        <Button type="button" className="dd-button dd-button--primary" disabled={isSaving} onClick={onSave}>
          {isSaving ? '保存中...' : '保存配置'}
        </Button>
      </div>
    </section>
  )
}

