'use client'

import { useState, type ChangeEvent, type ComponentType, type ReactNode } from 'react'
import {
  Bot,
  KeyRound,
  Plus,
  SearchCheck,
  Trash2,
} from 'lucide-react'
import type {
  AdminAiSettings,
  AdminAnthropicConfig,
  AdminModelToggleItem,
  AdminOpenRouterConfig,
} from '@/lib/ddzhilian-types'
import type {
  AdminAnthropicDetectResult,
  AdminOpenAiCompatibleDetectInput,
  AdminOpenAiCompatibleDetectResult,
} from '@/admin-v2/api'
import {
  addAdminAnthropicConfig,
  addAdminOpenAiConfig,
  applyAnthropicDetectionToAdminSettings,
  applyOpenAiDetectionToAdminSettings,
  removeAdminAnthropicConfig,
  removeAdminOpenAiConfig,
  updateAdminAnthropicField,
  updateAdminOpenAiField,
} from '@/admin-v2/ai-draft'
import {
  ANTHROPIC_PRESET,
  createAnthropicProviderConfig,
  createOpenAiProviderConfig,
  labelFromOpenAiModelId,
} from '@/app/components/admin/constants'
import { adminSelectClassName, formatInteger, normalizeNonNegativeInteger } from '@/admin-v2/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type ProviderDetailKey = string

type DetectionState = {
  tone: 'success' | 'error'
  message: string
  result: AdminOpenAiCompatibleDetectResult | null
} | null

type ProviderWorkspaceProps = {
  aiDraft: AdminAiSettings
  savedSettings: AdminAiSettings
  canEdit: boolean
  isSaving: boolean
  hasUnsavedChanges: boolean
  error: string | null
  onClearError: () => void
  onChange: (updater: (current: AdminAiSettings) => AdminAiSettings) => void
  onAutosave: (draftOverride?: AdminAiSettings, options?: { showSuccessToast?: boolean }) => Promise<boolean>
  onDetectAnthropicModels: (input: { baseUrl: string; authToken: string }) => Promise<AdminAnthropicDetectResult>
  onDetectOpenAiCompatibleModels: (input: AdminOpenAiCompatibleDetectInput) => Promise<AdminOpenAiCompatibleDetectResult>
}

function upsertModelInList(models: AdminModelToggleItem[], modelId: string): AdminModelToggleItem[] {
  if (!modelId.trim()) return models
  const exists = models.some((m) => m.id === modelId)
  if (exists) return models.map((m) => (m.id === modelId ? { ...m, enabled: true } : m))
  return [...models, { id: modelId, label: labelFromOpenAiModelId(modelId), alias: '', enabled: true }]
}

function buildConfiguredLabel(isConfigured: boolean) {
  return isConfigured ? '已配置' : '待配置'
}

function providerConfigured(settings: Pick<AdminOpenRouterConfig, 'baseUrl' | 'apiKey'>) {
  return Boolean(settings.baseUrl.trim() && settings.apiKey.trim())
}

function AutoSaveStatus({
  isSaving,
  hasUnsavedChanges,
  error,
}: Readonly<{
  isSaving: boolean
  hasUnsavedChanges: boolean
  error: string | null
}>) {
  if (error) {
    return <Badge variant="destructive">{error}</Badge>
  }

  if (isSaving) {
    return <Badge variant="outline">自动保存中</Badge>
  }

  if (hasUnsavedChanges) {
    return <Badge variant="outline">存在未保存更改</Badge>
  }

  return <Badge variant="secondary">已保存</Badge>
}

function NavItemButton({
  active,
  title,
  description,
  icon,
  children,
  onClick,
}: Readonly<{
  active: boolean
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  children?: ReactNode
  onClick: () => void
}>) {
  const Icon = icon

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
        active
          ? 'border-primary bg-primary/5 text-foreground'
          : 'border-border bg-background text-foreground hover:bg-muted/50',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className={cn('rounded-lg p-2', active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </button>
  )
}

function DetailSection({
  title,
  description,
  status,
  children,
}: Readonly<{
  title: string
  description: string
  status?: ReactNode
  children: ReactNode
}>) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {status}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  )
}

function Field({
  label,
  description,
  children,
}: Readonly<{
  label: string
  description?: string
  children: ReactNode
}>) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
    </label>
  )
}

