'use client'

import Link from 'next/link'
import { useEffect, useState, type ChangeEvent, type ComponentType, type ReactNode } from 'react'
import {
  Bot,
  Cloud,
  KeyRound,
  Plus,
  RefreshCcw,
  SearchCheck,
} from 'lucide-react'
import type {
  AdminAiSettings,
  AdminCloudflareConfig,
  AdminFeedbackProviderConfig,
  AdminOpenRouterConfig,
} from '@/lib/ddzhilian-types'
import type {
  AdminAnthropicDetectResult,
  AdminOpenAiCompatibleDetectInput,
  AdminOpenAiCompatibleDetectResult,
} from '@/admin-v2/api'
import {
  addAdminFeedbackProvider,
  applyAnthropicDetectionToAdminSettings,
  applyOpenAiDetectionToAdminSettings,
  removeAdminFeedbackProvider,
  updateAdminAiProvider,
  updateAdminCloudflareField,
  updateAdminOpenRouterField,
} from '@/admin-v2/ai-draft'
import {
  ANTHROPIC_PRESET,
  createAnthropicFeedbackProvider,
  createOpenAiFeedbackProvider,
  labelFromOpenAiModelId,
} from '@/app/components/admin/constants'
import { ADMIN_V2_BASE_PATH } from '@/admin-v2/config'
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

type ProviderDetailKey = 'runtime' | 'cloudflare' | 'openai' | string

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
  onRefreshModels: () => Promise<void>
  isRefreshingModels: boolean
}

function buildConfiguredLabel(isConfigured: boolean) {
  return isConfigured ? '已配置' : '待配置'
}

