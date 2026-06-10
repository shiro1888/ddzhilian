import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ComponentProps } from 'react'
import type { AdminAiSettings } from '@/lib/ddzhilian-types'
import { AdminV2ProvidersWorkspace } from '@/admin-v2/workspaces/ProvidersWorkspace'
import { createAdminAiSettingsFixture } from './fixtures/admin-ai-settings'

type WorkspaceProps = ComponentProps<typeof AdminV2ProvidersWorkspace>

type RenderWorkspaceOptions = Partial<Omit<
  WorkspaceProps,
  | 'aiDraft'
  | 'savedSettings'
  | 'onChange'
  | 'onAutosave'
  | 'onClearError'
  | 'onDetectAnthropicModels'
  | 'onDetectOpenAiCompatibleModels'
>> & {
  aiDraft?: AdminAiSettings
  savedSettings?: AdminAiSettings
  onAutosave?: WorkspaceProps['onAutosave']
  onDetectAnthropicModels?: WorkspaceProps['onDetectAnthropicModels']
  onDetectOpenAiCompatibleModels?: WorkspaceProps['onDetectOpenAiCompatibleModels']
}

function renderWorkspace(options: RenderWorkspaceOptions = {}) {
  const initialDraft = options.aiDraft ?? createAdminAiSettingsFixture()
  const savedSettings = options.savedSettings ?? structuredClone(initialDraft)
  let currentDraft = initialDraft
  const user = userEvent.setup()
  const onChange = vi.fn()
  const onClearError = vi.fn()
  const onAutosave = options.onAutosave ?? vi.fn(async () => true)
  const onDetectAnthropicModels = options.onDetectAnthropicModels ?? vi.fn(async () => ({
    baseUrl: 'https://api.anthropic.example.com',
    selectedModelId: 'claude-sonnet-4-5',
    models: [{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }],
  }))
  const onDetectOpenAiCompatibleModels = options.onDetectOpenAiCompatibleModels ?? vi.fn(async () => ({
    baseUrl: 'https://detected-openai.example.com/v1',
    selectedModelId: 'gpt-5-mini',
    checkedModelCount: 2,
    failedModelCount: 0,
    models: [
      { id: 'gpt-4.1-mini', label: 'GPT 4.1 Mini', enabled: false },
      { id: 'gpt-5-mini', label: 'GPT 5 Mini', enabled: true },
    ],
  }))

  function Harness() {
    const [draft, setDraft] = React.useState(initialDraft)

    return (
      <AdminV2ProvidersWorkspace
        aiDraft={draft}
        savedSettings={savedSettings}
        canEdit={options.canEdit ?? true}
        isSaving={options.isSaving ?? false}
        hasUnsavedChanges={options.hasUnsavedChanges ?? false}
        error={options.error ?? null}
        onClearError={onClearError}
        onChange={(updater) => {
          onChange(updater)
          setDraft((current) => {
            const next = updater(current)
            currentDraft = next
            return next
          })
        }}
        onAutosave={onAutosave}
        onDetectAnthropicModels={onDetectAnthropicModels}
        onDetectOpenAiCompatibleModels={onDetectOpenAiCompatibleModels}
      />
    )
  }

  render(<Harness />)

  return {
    user,
    onChange,
    onClearError,
    onAutosave,
    onDetectAnthropicModels,
    onDetectOpenAiCompatibleModels,
    getDraft: () => currentDraft,
  }
}

async function selectOpenAiProvider(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /OpenAI Compatible 1/ }))
}

async function selectAnthropicProvider(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Anthropic 1/ }))
}

afterEach(() => {
  cleanup()
})

