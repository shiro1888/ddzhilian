import { describe, expect, it } from 'vitest'
import { buildRefreshedOpenAiCompatibleModelConfig } from '../server/src/openai-compatible-model-refresh'

describe('OpenAI-compatible model refresh merging', () => {
  it('preserves manual toggles and keeps probe-failed models during refresh', () => {
    const refreshed = buildRefreshedOpenAiCompatibleModelConfig({
      currentModelId: 'mimo-v2.5-pro',
      detectedModels: [
        { id: 'mimo-v2-omni', label: 'mimo-v2-omni' },
        { id: 'mimo-v2.5', label: 'MIMO V2.5' },
      ],
      previousModels: [
        { id: 'mimo-v2-pro', label: 'mimo-v2-pro', enabled: true },
        { id: 'mimo-v2.5', label: 'mimo-v2.5', enabled: false },
        { id: 'mimo-v2.5-pro', label: 'mimo-v2.5-pro', enabled: true },
      ],
    })

    expect(refreshed.model).toBe('mimo-v2.5-pro')
    expect(refreshed.models).toEqual([
      { id: 'mimo-v2-pro', label: 'mimo-v2-pro', enabled: true },
      { id: 'mimo-v2.5', label: 'MIMO V2.5', enabled: false },
      { id: 'mimo-v2.5-pro', label: 'mimo-v2.5-pro', enabled: true },
      { id: 'mimo-v2-omni', label: 'mimo-v2-omni', enabled: false },
    ])
  })
})