function providerConfigured(settings: Pick<AdminOpenRouterConfig, 'baseUrl' | 'apiKey'> | Pick<AdminCloudflareConfig, 'accountId' | 'apiToken'>) {
  if ('apiKey' in settings) {
    return Boolean(settings.baseUrl.trim() && settings.apiKey.trim())
  }

  return Boolean(settings.accountId.trim() && settings.apiToken.trim())
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
  savedValue,
  type = 'text',
  disabled,
  description,
  onChange,
  onAutosave,
  onClearError,
  multiline = false,
}: Readonly<{
  label: string
  value: string
  savedValue: string
  type?: 'text' | 'url' | 'password'
  disabled: boolean
  description?: string
  onChange: (value: string) => void
  onAutosave: () => void
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
    onBlur: () => {
      if (value !== savedValue) {
        onAutosave()
      }
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

  useEffect(() => {
    setDraft(String(value))
  }, [value])

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

function RuntimeSummaryPanel({
  aiDraft,
  savedSettings,
  disabled,
  onClearError,
  onSelectProvider,
}: Readonly<{
  aiDraft: AdminAiSettings
  savedSettings: AdminAiSettings
  disabled: boolean
  onClearError: () => void
  onSelectProvider: (provider: AdminAiSettings['provider']) => void
}>) {
  const providerCards = [
    {
      key: 'cloudflare' as const,
      title: 'Cloudflare AI',
      configured: providerConfigured(savedSettings.cloudflare),
      defaultModel: savedSettings.cloudflare.model,
      modelCount: savedSettings.cloudflare.models.length,
      current: aiDraft.provider === 'cloudflare',
    },
    {
      key: 'openrouter' as const,
      title: savedSettings.openrouter.displayName.trim() || 'OpenAI Compatible',
      configured: providerConfigured(savedSettings.openrouter),
      defaultModel: savedSettings.openrouter.model,
      modelCount: savedSettings.openrouter.models.length,
      current: aiDraft.provider === 'openrouter',
    },
  ]

  return (
    <DetailSection
      title="当前运行"
      description="这里只负责切换主运行供应商，不编辑任何凭据字段。"
      status={<Badge>{savedSettings.provider}</Badge>}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {providerCards.map((card) => (
          <div key={card.key} className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{card.title}</p>
                <p className="text-xs text-muted-foreground">
                  默认模型 {card.defaultModel || '未设置'}
                </p>
              </div>
              <Badge variant={card.configured ? 'secondary' : 'outline'}>
                {buildConfiguredLabel(card.configured)}
              </Badge>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>模型数 {formatInteger(card.modelCount)}</span>
              {card.current ? <Badge>当前接管</Badge> : null}
            </div>
            <div className="mt-4">
              <Button
                type="button"
                disabled={disabled || card.current}
                onClick={() => {
                  onClearError()
                  onSelectProvider(card.key)
                }}
              >
                {card.current ? '当前使用中' : '切换为当前供应商'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </DetailSection>
  )
}

function CloudflarePanel({
  aiDraft,
  savedSettings,
  disabled,
  onClearError,
  onChangeField,
  onAutoSave,
}: Readonly<{
  aiDraft: AdminAiSettings
  savedSettings: AdminAiSettings
  disabled: boolean
  onClearError: () => void
  onChangeField: <Field extends keyof AdminCloudflareConfig>(field: Field, value: AdminCloudflareConfig[Field]) => void
  onAutoSave: (showSuccessToast?: boolean) => void
}>) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const configured = providerConfigured(aiDraft.cloudflare)
  const enabledModelCount = aiDraft.cloudflare.models.filter((model) => model.enabled).length

  return (
    <DetailSection
      title="Cloudflare AI"
      description="高频配置只保留鉴权与连接本身，模型编辑统一回到 models 页。"
      status={(
        <div className="flex gap-2">
          <Badge variant={configured ? 'secondary' : 'outline'}>{buildConfiguredLabel(configured)}</Badge>
          <Badge variant="outline">启用模型 {formatInteger(enabledModelCount)}</Badge>
        </div>
      )}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <AutoSaveTextField
          label="Account ID"
          value={aiDraft.cloudflare.accountId}
          savedValue={savedSettings.cloudflare.accountId}
          disabled={disabled}
          onChange={(value) => onChangeField('accountId', value)}
          onAutosave={() => onAutoSave()}
          onClearError={onClearError}
        />
        <AutoSaveTextField
          label="API Token"
          type="password"
          value={aiDraft.cloudflare.apiToken}
          savedValue={savedSettings.cloudflare.apiToken}
          disabled={disabled}
          onChange={(value) => onChangeField('apiToken', value)}
          onAutosave={() => onAutoSave()}
          onClearError={onClearError}
        />
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground lg:grid-cols-3">
        <div>
          <p className="font-medium text-foreground">当前默认模型</p>
          <p>{savedSettings.cloudflare.model || '未设置'}</p>
        </div>
        <div>
          <p className="font-medium text-foreground">启用模型数</p>
          <p>{formatInteger(enabledModelCount)} / {formatInteger(savedSettings.cloudflare.models.length)}</p>
        </div>
        <div className="flex items-end justify-start lg:justify-end">
          <Button asChild type="button" variant="outline">
            <Link href={`${ADMIN_V2_BASE_PATH}/models`} prefetch={false}>
              去 models 页管理
            </Link>
          </Button>
        </div>
      </div>

      <details
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="rounded-xl border border-border bg-background"
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
          高级设置
        </summary>
        <div className="grid gap-4 border-t border-border px-4 py-4 lg:grid-cols-2">
          <Field label="免费额度保护">
            <select
              className={adminSelectClassName}
              value={aiDraft.cloudflare.freeOnly ? 'true' : 'false'}
              disabled={disabled}
              onChange={(event) => {
                onClearError()
                onChangeField('freeOnly', event.target.value === 'true')
                onAutoSave()
              }}
            >
              <option value="true">启用</option>
              <option value="false">关闭</option>
            </select>
          </Field>
          <AutoSaveNumberField
            label="每日预算"
            value={aiDraft.cloudflare.dailyNeuronBudget}
            savedValue={savedSettings.cloudflare.dailyNeuronBudget}
            min={0}
            disabled={disabled}
            onCommit={(value) => {
              onChangeField('dailyNeuronBudget', value)
              onAutoSave()
            }}
            onClearError={onClearError}
          />
          <AutoSaveNumberField
            label="最大 Prompt 字符"
            value={aiDraft.cloudflare.maxPromptChars}
            savedValue={savedSettings.cloudflare.maxPromptChars}
            min={1}
            disabled={disabled}
            onCommit={(value) => {
              onChangeField('maxPromptChars', value)
              onAutoSave()
            }}
            onClearError={onClearError}
          />
          <AutoSaveNumberField
            label="最大输出 Token"
            value={aiDraft.cloudflare.maxOutputTokens}
            savedValue={savedSettings.cloudflare.maxOutputTokens}
            min={1}
            disabled={disabled}
            onCommit={(value) => {
              onChangeField('maxOutputTokens', value)
              onAutoSave()
            }}
            onClearError={onClearError}
          />
        </div>
      </details>
    </DetailSection>
  )
}

function OpenAiCompatiblePanel({
  aiDraft,
  savedSettings,
  disabled,
  statusAction,
  onClearError,
  detectionState,
  isRefreshingModels,
  onDetect,
  onApplyDetectedModels,
  onRefreshModels,
  onChangeField,
  onAutoSave,
}: Readonly<{
  aiDraft: AdminAiSettings
  savedSettings: AdminAiSettings
  disabled: boolean
  statusAction?: ReactNode
  onClearError: () => void
  detectionState: DetectionState
  isRefreshingModels: boolean
  onDetect: () => void
  onApplyDetectedModels: () => void
  onRefreshModels: () => void
  onChangeField: <Field extends keyof AdminOpenRouterConfig>(field: Field, value: AdminOpenRouterConfig[Field]) => void
  onAutoSave: (showSuccessToast?: boolean) => void
}>) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const configured = providerConfigured(aiDraft.openrouter)

  return (
    <DetailSection
      title="OpenAI Compatible"
      description="高频区只保留连接与鉴权，模型启用和默认值只读展示。"
      status={(
        <div className="flex gap-2">
          <Badge variant={configured ? 'secondary' : 'outline'}>{buildConfiguredLabel(configured)}</Badge>
          <Badge variant="outline">模型 {formatInteger(savedSettings.openrouter.models.length)}</Badge>
          {statusAction}
        </div>
      )}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <AutoSaveTextField
          label="显示名称"
          value={aiDraft.openrouter.displayName}
          savedValue={savedSettings.openrouter.displayName}
          disabled={disabled}
          onChange={(value) => onChangeField('displayName', value)}
          onAutosave={() => onAutoSave()}
          onClearError={onClearError}
        />
        <AutoSaveTextField
          label="Base URL"
          type="url"
          value={aiDraft.openrouter.baseUrl}
          savedValue={savedSettings.openrouter.baseUrl}
          disabled={disabled}
          onChange={(value) => onChangeField('baseUrl', value)}
          onAutosave={() => onAutoSave()}
          onClearError={onClearError}
        />
        <AutoSaveTextField
          label="API Key"
          type="password"
          value={aiDraft.openrouter.apiKey}
          savedValue={savedSettings.openrouter.apiKey}
          disabled={disabled}
          onChange={(value) => onChangeField('apiKey', value)}
          onAutosave={() => onAutoSave()}
          onClearError={onClearError}
        />
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground lg:grid-cols-4">
        <div>
          <p className="font-medium text-foreground">显示名称</p>
          <p>{savedSettings.openrouter.displayName || 'OpenAI Compatible'}</p>
        </div>
        <div>
          <p className="font-medium text-foreground">当前默认模型</p>
          <p>{savedSettings.openrouter.model || '未设置'}</p>
        </div>
        <div>
          <p className="font-medium text-foreground">模型总数</p>
          <p>{formatInteger(savedSettings.openrouter.models.length)}</p>
        </div>
        <div className="flex items-end justify-start lg:justify-end">
          <Button asChild type="button" variant="outline">
            <Link href={`${ADMIN_V2_BASE_PATH}/models`} prefetch={false}>
              去 models 页管理
            </Link>
          </Button>
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
              {detectionState.result ? (
                <p className="text-xs opacity-80">
                  检测到 {formatInteger(detectionState.result.models.length)} 个模型，仅在你确认应用后写入本地草稿。
                </p>
              ) : null}
            </div>
            {detectionState.result ? (
              <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onApplyDetectedModels}>
                应用到草稿并自动保存
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={onDetect}>
          <SearchCheck data-icon="inline-start" />
          检测模型
        </Button>
        <Button type="button" variant="outline" disabled={disabled || isRefreshingModels} onClick={onRefreshModels}>
          <RefreshCcw data-icon="inline-start" />
          {isRefreshingModels ? '刷新中...' : '刷新模型列表'}
        </Button>
      </div>

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
              value={aiDraft.openrouter.wireApi}
              disabled={disabled}
              onChange={(event) => {
                onClearError()
                onChangeField('wireApi', event.target.value as AdminOpenRouterConfig['wireApi'])
                onAutoSave()
              }}
            >
              <option value="responses">responses</option>
              <option value="chat_completions">chat_completions</option>
            </select>
          </Field>
          <Field label="Reasoning Effort">
            <select
              className={adminSelectClassName}
              value={aiDraft.openrouter.reasoningEffort}
              disabled={disabled}
              onChange={(event) => {
                onClearError()
                onChangeField('reasoningEffort', event.target.value as AdminOpenRouterConfig['reasoningEffort'])
                onAutoSave()
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
            value={aiDraft.openrouter.homepageUrl}
            savedValue={savedSettings.openrouter.homepageUrl}
            disabled={disabled}
            onChange={(value) => onChangeField('homepageUrl', value)}
            onAutosave={() => onAutoSave()}
            onClearError={onClearError}
          />
          <AutoSaveTextField
            label="备注"
            value={aiDraft.openrouter.note}
            savedValue={savedSettings.openrouter.note}
            disabled={disabled}
            onChange={(value) => onChangeField('note', value)}
            onAutosave={() => onAutoSave()}
            onClearError={onClearError}
            multiline
          />
          <AutoSaveNumberField
            label="最大 Prompt 字符"
            value={aiDraft.openrouter.maxPromptChars}
            savedValue={savedSettings.openrouter.maxPromptChars}
            min={1}
            disabled={disabled}
            onCommit={(value) => {
              onChangeField('maxPromptChars', value)
              onAutoSave()
            }}
            onClearError={onClearError}
          />
          <AutoSaveNumberField
            label="最大输出 Token"
            value={aiDraft.openrouter.maxOutputTokens}
            savedValue={savedSettings.openrouter.maxOutputTokens}
            min={1}
            disabled={disabled}
            onCommit={(value) => {
              onChangeField('maxOutputTokens', value)
              onAutoSave()
            }}
            onClearError={onClearError}
          />
        </div>
      </details>
    </DetailSection>
  )
}

function FeedbackProviderPanel({
  provider,
  disabled,
  onClearError,
  onChange,
  onDelete,
  onAutoSave,
  onDetectOpenAiCompatibleModels,
  onDetectAnthropicModels,
}: Readonly<{
  provider: AdminFeedbackProviderConfig
  disabled: boolean
  onClearError: () => void
  onChange: (updater: (current: AdminFeedbackProviderConfig) => AdminFeedbackProviderConfig) => void
  onDelete: () => void
  onAutoSave: () => void
  onDetectOpenAiCompatibleModels: (input: AdminOpenAiCompatibleDetectInput) => Promise<AdminOpenAiCompatibleDetectResult>
  onDetectAnthropicModels: (input: { baseUrl: string; authToken: string }) => Promise<AdminAnthropicDetectResult>
}>) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [openAiDetectionState, setOpenAiDetectionState] = useState<DetectionState>(null)
  const [anthropicMessage, setAnthropicMessage] = useState<string | null>(null)

  if (provider.openai) {
    return (
      <OpenAiCompatiblePanel
        aiDraft={{ openrouter: provider.openai } as AdminAiSettings}
        savedSettings={{ openrouter: provider.openai } as AdminAiSettings}
        disabled={disabled}
        statusAction={(
          <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={onDelete}>
            删除配置
          </Button>
        )}
        onClearError={onClearError}
        detectionState={openAiDetectionState}
        isRefreshingModels={false}
        onDetect={() => {
          onClearError()
          setOpenAiDetectionState(null)
          void onDetectOpenAiCompatibleModels({
            baseUrl: provider.openai!.baseUrl,
            apiKey: provider.openai!.apiKey,
            modelId: provider.openai!.model || undefined,
            wireApi: provider.openai!.wireApi,
            reasoningEffort: provider.openai!.reasoningEffort,
          })
            .then((result) => {
              setOpenAiDetectionState({
                tone: 'success',
                message: `已从 ${result.baseUrl} 读取模型列表。`,
                result,
              })
            })
            .catch((nextError) => {
              setOpenAiDetectionState({
                tone: 'error',
                message: nextError instanceof Error ? nextError.message : '模型检测失败。',
                result: null,
              })
            })
        }}
        onApplyDetectedModels={() => {
          if (!openAiDetectionState?.result) {
            return
          }

          const detectedOpenAi = applyOpenAiDetectionToAdminSettings(
            {
              provider: 'openrouter',
              systemPrompt: '',
              cloudflare: {} as AdminCloudflareConfig,
              openrouter: {} as AdminOpenRouterConfig,
              feedbackProviders: [provider],
            },
            provider.id,
            openAiDetectionState.result,
          ).feedbackProviders[0]?.openai

          onChange((current) => ({
            ...current,
            openai: current.openai && detectedOpenAi ? detectedOpenAi : current.openai,
          }))
          onAutoSave()
        }}
        onRefreshModels={() => undefined}
        onChangeField={(field, value) => {
          onChange((current) => ({
            ...current,
            displayName: field === 'displayName' ? String(value).trim() || current.displayName : current.displayName,
            note: field === 'note' ? String(value) : current.note,
            openai: current.openai
              ? {
                  ...current.openai,
                  [field]: value,
                }
              : current.openai,
          }))
        }}
        onAutoSave={onAutoSave}
      />
    )
  }

  if (!provider.anthropic) {
    return null
  }

  return (
    <DetailSection
      title={provider.displayName || 'Anthropic feedback'}
      description="高频区只保留连接与鉴权，模型启用和默认值只读展示。"
      status={(
        <div className="flex gap-2">
          <Badge variant={provider.anthropic.baseUrl.trim() && provider.anthropic.authToken.trim() ? 'secondary' : 'outline'}>
            {buildConfiguredLabel(Boolean(provider.anthropic.baseUrl.trim() && provider.anthropic.authToken.trim()))}
          </Badge>
          <Badge variant="outline">模型 {formatInteger(provider.anthropic.models.length)}</Badge>
          <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={onDelete}>
            删除配置
          </Button>
        </div>
      )}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <AutoSaveTextField
          label="显示名称"
          value={provider.displayName}
          savedValue={provider.displayName}
          disabled={disabled}
          onChange={(value) => {
            onChange((current) => ({
              ...current,
              displayName: value.trim() || current.displayName,
            }))
          }}
          onAutosave={onAutoSave}
          onClearError={onClearError}
        />
        <AutoSaveTextField
          label="Base URL"
          type="url"
          value={provider.anthropic.baseUrl}
          savedValue={provider.anthropic.baseUrl}
          disabled={disabled}
          onChange={(value) => {
            onChange((current) => ({
              ...current,
              anthropic: current.anthropic ? { ...current.anthropic, baseUrl: value } : current.anthropic,
            }))
          }}
          onAutosave={onAutoSave}
          onClearError={onClearError}
        />
        <AutoSaveTextField
          label="Token"
          type="password"
          value={provider.anthropic.authToken}
          savedValue={provider.anthropic.authToken}
          disabled={disabled}
          onChange={(value) => {
            onChange((current) => ({
              ...current,
              anthropic: current.anthropic ? { ...current.anthropic, authToken: value } : current.anthropic,
            }))
          }}
          onAutosave={onAutoSave}
          onClearError={onClearError}
        />
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground lg:grid-cols-4">
        <div>
          <p className="font-medium text-foreground">显示名称</p>
          <p>{provider.displayName || 'Anthropic feedback'}</p>
        </div>
        <div>
          <p className="font-medium text-foreground">当前默认模型</p>
          <p>{provider.anthropic.model || '未设置'}</p>
        </div>
        <div>
          <p className="font-medium text-foreground">模型总数</p>
          <p>{formatInteger(provider.anthropic.models.length)}</p>
        </div>
        <div className="flex items-end justify-start lg:justify-end">
          <Button asChild type="button" variant="outline">
            <Link href={`${ADMIN_V2_BASE_PATH}/models`} prefetch={false}>
              去 models 页管理
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            onClearError()
            setAnthropicMessage(null)
            void onDetectAnthropicModels({
              baseUrl: provider.anthropic!.baseUrl,
              authToken: provider.anthropic!.authToken,
            })
              .then((result) => {
                setAnthropicMessage(`已检测到 ${formatInteger(result.models.length)} 个模型。`)
                onChange((current) => ({
                  ...current,
                  displayName: labelFromOpenAiModelId(result.selectedModelId || result.models[0]?.id || current.displayName),
                  anthropic: applyAnthropicDetectionToAdminSettings(
                    {
                      provider: 'openrouter',
                      systemPrompt: '',
                      cloudflare: {} as AdminCloudflareConfig,
                      openrouter: {} as AdminOpenRouterConfig,
                      feedbackProviders: [current],
                    },
                    current.id,
                    result,
                  ).feedbackProviders[0].anthropic,
                }))
                onAutoSave()
              })
              .catch((nextError) => {
                setAnthropicMessage(nextError instanceof Error ? nextError.message : '模型检测失败。')
              })
          }}
        >
          <SearchCheck data-icon="inline-start" />
          检测模型
        </Button>
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
          <AutoSaveTextField
            label="备注"
            value={provider.note}
            savedValue={provider.note}
            disabled={disabled}
            onChange={(value) => {
              onChange((current) => ({ ...current, note: value }))
            }}
            onAutosave={onAutoSave}
            onClearError={onClearError}
            multiline
          />
          <AutoSaveNumberField
            label="最大 Prompt 字符"
            value={provider.anthropic.maxPromptChars}
            savedValue={provider.anthropic.maxPromptChars}
            min={1}
            disabled={disabled}
            onCommit={(value) => {
              onChange((current) => ({
                ...current,
                anthropic: current.anthropic ? { ...current.anthropic, maxPromptChars: value } : current.anthropic,
              }))
              onAutoSave()
            }}
            onClearError={onClearError}
          />
          <AutoSaveNumberField
            label="最大输出 Token"
            value={provider.anthropic.maxOutputTokens}
            savedValue={provider.anthropic.maxOutputTokens}
            min={1}
            disabled={disabled}
            onCommit={(value) => {
              onChange((current) => ({
                ...current,
                anthropic: current.anthropic ? { ...current.anthropic, maxOutputTokens: value } : current.anthropic,
              }))
              onAutoSave()
            }}
            onClearError={onClearError}
          />
        </div>
      </details>
    </DetailSection>
  )
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
  onRefreshModels,
  isRefreshingModels,
}: ProviderWorkspaceProps) {
  const [selectedDetail, setSelectedDetail] = useState<ProviderDetailKey>('runtime')
  const [detectionState, setDetectionState] = useState<DetectionState>(null)

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

  const addOpenAiFeedbackProvider = () => {
    const displayName = `OpenAI Compatible ${String(savedSettings.feedbackProviders.length + 1)}`
    const provider = createOpenAiFeedbackProvider({
      displayName,
      note: 'feedback',
      openai: {
        ...savedSettings.openrouter,
        displayName,
        note: 'feedback',
        apiKey: '',
      },
    })

    const nextDraft = commitDraftChange((current) => addAdminFeedbackProvider(current, provider))
    setSelectedDetail(provider.id)
    autoSaveDraft(nextDraft)
  }

  const addAnthropicFeedbackProvider = () => {
    const displayName = `Anthropic ${String(savedSettings.feedbackProviders.length + 1)}`
    const provider = createAnthropicFeedbackProvider({
      displayName,
      note: 'feedback',
      anthropic: { ...ANTHROPIC_PRESET },
    })

    const nextDraft = commitDraftChange((current) => addAdminFeedbackProvider(current, provider))
    setSelectedDetail(provider.id)
    autoSaveDraft(nextDraft)
  }

  const detailList: Array<{
    key: ProviderDetailKey
    title: string
    description: string
    icon: React.ComponentType<{ className?: string }>
    badge: ReactNode
  }> = [
    {
      key: 'runtime',
      title: '当前运行',
      description: '切换主运行供应商',
      icon: Bot,
      badge: <Badge variant="secondary">{savedSettings.provider}</Badge>,
    },
    {
      key: 'cloudflare',
      title: 'Cloudflare AI',
      description: '连接与预算控制',
      icon: Cloud,
      badge: (
        <Badge variant={providerConfigured(savedSettings.cloudflare) ? 'secondary' : 'outline'}>
          {buildConfiguredLabel(providerConfigured(savedSettings.cloudflare))}
        </Badge>
      ),
    },
    {
      key: 'openai',
      title: 'OpenAI Compatible',
      description: '检测、刷新与连接配置',
      icon: KeyRound,
      badge: (
        <Badge variant={providerConfigured(savedSettings.openrouter) ? 'secondary' : 'outline'}>
          {buildConfiguredLabel(providerConfigured(savedSettings.openrouter))}
        </Badge>
      ),
    },
    ...savedSettings.feedbackProviders.map((provider) => ({
      key: provider.id,
      title: provider.displayName || (provider.kind === 'anthropic' ? 'Anthropic feedback' : 'OpenAI feedback'),
      description: provider.kind === 'anthropic' ? 'Anthropic Messages 配置' : 'OpenAI 兼容反馈配置',
      icon: provider.kind === 'anthropic' ? Bot : KeyRound,
      badge: (
        <Badge
          variant={provider.openai
            ? (providerConfigured(provider.openai) ? 'secondary' : 'outline')
            : (provider.anthropic?.baseUrl.trim() && provider.anthropic?.authToken.trim() ? 'secondary' : 'outline')}
        >
          {provider.openai
            ? buildConfiguredLabel(providerConfigured(provider.openai))
            : buildConfiguredLabel(Boolean(provider.anthropic?.baseUrl.trim() && provider.anthropic?.authToken.trim()))}
        </Badge>
      ),
    })),
  ]

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>供应商配置</CardTitle>
              <CardDescription>
                这页只保留主运行供应商链路。`systemPrompt` 已剥离到 AI 策略页，模型启用与默认值去 models 页管理。
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
                  <DropdownMenuItem onClick={addOpenAiFeedbackProvider}>新增 OpenAI Compatible</DropdownMenuItem>
                  <DropdownMenuItem onClick={addAnthropicFeedbackProvider}>新增 Anthropic</DropdownMenuItem>
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
                active={selectedDetail === item.key}
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
            {selectedDetail === 'runtime' ? (
              <RuntimeSummaryPanel
                aiDraft={aiDraft}
                savedSettings={savedSettings}
                disabled={!canEdit || isSaving}
                onClearError={onClearError}
                onSelectProvider={(provider) => {
                  const nextDraft = commitDraftChange((current) => updateAdminAiProvider(current, provider))
                  autoSaveDraft(nextDraft)
                }}
              />
            ) : null}

            {selectedDetail === 'cloudflare' ? (
              <CloudflarePanel
                aiDraft={aiDraft}
                savedSettings={savedSettings}
                disabled={!canEdit || isSaving}
                onClearError={onClearError}
                onChangeField={(field, value) => {
                  onChange((current) => updateAdminCloudflareField(current, field, value))
                }}
                onAutoSave={() => {
                  autoSaveDraft()
                }}
              />
            ) : null}

            {selectedDetail === 'openai' ? (
              <OpenAiCompatiblePanel
                aiDraft={aiDraft}
                savedSettings={savedSettings}
                disabled={!canEdit || isSaving}
                onClearError={onClearError}
                detectionState={detectionState}
                isRefreshingModels={isRefreshingModels}
                onDetect={() => {
                  onClearError()
                  setDetectionState(null)
                  void onDetectOpenAiCompatibleModels({
                    baseUrl: aiDraft.openrouter.baseUrl,
                    apiKey: aiDraft.openrouter.apiKey,
                    modelId: aiDraft.openrouter.model || undefined,
                    wireApi: aiDraft.openrouter.wireApi,
                    reasoningEffort: aiDraft.openrouter.reasoningEffort,
                  })
                    .then((result) => {
                      setDetectionState({
                        tone: 'success',
                        message: `已从 ${result.baseUrl} 读取模型列表。`,
                        result,
                      })
                    })
                    .catch((nextError) => {
                      setDetectionState({
                        tone: 'error',
                        message: nextError instanceof Error ? nextError.message : '模型检测失败。',
                        result: null,
                      })
                    })
                }}
                onApplyDetectedModels={() => {
                  if (!detectionState?.result) {
                    return
                  }

                  const nextDraft = commitDraftChange((current) =>
                    applyOpenAiDetectionToAdminSettings(current, 'openrouter', detectionState.result!),
                  )
                  autoSaveDraft(nextDraft)
                }}
                onRefreshModels={() => {
                  onClearError()
                  setDetectionState(null)
                  void onRefreshModels()
                }}
                onChangeField={(field, value) => {
                  onChange((current) => updateAdminOpenRouterField(current, field, value))
                }}
                onAutoSave={() => {
                  autoSaveDraft()
                }}
              />
            ) : null}

            {selectedDetail !== 'runtime' && selectedDetail !== 'cloudflare' && selectedDetail !== 'openai' ? (
              (() => {
                const provider = savedSettings.feedbackProviders.find((item) => item.id === selectedDetail)
                if (!provider) {
                  return null
                }

                return (
                  <FeedbackProviderPanel
                    provider={provider}
                    disabled={!canEdit || isSaving}
                    onClearError={onClearError}
                    onChange={(updater) => {
                      onChange((current) => ({
                        ...current,
                        feedbackProviders: current.feedbackProviders.map((item) =>
                          item.id === provider.id ? updater(item) : item,
                        ),
                      }))
                    }}
                    onDelete={() => {
                      const nextDraft = commitDraftChange((current) =>
                        removeAdminFeedbackProvider(current, provider.id),
                      )
                      setSelectedDetail('openai')
                      autoSaveDraft(nextDraft)
                    }}
                    onAutoSave={() => {
                      autoSaveDraft()
                    }}
                    onDetectOpenAiCompatibleModels={onDetectOpenAiCompatibleModels}
                    onDetectAnthropicModels={onDetectAnthropicModels}
                  />
                )
              })()
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
