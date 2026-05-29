import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { useState } from 'react'
import type { AdminAnthropicConfig, AdminFeedbackProviderConfig } from '../../../lib/ddzhilian-types'
import type { AdminAnthropicDetectResult } from '../../../lib/use-admin'
import {
  ANTHROPIC_PRESET,
  createAnthropicFeedbackProvider,
  isHttpBaseUrl,
  labelFromOpenAiModelId,
  normalizeAnthropicBaseUrl,
} from './constants'
import type { AdminOpenAiCompatibleDetectedModel } from './constants'
import { AdminConfigField } from './FormControls'

type AnthropicJsonConfig = {
  ANTHROPIC_BASE_URL?: unknown
  ANTHROPIC_AUTH_TOKEN?: unknown
  ANTHROPIC_MODEL?: unknown
}

function normalizeJsonString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildAnthropicModels(
  modelId: string,
  detectedModels: AdminOpenAiCompatibleDetectedModel[],
) {
  if (detectedModels.length > 0) {
    return detectedModels.map((model) => ({
      id: model.id,
      label: model.label || labelFromOpenAiModelId(model.id),
      alias: '',
      enabled: model.id === modelId,
    }))
  }

  const label = detectedModels.find((model) => model.id === modelId)?.label ?? labelFromOpenAiModelId(modelId)
  return [{
    id: modelId,
    label,
    alias: '',
    enabled: true,
  }]
}

