import { describe, expect, it } from 'vitest'
import {
  addAdminAnthropicConfig,
  addAdminOpenAiConfig,
  applyAnthropicDetectionToAdminSettings,
  applyOpenAiDetectionToAdminSettings,
  buildAdminAiModelGroups,
  removeAdminAnthropicConfig,
  removeAdminOpenAiConfig,
  updateAdminAnthropicField,
  updateAdminOpenAiField,
} from '@/admin-v2/ai-draft'
import {
  createAdminAiSettingsFixture,
  createAnthropicConfigFixture,
  createOpenAiConfigFixture,
} from './fixtures/admin-ai-settings'

describe('Admin V2 provider AI draft helpers', () => {
  it('builds model groups for configured non-Cloudflare providers only', () => {
    const settings = createAdminAiSettingsFixture()
    const groups = buildAdminAiModelGroups(settings)

    expect(groups.map((group) => group.providerKey)).toEqual(['openai:0', 'anthropic:0'])
    expect(groups.map((group) => group.providerLabel)).toEqual(['OpenAI Compatible 1', 'Anthropic 1'])
  })

  it('updates OpenAI compatible and Anthropic provider fields by index', () => {
    const settings = createAdminAiSettingsFixture()

    const openAiUpdated = updateAdminOpenAiField(settings, 0, 'baseUrl', 'https://next-openai.example.com/v1')
    expect(openAiUpdated.openai[0].baseUrl).toBe('https://next-openai.example.com/v1')
    expect(settings.openai[0].baseUrl).toBe('https://api.provider.example.com/v1')

    const anthropicUpdated = updateAdminAnthropicField(settings, 0, 'authToken', 'next-anthropic-token')
    expect(anthropicUpdated.anthropic[0].authToken).toBe('next-anthropic-token')
    expect(settings.anthropic[0].authToken).toBe('anthropic-token')
  })

  it('adds and removes OpenAI compatible providers', () => {
    const settings = createAdminAiSettingsFixture()
    const addedConfig = createOpenAiConfigFixture({ displayName: 'OpenAI Compatible 2' })
    const added = addAdminOpenAiConfig(settings, addedConfig)

    expect(added.openai).toHaveLength(2)
    expect(added.openai[1].displayName).toBe('OpenAI Compatible 2')

    const removed = removeAdminOpenAiConfig(added, 0)
    expect(removed.openai).toHaveLength(1)
    expect(removed.openai[0].displayName).toBe('OpenAI Compatible 2')
  })

  it('adds and removes Anthropic providers', () => {
    const settings = createAdminAiSettingsFixture()
    const addedConfig = createAnthropicConfigFixture({ authToken: 'second-token' })
    const added = addAdminAnthropicConfig(settings, addedConfig)

    expect(added.anthropic).toHaveLength(2)
    expect(added.anthropic[1].authToken).toBe('second-token')

    const removed = removeAdminAnthropicConfig(added, 0)
    expect(removed.anthropic).toHaveLength(1)
    expect(removed.anthropic[0].authToken).toBe('second-token')
  })

  it('applies OpenAI compatible detection results and enables all detected models by default', () => {
    const settings = createAdminAiSettingsFixture()
    const updated = applyOpenAiDetectionToAdminSettings(settings, 0, {
      baseUrl: 'https://detected-openai.example.com/v1',
      selectedModelId: 'gpt-4.1',
      checkedModelCount: 2,
      failedModelCount: 0,
      models: [
        { id: 'gpt-4.1-mini', label: 'GPT 4.1 Mini', enabled: false },
        { id: 'gpt-4.1', label: 'GPT 4.1', enabled: false },
        { id: 'gpt-5-mini', label: 'GPT 5 Mini', enabled: true },
      ],
    })

    expect(updated.openai[0].baseUrl).toBe('https://detected-openai.example.com/v1')
    expect(updated.openai[0].model).toBe('gpt-4.1')
    expect(updated.openai[0].models.map((model) => model.id)).toEqual([
      'gpt-4.1-mini',
      'gpt-4.1',
      'gpt-5-mini',
    ])
    expect(updated.openai[0].models.every((model) => model.enabled)).toBe(true)
  })

  it('falls back to current or first detected model when OpenAI detection has no selected model', () => {
    const settings = createAdminAiSettingsFixture({
      openai: [createOpenAiConfigFixture({ model: '' })],
    })
    const updated = applyOpenAiDetectionToAdminSettings(settings, 0, {
      baseUrl: 'https://detected-openai.example.com/v1',
      models: [{ id: 'gpt-first', label: 'GPT First' }],
    })

    expect(updated.openai[0].model).toBe('gpt-first')
  })

  it('applies Anthropic detection results to all default model fields and enables detected models', () => {
    const settings = createAdminAiSettingsFixture()
    const updated = applyAnthropicDetectionToAdminSettings(settings, 0, {
      baseUrl: 'https://detected-anthropic.example.com',
      selectedModelId: 'claude-opus-4-1',
      models: [
        { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
        { id: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
      ],
    })

    expect(updated.anthropic[0].baseUrl).toBe('https://detected-anthropic.example.com')
    expect(updated.anthropic[0].model).toBe('claude-opus-4-1')
    expect(updated.anthropic[0].defaultSonnetModel).toBe('claude-opus-4-1')
    expect(updated.anthropic[0].defaultOpusModel).toBe('claude-opus-4-1')
    expect(updated.anthropic[0].defaultHaikuModel).toBe('claude-opus-4-1')
    expect(updated.anthropic[0].models).toEqual([
      {
        id: 'claude-sonnet-4-5',
        label: 'Claude Sonnet 4.5',
        alias: '',
        enabled: true,
      },
      {
        id: 'claude-opus-4-1',
        label: 'Claude Opus 4.1',
        alias: '',
        enabled: true,
      },
    ])
  })
})