function AutoSaveTextField({
  label,
  value,
  type = 'text',
  disabled,
  description,
  onChange,
  onClearError,
  multiline = false,
}: Readonly<{
  label: string
  value: string
  type?: 'text' | 'url' | 'password'
  disabled: boolean
  description?: string
  onChange: (value: string) => void
  onClearError: () => void
  multiline?: boolean
}>) {
  const sharedProps = {
    disabled,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onClearError()
      onChange(event.target.value)
    },
  }

  return (
    <Field label={label} description={description}>
      {multiline ? (
        <Textarea className="min-h-28" {...sharedProps} />
      ) : (
        <Input type={type} {...sharedProps} />
      )}
    </Field>
  )
}

function AutoSaveNumberField({
  label,
  value,
  savedValue,
  min,
  disabled,
  description,
  onCommit,
  onClearError,
}: Readonly<{
  label: string
  value: number
  savedValue: number
  min: number
  disabled: boolean
  description?: string
  onCommit: (value: number) => void
  onClearError: () => void
}>) {
  const [draft, setDraft] = useState(String(value))
  const [localError, setLocalError] = useState<string | null>(null)

  useState(() => {
    setDraft(String(value))
  })

  return (
    <Field label={label} description={description}>
      <Input
        type="number"
        min={String(min)}
        value={draft}
        disabled={disabled}
        aria-invalid={Boolean(localError)}
        onChange={(event) => {
          onClearError()
          setLocalError(null)
          setDraft(event.target.value)
        }}
        onBlur={() => {
          if (draft === String(savedValue)) {
            return
          }

          const parsed = normalizeNonNegativeInteger(draft)
          if (parsed === null || parsed < min) {
            setLocalError(`请输入不小于 ${String(min)} 的整数。`)
            return
          }

          onCommit(parsed)
        }}
      />
      {localError ? <span className="text-xs text-destructive">{localError}</span> : null}
    </Field>
  )
}

