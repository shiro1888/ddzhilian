import { Button } from '@base-ui/react/button'
import type { AdminAiSettings } from '../../../lib/ddzhilian-types'
import { AdminConfigField } from './FormControls'

export function SystemPromptPanel({
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

