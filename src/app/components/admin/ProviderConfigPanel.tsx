import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { Tabs } from '@base-ui/react/tabs'
import { useState } from 'react'
import type {
  AdminAiSettings,
  AdminAnthropicConfig,
  AdminCloudflareConfig,
  AdminFeedbackProviderConfig,
  AdminOpenRouterConfig,
} from '../../../lib/ddzhilian-types'
import type {
  AdminAnthropicDetectInput,
  AdminAnthropicDetectResult,
  AdminOpenAiCompatibleDetectInput,
  AdminOpenAiCompatibleDetectResult,
} from '../../../lib/use-admin'
import {
  isHttpBaseUrl,
  isProviderConfigOption,
  labelFromOpenAiModelId,
  normalizeAnthropicBaseUrl,
  OPENAI_COMPATIBLE_PROVIDER_LABEL,
} from './constants'
import type { AdminOpenAiCompatibleDetectedModel, ProviderConfigOption } from './constants'
import { AdminConfigField } from './FormControls'
import { AnthropicPresetPanel } from './AnthropicPresetPanel'
import { ManualOpenAiApiPanel } from './ManualOpenAiApiPanel'
import { OpenAiProviderTemplatePanel } from './OpenAiProviderTemplatePanel'

function getFeedbackProviderDomId(providerId: string) {
  return providerId.replace(/[^a-z0-9_-]+/gi, '-')
}

type DetectMessage = {
  tone: 'success' | 'error'
  text: string
}

type AnthropicProviderDetectionState = {
  isDetecting: boolean
  models: AdminOpenAiCompatibleDetectedModel[]
  message: DetectMessage | null
}

function buildAnthropicModelList(
  modelId: string,
  detectedModels: AdminOpenAiCompatibleDetectedModel[],
) {
  if (detectedModels.length > 0) {
    return detectedModels.map((model) => ({
      id: model.id,
      label: model.label || labelFromOpenAiModelId(model.id),
      enabled: model.id === modelId,
    }))
  }

  return [{ id: modelId, label: labelFromOpenAiModelId(modelId), enabled: true }]
}

function withAnthropicModel(
  config: AdminAnthropicConfig,
  detectedModels: AdminOpenAiCompatibleDetectedModel[] = [],
) {
  const model = config.model.trim()
  if (!model) {
    return config
  }

  return {
    ...config,
    defaultSonnetModel: model,
    defaultOpusModel: model,
    defaultHaikuModel: model,
    models: buildAnthropicModelList(model, detectedModels),
  }
}