export function AnthropicPresetPanel({
  onDetectModels,
  onFeedbackProviderAdd,
}: {
  onDetectModels: (input: { baseUrl: string; authToken: string }) => Promise<AdminAnthropicDetectResult>
  onFeedbackProviderAdd: (provider: AdminFeedbackProviderConfig) => void
}) {
  const [draft, setDraft] = useState<AdminAnthropicConfig>(ANTHROPIC_PRESET)
  const [jsonDraft, setJsonDraft] = useState('')
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [detectedModels, setDetectedModels] = useState<AdminOpenAiCompatibleDetectedModel[]>([])
  const [isDetectingModels, setIsDetectingModels] = useState(false)

  const updateDraft = <Field extends keyof AdminAnthropicConfig>(field: Field, value: AdminAnthropicConfig[Field]) => {
    setDraft((previous) => ({
      ...previous,
      [field]: value,
    }))
    if (field === 'baseUrl' || field === 'authToken') {
      setDetectedModels([])
    }
    setMessage(null)
  }

  const importJson = () => {
    try {
      const payload = JSON.parse(jsonDraft) as AnthropicJsonConfig
      setDraft((previous) => ({
        ...previous,
        baseUrl: normalizeJsonString(payload.ANTHROPIC_BASE_URL) || previous.baseUrl,
        authToken: normalizeJsonString(payload.ANTHROPIC_AUTH_TOKEN) || previous.authToken,
        model: normalizeJsonString(payload.ANTHROPIC_MODEL) || previous.model,
      }))
      setDetectedModels([])
      setMessage({ tone: 'success', text: '已读取 Anthropic JSON 配置，请确认后增加配置。' })
    } catch {
      setMessage({ tone: 'error', text: 'Anthropic JSON 格式不正确。' })
    }
  }

  const detectModels = () => {
    const baseUrl = normalizeAnthropicBaseUrl(draft.baseUrl)
    const authToken = draft.authToken.trim()

    if (!baseUrl || !authToken) {
      setMessage({ tone: 'error', text: 'Base URL 和 Token 都需要填写后才能检测模型。' })
      return
    }

    if (!isHttpBaseUrl(baseUrl)) {
      setMessage({ tone: 'error', text: 'Base URL 需要是 http 或 https 地址。' })
      return
    }

    setIsDetectingModels(true)
    setMessage(null)

    void onDetectModels({ baseUrl, authToken })
      .then((result) => {
        const selectedModelId = result.selectedModelId ?? result.models[0]?.id ?? ''
        setDetectedModels(result.models)
        setDraft((previous) => ({
          ...previous,
          baseUrl: result.baseUrl,
          model: selectedModelId || previous.model,
        }))
        setMessage({ tone: 'success', text: `检测到 ${result.models.length.toString()} 个模型，可选择或继续手动填写模型名。` })
      })
      .catch((error) => {
        setDetectedModels([])
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : '模型检测失败。' })
      })
      .finally(() => {
        setIsDetectingModels(false)
      })
  }

  const addAnthropicConfig = () => {
    const baseUrl = normalizeAnthropicBaseUrl(draft.baseUrl)
    const authToken = draft.authToken.trim()
    const model = draft.model.trim()

    if (!baseUrl || !authToken || !model) {
      setMessage({ tone: 'error', text: 'Base URL、Token 和模型名都需要填写。' })
      return
    }

    if (!isHttpBaseUrl(baseUrl)) {
      setMessage({ tone: 'error', text: 'Base URL 需要是 http 或 https 地址。' })
      return
    }

    const anthropic = {
      ...draft,
      baseUrl,
      authToken,
      model,
      defaultSonnetModel: model,
      defaultOpusModel: model,
      defaultHaikuModel: model,
      models: buildAnthropicModels(model, detectedModels),
    }
    const displayName = labelFromOpenAiModelId(model) || 'Anthropic feedback'
    onFeedbackProviderAdd(createAnthropicFeedbackProvider({
      displayName,
      note: 'feedback',
      anthropic,
    }))
    setDraft((previous) => ({
      ...previous,
      baseUrl,
      authToken: '',
      model,
    }))
    setMessage({ tone: 'success', text: '已增加 Anthropic feedback 配置，点击保存配置后生效。' })
  }

  return (
    <section className="dd-admin-manual-api-card">
      <div className="dd-admin-card__head">
        <div>
          <p>Anthropic 接入</p>
          <h3>Anthropic feedback</h3>
          <span>只填写 Base URL、Token 和模型名；检测模型列表只是辅助。</span>
        </div>
      </div>
      <AdminConfigField label="JSON 配置" wide>
        <textarea
          value={jsonDraft}
          rows={6}
          onChange={(event) => {
            setJsonDraft(event.currentTarget.value)
            setMessage(null)
          }}
        />
      </AdminConfigField>
      <div className="dd-admin-manual-api-buttons">
        <Button type="button" className="dd-button dd-button--dark" onClick={importJson}>
          导入 JSON
        </Button>
      </div>
      <div className="dd-admin-config-form">
        <AdminConfigField label="Base URL" wide>
          <Input
            type="text"
            value={draft.baseUrl}
            placeholder="https://api.anthropic.com"
            onChange={(event) => updateDraft('baseUrl', event.currentTarget.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="Token" wide>
          <Input
            type="password"
            value={draft.authToken}
            onChange={(event) => updateDraft('authToken', event.currentTarget.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="模型名" wide>
          {detectedModels.length > 0 ? (
            <select
              value={draft.model}
              onChange={(event) => updateDraft('model', event.target.value)}
            >
              {detectedModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label === model.id ? model.id : `${model.label} (${model.id})`}
                </option>
              ))}
            </select>
          ) : (
            <Input
              type="text"
              value={draft.model}
              placeholder="claude-sonnet-4-5"
              onChange={(event) => updateDraft('model', event.currentTarget.value)}
            />
          )}
        </AdminConfigField>
      </div>
      <div className="dd-admin-manual-api-actions">
        {message ? (
          <p className={`dd-admin-manual-api-message is-${message.tone}`} aria-live="polite">
            {message.text}
          </p>
        ) : (
          <p className="dd-admin-manual-api-message">可直接手动填写模型名；检测模型列表不是必需步骤。</p>
        )}
        <div className="dd-admin-manual-api-buttons">
          <Button type="button" className="dd-button dd-button--dark" disabled={isDetectingModels} onClick={detectModels}>
            {isDetectingModels ? '检测中...' : '检测模型列表'}
          </Button>
          <Button type="button" className="dd-button dd-button--primary" onClick={addAnthropicConfig}>
            增加配置
          </Button>
        </div>
      </div>
    </section>
  )
}
