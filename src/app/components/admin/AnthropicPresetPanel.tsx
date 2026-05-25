import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { useState } from 'react'
import type { AdminAnthropicConfig, AdminFeedbackProviderConfig } from '../../../lib/ddzhilian-types'
import {
  ANTHROPIC_PRESET,
  createAnthropicFeedbackProvider,
  isHttpBaseUrl,
  labelFromOpenAiModelId,
} from './constants'
import { AdminConfigField } from './FormControls'

type AnthropicJsonConfig = {
  ANTHROPIC_BASE_URL?: unknown
  ANTHROPIC_AUTH_TOKEN?: unknown
  ANTHROPIC_MODEL?: unknown
  ANTHROPIC_DEFAULT_SONNET_MODEL?: unknown
  ANTHROPIC_DEFAULT_OPUS_MODEL?: unknown
  ANTHROPIC_DEFAULT_HAIKU_MODEL?: unknown
}

function normalizeJsonString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildAnthropicModels(draft: AdminAnthropicConfig) {
  const models = [
    draft.model,
    draft.defaultSonnetModel,
    draft.defaultOpusModel,
    draft.defaultHaikuModel,
  ].filter(Boolean)
  const uniqueModels = new Map<string, { id: string; label: string; enabled: boolean }>()

  for (const model of models) {
    uniqueModels.set(model, {
      id: model,
      label: labelFromOpenAiModelId(model),
      enabled: true,
    })
  }

  return [...uniqueModels.values()]
}

export function AnthropicPresetPanel({
  onFeedbackProviderAdd,
}: {
  onFeedbackProviderAdd: (provider: AdminFeedbackProviderConfig) => void
}) {
  const [draft, setDraft] = useState<AdminAnthropicConfig>(ANTHROPIC_PRESET)
  const [jsonDraft, setJsonDraft] = useState('')
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const updateDraft = <Field extends keyof AdminAnthropicConfig>(field: Field, value: AdminAnthropicConfig[Field]) => {
    setDraft((previous) => ({
      ...previous,
      [field]: value,
    }))
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
        defaultSonnetModel: normalizeJsonString(payload.ANTHROPIC_DEFAULT_SONNET_MODEL) || previous.defaultSonnetModel,
        defaultOpusModel: normalizeJsonString(payload.ANTHROPIC_DEFAULT_OPUS_MODEL) || previous.defaultOpusModel,
        defaultHaikuModel: normalizeJsonString(payload.ANTHROPIC_DEFAULT_HAIKU_MODEL) || previous.defaultHaikuModel,
      }))
      setMessage({ tone: 'success', text: '已读取 Anthropic JSON 配置，请确认后增加配置。' })
    } catch {
      setMessage({ tone: 'error', text: 'Anthropic JSON 格式不正确。' })
    }
  }

  const addAnthropicConfig = () => {
    const baseUrl = draft.baseUrl.trim().replace(/\/+$/g, '')
    const authToken = draft.authToken.trim()
    const model = draft.model.trim()

    if (!baseUrl || !authToken || !model) {
      setMessage({ tone: 'error', text: 'Base URL、Auth Token 和默认模型都需要填写。' })
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
      defaultSonnetModel: draft.defaultSonnetModel.trim() || model,
      defaultOpusModel: draft.defaultOpusModel.trim() || model,
      defaultHaikuModel: draft.defaultHaikuModel.trim() || model,
    }
    onFeedbackProviderAdd(createAnthropicFeedbackProvider({
      displayName: 'Anthropic feedback',
      note: 'feedback',
      anthropic: {
        ...anthropic,
        models: buildAnthropicModels(anthropic),
      },
    }))
    setDraft((previous) => ({
      ...previous,
      authToken: '',
    }))
    setMessage({ tone: 'success', text: '已增加 Anthropic feedback 配置，点击保存配置后生效。' })
  }

  return (
    <section className="dd-admin-manual-api-card">
      <div className="dd-admin-card__head">
        <div>
          <p>Anthropic 接入</p>
          <h3>Anthropic feedback</h3>
          <span>独立追加 Anthropic 协议配置，不覆盖现有 shiro 或 Cloudflare AI。</span>
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
          <Input type="text" value={draft.baseUrl} onChange={(event) => updateDraft('baseUrl', event.currentTarget.value)} />
        </AdminConfigField>
        <AdminConfigField label="Auth Token" wide>
          <Input type="password" value={draft.authToken} onChange={(event) => updateDraft('authToken', event.currentTarget.value)} />
        </AdminConfigField>
        <AdminConfigField label="默认模型">
          <Input type="text" value={draft.model} onChange={(event) => updateDraft('model', event.currentTarget.value)} />
        </AdminConfigField>
        <AdminConfigField label="Sonnet 默认">
          <Input type="text" value={draft.defaultSonnetModel} onChange={(event) => updateDraft('defaultSonnetModel', event.currentTarget.value)} />
        </AdminConfigField>
        <AdminConfigField label="Opus 默认">
          <Input type="text" value={draft.defaultOpusModel} onChange={(event) => updateDraft('defaultOpusModel', event.currentTarget.value)} />
        </AdminConfigField>
        <AdminConfigField label="Haiku 默认">
          <Input type="text" value={draft.defaultHaikuModel} onChange={(event) => updateDraft('defaultHaikuModel', event.currentTarget.value)} />
        </AdminConfigField>
        <AdminConfigField label="最大 Prompt 字符">
          <Input type="number" min="1" value={draft.maxPromptChars} onChange={(event) => updateDraft('maxPromptChars', Number(event.currentTarget.value) || 1)} />
        </AdminConfigField>
        <AdminConfigField label="最大输出 Token">
          <Input type="number" min="1" value={draft.maxOutputTokens} onChange={(event) => updateDraft('maxOutputTokens', Number(event.currentTarget.value) || 1)} />
        </AdminConfigField>
      </div>
      <div className="dd-admin-manual-api-actions">
        {message ? (
          <p className={`dd-admin-manual-api-message is-${message.tone}`} aria-live="polite">
            {message.text}
          </p>
        ) : (
          <p className="dd-admin-manual-api-message">保存前只写入当前后台草稿，不会改动服务器用户目录。</p>
        )}
        <div className="dd-admin-manual-api-buttons">
          <Button type="button" className="dd-button dd-button--primary" onClick={addAnthropicConfig}>
            增加配置
          </Button>
        </div>
      </div>
    </section>
  )
}