function OpenAiCompatiblePanel({
  configIndex,
  aiDraft,
  savedSettings,
  disabled,
  onClearError,
  detectionState,
  onDetect,
  onChangeField,
  onAutoSave,
  onDelete,
}: Readonly<{
  configIndex: number
  aiDraft: AdminAiSettings
  savedSettings: AdminAiSettings
  disabled: boolean
  onClearError: () => void
  detectionState: DetectionState
  onDetect: () => void
  onChangeField: <Field extends keyof AdminOpenRouterConfig>(field: Field, value: AdminOpenRouterConfig[Field]) => void
  onAutoSave: (showSuccessToast?: boolean) => void
  onDelete: () => void
}>) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const config = aiDraft.openai[configIndex]
  if (!config) {
    return null
  }
  const savedConfig = savedSettings.openai[configIndex] ?? config
  const configured = providerConfigured(config)

  return (
    <DetailSection
      title={config.displayName || 'OpenAI Compatible'}
      description="高频区只保留连接与鉴权，模型启用和默认值只读展示。"
      status={(
        <div className="flex gap-2">
          <Badge variant={configured ? 'secondary' : 'outline'}>{buildConfiguredLabel(configured)}</Badge>
          <Badge variant="outline">模型 {formatInteger(savedConfig.models.length)}</Badge>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onAutoSave()}>
            保存配置
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={onDelete}>
            <Trash2 className="size-3" />
            删除
          </Button>
        </div>
      )}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <AutoSaveTextField
          label="显示名称"
          value={config.displayName}
          disabled={disabled}
          onChange={(value) => onChangeField('displayName', value)}
          onClearError={onClearError}
        />
        <AutoSaveTextField
          label="Base URL"
          type="url"
          value={config.baseUrl}
          disabled={disabled}
          onChange={(value) => onChangeField('baseUrl', value)}
          onClearError={onClearError}
        />
        <AutoSaveTextField
          label="API Key"
          type="password"
          value={config.apiKey}
          disabled={disabled}
          onChange={(value) => onChangeField('apiKey', value)}
          onClearError={onClearError}
        />
        <div className="lg:col-span-2">
          <Field label="模型名称">
            <div className="flex gap-2">
              <div className="flex-1">
                {(detectionState?.result?.models.length ?? savedConfig.models.length) > 0 ? (
                  <select
                    className={adminSelectClassName}
                    value={config.model}
                    disabled={disabled}
                    onChange={(event) => {
                      onClearError()
                      const modelId = event.target.value
                      onChangeField('model', modelId)
                      onChangeField('models', upsertModelInList(config.models, modelId))
                    }}
                  >
                    {(detectionState?.result?.models.length ?? 0) > 0
                      ? detectionState!.result!.models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.label === model.id ? model.id : `${model.label} (${model.id})`}
                          </option>
                        ))
                      : savedConfig.models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.label === model.id ? model.id : `${model.label} (${model.id})`}
                          </option>
                        ))}
                  </select>
                ) : (
                  <Input
                    type="text"
                    value={config.model}
                    disabled={disabled}
                    placeholder="gpt-4o"
                    onChange={(event) => {
                      onClearError()
                      const modelId = event.target.value
                      onChangeField('model', modelId)
                      if (modelId.trim()) {
                        onChangeField('models', upsertModelInList(config.models, modelId.trim()))
                      }
                    }}
                  />
                )}
              </div>
              <Button type="button" variant="outline" disabled={disabled} onClick={onDetect}>
                <SearchCheck className="size-4" />
                获取模型
              </Button>
            </div>
          </Field>
        </div>
      </div>

      {detectionState ? (
        <div className={cn(
          'rounded-xl border px-4 py-3 text-sm',
          detectionState.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-destructive/20 bg-destructive/5 text-destructive',
        )}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <p>{detectionState.message}</p>
            </div>
          </div>
        </div>
      ) : null}

      <details
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="rounded-xl border border-border bg-background"
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
          高级设置
        </summary>
        <div className="grid gap-4 border-t border-border px-4 py-4 lg:grid-cols-2">
          <Field label="Wire API">
            <select
              className={adminSelectClassName}
              value={config.wireApi}
              disabled={disabled}
              onChange={(event) => {
                onClearError()
                onChangeField('wireApi', event.target.value as AdminOpenRouterConfig['wireApi'])
              }}
            >
              <option value="responses">responses</option>
              <option value="chat_completions">chat_completions</option>
            </select>
          </Field>
          <Field label="Reasoning Effort">
            <select
              className={adminSelectClassName}
              value={config.reasoningEffort}
              disabled={disabled}
              onChange={(event) => {
                onClearError()
                onChangeField('reasoningEffort', event.target.value as AdminOpenRouterConfig['reasoningEffort'])
              }}
            >
              <option value="">默认</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </Field>
          <AutoSaveTextField
            label="主页链接"
            type="url"
            value={config.homepageUrl}
            disabled={disabled}
            onChange={(value) => onChangeField('homepageUrl', value)}
            onClearError={onClearError}
          />
          <AutoSaveTextField
            label="备注"
            value={config.note}
            disabled={disabled}
            onChange={(value) => onChangeField('note', value)}
            onClearError={onClearError}
            multiline
          />
          <AutoSaveNumberField
            label="最大 Prompt 字符"
            value={config.maxPromptChars}
            savedValue={savedConfig.maxPromptChars}
            min={1}
            disabled={disabled}
            onCommit={(value) => {
              onChangeField('maxPromptChars', value)
            }}
            onClearError={onClearError}
          />
          <AutoSaveNumberField
            label="最大输出 Token"
            value={config.maxOutputTokens}
            savedValue={savedConfig.maxOutputTokens}
            min={1}
            disabled={disabled}
            onCommit={(value) => {
              onChangeField('maxOutputTokens', value)
            }}
            onClearError={onClearError}
          />
        </div>
      </details>
    </DetailSection>
  )
}