export function ProviderConfigPanel({
  settings,
  onCloudflareFieldChange,
  onOpenRouterFieldChange,
  onFeedbackProviderAdd,
  onFeedbackProviderChange,
  onFeedbackProviderDelete,
  onOpenRouterModelsDetect,
  onAnthropicModelsDetect,
  onProviderChange,
  onSave,
  isSaving,
}: {
  settings: AdminAiSettings
  onCloudflareFieldChange: <Field extends keyof AdminCloudflareConfig>(field: Field, value: AdminCloudflareConfig[Field]) => void
  onOpenRouterFieldChange: <Field extends keyof AdminOpenRouterConfig>(field: Field, value: AdminOpenRouterConfig[Field]) => void
  onFeedbackProviderAdd: (provider: AdminFeedbackProviderConfig) => void
  onFeedbackProviderChange: (providerId: string, provider: AdminFeedbackProviderConfig) => void
  onFeedbackProviderDelete: (providerId: string) => void
  onOpenRouterModelsDetect: (input: AdminOpenAiCompatibleDetectInput) => Promise<AdminOpenAiCompatibleDetectResult>
  onAnthropicModelsDetect: (input: AdminAnthropicDetectInput) => Promise<AdminAnthropicDetectResult>
  onProviderChange: (provider: AdminAiSettings['provider']) => void
  onSave: () => void
  isSaving: boolean
}) {
  const [activeOption, setActiveOption] = useState<ProviderConfigOption>('params')
  const [expandedProvider, setExpandedProvider] = useState<AdminAiSettings['provider'] | null>('openrouter')
  const [anthropicDetectionByProvider, setAnthropicDetectionByProvider] = useState<Record<string, AnthropicProviderDetectionState>>({})
  const isOpenRouter = settings.provider === 'openrouter'
  const isCloudflareExpanded = expandedProvider === 'cloudflare'
  const isOpenRouterExpanded = expandedProvider === 'openrouter'
  const enabledCloudflareModels = settings.cloudflare.models.filter((model) => model.enabled).length
  const openRouterDisplayName = settings.openrouter.displayName || OPENAI_COMPATIBLE_PROVIDER_LABEL
  const toggleProviderDetails = (provider: AdminAiSettings['provider']) => {
    setExpandedProvider((current) => current === provider ? null : provider)
  }
  const updateFeedbackOpenAiField = <Field extends keyof AdminOpenRouterConfig>(
    provider: AdminFeedbackProviderConfig,
    field: Field,
    value: AdminOpenRouterConfig[Field],
  ) => {
    if (!provider.openai) {
      return
    }

    const openai = {
      ...provider.openai,
      [field]: value,
    }

    onFeedbackProviderChange(provider.id, {
      ...provider,
      displayName: field === 'displayName' ? String(value).trim() || provider.displayName : provider.displayName,
      note: field === 'note' ? String(value).trim() : provider.note,
      openai,
    })
  }
  const updateFeedbackAnthropicField = <Field extends keyof AdminAnthropicConfig>(
    provider: AdminFeedbackProviderConfig,
    field: Field,
    value: AdminAnthropicConfig[Field],
  ) => {
    if (!provider.anthropic) {
      return
    }

    const nextAnthropic = {
      ...provider.anthropic,
      [field]: value,
    }
    const detectedModels = anthropicDetectionByProvider[provider.id]?.models ?? []
    const anthropic = field === 'model' ? withAnthropicModel(nextAnthropic, detectedModels) : nextAnthropic
    const nextDisplayName = field === 'model' && typeof value === 'string' && value.trim()
      ? labelFromOpenAiModelId(value.trim())
      : provider.displayName

    if (field === 'baseUrl' || field === 'authToken') {
      setAnthropicDetectionByProvider((previous) => ({
        ...previous,
        [provider.id]: {
          isDetecting: false,
          models: [],
          message: null,
        },
      }))
    }

    onFeedbackProviderChange(provider.id, {
      ...provider,
      displayName: nextDisplayName,
      anthropic,
    })
  }

  const detectFeedbackAnthropicModels = (provider: AdminFeedbackProviderConfig) => {
    if (!provider.anthropic) {
      return
    }

    const baseUrl = normalizeAnthropicBaseUrl(provider.anthropic.baseUrl)
    const authToken = provider.anthropic.authToken.trim()

    if (!baseUrl || !authToken) {
      setAnthropicDetectionByProvider((previous) => ({
        ...previous,
        [provider.id]: {
          isDetecting: false,
          models: [],
          message: { tone: 'error', text: 'Base URL 和 Token 都需要填写后才能检测模型。' },
        },
      }))
      return
    }

    if (!isHttpBaseUrl(baseUrl)) {
      setAnthropicDetectionByProvider((previous) => ({
        ...previous,
        [provider.id]: {
          isDetecting: false,
          models: [],
          message: { tone: 'error', text: 'Base URL 需要是 http 或 https 地址。' },
        },
      }))
      return
    }

    setAnthropicDetectionByProvider((previous) => ({
      ...previous,
      [provider.id]: {
        isDetecting: true,
        models: previous[provider.id]?.models ?? [],
        message: null,
      },
    }))

    void onAnthropicModelsDetect({ baseUrl, authToken, modelId: provider.anthropic.model.trim() || undefined })
      .then((result) => {
        const selectedModelId =
          result.models.find((model) => model.id === provider.anthropic?.model)?.id ||
          result.selectedModelId ||
          result.models[0]?.id ||
          provider.anthropic?.model ||
          ''
        const nextAnthropic = provider.anthropic
          ? withAnthropicModel({
              ...provider.anthropic,
              baseUrl: result.baseUrl,
              model: selectedModelId,
            }, result.models)
          : provider.anthropic

        setAnthropicDetectionByProvider((previous) => ({
          ...previous,
          [provider.id]: {
            isDetecting: false,
            models: result.models,
            message: { tone: 'success', text: `检测到 ${result.models.length.toString()} 个模型，可选择或继续手动填写模型名。` },
          },
        }))

        if (nextAnthropic) {
          onFeedbackProviderChange(provider.id, {
            ...provider,
            displayName: selectedModelId ? labelFromOpenAiModelId(selectedModelId) : provider.displayName,
            anthropic: nextAnthropic,
          })
        }
      })
      .catch((error) => {
        setAnthropicDetectionByProvider((previous) => ({
          ...previous,
          [provider.id]: {
            isDetecting: false,
            models: [],
            message: { tone: 'error', text: error instanceof Error ? error.message : '模型检测失败。' },
          },
        }))
      })
  }
  return (
    <section className="dd-admin-config-card dd-admin-provider-config-card">
      <div className="dd-admin-card__head">
        <div>
          <p>供应商配置</p>
          <h3>全部供应商</h3>
          <span>每条供应商配置独立列出，可直接修改字段后统一保存。</span>
        </div>
      </div>
      <Tabs.Root
        className="dd-admin-provider-config-options"
        value={activeOption}
        onValueChange={(value) => {
          if (isProviderConfigOption(value)) {
            setActiveOption(value)
          }
        }}
      >
        <Tabs.List className="dd-admin-provider-tabs dd-admin-provider-tabs--options" activateOnFocus>
          <Tabs.Tab value="params">配置列表</Tabs.Tab>
          <Tabs.Tab value="manual">手动 API</Tabs.Tab>
          <Tabs.Tab value="anthropic">Anthropic</Tabs.Tab>
          <Tabs.Indicator className="dd-admin-provider-tabs__indicator" />
        </Tabs.List>
        <Tabs.Panel className="dd-admin-provider-panel" value="params" keepMounted>
          <div className="dd-admin-provider-config-list">
            <article className={`dd-admin-provider-config-item dd-admin-provider-config-item--cloudflare${settings.provider === 'cloudflare' ? ' is-active' : ''}${isCloudflareExpanded ? ' is-expanded' : ''}`}>
              <div className="dd-admin-provider-config-item__head">
                <button
                  type="button"
                  className="dd-admin-provider-config-item__toggle"
                  aria-expanded={isCloudflareExpanded}
                  aria-controls="admin-provider-cloudflare-details"
                  onClick={() => toggleProviderDetails('cloudflare')}
                >
                  <span className="dd-admin-provider-config-item__kicker">供应商 02</span>
                  <strong>Cloudflare AI</strong>
                  <small>Cloudflare Workers AI 接入参数与额度保护。</small>
                  <span className="dd-admin-provider-config-item__expand">{isCloudflareExpanded ? '收起' : '展开'}</span>
                </button>
                <div className="dd-admin-provider-config-item__actions">
                  <span className={`dd-admin-status-dot ${settings.cloudflare.accountId && settings.cloudflare.apiToken ? 'is-green' : 'is-amber'}`}>
                    {settings.cloudflare.accountId && settings.cloudflare.apiToken ? '已配置' : '待配置'}
                  </span>
                  <Button
                    type="button"
                    className={settings.provider === 'cloudflare' ? 'dd-button dd-button--primary' : 'dd-button dd-button--dark'}
                    disabled={settings.provider === 'cloudflare'}
                    onClick={() => onProviderChange('cloudflare')}
                  >
                    {settings.provider === 'cloudflare' ? '当前使用' : '设为当前'}
                  </Button>
                </div>
              </div>
              {isCloudflareExpanded ? (
                <div id="admin-provider-cloudflare-details" className="dd-admin-provider-config-item__details">
                  <dl className="dd-admin-provider-config-meta">
                    <div>
                      <dt>默认模型</dt>
                      <dd>{settings.cloudflare.model || '未设置'}</dd>
                    </div>
                    <div>
                      <dt>启用模型</dt>
                      <dd>{enabledCloudflareModels.toString()}</dd>
                    </div>
                    <div>
                      <dt>额度保护</dt>
                      <dd>{settings.cloudflare.freeOnly ? '启用' : '关闭'}</dd>
                    </div>
                  </dl>
                  <div className="dd-admin-config-form">
                    <AdminConfigField label="Account ID">
                      <Input type="text" value={settings.cloudflare.accountId} onChange={(event) => onCloudflareFieldChange('accountId', event.currentTarget.value)} />
                    </AdminConfigField>
                    <AdminConfigField label="API Token">
                      <Input type="password" value={settings.cloudflare.apiToken} onChange={(event) => onCloudflareFieldChange('apiToken', event.currentTarget.value)} />
                    </AdminConfigField>
                    <AdminConfigField label="默认模型" wide>
                      <Input type="text" value={settings.cloudflare.model} onChange={(event) => onCloudflareFieldChange('model', event.currentTarget.value)} />
                    </AdminConfigField>
                    <AdminConfigField label="免费额度保护">
                      <select value={settings.cloudflare.freeOnly ? 'true' : 'false'} onChange={(event) => onCloudflareFieldChange('freeOnly', event.currentTarget.value === 'true')}>
                        <option value="true">启用</option>
                        <option value="false">关闭</option>
                      </select>
                    </AdminConfigField>
                    <AdminConfigField label="每日预算">
                      <Input type="number" min="0" value={settings.cloudflare.dailyNeuronBudget} onChange={(event) => onCloudflareFieldChange('dailyNeuronBudget', Number(event.currentTarget.value) || 0)} />
                    </AdminConfigField>
                    <AdminConfigField label="最大 Prompt 字符">
                      <Input type="number" min="1" value={settings.cloudflare.maxPromptChars} onChange={(event) => onCloudflareFieldChange('maxPromptChars', Number(event.currentTarget.value) || 1)} />
                    </AdminConfigField>
                    <AdminConfigField label="最大输出 Token">
                      <Input type="number" min="1" value={settings.cloudflare.maxOutputTokens} onChange={(event) => onCloudflareFieldChange('maxOutputTokens', Number(event.currentTarget.value) || 1)} />
                    </AdminConfigField>
                  </div>
                </div>
              ) : null}
            </article>

            <article className={`dd-admin-provider-config-item dd-admin-provider-config-item--openai${settings.provider === 'openrouter' ? ' is-active' : ''}${isOpenRouterExpanded ? ' is-expanded' : ''}`}>
              <div className="dd-admin-provider-config-item__head">
                <button
                  type="button"
                  className="dd-admin-provider-config-item__toggle"
                  aria-expanded={isOpenRouterExpanded}
                  aria-controls="admin-provider-openrouter-details"
                  onClick={() => toggleProviderDetails('openrouter')}
                >
                  <span className="dd-admin-provider-config-item__kicker">供应商 01</span>
                  <strong>{openRouterDisplayName}</strong>
                  <small>OpenRouter 或其他 OpenAI 兼容接口。</small>
                  <span className="dd-admin-provider-config-item__expand">{isOpenRouterExpanded ? '收起' : '展开'}</span>
                </button>
                <div className="dd-admin-provider-config-item__actions">
                  <span className={`dd-admin-status-dot ${settings.openrouter.apiKey ? 'is-green' : 'is-amber'}`}>
                    {settings.openrouter.apiKey ? '已配置' : '待配置'}
                  </span>
                  <Button
                    type="button"
                    className={isOpenRouter ? 'dd-button dd-button--primary' : 'dd-button dd-button--dark'}
                    disabled={isOpenRouter}
                    onClick={() => onProviderChange('openrouter')}
                  >
                    {isOpenRouter ? '当前使用' : '设为当前'}
                  </Button>
                </div>
              </div>
              {isOpenRouterExpanded ? (
                <div id="admin-provider-openrouter-details" className="dd-admin-provider-config-item__details">
                  <OpenAiProviderTemplatePanel
                    settings={settings.openrouter}
                    onDetectModels={onOpenRouterModelsDetect}
                    onProviderChange={onProviderChange}
                    onOpenRouterFieldChange={onOpenRouterFieldChange}
                  />
                </div>
              ) : null}
            </article>

            {settings.feedbackProviders.map((provider, index) => {
              const isExpanded = expandedProvider === provider.id
              const isActive = settings.provider === provider.id
              const detailsId = `admin-provider-${getFeedbackProviderDomId(provider.id)}-details`
              const isConfigured = Boolean(provider.openai?.apiKey || provider.anthropic?.authToken)
              const anthropicDetection = anthropicDetectionByProvider[provider.id] ?? {
                isDetecting: false,
                models: [],
                message: null,
              }

              return (
                <article
                  key={provider.id}
                  className={`dd-admin-provider-config-item dd-admin-provider-config-item--feedback${isActive ? ' is-active' : ''}${isExpanded ? ' is-expanded' : ''}`}
                >
                  <div className="dd-admin-provider-config-item__head">
                    <button
                      type="button"
                      className="dd-admin-provider-config-item__toggle"
                      aria-expanded={isExpanded}
                      aria-controls={detailsId}
                      onClick={() => toggleProviderDetails(provider.id)}
                    >
                      <span className="dd-admin-provider-config-item__kicker">feedback {String(index + 1).padStart(2, '0')}</span>
                      <strong>{provider.displayName || (provider.kind === 'anthropic' ? 'Anthropic feedback' : 'OpenAI feedback')}</strong>
                      <small>{provider.kind === 'anthropic' ? 'Anthropic Messages 协议配置。' : 'OpenAI 兼容接口 feedback 配置。'}</small>
                      <span className="dd-admin-provider-config-item__expand">{isExpanded ? '收起' : '展开'}</span>
                    </button>
                    <div className="dd-admin-provider-config-item__actions">
                      <span className={`dd-admin-status-dot ${isConfigured ? 'is-green' : 'is-amber'}`}>
                        {isConfigured ? '已配置' : '待配置'}
                      </span>
                      <Button
                        type="button"
                        className={isActive ? 'dd-button dd-button--primary' : 'dd-button dd-button--dark'}
                        disabled={isActive}
                        onClick={() => onProviderChange(provider.id)}
                      >
                        {isActive ? '当前使用' : '设为当前'}
                      </Button>
                      <Button
                        type="button"
                        className="dd-button dd-button--subtle"
                        onClick={() => onFeedbackProviderDelete(provider.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div id={detailsId} className="dd-admin-provider-config-item__details">
                      {provider.openai ? (
                        <OpenAiProviderTemplatePanel
                          settings={provider.openai}
                          onDetectModels={onOpenRouterModelsDetect}
                          providerId={provider.id}
                          activateProviderOnDetect={false}
                          onProviderChange={onProviderChange}
                          onOpenRouterFieldChange={(field, value) => updateFeedbackOpenAiField(provider, field, value)}
                        />
                      ) : null}

                      {provider.anthropic ? (
                        <section className="dd-admin-provider-template">
                          <div className="dd-admin-config-form">
                            <AdminConfigField label="Base URL" wide>
                              <Input
                                type="url"
                                value={provider.anthropic.baseUrl}
                                onChange={(event) => updateFeedbackAnthropicField(provider, 'baseUrl', event.currentTarget.value)}
                              />
                            </AdminConfigField>
                            <AdminConfigField label="Token" wide>
                              <Input
                                type="password"
                                value={provider.anthropic.authToken}
                                onChange={(event) => updateFeedbackAnthropicField(provider, 'authToken', event.currentTarget.value)}
                              />
                            </AdminConfigField>
                            <AdminConfigField label="模型名" wide>
                              {anthropicDetection.models.length > 0 ? (
                                <select
                                  value={provider.anthropic.model}
                                  onChange={(event) => updateFeedbackAnthropicField(provider, 'model', event.target.value)}
                                >
                                  {anthropicDetection.models.map((model) => (
                                    <option key={model.id} value={model.id}>
                                      {model.label === model.id ? model.id : `${model.label} (${model.id})`}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <Input
                                  type="text"
                                  value={provider.anthropic.model}
                                  onChange={(event) => updateFeedbackAnthropicField(provider, 'model', event.currentTarget.value)}
                                />
                              )}
                            </AdminConfigField>
                          </div>
                          {anthropicDetection.message ? (
                            <p className={`dd-admin-manual-api-message is-${anthropicDetection.message.tone}`} aria-live="polite">
                              {anthropicDetection.message.text}
                            </p>
                          ) : null}
                          <div className="dd-admin-manual-api-buttons">
                            <Button
                              type="button"
                              className="dd-button dd-button--dark"
                              disabled={anthropicDetection.isDetecting}
                              onClick={() => detectFeedbackAnthropicModels(provider)}
                            >
                              {anthropicDetection.isDetecting ? '检测中...' : '检测模型列表'}
                            </Button>
                          </div>
                        </section>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        </Tabs.Panel>
        <Tabs.Panel className="dd-admin-provider-panel" value="manual" keepMounted>
          <ManualOpenAiApiPanel
            settings={settings.openrouter}
            onDetectModels={onOpenRouterModelsDetect}
            onFeedbackProviderAdd={onFeedbackProviderAdd}
          />
        </Tabs.Panel>
        <Tabs.Panel className="dd-admin-provider-panel" value="anthropic" keepMounted>
          <AnthropicPresetPanel
            onDetectModels={onAnthropicModelsDetect}
            onFeedbackProviderAdd={onFeedbackProviderAdd}
          />
        </Tabs.Panel>
      </Tabs.Root>
      <div className="dd-admin-config-actions">
        <Button type="button" className="dd-button dd-button--dark">取消</Button>
        <Button type="button" className="dd-button dd-button--primary" onClick={onSave}>
          {isSaving ? '保存中...' : '保存配置'}
        </Button>
      </div>
    </section>
  )
}

