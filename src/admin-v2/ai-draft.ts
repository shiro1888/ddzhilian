import type {
  AdminAiSettings,
  AdminAnthropicConfig,
  AdminFeedbackProviderConfig,
  AdminModelToggleItem,
  AdminOpenRouterConfig,
} from '@/lib/ddzhilian-types'
import type {
  AdminAnthropicDetectResult,
  AdminOpenAiCompatibleDetectResult,
} from '@/admin-v2/api'

export type AdminAiProviderTarget = 'cloudflare' | 'openrouter' | string

export type AdminAiModelGroup = {
  providerId: AdminAiProviderTarget
  providerLabel: string
  providerTypeLabel: string
  defaultModel: string
  models: AdminModelToggleItem[]
}

function withUpdatedFeedbackProvider(
  settings: AdminAiSettings,
  providerId: string,
  updater: (provider: AdminFeedbackProviderConfig) => AdminFeedbackProviderConfig,
) {
  return {
    ...settings,
    feedbackProviders: settings.feedbackProviders.map((provider) =>
      provider.id === providerId ? updater(provider) : provider,
    ),
  }
}

export function getAdminAiProviderOptions(settings: AdminAiSettings) {
  return [
    { value: 'cloudflare', label: 'Cloudflare AI' },
    {
      value: 'openrouter',
      label: settings.openrouter.displayName.trim() || 'OpenRouter / OpenAI Compatible',
    },
    ...settings.feedbackProviders.map((provider) => ({
      value: provider.id,
      label: provider.displayName.trim() || provider.id,
    })),
  ]
}

export function buildAdminAiModelGroups(settings: AdminAiSettings): AdminAiModelGroup[] {
  return [
    {
      providerId: 'cloudflare',
      providerLabel: 'Cloudflare AI',
      providerTypeLabel: 'Workers AI',
      defaultModel: settings.cloudflare.model,
      models: settings.cloudflare.models,
    },
    {
      providerId: 'openrouter',
      providerLabel: settings.openrouter.displayName.trim() || 'OpenRouter / OpenAI Compatible',
      providerTypeLabel: settings.openrouter.baseUrl.trim() || 'OpenAI Compatible',
      defaultModel: settings.openrouter.model,
      models: settings.openrouter.models,
    },
    ...settings.feedbackProviders.map((provider) => ({
      providerId: provider.id,
      providerLabel: provider.displayName.trim() || provider.id,
      providerTypeLabel: provider.kind === 'anthropic' ? 'Anthropic feedback' : 'OpenAI feedback',
      defaultModel: provider.openai?.model ?? provider.anthropic?.model ?? '',
      models: provider.openai?.models ?? provider.anthropic?.models ?? [],
    })),
  ]
}

export function updateAdminAiProvider(settings: AdminAiSettings, provider: AdminAiSettings['provider']) {
  return {
    ...settings,
    provider,
  }
}

export function updateAdminAiSystemPrompt(settings: AdminAiSettings, systemPrompt: string) {
  return {
    ...settings,
    systemPrompt,
  }
}

