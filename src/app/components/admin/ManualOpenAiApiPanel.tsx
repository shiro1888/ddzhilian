import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { useState } from 'react'
import type { AdminFeedbackProviderConfig, AdminOpenAiReasoningEffort, AdminOpenRouterConfig } from '../../../lib/ddzhilian-types'
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
  const [draft, setDraft] = useState<ManualOpenAiApiDraft>(() => ({
    label: labelFromOpenAiModelId(settings.model),
    baseUrl: settings.baseUrl || OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER,
    wireApi: settings.wireApi ?? 'chat_completions',
    reasoningEffort: settings.reasoningEffort ?? '',
    apiKey: '',
    modelId: settings.model,
  }))
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
      setMessage({ tone: 'error', text: 'Base URL 和 API Key 都需要填写后才能检测模型。' })
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
      wireApi: draft.wireApi,
      reasoningEffort: draft.reasoningEffort,
    })
      .then((result) => {
        const selectedModelId = result.selectedModelId ?? result.models[0]?.id ?? ''
        const selectedModel = result.models.find((model) => model.id === selectedModelId)
        setDetectedModels(result.models)
        setDraft((previous) => ({
          ...previous,
          baseUrl: result.baseUrl,
          modelId: selectedModelId,
          label: selectedModel?.label ?? labelFromOpenAiModelId(selectedModelId),
        }))
        setMessage({ tone: 'success', text: `检测到 ${result.models.length.toString()} 个真实模型，请选择后增加配置。` })
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
    const label = detectedModel?.label ?? ''

    if (!baseUrl || !apiKey || !modelId) {
      setMessage({ tone: 'error', text: 'Base URL、API Key 和模型 ID 都需要填写。' })
      return
    }

    if (!detectedModel) {
      setMessage({ tone: 'error', text: '请先检测模型，并从检测返回的真实模型列表中选择。' })
      return
    }

    if (!isHttpBaseUrl(baseUrl)) {
      setMessage({ tone: 'error', text: 'Base URL 需要是 http 或 https 地址。' })
      return
    }

    const displayName = draft.label.trim() || label || 'feedback'
    onFeedbackProviderAdd(createOpenAiFeedbackProvider({
      displayName,
      note: 'feedback',
      openai: {
        ...settings,
        displayName,
        note: 'feedback',
        baseUrl,
        wireApi: draft.wireApi,
        reasoningEffort: draft.reasoningEffort,
        apiKey,
        model: modelId,
        models: upsertOpenAiCompatibleModel(
          detectedModels.map((model) => ({
            id: model.id,
            label: model.label,
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
      label,
    }))
    setMessage({ tone: 'success', text: '已增加 OpenAI 兼容接口配置，点击保存配置后生效。' })
  }

  return (
    <section className="dd-admin-manual-api-card">
      <div className="dd-admin-card__head">
        <div>
          <p>手动添加 API</p>
          <h3>OpenAI 兼容接口</h3>
          <span>填写 Base URL 和 API Key 后先检测模型，再从上游返回的真实模型列表中增加配置。</span>
        </div>
      </div>
      <div className="dd-admin-config-form">
        <AdminConfigField label="真实模型" wide>
          <select
            value={draft.modelId}
            disabled={detectedModels.length === 0}
            onChange={(event) => {
              const modelId = event.target.value
              const selectedModel = detectedModels.find((model) => model.id === modelId)
              setDraft((previous) => ({
                ...previous,
                modelId,
                label: selectedModel?.label ?? labelFromOpenAiModelId(modelId),
              }))
              setMessage(null)
            }}
          >
            {detectedModels.length > 0 ? (
              detectedModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label === model.id ? model.id : `${model.label} (${model.id})`}
                </option>
              ))
            ) : (
              <option value={draft.modelId}>先检测模型</option>
            )}
          </select>
        </AdminConfigField>
        <AdminConfigField label="接口类型">
          <select
            value={draft.wireApi}
            onChange={(event) => updateDraft('wireApi', event.target.value as AdminOpenRouterConfig['wireApi'])}
          >
            <option value="chat_completions">Chat Completions</option>
            <option value="responses">Responses</option>
          </select>
        </AdminConfigField>
        <AdminConfigField label="推理强度">
          <select
            value={draft.reasoningEffort}
            onChange={(event) => updateDraft('reasoningEffort', event.target.value as AdminOpenAiReasoningEffort)}
          >
            <option value="">不发送</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </AdminConfigField>
        <AdminConfigField label="Base URL" wide>
          <Input
            type="text"
            value={draft.baseUrl}
            placeholder={OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER}
            onChange={(event) => updateDraft('baseUrl', event.target.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="API Key" wide>
          <Input
            type="password"
            value={draft.apiKey}
            placeholder="sk-..."
            onChange={(event) => updateDraft('apiKey', event.target.value)}
          />
        </AdminConfigField>
      </div>
      <div className="dd-admin-manual-api-actions">
        {message ? (
          <p className={`dd-admin-manual-api-message is-${message.tone}`} aria-live="polite">
            {message.text}
          </p>
        ) : (
          <p className="dd-admin-manual-api-message">如果粘贴了完整 /chat/completions 地址，系统会自动截取到接口根路径。</p>
        )}
        <div className="dd-admin-manual-api-buttons">
          <Button type="button" className="dd-button dd-button--dark" disabled={isDetectingModels} onClick={detectModels}>
            {isDetectingModels ? '检测中...' : '检测模型'}
          </Button>
          <Button type="button" className="dd-button dd-button--primary" disabled={detectedModels.length === 0} onClick={addManualApi}>
            增加配置
          </Button>
        </div>
      </div>
    </section>
  )
}