function AnthropicPanel({
  configIndex,
  aiDraft,
  savedSettings,
  disabled,
  onClearError,
  onChangeField,
  onDelete,
  onAutoSave,
  onDetectAnthropicModels,
  onApplyDetection,
}: Readonly<{
  configIndex: number
  aiDraft: AdminAiSettings
  savedSettings: AdminAiSettings
  disabled: boolean
  onClearError: () => void
  onChangeField: <Field extends keyof AdminAnthropicConfig>(field: Field, value: AdminAnthropicConfig[Field]) => void
  onDelete: () => void
  onAutoSave: () => void
  onDetectAnthropicModels: (input: { baseUrl: string; authToken: string }) => Promise<AdminAnthropicDetectResult>
  onApplyDetection: (result: AdminAnthropicDetectResult) => void
}>) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [anthropicMessage, setAnthropicMessage] = useState<string | null>(null)
  const [detectedModels, setDetectedModels] = useState<Array<{ id: string; label: string }>>([])
  const config = aiDraft.anthropic[configIndex]
  if (!config) {
    return null
  }
  const savedConfig = savedSettings.anthropic[configIndex] ?? config
  const configured = Boolean(config.baseUrl.trim() && config.authToken.trim())

  return (
    <DetailSection
      title={`Anthropic ${configIndex + 1}`}
      description="Anthropic Messages 协议配置。"
      status={(
        <div className="flex gap-2">
          <Badge variant={configured ? 'secondary' : 'outline'}>{buildConfiguredLabel(configured)}</Badge>
          <Badge variant="outline">模型 {formatInteger(savedConfig.models.length)}</Badge>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onAutoSave()}>
            保存配置
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={onDelete}>
            <Trash2 className="size-3" />
            删除
          </Button>
        </div>
      )}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <AutoSaveTextField
          label="Base URL"
          type="url"
          value={config.baseUrl}
          disabled={disabled}
          onChange={(value) => onChangeField('baseUrl', value)}
          onClearError={onClearError}
        />
        <AutoSaveTextField
          label="Token"
          type="password"
          value={config.authToken}
          disabled={disabled}
          onChange={(value) => onChangeField('authToken', value)}
          onClearError={onClearError}
        />
        <div className="lg:col-span-2">
          <Field label="模型名称">
            <div className="flex gap-2">
              <div className="flex-1">
                {detectedModels.length > 0 || savedConfig.models.length > 0 ? (
                  <select
                    className={adminSelectClassName}
                    value={config.model}
                    disabled={disabled}
                    onChange={(event) => {
                      onClearError()
                      const modelId = event.target.value
                      onChangeField('model', modelId)
                      onChangeField('models', upsertModelInList(config.models, modelId))
                    }}
                  >
                    {(detectedModels.length > 0 ? detectedModels : savedConfig.models).map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label === model.id ? model.id : `${model.label} (${model.id})`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type="text"
                    value={config.model}
                    disabled={disabled}
                    placeholder="claude-sonnet-4-5"
                    onChange={(event) => {
                      onClearError()
                      const modelId = event.target.value
                      onChangeField('model', modelId)
                      if (modelId.trim()) {
                        onChangeField('models', upsertModelInList(config.models, modelId.trim()))
                      }
                    }}
                  />
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  onClearError()
                  setAnthropicMessage(null)
                  void onDetectAnthropicModels({
                    baseUrl: config.baseUrl,
                    authToken: config.authToken,
                  })
                    .then((result) => {
                      setDetectedModels(result.models.map((m) => ({ id: m.id, label: m.label || m.id })))
                      setAnthropicMessage(`已检测到 ${formatInteger(result.models.length)} 个模型，可从下拉中选择。`)
                      onApplyDetection(result)
                    })
                    .catch((nextError) => {
                      setDetectedModels([])
                      setAnthropicMessage(nextError instanceof Error ? nextError.message : '模型检测失败。')
                    })
                }}
              >
                <SearchCheck className="size-4" />
                获取模型
              </Button>
            </div>
          </Field>
        </div>
      </div>

      {anthropicMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {anthropicMessage}
        </div>
      ) : null}

      <details
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="rounded-xl border border-border bg-background"
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
          高级设置
        </summary>
        <div className="grid gap-4 border-t border-border px-4 py-4 lg:grid-cols-2">
          <AutoSaveNumberField
            label="最大 Prompt 字符"
            value={config.maxPromptChars}
            savedValue={savedConfig.maxPromptChars}
            min={1}
            disabled={disabled}
            onCommit={(value) => {
              onChangeField('maxPromptChars', value)
            }}
            onClearError={onClearError}
          />
          <AutoSaveNumberField
            label="最大输出 Token"
            value={config.maxOutputTokens}
            savedValue={savedConfig.maxOutputTokens}
            min={1}
            disabled={disabled}
            onCommit={(value) => {
              onChangeField('maxOutputTokens', value)
            }}
            onClearError={onClearError}
          />
        </div>
      </details>
    </DetailSection>
  )
}

