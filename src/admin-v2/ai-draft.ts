import type {
  AdminAiSettings,
  AdminAnthropicConfig,
  AdminModelToggleItem,
  AdminOpenRouterConfig,
} from '@/lib/ddzhilian-types'
import type {
  AdminAnthropicDetectResult,
  AdminOpenAiCompatibleDetectResult,
} from '@/admin-v2/api'

export type AdminAiModelGroup = {
  providerKey: string
  providerLabel: string
  providerTypeLabel: string
  defaultModel: string
  models: AdminModelToggleItem[]
}

export function buildAdminAiModelGroups(settings: AdminAiSettings): AdminAiModelGroup[] {
  const groups: AdminAiModelGroup[] = [
    {
      providerKey: 'cloudflare',
      providerLabel: 'Cloudflare AI',
      providerTypeLabel: 'Workers AI',
      defaultModel: settings.cloudflare.model,
      models: settings.cloudflare.models,
    },
    ...settings.openai.map((config, index) => ({
      providerKey: `openai:${index.toString()}`,
      providerLabel: config.displayName.trim() || 'OpenAI Compatible',
      providerTypeLabel: config.baseUrl.trim() || 'OpenAI Compatible',
      defaultModel: config.model,
      models: config.models,
    })),
    ...settings.anthropic.map((config, index) => ({
      providerKey: `anthropic:${index.toString()}`,
      providerLabel: `Anthropic ${index + 1}`,
      providerTypeLabel: 'Anthropic',
      defaultModel: config.model,
      models: config.models,
    })),
  ]
  return groups
}

export function updateAdminAiSystemPrompt(settings: AdminAiSettings, systemPrompt: string) {
  return {
    ...settings,
    systemPrompt,
  }
}

export function updateAdminCloudflareField<Field extends keyof AdminAiSettings['cloudflare']>(
  settings: AdminAiSettings,
  field: Field,
  value: AdminAiSettings['cloudflare'][Field],
) {
  return {
    ...settings,
    cloudflare: {
      ...settings.cloudflare,
      [field]: value,
    },
  }
}

export function updateAdminOpenAiField<Field extends keyof AdminOpenRouterConfig>(
  settings: AdminAiSettings,
  index: number,
  field: Field,
  value: AdminOpenRouterConfig[Field],
) {
  return {
    ...settings,
    openai: settings.openai.map((config, i) =>
      i === index ? { ...config, [field]: value } : config,
    ),
  }
}

export function addAdminOpenAiConfig(settings: AdminAiSettings, config: AdminOpenRouterConfig) {
  return {
    ...settings,
    openai: [...settings.openai, config],
  }
}

export function removeAdminOpenAiConfig(settings: AdminAiSettings, index: number) {
  return {
    ...settings,
    openai: settings.openai.filter((_, i) => i !== index),
  }
}

export function addAdminAnthropicConfig(settings: AdminAiSettings, config: AdminAnthropicConfig) {
  return {
    ...settings,
    anthropic: [...settings.anthropic, config],
  }
}

export function removeAdminAnthropicConfig(settings: AdminAiSettings, index: number) {
  return {
    ...settings,
    anthropic: settings.anthropic.filter((_, i) => i !== index),
  }
}

export function updateAdminAnthropicField<Field extends keyof AdminAnthropicConfig>(
  settings: AdminAiSettings,
  index: number,
  field: Field,
  value: AdminAnthropicConfig[Field],
) {
  return {
    ...settings,
    anthropic: settings.anthropic.map((config, i) =>
      i === index ? { ...config, [field]: value } : config,
    ),
  }
}

function setDefaultModelOnModels(
  models: AdminModelToggleItem[],
  modelId: string,
) {
  return models.map((model) =>
    model.id === modelId
      ? { ...model, enabled: true }
      : model,
  )
}