export function addAdminFeedbackProvider(settings: AdminAiSettings, provider: AdminFeedbackProviderConfig) {
  return {
    ...settings,
    feedbackProviders: [...settings.feedbackProviders, provider],
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

export function updateAdminOpenRouterField<Field extends keyof AdminOpenRouterConfig>(
  settings: AdminAiSettings,
  field: Field,
  value: AdminOpenRouterConfig[Field],
) {
  return {
    ...settings,
    openrouter: {
      ...settings.openrouter,
      [field]: value,
    },
  }
}

export function updateAdminFeedbackOpenAiField<Field extends keyof AdminOpenRouterConfig>(
  settings: AdminAiSettings,
  providerId: string,
  field: Field,
  value: AdminOpenRouterConfig[Field],
) {
  return withUpdatedFeedbackProvider(settings, providerId, (provider) => ({
    ...provider,
    displayName: field === 'displayName'
      ? String(value).trim() || provider.displayName
      : provider.displayName,
    note: field === 'note'
      ? String(value)
      : provider.note,
    openai: provider.openai
      ? {
          ...provider.openai,
          [field]: value,
        }
      : provider.openai,
  }))
}

export function updateAdminFeedbackAnthropicField<Field extends keyof AdminAnthropicConfig>(
  settings: AdminAiSettings,
  providerId: string,
  field: Field,
  value: AdminAnthropicConfig[Field],
) {
  return withUpdatedFeedbackProvider(settings, providerId, (provider) => ({
    ...provider,
    anthropic: provider.anthropic
      ? {
          ...provider.anthropic,
          [field]: value,
        }
      : provider.anthropic,
  }))
}

export function updateAdminFeedbackProviderMeta(
  settings: AdminAiSettings,
  providerId: string,
  patch: Partial<Pick<AdminFeedbackProviderConfig, 'displayName' | 'note'>>,
) {
  return withUpdatedFeedbackProvider(settings, providerId, (provider) => ({
    ...provider,
    ...patch,
  }))
}

export function removeAdminFeedbackProvider(settings: AdminAiSettings, providerId: string) {
  return {
    ...settings,
    provider: settings.provider === providerId ? 'openrouter' : settings.provider,
    feedbackProviders: settings.feedbackProviders.filter((provider) => provider.id !== providerId),
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
  providerId: AdminAiProviderTarget,
  modelId: string,
) {
  if (providerId === 'cloudflare') {
    return {
      ...settings,
      cloudflare: {
        ...settings.cloudflare,
        model: modelId,
        models: setDefaultModelOnModels(settings.cloudflare.models, modelId),
      },
    }
  }

  if (providerId === 'openrouter') {
    return {
      ...settings,
      openrouter: {
        ...settings.openrouter,
        model: modelId,
        models: setDefaultModelOnModels(settings.openrouter.models, modelId),
      },
    }
  }

  return withUpdatedFeedbackProvider(settings, providerId, (provider) => {
    if (provider.openai) {
      return {
        ...provider,
        openai: {
          ...provider.openai,
          model: modelId,
          models: setDefaultModelOnModels(provider.openai.models, modelId),
        },
      }
    }

    if (provider.anthropic) {
      return {
        ...provider,
        anthropic: {
          ...provider.anthropic,
          model: modelId,
          defaultSonnetModel: modelId,
          defaultOpusModel: modelId,
          defaultHaikuModel: modelId,
          models: setDefaultModelOnModels(provider.anthropic.models, modelId),
        },
      }
    }

    return provider
  })
}

export function toggleAdminProviderModel(
  settings: AdminAiSettings,
  providerId: AdminAiProviderTarget,
  modelId: string,
  enabled: boolean,
) {
  const updateModels = (models: AdminModelToggleItem[]) =>
    models.map((model) => model.id === modelId ? { ...model, enabled } : model)

  if (providerId === 'cloudflare') {
    return {
      ...settings,
      cloudflare: {
        ...settings.cloudflare,
        models: updateModels(settings.cloudflare.models),
      },
    }
  }

  if (providerId === 'openrouter') {
    return {
      ...settings,
      openrouter: {
        ...settings.openrouter,
        models: updateModels(settings.openrouter.models),
      },
    }
  }

  return withUpdatedFeedbackProvider(settings, providerId, (provider) => {
    if (provider.openai) {
      return {
        ...provider,
        openai: {
          ...provider.openai,
          models: updateModels(provider.openai.models),
        },
      }
    }

    if (provider.anthropic) {
      return {
        ...provider,
        anthropic: {
          ...provider.anthropic,
          models: updateModels(provider.anthropic.models),
        },
      }
    }

    return provider
  })
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
    enabled: enabledIds.has(model.id) || model.id === selectedModelId,
  }))
}

export function applyOpenAiDetectionToAdminSettings(
  settings: AdminAiSettings,
  providerId: AdminAiProviderTarget,
  result: AdminOpenAiCompatibleDetectResult,
) {
  if (providerId === 'openrouter') {
    const selectedModelId = result.selectedModelId || settings.openrouter.model || result.models[0]?.id || ''
    return {
      ...settings,
      openrouter: {
        ...settings.openrouter,
        baseUrl: result.baseUrl,
        model: selectedModelId,
        models: buildDetectedModelList(settings.openrouter.models, result, selectedModelId),
      },
    }
  }

  return withUpdatedFeedbackProvider(settings, providerId, (provider) => {
    if (!provider.openai) {
      return provider
    }

    const selectedModelId = result.selectedModelId || provider.openai.model || result.models[0]?.id || ''
    return {
      ...provider,
      openai: {
        ...provider.openai,
        baseUrl: result.baseUrl,
        model: selectedModelId,
        models: buildDetectedModelList(provider.openai.models, result, selectedModelId),
      },
    }
  })
}

export function applyAnthropicDetectionToAdminSettings(
  settings: AdminAiSettings,
  providerId: string,
  result: AdminAnthropicDetectResult,
) {
  return withUpdatedFeedbackProvider(settings, providerId, (provider) => {
    if (!provider.anthropic) {
      return provider
    }

    const selectedModelId = result.selectedModelId || provider.anthropic.model || result.models[0]?.id || ''
    return {
      ...provider,
      anthropic: {
        ...provider.anthropic,
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
      },
    }
  })
}
