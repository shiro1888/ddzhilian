import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AdminV2UnauthorizedError,
  detectAdminAnthropicModels,
  detectAdminOpenAiCompatibleModels,
  refreshAdminOpenAiCompatibleModels,
  saveAdminAiConfig,
} from '@/admin-v2/api'
import { createAdminAiSettingsFixture } from './fixtures/admin-ai-settings'
import { createAdminStateFixture } from './fixtures/admin-state'

const originalFetch = globalThis.fetch

function mockJsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
    ...init,
  })
}

function getLastFetchCall() {
  const fetchMock = vi.mocked(globalThis.fetch)
  const call = fetchMock.mock.calls.at(-1)
  if (!call) {
    throw new Error('Expected fetch to be called.')
  }
  return call
}

describe('Admin V2 provider API client', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SIGNALING_HTTP_URL', 'https://admin-api.example.com/')
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    globalThis.fetch = originalFetch
  })

  it('posts the complete AI settings when saving provider configuration', async () => {
    const aiSettings = createAdminAiSettingsFixture()
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockJsonResponse(createAdminStateFixture({ ai: aiSettings })))

    const result = await saveAdminAiConfig(aiSettings)
    const [url, init] = getLastFetchCall()

    expect(url).toBe('https://admin-api.example.com/api/admin/ai-config')
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
    })
    expect(JSON.parse(String(init?.body))).toEqual(aiSettings)
    expect(result.ai).toEqual(aiSettings)
  })

  it('posts OpenAI compatible model detection parameters', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockJsonResponse({
      baseUrl: 'https://api.provider.example.com/v1',
      selectedModelId: 'gpt-4.1-mini',
      models: [{ id: 'gpt-4.1-mini', label: 'GPT 4.1 Mini' }],
    }))

    const input = {
      baseUrl: 'https://api.provider.example.com/v1',
      apiKey: 'sk-test-openai',
      modelId: 'gpt-4.1-mini',
      wireApi: 'responses' as const,
      reasoningEffort: 'medium' as const,
    }
    const result = await detectAdminOpenAiCompatibleModels(input)
    const [url, init] = getLastFetchCall()

    expect(url).toBe('https://admin-api.example.com/api/admin/ai-config/detect')
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
    })
    expect(JSON.parse(String(init?.body))).toEqual(input)
    expect(result.selectedModelId).toBe('gpt-4.1-mini')
  })

  it('throws an unauthorized error for OpenAI compatible detection 401 and 403 responses', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockJsonResponse(
      { error: '管理员账号会话已失效。' },
      { status: 401 },
    ))

    await expect(detectAdminOpenAiCompatibleModels({
      baseUrl: 'https://api.provider.example.com/v1',
      apiKey: 'sk-test-openai',
    })).rejects.toBeInstanceOf(AdminV2UnauthorizedError)

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockJsonResponse(
      { error: '权限不足。' },
      { status: 403 },
    ))

    await expect(detectAdminOpenAiCompatibleModels({
      baseUrl: 'https://api.provider.example.com/v1',
      apiKey: 'sk-test-openai',
    })).rejects.toBeInstanceOf(AdminV2UnauthorizedError)
  })

  it('uses backend errors or fallback messages for non-2xx provider responses', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockJsonResponse(
      { error: '上游模型检测失败。' },
      { status: 500 },
    ))

    await expect(detectAdminOpenAiCompatibleModels({
      baseUrl: 'https://api.provider.example.com/v1',
      apiKey: 'sk-test-openai',
    })).rejects.toThrow('上游模型检测失败。')

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('not json', { status: 502 }))

    await expect(detectAdminOpenAiCompatibleModels({
      baseUrl: 'https://api.provider.example.com/v1',
      apiKey: 'sk-test-openai',
    })).rejects.toThrow('模型检测失败。')
  })

  it('posts Anthropic model detection parameters', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockJsonResponse({
      baseUrl: 'https://api.anthropic.example.com',
      selectedModelId: 'claude-sonnet-4-5',
      models: [{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }],
    }))

    const input = {
      baseUrl: 'https://api.anthropic.example.com',
      authToken: 'anthropic-token',
    }
    const result = await detectAdminAnthropicModels(input)
    const [url, init] = getLastFetchCall()

    expect(url).toBe('https://admin-api.example.com/api/admin/ai-config/detect-anthropic')
    expect(JSON.parse(String(init?.body))).toEqual(input)
    expect(result.selectedModelId).toBe('claude-sonnet-4-5')
  })

  it('posts an empty JSON body when refreshing OpenAI compatible models', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockJsonResponse({
      ...createAdminStateFixture(),
      refresh: {
        refreshed: true,
        refreshedAt: '2026-06-10T08:00:00.000Z',
        baseUrl: 'https://api.provider.example.com/v1',
        models: [],
      },
    }))

    await refreshAdminOpenAiCompatibleModels()
    const [url, init] = getLastFetchCall()

    expect(url).toBe('https://admin-api.example.com/api/admin/ai-config/refresh-models')
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: '{}',
    })
  })
})
