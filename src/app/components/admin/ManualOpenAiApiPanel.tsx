import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { useState } from 'react'
import type { AdminFeedbackProviderConfig, AdminOpenRouterConfig } from '../../../lib/ddzhilian-types'
import type { AdminOpenAiCompatibleDetectInput, AdminOpenAiCompatibleDetectResult } from '../../../lib/use-admin'
import {
  createOpenAiFeedbackProvider,
  isHttpBaseUrl,
  labelFromOpenAiModelId,
  normalizeOpenAiCompatibleBaseUrl,
  OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER,
  upsertOpenAiCompatibleModel,
} from './constants'
import type { AdminOpenAiCompatibleDetectedModel, ManualOpenAiApiDraft } from './constants'
import { AdminConfigField } from './FormControls'

export function ManualOpenAiApiPanel({
  settings,
  onDetectModels,
  onFeedbackProviderAdd,
}: {
  settings: AdminOpenRouterConfig
  onDetectModels: (input: AdminOpenAiCompatibleDetectInput) => Promise<AdminOpenAiCompatibleDetectResult>
  onFeedbackProviderAdd: (provider: AdminFeedbackProviderConfig) => void
}) {
  const [draft, setDraft] = useState<ManualOpenAiApiDraft>({
    baseUrl: '',
    apiKey: '',
    modelId: '',
  })
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [detectedModels, setDetectedModels] = useState<AdminOpenAiCompatibleDetectedModel[]>([])
  const [isDetectingModels, setIsDetectingModels] = useState(false)

  const updateDraft = (field: keyof ManualOpenAiApiDraft, value: string) => {
    setDraft((previous) => ({
      ...previous,
      [field]: value,
    }))
    if (field === 'baseUrl' || field === 'apiKey') {
      setDetectedModels([])
    }
    setMessage(null)
  }

  const detectModels = () => {
    const baseUrl = normalizeOpenAiCompatibleBaseUrl(draft.baseUrl)
    const apiKey = draft.apiKey.trim()

    if (!baseUrl || !apiKey) {
      setMessage({ tone: 'error', text: 'Base URL 和 Token 都需要填写后才能检测模型。' })
      return
    }

    if (!isHttpBaseUrl(baseUrl)) {
      setMessage({ tone: 'error', text: 'Base URL 需要是 http 或 https 地址。' })
      return
    }

    setIsDetectingModels(true)
    setMessage(null)

    void onDetectModels({
      baseUrl,
      apiKey,
      modelId: draft.modelId.trim() || undefined,
      wireApi: settings.wireApi,
      reasoningEffort: settings.reasoningEffort,
    })
      .then((result) => {
        const selectedModelId = result.selectedModelId ?? result.models[0]?.id ?? ''
        setDetectedModels(result.models)
        setDraft((previous) => ({
          ...previous,
          baseUrl: result.baseUrl,
          modelId: selectedModelId || previous.modelId,
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

  const addManualApi = () => {
    const baseUrl = normalizeOpenAiCompatibleBaseUrl(draft.baseUrl)
    const apiKey = draft.apiKey.trim()
    const modelId = draft.modelId.trim()
    const detectedModel = detectedModels.find((model) => model.id === modelId)
    const label = detectedModel?.label ?? labelFromOpenAiModelId(modelId)

    if (!baseUrl || !apiKey || !modelId) {
      setMessage({ tone: 'error', text: 'Base URL、Token 和模型名都需要填写。' })
      return
    }

    if (!isHttpBaseUrl(baseUrl)) {
      setMessage({ tone: 'error', text: 'Base URL 需要是 http 或 https 地址。' })
      return
    }

    const displayName = label || 'OpenAI feedback'
    onFeedbackProviderAdd(createOpenAiFeedbackProvider({
      displayName,
      note: 'feedback',
      openai: {
        ...settings,
        displayName,
        note: 'feedback',
        baseUrl,
        wireApi: settings.wireApi,
        reasoningEffort: settings.reasoningEffort,
        apiKey,
        model: modelId,
        models: upsertOpenAiCompatibleModel(
          detectedModels.map((model) => ({
            id: model.id,
            label: model.label,
            alias: '',
            enabled: model.id === modelId,
          })),
          modelId,
          label,
        ),
      },
    }))
    setDraft((previous) => ({
      ...previous,
      baseUrl,
      modelId,
    }))
    setMessage({ tone: 'success', text: '已增加 OpenAI 兼容接口配置，点击保存配置后生效。' })
  }

  return (
    <section className="dd-admin-manual-api-card">
      <div className="dd-admin-card__head">
        <div>
          <p>手动添加 API</p>
          <h3>OpenAI 兼容接口</h3>
          <span>只填写 Base URL、Token 和模型名；检测模型列表只是辅助。</span>
        </div>
      </div>
      <div className="dd-admin-config-form">
        <AdminConfigField label="Base URL" wide>
          <Input
            type="text"
            value={draft.baseUrl}
            placeholder={OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER}
            onChange={(event) => updateDraft('baseUrl', event.currentTarget.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="Token" wide>
          <Input
            type="password"
            value={draft.apiKey}
            placeholder="sk-..."
            onChange={(event) => updateDraft('apiKey', event.currentTarget.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="模型名" wide>
          {detectedModels.length > 0 ? (
            <select
              value={draft.modelId}
              onChange={(event) => updateDraft('modelId', event.target.value)}
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
              value={draft.modelId}
              placeholder="gpt-5.4"
              onChange={(event) => updateDraft('modelId', event.currentTarget.value)}
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
          <Button type="button" className="dd-button dd-button--primary" onClick={addManualApi}>
            增加配置
          </Button>
        </div>
      </div>
    </section>
  )
}
