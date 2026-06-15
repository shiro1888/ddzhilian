import type { AdminModelToggleItem } from './registry/admin-config-registry.js';

export type OpenAiCompatibleModelOption = {
  id: string;
  label: string;
};

type BuildRefreshedOpenAiCompatibleModelConfigInput = {
  currentModelId: string;
  detectedModels: OpenAiCompatibleModelOption[];
  previousModels: AdminModelToggleItem[];
};

export function mergeOpenAiCompatibleModelRefresh(
  detectedModels: OpenAiCompatibleModelOption[],
  previousModels: AdminModelToggleItem[],
) {
  const detectedById = new Map(detectedModels.map((model) => [model.id, model]));
  const previousIds = new Set(previousModels.map((model) => model.id));
  const mergedModels = previousModels.map((model) => {
    const detected = detectedById.get(model.id);
    return {
      id: model.id,
      label: detected?.label || model.label || model.id,
      enabled: model.enabled,
    } satisfies AdminModelToggleItem;
  });

  for (const model of detectedModels) {
    if (previousIds.has(model.id)) {
      continue;
    }

    mergedModels.push({
      id: model.id,
      label: model.label || model.id,
      enabled: false,
    });
  }

  return mergedModels;
}

export function buildRefreshedOpenAiCompatibleModelConfig({
  currentModelId,
  detectedModels,
  previousModels,
}: BuildRefreshedOpenAiCompatibleModelConfigInput) {
  const models = mergeOpenAiCompatibleModelRefresh(detectedModels, previousModels);
  const model = currentModelId || models.find((item) => item.enabled)?.id || models[0]?.id || '';

  return {
    model,
    models,
  };
}