describe('AdminV2ProvidersWorkspace', () => {
  it('renders OpenAI compatible provider as the default detail without Cloudflare configuration', () => {
    renderWorkspace()

    expect(screen.getByText('供应商配置')).toBeInTheDocument()
    expect(screen.queryByText('Cloudflare AI')).not.toBeInTheDocument()
    expect(screen.getAllByText('OpenAI Compatible 1').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('显示名称')).toHaveValue('OpenAI Compatible 1')
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://api.provider.example.com/v1')
    expect(screen.getByLabelText('API Key')).toHaveValue('sk-test-openai')
    expect(screen.getByLabelText('模型名称')).toHaveValue('gpt-4.1-mini')
    expect(screen.getAllByText('已配置').length).toBeGreaterThan(0)
  })

  it('edits OpenAI compatible provider fields and saves the configuration', async () => {
    const { user, onAutosave, getDraft } = renderWorkspace()
    await selectOpenAiProvider(user)

    await user.clear(screen.getByLabelText('显示名称'))
    await user.type(screen.getByLabelText('显示名称'), 'Primary OpenAI')
    await user.clear(screen.getByLabelText('Base URL'))
    await user.type(screen.getByLabelText('Base URL'), 'https://next-openai.example.com/v1')
    await user.clear(screen.getByLabelText('API Key'))
    await user.type(screen.getByLabelText('API Key'), 'sk-next')

    expect(getDraft().openai[0]).toMatchObject({
      displayName: 'Primary OpenAI',
      baseUrl: 'https://next-openai.example.com/v1',
      apiKey: 'sk-next',
    })

    await user.click(screen.getByRole('button', { name: /保存配置/ }))
    expect(onAutosave).toHaveBeenCalledWith(undefined, { showSuccessToast: false })
  })

  it('detects OpenAI compatible models and applies the detection result to the draft', async () => {
    const { user, onAutosave, onDetectOpenAiCompatibleModels, getDraft } = renderWorkspace()
    await selectOpenAiProvider(user)

    await user.click(screen.getByRole('button', { name: /获取模型/ }))

    await waitFor(() => {
      expect(onDetectOpenAiCompatibleModels).toHaveBeenCalledWith({
        baseUrl: 'https://api.provider.example.com/v1',
        apiKey: 'sk-test-openai',
        modelId: 'gpt-4.1-mini',
        wireApi: 'responses',
        reasoningEffort: 'medium',
      })
    })
    expect(await screen.findByText('已从 https://detected-openai.example.com/v1 读取模型列表并自动应用到草稿。'))
      .toBeInTheDocument()
    expect(getDraft().openai[0].baseUrl).toBe('https://detected-openai.example.com/v1')
    expect(getDraft().openai[0].model).toBe('gpt-5-mini')
    expect(getDraft().openai[0].models.map((model) => model.id)).toEqual([
      'gpt-4.1-mini',
      'gpt-5-mini',
    ])
    expect(getDraft().openai[0].models.every((model) => model.enabled)).toBe(true)
    expect(onAutosave).toHaveBeenCalledWith(getDraft(), { showSuccessToast: false })
  })

  it('shows OpenAI compatible detection errors without overwriting the existing model list', async () => {
    const originalSettings = createAdminAiSettingsFixture()
    const detectError = new Error('模型检测失败：API Key 无效。')
    const { user, getDraft } = renderWorkspace({
      aiDraft: originalSettings,
      onDetectOpenAiCompatibleModels: vi.fn(async () => {
        throw detectError
      }),
    })
    await selectOpenAiProvider(user)

    await user.click(screen.getByRole('button', { name: /获取模型/ }))

    expect(await screen.findByText('模型检测失败：API Key 无效。')).toBeInTheDocument()
    expect(getDraft().openai[0].models).toEqual(originalSettings.openai[0].models)
  })

  it('updates OpenAI compatible advanced fields', async () => {
    const { user, getDraft } = renderWorkspace()
    await selectOpenAiProvider(user)
    await user.click(screen.getByText('高级设置'))

    await user.selectOptions(screen.getByLabelText('Wire API'), 'chat_completions')
    await user.selectOptions(screen.getByLabelText('Reasoning Effort'), 'high')
    await user.clear(screen.getByLabelText('主页链接'))
    await user.type(screen.getByLabelText('主页链接'), 'https://new-provider.example.com')
    await user.clear(screen.getByLabelText('备注'))
    await user.type(screen.getByLabelText('备注'), 'new note')

    expect(getDraft().openai[0]).toMatchObject({
      wireApi: 'chat_completions',
      reasoningEffort: 'high',
      homepageUrl: 'https://new-provider.example.com',
      note: 'new note',
    })
  })

  it('detects Anthropic models and saves the configuration', async () => {
    const { user, onAutosave, onDetectAnthropicModels, getDraft } = renderWorkspace()
    await selectAnthropicProvider(user)

    await user.click(screen.getByRole('button', { name: /获取模型/ }))

    await waitFor(() => {
      expect(onDetectAnthropicModels).toHaveBeenCalledWith({
        baseUrl: 'https://api.anthropic.example.com',
        authToken: 'anthropic-token',
      })
    })
    expect(await screen.findByText('已检测到 1 个模型，可从下拉中选择。')).toBeInTheDocument()
    expect(getDraft().anthropic[0].model).toBe('claude-sonnet-4-5')
    expect(getDraft().anthropic[0].models).toEqual([
      {
        id: 'claude-sonnet-4-5',
        label: 'Claude Sonnet 4.5',
        alias: '',
        enabled: true,
      },
    ])
    expect(onAutosave).toHaveBeenCalledWith(getDraft(), { showSuccessToast: false })

    vi.mocked(onAutosave).mockClear()
    await user.click(screen.getByRole('button', { name: /保存配置/ }))
    expect(onAutosave).toHaveBeenCalledWith(undefined, { showSuccessToast: false })
  })

  it('shows Anthropic detection errors', async () => {
    const { user } = renderWorkspace({
      onDetectAnthropicModels: vi.fn(async () => {
        throw new Error('Anthropic token 无效。')
      }),
    })
    await selectAnthropicProvider(user)

    await user.click(screen.getByRole('button', { name: /获取模型/ }))

    expect(await screen.findByText('Anthropic token 无效。')).toBeInTheDocument()
  })

  it('adds OpenAI compatible and Anthropic provider configs from the add menu', async () => {
    const { user, getDraft } = renderWorkspace()

    await user.click(screen.getByRole('button', { name: /添加配置/ }))
    await user.click(await screen.findByText('新增 OpenAI Compatible'))

    expect(getDraft().openai).toHaveLength(2)
    expect(getDraft().openai[1]).toMatchObject({
      displayName: 'OpenAI Compatible 2',
      apiKey: '',
      baseUrl: '',
      model: '',
      models: [],
    })

    await user.click(screen.getByRole('button', { name: /添加配置/ }))
    await user.click(await screen.findByText('新增 Anthropic'))

    expect(getDraft().anthropic).toHaveLength(2)
    expect(getDraft().anthropic[1]).toMatchObject({
      baseUrl: '',
      authToken: '',
      model: '',
    })
  })

  it('removes selected OpenAI compatible and Anthropic providers and returns to the first remaining provider', async () => {
    const { user, getDraft } = renderWorkspace()

    await selectOpenAiProvider(user)
    await user.click(screen.getByRole('button', { name: /删除/ }))
    expect(getDraft().openai).toHaveLength(0)
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://api.anthropic.example.com')

    await selectAnthropicProvider(user)
    await user.click(screen.getByRole('button', { name: /删除/ }))
    expect(getDraft().anthropic).toHaveLength(0)
    expect(screen.getByText('暂无供应商配置，请先添加 OpenAI Compatible 或 Anthropic。')).toBeInTheDocument()
  })

  it('disables editable controls when editing is not allowed', async () => {
    const { user } = renderWorkspace({ canEdit: false })

    expect(screen.getByRole('button', { name: /添加配置/ })).toBeDisabled()
    expect(screen.getByLabelText('显示名称')).toBeDisabled()
    expect(screen.getByLabelText('Base URL')).toBeDisabled()
    expect(screen.getByLabelText('API Key')).toBeDisabled()
    expect(screen.getByRole('button', { name: /保存配置/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /删除/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /获取模型/ })).toBeDisabled()

    await selectAnthropicProvider(user)
    expect(screen.getByLabelText('Base URL')).toBeDisabled()
    expect(screen.getByLabelText('Token')).toBeDisabled()
    expect(screen.getByRole('button', { name: /保存配置/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /删除/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /获取模型/ })).toBeDisabled()
  })

  it('renders autosave and error states', () => {
    const { rerender } = render(
      <AdminV2ProvidersWorkspace
        aiDraft={createAdminAiSettingsFixture()}
        savedSettings={createAdminAiSettingsFixture()}
        canEdit
        isSaving
        hasUnsavedChanges={false}
        error={null}
        onClearError={vi.fn()}
        onChange={vi.fn()}
        onAutosave={vi.fn(async () => true)}
        onDetectAnthropicModels={vi.fn()}
        onDetectOpenAiCompatibleModels={vi.fn()}
      />,
    )

    expect(screen.getByText('自动保存中')).toBeInTheDocument()

    rerender(
      <AdminV2ProvidersWorkspace
        aiDraft={createAdminAiSettingsFixture()}
        savedSettings={createAdminAiSettingsFixture()}
        canEdit
        isSaving={false}
        hasUnsavedChanges
        error={null}
        onClearError={vi.fn()}
        onChange={vi.fn()}
        onAutosave={vi.fn(async () => true)}
        onDetectAnthropicModels={vi.fn()}
        onDetectOpenAiCompatibleModels={vi.fn()}
      />,
    )

    expect(screen.getByText('存在未保存更改')).toBeInTheDocument()

    rerender(
      <AdminV2ProvidersWorkspace
        aiDraft={createAdminAiSettingsFixture()}
        savedSettings={createAdminAiSettingsFixture()}
        canEdit
        isSaving={false}
        hasUnsavedChanges={false}
        error="AI 配置保存失败。"
        onClearError={vi.fn()}
        onChange={vi.fn()}
        onAutosave={vi.fn(async () => true)}
        onDetectAnthropicModels={vi.fn()}
        onDetectOpenAiCompatibleModels={vi.fn()}
      />,
    )

    expect(screen.getByText('AI 配置保存失败。')).toHaveAttribute('data-variant', 'destructive')
  })
})
