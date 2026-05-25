import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { useState } from 'react'
import type { AdminFeedbackProviderConfig, AdminOpenAiReasoningEffort, AdminOpenRouterConfig } from '../../../lib/ddzhilian-types'
import type { AdminOpenAiCompatibleDetectInput, AdminOpenAiCompatibleDetectResult } from '../../../lib/use-admin'
import {
  CLIPROXYAPI_PRESET,
  createOpenAiFeedbackProvider,
  formatTomlString,
  isHttpBaseUrl,
  normalizeOpenAiCompatibleBaseUrl,
  upsertOpenAiCompatibleModel,
} from './constants'
import type { AdminOpenAiCompatibleDetectedModel, ManualOpenAiApiDraft } from './constants'
import { AdminConfigField } from './FormControls'

export function CliProxyApiPresetPanel({
  settings,
  onDetectModels,
  onFeedbackProviderAdd,
}: {
  settings: AdminOpenRouterConfig
  onDetectModels: (input: AdminOpenAiCompatibleDetectInput) => Promise<AdminOpenAiCompatibleDetectResult>
  onFeedbackProviderAdd: (provider: AdminFeedbackProviderConfig) => void
}) {
  const [draft, setDraft] = useState<ManualOpenAiApiDraft>(() => ({
    label: CLIPROXYAPI_PRESET.label,
    baseUrl: CLIPROXYAPI_PRESET.baseUrl,
    wireApi: CLIPROXYAPI_PRESET.wireApi,
    reasoningEffort: CLIPROXYAPI_PRESET.reasoningEffort,
    apiKey: CLIPROXYAPI_PRESET.apiKey,
    modelId: CLIPROXYAPI_PRESET.modelId,
  }))
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [detectedModels, setDetectedModels] = useState<AdminOpenAiCompatibleDetectedModel[]>([])
  const [isDetectingModels, setIsDetectingModels] = useState(false)
  const previewBaseUrl = normalizeOpenAiCompatibleBaseUrl(draft.baseUrl) || CLIPROXYAPI_PRESET.baseUrl
  const previewModel = draft.modelId.trim()
  const previewReasoningEffort = draft.reasoningEffort || CLIPROXYAPI_PRESET.reasoningEffort
  const previewApiKey = draft.apiKey.trim() || CLIPROXYAPI_PRESET.apiKey
  const configPreview = [
    '# approval_policy = "never"',
    '# sandbox_mode = "danger-full-access"',
    '',
    'model_provider = "cliproxyapi"',
    `model = "${formatTomlString(previewModel)}"`,
    `model_reasoning_effort = "${formatTomlString(previewReasoningEffort)}"`,
    '',
    '[model_providers.cliproxyapi]',
    'name = "cliproxyapi"',
    `base_url = "${formatTomlString(previewBaseUrl)}"`,
    `wire_api = "${formatTomlString(draft.wireApi)}"`,
  ].join('\n')
  const authPreview = JSON.stringify({ OPENAI_API_KEY: previewApiKey }, null, 2)

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
          label: selectedModel?.label ?? CLIPROXYAPI_PRESET.label,
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

  const applyPreset = () => {
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

    const displayName = 'CLIProxyAPI feedback'
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
      label,
      baseUrl,
      apiKey,
      modelId,
    }))
    setMessage({ tone: 'success', text: '已增加 CLIProxyAPI 配置，点击保存配置后生效。' })
  }

  return (
    <section className="dd-admin-manual-api-card dd-admin-cliproxy-card">
      <div className="dd-admin-card__head">
        <div>
          <p>Codex 接入</p>
          <h3>CLIProxyAPI</h3>
          <span>按 Codex CLI 的 `config.toml` 与 `auth.json` 口径编辑，检测真实模型后增加到当前网站的 OpenAI 兼容配置。</span>
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
                label: selectedModel?.label ?? CLIPROXYAPI_PRESET.label,
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
            <option value="responses">Responses</option>
            <option value="chat_completions">Chat Completions</option>
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
            onChange={(event) => updateDraft('baseUrl', event.target.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="API Key" wide>
          <Input
            type="password"
            value={draft.apiKey}
            onChange={(event) => updateDraft('apiKey', event.target.value)}
          />
        </AdminConfigField>
      </div>
      <div className="dd-admin-code-preview-grid">
        <div className="dd-admin-code-preview">
          <strong>config.toml</strong>
          <pre>{configPreview}</pre>
        </div>
        <div className="dd-admin-code-preview">
          <strong>auth.json</strong>
          <pre>{authPreview}</pre>
        </div>
      </div>
      <div className="dd-admin-manual-api-actions">
        {message ? (
          <p className={`dd-admin-manual-api-message is-${message.tone}`} aria-live="polite">
            {message.text}
          </p>
        ) : (
          <p className="dd-admin-manual-api-message">此模块不直接启动进程或写入服务器用户目录。</p>
        )}
        <div className="dd-admin-manual-api-buttons">
          <Button type="button" className="dd-button dd-button--dark" disabled={isDetectingModels} onClick={detectModels}>
            {isDetectingModels ? '检测中...' : '检测模型'}
          </Button>
          <Button type="button" className="dd-button dd-button--primary" disabled={detectedModels.length === 0} onClick={applyPreset}>
            增加配置
          </Button>
        </div>
      </div>
    </section>
  )
}