export function setAdminProviderDefaultModel(
  settings: AdminAiSettings,
  providerKey: string,
  modelId: string,
) {
  if (providerKey === 'cloudflare') {
    return {
      ...settings,
      cloudflare: {
        ...settings.cloudflare,
        model: modelId,
        models: setDefaultModelOnModels(settings.cloudflare.models, modelId),
      },
    }
  }

  if (providerKey.startsWith('openai:')) {
    const index = Number.parseInt(providerKey.slice(7), 10)
    return {
      ...settings,
      openai: settings.openai.map((config, i) =>
        i === index
          ? {
              ...config,
              model: modelId,
              models: setDefaultModelOnModels(config.models, modelId),
            }
          : config,
      ),
    }
  }

  if (providerKey.startsWith('anthropic:')) {
    const index = Number.parseInt(providerKey.slice(10), 10)
    return {
      ...settings,
      anthropic: settings.anthropic.map((config, i) =>
        i === index
          ? {
              ...config,
              model: modelId,
              defaultSonnetModel: modelId,
              defaultOpusModel: modelId,
              defaultHaikuModel: modelId,
              models: setDefaultModelOnModels(config.models, modelId),
            }
          : config,
      ),
    }
  }

  return settings
}

export function toggleAdminProviderModel(
  settings: AdminAiSettings,
  providerKey: string,
  modelId: string,
  enabled: boolean,
) {
  const updateModels = (models: AdminModelToggleItem[]) =>
    models.map((model) => model.id === modelId ? { ...model, enabled } : model)

  if (providerKey === 'cloudflare') {
    return {
      ...settings,
      cloudflare: {
        ...settings.cloudflare,
        models: updateModels(settings.cloudflare.models),
      },
    }
  }

  if (providerKey.startsWith('openai:')) {
    const index = Number.parseInt(providerKey.slice(7), 10)
    return {
      ...settings,
      openai: settings.openai.map((config, i) =>
        i === index ? { ...config, models: updateModels(config.models) } : config,
      ),
    }
  }

  if (providerKey.startsWith('anthropic:')) {
    const index = Number.parseInt(providerKey.slice(10), 10)
    return {
      ...settings,
      anthropic: settings.anthropic.map((config, i) =>
        i === index ? { ...config, models: updateModels(config.models) } : config,
      ),
    }
  }

  return settings
}

function buildDetectedModelList(
  currentModels: AdminModelToggleItem[],
  result: AdminOpenAiCompatibleDetectResult,
  selectedModelId: string,
) {
  const enabledIds = new Set(currentModels.filter((model) => model.enabled).map((model) => model.id))

  return result.models.map((model) => ({
    id: model.id,
    label: model.label || model.id,
    alias: '',
    enabled: enabledIds.has(model.id) || model.id === selectedModelId,
  }))
}

export function applyOpenAiDetectionToAdminSettings(
  settings: AdminAiSettings,
  index: number,
  result: AdminOpenAiCompatibleDetectResult,
) {
  const selectedModelId = result.selectedModelId || settings.openai[index]?.model || result.models[0]?.id || ''
  return {
    ...settings,
    openai: settings.openai.map((config, i) =>
      i === index
        ? {
            ...config,
            baseUrl: result.baseUrl,
            model: selectedModelId,
            models: buildDetectedModelList(config.models, result, selectedModelId),
          }
        : config,
    ),
  }
}

export function applyAnthropicDetectionToAdminSettings(
  settings: AdminAiSettings,
  index: number,
  result: AdminAnthropicDetectResult,
) {
  const selectedModelId = result.selectedModelId || settings.anthropic[index]?.model || result.models[0]?.id || ''
  return {
    ...settings,
    anthropic: settings.anthropic.map((config, i) =>
      i === index
        ? {
            ...config,
            baseUrl: result.baseUrl,
            model: selectedModelId,
            defaultSonnetModel: selectedModelId,
            defaultOpusModel: selectedModelId,
            defaultHaikuModel: selectedModelId,
            models: result.models.map((model) => ({
              id: model.id,
              label: model.label || model.id,
              enabled: model.id === selectedModelId,
            })),
          }
        : config,
    ),
  }
}