function getFirstProviderDetailKey(settings: AdminAiSettings): ProviderDetailKey {
  if (settings.openai.length > 0) {
    return 'openai:0'
  }

  if (settings.anthropic.length > 0) {
    return 'anthropic:0'
  }

  return ''
}

export function AdminV2ProvidersWorkspace({
  aiDraft,
  savedSettings,
  canEdit,
  isSaving,
  hasUnsavedChanges,
  error,
  onClearError,
  onChange,
  onAutosave,
  onDetectAnthropicModels,
  onDetectOpenAiCompatibleModels,
}: ProviderWorkspaceProps) {
  const [selectedDetail, setSelectedDetail] = useState<ProviderDetailKey>(() => getFirstProviderDetailKey(aiDraft))
  const [detectionStates, setDetectionStates] = useState<Record<string, DetectionState>>({})

  const commitDraftChange = (updater: (current: AdminAiSettings) => AdminAiSettings) => {
    let nextDraft: AdminAiSettings | undefined
    onChange((current) => {
      nextDraft = updater(current)
      return nextDraft ?? current
    })
    return nextDraft
  }

  const autoSaveDraft = (draftOverride?: AdminAiSettings, showSuccessToast = false) => {
    void onAutosave(draftOverride, { showSuccessToast })
  }

  const addOpenAiConfig = () => {
    const displayName = `OpenAI Compatible ${String(savedSettings.openai.length + 1)}`
    const config = createOpenAiProviderConfig({
      displayName,
      note: '',
      openai: {
        ...savedSettings.openai[0] ?? ANTHROPIC_PRESET as unknown as AdminOpenRouterConfig,
        displayName,
        note: '',
        apiKey: '',
        baseUrl: '',
        model: '',
        models: [],
      },
    })

    commitDraftChange((current) => addAdminOpenAiConfig(current, config))
    setSelectedDetail(`openai:${String(aiDraft.openai.length)}`)
  }

  const addAnthropicConfig = () => {
    const config = createAnthropicProviderConfig({
      anthropic: { ...ANTHROPIC_PRESET },
    })

    commitDraftChange((current) => addAdminAnthropicConfig(current, config))
    setSelectedDetail(`anthropic:${String(aiDraft.anthropic.length)}`)
  }

  const detailList: Array<{
    key: ProviderDetailKey
    title: string
    description: string
    icon: React.ComponentType<{ className?: string }>
    badge: ReactNode
  }> = [
    ...aiDraft.openai.map((config, index) => ({
      key: `openai:${index.toString()}` as ProviderDetailKey,
      title: config.displayName || 'OpenAI Compatible',
      description: '检测、刷新与连接配置',
      icon: KeyRound,
      badge: (
        <Badge variant={providerConfigured(config) ? 'secondary' : 'outline'}>
          {buildConfiguredLabel(providerConfigured(config))}
        </Badge>
      ),
    })),
    ...aiDraft.anthropic.map((config, index) => ({
      key: `anthropic:${index.toString()}` as ProviderDetailKey,
      title: `Anthropic ${index + 1}`,
      description: 'Anthropic Messages 配置',
      icon: Bot,
      badge: (
        <Badge variant={config.baseUrl.trim() && config.authToken.trim() ? 'secondary' : 'outline'}>
          {buildConfiguredLabel(Boolean(config.baseUrl.trim() && config.authToken.trim()))}
        </Badge>
      ),
    })),
  ]
  const activeDetail = detailList.some((item) => item.key === selectedDetail)
    ? selectedDetail
    : detailList[0]?.key ?? ''

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>供应商配置</CardTitle>
              <CardDescription>
                在这里统一管理各供应商连接配置，所有已配置的供应商同时可用。
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" disabled={!canEdit || isSaving}>
                    <Plus data-icon="inline-start" />
                    添加配置
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={addOpenAiConfig}>新增 OpenAI Compatible</DropdownMenuItem>
                  <DropdownMenuItem onClick={addAnthropicConfig}>新增 Anthropic</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <AutoSaveStatus isSaving={isSaving} hasUnsavedChanges={hasUnsavedChanges} error={error} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="grid gap-3">
            {detailList.map((item) => (
              <NavItemButton
                key={item.key}
                active={activeDetail === item.key}
                title={item.title}
                description={item.description}
                icon={item.icon}
                onClick={() => setSelectedDetail(item.key)}
              >
                {item.badge}
              </NavItemButton>
            ))}
          </div>

          <div className="grid gap-6">
            {!activeDetail ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  暂无供应商配置，请先添加 OpenAI Compatible 或 Anthropic。
                </CardContent>
              </Card>
            ) : null}

            {activeDetail.startsWith('openai:') ? (() => {
              const index = Number.parseInt(activeDetail.slice(7), 10)
              return (
                <OpenAiCompatiblePanel
                  configIndex={index}
                  aiDraft={aiDraft}
                  savedSettings={savedSettings}
                  disabled={!canEdit || isSaving}
                  onClearError={onClearError}
                  detectionState={detectionStates[activeDetail] ?? null}
                  onDetect={() => {
                    onClearError()
                    setDetectionStates((prev) => ({ ...prev, [activeDetail]: null }))
                    const config = aiDraft.openai[index]
                    if (!config) return
                    void onDetectOpenAiCompatibleModels({
                      baseUrl: config.baseUrl,
                      apiKey: config.apiKey,
                      modelId: config.model || undefined,
                      wireApi: config.wireApi,
                      reasoningEffort: config.reasoningEffort,
                    })
                      .then((result) => {
                        setDetectionStates((prev) => ({
                          ...prev,
                          [activeDetail]: {
                            tone: 'success',
                            message: `已从 ${result.baseUrl} 读取模型列表并自动应用到草稿。`,
                            result,
                          },
                        }))
                        const nextDraft = commitDraftChange((current) =>
                          applyOpenAiDetectionToAdminSettings(current, index, result),
                        )
                        autoSaveDraft(nextDraft, false)
                      })
                      .catch((nextError) => {
                        setDetectionStates((prev) => ({
                          ...prev,
                          [activeDetail]: {
                            tone: 'error',
                            message: nextError instanceof Error ? nextError.message : '模型检测失败。',
                            result: null,
                          },
                        }))
                      })
                  }}
                  onChangeField={(field, value) => {
                    onChange((current) => updateAdminOpenAiField(current, index, field, value))
                  }}
                  onAutoSave={() => {
                    autoSaveDraft()
                  }}
                  onDelete={() => {
                    const nextDraft = commitDraftChange((current) =>
                      removeAdminOpenAiConfig(current, index),
                    )
                    setDetectionStates((prev) => {
                      const next = { ...prev }
                      delete next[activeDetail]
                      return next
                    })
                    setSelectedDetail(getFirstProviderDetailKey(nextDraft ?? aiDraft))
                  }}
                />
              )
            })() : null}

            {activeDetail.startsWith('anthropic:') ? (() => {
              const index = Number.parseInt(activeDetail.slice(10), 10)
              return (
                <AnthropicPanel
                  configIndex={index}
                  aiDraft={aiDraft}
                  savedSettings={savedSettings}
                  disabled={!canEdit || isSaving}
                  onClearError={onClearError}
                  onChangeField={(field, value) => {
                    onChange((current) => updateAdminAnthropicField(current, index, field, value))
                  }}
                  onDelete={() => {
                    const nextDraft = commitDraftChange((current) =>
                      removeAdminAnthropicConfig(current, index),
                    )
                    setDetectionStates((prev) => {
                      const next = { ...prev }
                      delete next[activeDetail]
                      return next
                    })
                    setSelectedDetail(getFirstProviderDetailKey(nextDraft ?? aiDraft))
                  }}
                  onAutoSave={() => {
                    autoSaveDraft()
                  }}
                  onDetectAnthropicModels={onDetectAnthropicModels}
                  onApplyDetection={(result) => {
                    const nextDraft = commitDraftChange((current) =>
                      applyAnthropicDetectionToAdminSettings(current, index, result),
                    )
                    autoSaveDraft(nextDraft, false)
                  }}
                />
              )
            })() : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
