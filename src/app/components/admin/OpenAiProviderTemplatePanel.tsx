import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { useState } from 'react'
import type {
  AdminAiSettings,
  AdminModelToggleItem,
  AdminOpenAiReasoningEffort,
  AdminOpenRouterConfig,
} from '../../../lib/ddzhilian-types'
import type {
  AdminOpenAiCompatibleDetectInput,
  AdminOpenAiCompatibleDetectResult,
  AdminOpenAiCompatibleRefreshResult,
} from '../../../lib/use-admin'
import {
  isHttpBaseUrl,
  normalizeOpenAiCompatibleBaseUrl,
  OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER,
} from './constants'
import type { AdminOpenAiCompatibleDetectedModel } from './constants'
import { AdminBaseSwitch, AdminConfigField } from './FormControls'

const DEFAULT_PROVIDER_HOMEPAGE_URL = 'https://openrouter.ai'

type DetectMessage = {
  tone: 'success' | 'error'
  text: string
}

function normalizeHomepageUrl(value: string) {
  return value.trim().replace(/\/+$/g, '')
}

function inferWireApiFromAddress(
  value: string,
  fallback: AdminOpenRouterConfig['wireApi'],
): AdminOpenRouterConfig['wireApi'] {
  const normalized = value.trim().replace(/\/+$/g, '').toLowerCase()

  if (normalized.endsWith('/responses')) {
    return 'responses'
  }

  if (normalized.endsWith('/chat/completions')) {
    return 'chat_completions'
  }

  return fallback
}

function formatEndpointUrl(settings: AdminOpenRouterConfig) {
  const baseUrl = normalizeOpenAiCompatibleBaseUrl(settings.baseUrl || OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER)

  if (!baseUrl) {
    return ''
  }

  return settings.wireApi === 'responses'
    ? `${baseUrl}/responses`
    : `${baseUrl}/chat/completions`
}

function mergeDetectedModels(
  currentModels: AdminModelToggleItem[],
  detectedModels: AdminOpenAiCompatibleDetectedModel[],
  defaultModelId: string,
) {
  const currentById = new Map(currentModels.map((model) => [model.id, model]))

  return detectedModels.map((detectedModel) => {
    const current = currentById.get(detectedModel.id)
    return {
      id: detectedModel.id,
      label: detectedModel.label || current?.label || detectedModel.id,
      enabled: detectedModel.id === defaultModelId ? true : current?.enabled ?? false,
    }
  })
}

