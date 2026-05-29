import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { useState } from 'react'
import type {
  AdminAiSettings,
  AdminModelToggleItem,
  AdminOpenRouterConfig,
} from '../../../lib/ddzhilian-types'
import type {
  AdminOpenAiCompatibleDetectInput,
  AdminOpenAiCompatibleDetectResult,
} from '../../../lib/use-admin'
import {
  isHttpBaseUrl,
  normalizeOpenAiCompatibleBaseUrl,
  OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER,
} from './constants'
import type { AdminOpenAiCompatibleDetectedModel } from './constants'
import { AdminConfigField } from './FormControls'

type DetectMessage = {
  tone: 'success' | 'error'
  text: string
}

function mergeDetectedModels(
  currentModels: AdminModelToggleItem[],
  detectedModels: AdminOpenAiCompatibleDetectedModel[],
  selectedModelId: string,
) {
  const currentById = new Map(currentModels.map((model) => [model.id, model]))

  return detectedModels.map((detectedModel) => {
    const current = currentById.get(detectedModel.id)
    return {
      id: detectedModel.id,
      label: detectedModel.label || current?.label || detectedModel.id,
      alias: current?.alias ?? '',
      enabled: detectedModel.id === selectedModelId ? true : current?.enabled ?? false,
    }
  })
}

export function OpenAiProviderTemplatePanel({
  settings,
  onDetectModels,
  providerId = 'openrouter',
  activateProviderOnDetect = true,
  onProviderChange,
  onOpenRouterFieldChange,
}: {
  settings: AdminOpenRouterConfig
  onDetectModels: (input: AdminOpenAiCompatibleDetectInput) => Promise<AdminOpenAiCompatibleDetectResult>
  providerId?: AdminAiSettings['provider']
  activateProviderOnDetect?: boolean
  onProviderChange: (provider: AdminAiSettings['provider']) => void
  onOpenRouterFieldChange: <Field extends keyof AdminOpenRouterConfig>(field: Field, value: AdminOpenRouterConfig[Field]) => void
}) {
  const [isDetectingModels, setIsDetectingModels] = useState(false)
  const [message, setMessage] = useState<DetectMessage | null>(null)
  const [detectedModels, setDetectedModels] = useState<AdminOpenAiCompatibleDetectedModel[]>([])

  const updateBaseUrl = (value: string) => {
    onOpenRouterFieldChange('baseUrl', normalizeOpenAiCompatibleBaseUrl(value))
    setDetectedModels([])
    setMessage(null)
  }

  const updateToken = (value: string) => {
    onOpenRouterFieldChange('apiKey', value)
    setDetectedModels([])
    setMessage(null)
  }

  const updateModel = (modelId: string) => {
    onOpenRouterFieldChange('model', modelId)
    setMessage(null)
  }

  const detectModels = () => {
    const baseUrl = normalizeOpenAiCompatibleBaseUrl(settings.baseUrl)
    const apiKey = settings.apiKey.trim()

    if (!baseUrl || !apiKey) {
      setMessage({ tone: 'error', text: 'Base URL 和 Token 都需要填写后才能检测模型。' })
      return
    }

    if (!isHttpBaseUrl(baseUrl)) {
      setMessage({ tone: 'error', text: 'Base URL 需要是 http 或 https 地址。' })
      return
    }

    if (activateProviderOnDetect) {
      onProviderChange(providerId)
    }
    setIsDetectingModels(true)
    setMessage(null)

    void onDetectModels({
      baseUrl,
      apiKey,
      modelId: settings.model.trim() || undefined,
      wireApi: settings.wireApi,
      reasoningEffort: settings.reasoningEffort,
    })
      .then((result) => {
        const selectedModelId =
          result.models.find((model) => model.id === settings.model)?.id ||
          result.selectedModelId ||
          result.models[0]?.id ||
          ''

        setDetectedModels(result.models)
        onOpenRouterFieldChange('baseUrl', result.baseUrl)
        if (selectedModelId) {
          onOpenRouterFieldChange('model', selectedModelId)
        }
        onOpenRouterFieldChange('models', mergeDetectedModels(settings.models, result.models, selectedModelId))
        const failedCount = result.failedModelCount ?? 0
        setMessage({
          tone: 'success',
          text: failedCount > 0
            ? `已检测 ${result.models.length.toString()} 个可用模型，隐藏 ${failedCount.toString()} 个不可用模型。`
            : `已检测 ${result.models.length.toString()} 个模型。`,
        })
      })
      .catch((error) => {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : '模型列表获取失败。' })
      })
      .finally(() => {
        setIsDetectingModels(false)
      })
  }

  return (
    <section className="dd-admin-provider-template">
      <div className="dd-admin-config-form">
        <AdminConfigField label="Base URL" wide>
          <Input
            type="url"
            value={settings.baseUrl}
            placeholder={OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER}
            onChange={(event) => updateBaseUrl(event.currentTarget.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="Token" wide>
          <Input
            type="password"
            value={settings.apiKey}
            placeholder="sk-..."
            onChange={(event) => updateToken(event.currentTarget.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="模型名" wide>
          {detectedModels.length > 0 ? (
            <select value={settings.model} onChange={(event) => updateModel(event.target.value)}>
              {detectedModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label === model.id ? model.id : `${model.label} (${model.id})`}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id="admin-openai-model-name"
              type="text"
              value={settings.model}
              placeholder="gpt-5.4"
              onChange={(event) => updateModel(event.currentTarget.value)}
            />
          )}
        </AdminConfigField>
      </div>

      {message ? (
        <p className={`dd-admin-manual-api-message is-${message.tone}`} aria-live="polite">
          {message.text}
        </p>
      ) : null}

      <div className="dd-admin-manual-api-buttons">
        <Button
          type="button"
          className="dd-button dd-button--dark"
          disabled={isDetectingModels}
          onClick={detectModels}
        >
          {isDetectingModels ? '检测中...' : '检测模型列表'}
        </Button>
      </div>
    </section>
  )
}
