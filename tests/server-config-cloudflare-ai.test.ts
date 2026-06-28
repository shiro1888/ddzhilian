import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../server/src/config'

describe('server Cloudflare AI config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses GLM 5.2 as the default Workers AI text model', () => {
    vi.stubEnv('CLOUDFLARE_AI_MODEL', '')
    vi.stubEnv('CLOUDFLARE_AI_MODELS', '')

    const config = loadConfig()

    expect(config.cloudflareAi.model).toBe('@cf/zai-org/glm-5.2')
    expect(config.cloudflareAi.models.map((model) => model.id)).toEqual([
      '@cf/zai-org/glm-5.2',
      '@cf/google/gemma-4-26b-a4b-it',
      '@cf/openai/gpt-oss-120b',
    ])
    expect(config.cloudflareAi.estimatedInputNeuronsPerMillionTokens).toBe(127273)
    expect(config.cloudflareAi.estimatedOutputNeuronsPerMillionTokens).toBe(400000)
  })
})