export function OpenAiProviderTemplatePanel({
  settings,
  onDetectModels,
  onRefreshModels,
  onProviderChange,
  onOpenRouterFieldChange,
}: {
  settings: AdminOpenRouterConfig
  onDetectModels: (input: AdminOpenAiCompatibleDetectInput) => Promise<AdminOpenAiCompatibleDetectResult>
  onRefreshModels: () => Promise<AdminOpenAiCompatibleRefreshResult>
  onProviderChange: (provider: AdminAiSettings['provider']) => void
  onOpenRouterFieldChange: <Field extends keyof AdminOpenRouterConfig>(field: Field, value: AdminOpenRouterConfig[Field]) => void
}) {
  const [isFullEndpointMode, setIsFullEndpointMode] = useState(false)
  const [isDetectingModels, setIsDetectingModels] = useState(false)
  const [isRefreshingModels, setIsRefreshingModels] = useState(false)
  const [message, setMessage] = useState<DetectMessage | null>(null)
  const providerHomepageUrl = normalizeHomepageUrl(settings.homepageUrl) || DEFAULT_PROVIDER_HOMEPAGE_URL
  const apiAddressValue = isFullEndpointMode ? formatEndpointUrl(settings) : settings.baseUrl

  const updateApiAddress = (value: string) => {
    const nextWireApi = inferWireApiFromAddress(value, settings.wireApi)
    const nextBaseUrl = normalizeOpenAiCompatibleBaseUrl(value)

    if (nextWireApi !== settings.wireApi) {
      onOpenRouterFieldChange('wireApi', nextWireApi)
    }

    onOpenRouterFieldChange('baseUrl', nextBaseUrl)
    setMessage(null)
  }

  const detectModels = () => {
    const baseUrl = normalizeOpenAiCompatibleBaseUrl(settings.baseUrl)
    const apiKey = settings.apiKey.trim()

    if (!baseUrl || !apiKey) {
      setMessage({ tone: 'error', text: 'API 请求地址和 API Key 都需要填写后才能获取模型列表。' })
      return
    }

    if (!isHttpBaseUrl(baseUrl)) {
      setMessage({ tone: 'error', text: 'API 请求地址需要是 http 或 https 地址。' })
      return
    }

    onProviderChange('openrouter')
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

        onOpenRouterFieldChange('baseUrl', result.baseUrl)
        if (selectedModelId) {
          onOpenRouterFieldChange('model', selectedModelId)
        }
        onOpenRouterFieldChange('models', mergeDetectedModels(settings.models, result.models, selectedModelId))
        const failedCount = result.failedModelCount ?? 0
        setMessage({
          tone: 'success',
          text: failedCount > 0
            ? `已验证 ${result.models.length.toString()} 个可用模型，隐藏 ${failedCount.toString()} 个不可用模型，保存后生效。`
            : `已验证 ${result.models.length.toString()} 个可用模型，保存后生效。`,
        })
      })
      .catch((error) => {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : '模型列表获取失败。' })
      })
      .finally(() => {
        setIsDetectingModels(false)
      })
  }

  const refreshModels = () => {
    onProviderChange('openrouter')
    setIsRefreshingModels(true)
    setMessage(null)

    void onRefreshModels()
      .then((result) => {
        const failedCount = result.failedModelCount ?? 0
        setMessage({
          tone: 'success',
          text: failedCount > 0
            ? `已刷新 ${result.models.length.toString()} 个可用模型，隐藏 ${failedCount.toString()} 个不可用模型。`
            : `已刷新 ${result.models.length.toString()} 个可用模型。`,
        })
      })
      .catch((error) => {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : '模型列表刷新失败。' })
      })
      .finally(() => {
        setIsRefreshingModels(false)
      })
  }

  return (
    <section className="dd-admin-provider-template">
      <div className="dd-admin-provider-template__grid">
        <AdminConfigField label="供应商名称">
          <Input
            type="text"
            value={settings.displayName}
            placeholder="OpenRouter"
            onChange={(event) => onOpenRouterFieldChange('displayName', event.currentTarget.value)}
          />
        </AdminConfigField>
        <AdminConfigField label="备注">
          <Input
            type="text"
            value={settings.note}
            placeholder="例如：公司专用账号"
            onChange={(event) => onOpenRouterFieldChange('note', event.currentTarget.value)}
          />
        </AdminConfigField>
      </div>

      <AdminConfigField label="官网链接" wide>
        <Input
          type="url"
          value={settings.homepageUrl}
          placeholder={DEFAULT_PROVIDER_HOMEPAGE_URL}
          onChange={(event) => onOpenRouterFieldChange('homepageUrl', event.currentTarget.value)}
        />
      </AdminConfigField>

      <div className="dd-admin-provider-template__stack">
        <AdminConfigField label="API Key" wide>
          <Input
            type="password"
            value={settings.apiKey}
            placeholder="只需要填这里，保存配置后服务端会自动使用"
            onChange={(event) => onOpenRouterFieldChange('apiKey', event.currentTarget.value)}
          />
        </AdminConfigField>
        <a className="dd-admin-provider-template__link" href={providerHomepageUrl} target="_blank" rel="noreferrer">
          获取 API Key
        </a>
      </div>

      <div className="dd-admin-provider-template__address-head">
        <label className="dd-admin-config-label" htmlFor="admin-openai-api-address">API 请求地址</label>
        <div className="dd-admin-provider-template__address-actions">
          <span className="dd-admin-provider-template__switch-label">完整 URL</span>
          <AdminBaseSwitch
            checked={isFullEndpointMode}
            label="使用完整 API 请求 URL"
            onCheckedChange={setIsFullEndpointMode}
          />
          <Button
            type="button"
            className="dd-admin-link-button dd-admin-provider-template__test"
            disabled={isDetectingModels || isRefreshingModels}
            onClick={detectModels}
          >
            管理与测试
          </Button>
        </div>
      </div>
      <Input
        id="admin-openai-api-address"
        type="url"
        value={apiAddressValue}
        placeholder={OPENAI_COMPATIBLE_BASE_URL_PLACEHOLDER}
        onChange={(event) => updateApiAddress(event.currentTarget.value)}
      />
      <p className="dd-admin-provider-template__hint">
        填写兼容 OpenAI {settings.wireApi === 'responses' ? 'Responses' : 'Chat Completions'} 格式的服务端点地址
      </p>

      <div className="dd-admin-provider-template__model-head">
        <label className="dd-admin-config-label" htmlFor="admin-openai-model-name">模型名称</label>
        <div className="dd-admin-provider-template__model-actions">
          <Button
            type="button"
            className="dd-button dd-button--subtle dd-admin-provider-template__model-button"
            disabled={isDetectingModels || isRefreshingModels}
            onClick={detectModels}
          >
            {isDetectingModels ? '检测中...' : '检测可用模型'}
          </Button>
          <Button
            type="button"
            className="dd-button dd-button--dark dd-admin-provider-template__model-button"
            disabled={isDetectingModels || isRefreshingModels}
            onClick={refreshModels}
          >
            {isRefreshingModels ? '刷新中...' : '刷新模型列表'}
          </Button>
        </div>
      </div>
      <Input
        id="admin-openai-model-name"
        type="text"
        value={settings.model}
        placeholder="gpt-5.4"
        onChange={(event) => onOpenRouterFieldChange('model', event.currentTarget.value)}
      />

      {message ? (
        <p className={`dd-admin-manual-api-message is-${message.tone}`} aria-live="polite">
          {message.text}
        </p>
      ) : null}

      <details className="dd-admin-provider-template__advanced">
        <summary>高级参数</summary>
        <div className="dd-admin-provider-template__advanced-grid">
          <AdminConfigField label="接口类型">
            <select
              value={settings.wireApi}
              onChange={(event) => onOpenRouterFieldChange('wireApi', event.currentTarget.value as AdminOpenRouterConfig['wireApi'])}
            >
              <option value="chat_completions">Chat Completions</option>
              <option value="responses">Responses</option>
            </select>
          </AdminConfigField>
          <AdminConfigField label="推理强度">
            <select
              value={settings.reasoningEffort}
              onChange={(event) => onOpenRouterFieldChange('reasoningEffort', event.currentTarget.value as AdminOpenAiReasoningEffort)}
            >
              <option value="">不发送</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </AdminConfigField>
          <AdminConfigField label="站点 URL">
            <Input type="url" value={settings.siteUrl} onChange={(event) => onOpenRouterFieldChange('siteUrl', event.currentTarget.value)} />
          </AdminConfigField>
          <AdminConfigField label="站点名称">
            <Input type="text" value={settings.siteName} onChange={(event) => onOpenRouterFieldChange('siteName', event.currentTarget.value)} />
          </AdminConfigField>
          <AdminConfigField label="最大 Prompt 字符">
            <Input type="number" min="1" value={settings.maxPromptChars} onChange={(event) => onOpenRouterFieldChange('maxPromptChars', Number(event.currentTarget.value) || 1)} />
          </AdminConfigField>
          <AdminConfigField label="最大输出 Token">
            <Input type="number" min="1" value={settings.maxOutputTokens} onChange={(event) => onOpenRouterFieldChange('maxOutputTokens', Number(event.currentTarget.value) || 1)} />
          </AdminConfigField>
        </div>
      </details>
    </section>
  )
}
