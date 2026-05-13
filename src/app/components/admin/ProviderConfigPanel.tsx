import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { Tabs } from '@base-ui/react/tabs'
import { useState } from 'react'
import type { AdminAiSettings, AdminCloudflareConfig, AdminOpenAiReasoningEffort, AdminOpenRouterConfig } from '../../../lib/ddzhilian-types'
import type { AdminOpenAiCompatibleDetectInput, AdminOpenAiCompatibleDetectResult } from '../../../lib/use-admin'
import { isProviderConfigOption, OPENAI_COMPATIBLE_PROVIDER_LABEL } from './constants'
import type { ProviderConfigOption } from './constants'
import { AdminConfigField } from './FormControls'
import { CliProxyApiPresetPanel } from './CliProxyApiPresetPanel'
import { ManualOpenAiApiPanel } from './ManualOpenAiApiPanel'

export function ProviderConfigPanel({
  settings,
  onCloudflareFieldChange,
  onOpenRouterFieldChange,
  onOpenRouterModelsDetect,
  onProviderChange,
  onSave,
  isSaving,
}: {
  settings: AdminAiSettings
  onCloudflareFieldChange: <Field extends keyof AdminCloudflareConfig>(field: Field, value: AdminCloudflareConfig[Field]) => void
  onOpenRouterFieldChange: <Field extends keyof AdminOpenRouterConfig>(field: Field, value: AdminOpenRouterConfig[Field]) => void
  onOpenRouterModelsDetect: (input: AdminOpenAiCompatibleDetectInput) => Promise<AdminOpenAiCompatibleDetectResult>
  onProviderChange: (provider: AdminAiSettings['provider']) => void
  onSave: () => void
  isSaving: boolean
}) {
  const [activeOption, setActiveOption] = useState<ProviderConfigOption>('params')
  const [expandedProvider, setExpandedProvider] = useState<AdminAiSettings['provider'] | null>(null)
  const isOpenRouter = settings.provider === 'openrouter'
  const isCloudflareExpanded = expandedProvider === 'cloudflare'
  const isOpenRouterExpanded = expandedProvider === 'openrouter'
  const enabledCloudflareModels = settings.cloudflare.models.filter((model) => model.enabled).length
  const enabledOpenRouterModels = settings.openrouter.models.filter((model) => model.enabled).length
  const toggleProviderDetails = (provider: AdminAiSettings['provider']) => {
    setExpandedProvider((current) => current === provider ? null : provider)
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
          <Tabs.Tab value="cliproxy">CLIProxyAPI</Tabs.Tab>
          <Tabs.Indicator className="dd-admin-provider-tabs__indicator" />
        </Tabs.List>
        <Tabs.Panel className="dd-admin-provider-panel" value="params" keepMounted>
          <div className="dd-admin-provider-config-list">
            <article className={`dd-admin-provider-config-item${settings.provider === 'cloudflare' ? ' is-active' : ''}${isCloudflareExpanded ? ' is-expanded' : ''}`}>
              <div className="dd-admin-provider-config-item__head">
                <button
                  type="button"
                  className="dd-admin-provider-config-item__toggle"
                  aria-expanded={isCloudflareExpanded}
                  aria-controls="admin-provider-cloudflare-details"
                  onClick={() => toggleProviderDetails('cloudflare')}
                >
                  <span className="dd-admin-provider-config-item__kicker">供应商 01</span>
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

            <article className={`dd-admin-provider-config-item${settings.provider === 'openrouter' ? ' is-active' : ''}${isOpenRouterExpanded ? ' is-expanded' : ''}`}>
              <div className="dd-admin-provider-config-item__head">
                <button
                  type="button"
                  className="dd-admin-provider-config-item__toggle"
                  aria-expanded={isOpenRouterExpanded}
                  aria-controls="admin-provider-openrouter-details"
                  onClick={() => toggleProviderDetails('openrouter')}
                >
                  <span className="dd-admin-provider-config-item__kicker">供应商 02</span>
                  <strong>{OPENAI_COMPATIBLE_PROVIDER_LABEL}</strong>
                  <small>OpenRouter、CLIProxyAPI 或其他 OpenAI 兼容接口。</small>
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
                  <dl className="dd-admin-provider-config-meta">
                    <div>
                      <dt>Base URL</dt>
                      <dd>{settings.openrouter.baseUrl || '未设置'}</dd>
                    </div>
                    <div>
                      <dt>接口类型</dt>
                      <dd>{settings.openrouter.wireApi === 'responses' ? 'Responses' : 'Chat Completions'}</dd>
                    </div>
                    <div>
                      <dt>启用模型</dt>
                      <dd>{enabledOpenRouterModels.toString()}</dd>
                    </div>
                  </dl>
                  <div className="dd-admin-config-form">
                    <AdminConfigField label="API Key">
                      <Input type="password" value={settings.openrouter.apiKey} onChange={(event) => onOpenRouterFieldChange('apiKey', event.currentTarget.value)} />
                    </AdminConfigField>
                    <AdminConfigField label="Base URL">
                      <Input type="text" value={settings.openrouter.baseUrl} onChange={(event) => onOpenRouterFieldChange('baseUrl', event.currentTarget.value)} />
                    </AdminConfigField>
                    <AdminConfigField label="接口类型">
                      <select value={settings.openrouter.wireApi} onChange={(event) => onOpenRouterFieldChange('wireApi', event.currentTarget.value as AdminOpenRouterConfig['wireApi'])}>
                        <option value="chat_completions">Chat Completions</option>
                        <option value="responses">Responses</option>
                      </select>
                    </AdminConfigField>
                    <AdminConfigField label="推理强度">
                      <select
                        value={settings.openrouter.reasoningEffort}
                        onChange={(event) => onOpenRouterFieldChange('reasoningEffort', event.currentTarget.value as AdminOpenAiReasoningEffort)}
                      >
                        <option value="">不发送</option>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </AdminConfigField>
                    <AdminConfigField label="站点 URL">
                      <Input type="text" value={settings.openrouter.siteUrl} onChange={(event) => onOpenRouterFieldChange('siteUrl', event.currentTarget.value)} />
                    </AdminConfigField>
                    <AdminConfigField label="站点名称">
                      <Input type="text" value={settings.openrouter.siteName} onChange={(event) => onOpenRouterFieldChange('siteName', event.currentTarget.value)} />
                    </AdminConfigField>
                    <AdminConfigField label="默认模型" wide>
                      <Input type="text" value={settings.openrouter.model} onChange={(event) => onOpenRouterFieldChange('model', event.currentTarget.value)} />
                    </AdminConfigField>
                    <AdminConfigField label="最大 Prompt 字符">
                      <Input type="number" min="1" value={settings.openrouter.maxPromptChars} onChange={(event) => onOpenRouterFieldChange('maxPromptChars', Number(event.currentTarget.value) || 1)} />
                    </AdminConfigField>
                    <AdminConfigField label="最大输出 Token">
                      <Input type="number" min="1" value={settings.openrouter.maxOutputTokens} onChange={(event) => onOpenRouterFieldChange('maxOutputTokens', Number(event.currentTarget.value) || 1)} />
                    </AdminConfigField>
                  </div>
                </div>
              ) : null}
            </article>
          </div>
        </Tabs.Panel>
        <Tabs.Panel className="dd-admin-provider-panel" value="manual" keepMounted>
          <ManualOpenAiApiPanel
            settings={settings.openrouter}
            onDetectModels={onOpenRouterModelsDetect}
            onProviderChange={onProviderChange}
            onOpenRouterFieldChange={onOpenRouterFieldChange}
          />
        </Tabs.Panel>
        <Tabs.Panel className="dd-admin-provider-panel" value="cliproxy" keepMounted>
          <CliProxyApiPresetPanel
            settings={settings.openrouter}
            onDetectModels={onOpenRouterModelsDetect}
            onProviderChange={onProviderChange}
            onOpenRouterFieldChange={onOpenRouterFieldChange}
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

