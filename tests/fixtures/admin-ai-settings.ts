import type {
  AdminAiSettings,
  AdminAnthropicConfig,
  AdminCloudflareConfig,
  AdminModelToggleItem,
  AdminOpenRouterConfig,
} from '@/lib/ddzhilian-types'

type AdminAiSettingsOverrides = Partial<{
  provider: string
  systemPrompt: string
  cloudflare: Partial<AdminCloudflareConfig>
  openai: AdminOpenRouterConfig[]
  anthropic: AdminAnthropicConfig[]
}>

function model(id: string, enabled = true, label = id): AdminModelToggleItem {
  return {
    id,
    label,
    alias: '',
    enabled,
  }
}

export function createOpenAiConfigFixture(
  overrides: Partial<AdminOpenRouterConfig> = {},
): AdminOpenRouterConfig {
  return {
    displayName: 'OpenAI Compatible 1',
    homepageUrl: 'https://provider.example.com',
    note: 'primary compatible provider',
    apiKey: 'sk-test-openai',
    baseUrl: 'https://api.provider.example.com/v1',
    wireApi: 'responses',
    reasoningEffort: 'medium',
    siteUrl: 'https://ddzhilian.test',
    siteName: 'ddzhilian',
    model: 'gpt-4.1-mini',
    models: [
      model('gpt-4.1-mini', true, 'GPT 4.1 Mini'),
      model('gpt-4.1', false, 'GPT 4.1'),
    ],
    maxPromptChars: 12000,
    maxOutputTokens: 2000,
    ...overrides,
  }
}

export function createAnthropicConfigFixture(
  overrides: Partial<AdminAnthropicConfig> = {},
): AdminAnthropicConfig {
  return {
    baseUrl: 'https://api.anthropic.example.com',
    authToken: 'anthropic-token',
    model: 'claude-sonnet-4-5',
    defaultSonnetModel: 'claude-sonnet-4-5',
    defaultOpusModel: 'claude-opus-4-1',
    defaultHaikuModel: 'claude-haiku-4-5',
    models: [
      model('claude-sonnet-4-5', true, 'Claude Sonnet 4.5'),
      model('claude-opus-4-1', false, 'Claude Opus 4.1'),
    ],
    maxPromptChars: 16000,
    maxOutputTokens: 3000,
    ...overrides,
  }
}

export function createAdminAiSettingsFixture(
  overrides: AdminAiSettingsOverrides = {},
): AdminAiSettings {
  const cloudflare: AdminCloudflareConfig = {
    accountId: 'cf-account-id',
    apiToken: 'cf-api-token',
    model: '@cf/meta/llama-3.1-8b-instruct',
    models: [
      model('@cf/meta/llama-3.1-8b-instruct', true, 'Llama 3.1 8B'),
      model('@cf/google/gemma-4-26b-a4b-it', false, 'Gemma 4 26B'),
    ],
    freeOnly: true,
    dailyNeuronBudget: 1000,
    maxPromptChars: 8000,
    maxOutputTokens: 1000,
    ...overrides.cloudflare,
  }

  return {
    provider: overrides.provider ?? 'openrouter',
    systemPrompt: overrides.systemPrompt ?? 'You are ddzhilian admin AI.',
    cloudflare,
    openai: overrides.openai ?? [createOpenAiConfigFixture()],
    anthropic: overrides.anthropic ?? [createAnthropicConfigFixture()],
  }
}
