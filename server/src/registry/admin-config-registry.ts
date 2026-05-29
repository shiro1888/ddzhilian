import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type AnthropicProviderConfig,
  type FeedbackAiProviderConfig,
  type ManagedAiModelOption,
  type OpenAiCompatibleProviderConfig,
  type OpenAiCompatibleReasoningEffort,
  type OpenAiCompatibleWireApi,
  type ServerConfig,
} from '../config.js';

const ADMIN_CONFIG_ROOT = fileURLToPath(new URL('../../data/admin', import.meta.url));
const ADMIN_CONFIG_PATH = join(ADMIN_CONFIG_ROOT, 'config.json');
const ENV_PATH = fileURLToPath(new URL('../../.env', import.meta.url));
const defaultOpenRouterDisplayName = 'OpenRouter';
const defaultOpenRouterHomepageUrl = 'https://openrouter.ai';
const defaultOpenRouterBaseUrl = 'https://openrouter.ai/api/v1';
const defaultAnthropicDisplayName = 'Anthropic';
const defaultAnthropicBaseUrl = 'https://api.anthropic.com';
const defaultAnthropicMaxPromptChars = 8000;
const defaultAnthropicMaxOutputTokens = 1000;

export type AdminModelToggleItem = {
  id: string;
  label: string;
  enabled: boolean;
};

type AdminOpenAiCompatibleSnapshot = {
  displayName: string;
  homepageUrl: string;
  note: string;
  apiKey: string;
  baseUrl: string;
  wireApi: OpenAiCompatibleWireApi;
  reasoningEffort: OpenAiCompatibleReasoningEffort;
  siteUrl: string;
  siteName: string;
  model: string;
  models: AdminModelToggleItem[];
  maxPromptChars: number;
  maxOutputTokens: number;
};

type AdminAnthropicSnapshot = {
  baseUrl: string;
  authToken: string;
  model: string;
  defaultSonnetModel: string;
  defaultOpusModel: string;
  defaultHaikuModel: string;
  models: AdminModelToggleItem[];
  maxPromptChars: number;
  maxOutputTokens: number;
};

export type AdminFeedbackProviderSnapshot = {
  id: string;
  kind: 'openai-compatible' | 'anthropic';
  displayName: string;
  note: string;
  createdAt: string;
  openai?: AdminOpenAiCompatibleSnapshot;
  anthropic?: AdminAnthropicSnapshot;
};

export type AdminAiSettingsSnapshot = {
  provider: string;
  systemPrompt: string;
  cloudflare: {
    accountId: string;
    apiToken: string;
    model: string;
    models: AdminModelToggleItem[];
    freeOnly: boolean;
    dailyNeuronBudget: number;
    maxPromptChars: number;
    maxOutputTokens: number;
  };
  openai: AdminOpenAiCompatibleSnapshot[];
  anthropic: AdminAnthropicSnapshot[];
};

type LegacyProviderSnapshot = {
  id?: unknown;
  kind?: unknown;
  createdAt?: unknown;
  openai?: unknown;
  anthropic?: unknown;
  model?: unknown;
  modelsText?: unknown;
  models?: unknown;
  accountId?: unknown;
  apiToken?: unknown;
  apiKey?: unknown;
  displayName?: unknown;
  providerName?: unknown;
  homepageUrl?: unknown;
  providerUrl?: unknown;
  note?: unknown;
  baseUrl?: unknown;
  wireApi?: unknown;
  reasoningEffort?: unknown;
  siteUrl?: unknown;
  siteName?: unknown;
  authToken?: unknown;
  defaultSonnetModel?: unknown;
  defaultOpusModel?: unknown;
  defaultHaikuModel?: unknown;
  freeOnly?: unknown;
  dailyNeuronBudget?: unknown;
  maxPromptChars?: unknown;
  maxOutputTokens?: unknown;
};

type PersistedAdminConfig = {
  ai?: {
    provider?: unknown;
    systemPrompt?: unknown;
    cloudflare?: LegacyProviderSnapshot;
    openrouter?: LegacyProviderSnapshot;
    feedbackProviders?: unknown;
  };
};

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOpenAiCompatibleBaseUrl(value: unknown) {
  return normalizeOptionalString(value)
    .replace(/\/+$/g, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/+$/g, '');
}

function normalizeHomepageUrl(value: unknown) {
  return normalizeOptionalString(value).replace(/\/+$/g, '');
}

function normalizeOpenAiCompatibleWireApi(
  value: unknown,
  fallback: OpenAiCompatibleWireApi,
): OpenAiCompatibleWireApi {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase().replace(/[-/]/g, '_');
  return normalized === 'responses' ? 'responses' : 'chat_completions';
}

function normalizeOpenAiCompatibleReasoningEffort(
  value: unknown,
  fallback: OpenAiCompatibleReasoningEffort,
): OpenAiCompatibleReasoningEffort {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }

  return '';
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function normalizeSystemPrompt(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }

  return value.trim().slice(0, 20_000);
}

function normalizeFeedbackProviderId(value: unknown, index: number, usedIds: Set<string>) {
  const raw = normalizeOptionalString(value).replace(/^feedback:/i, '');
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const base = `feedback:${slug || `config-${index + 1}`}`;
  let next = base;
  let suffix = 2;

  while (usedIds.has(next)) {
    next = `${base}-${suffix.toString()}`;
    suffix += 1;
  }

  usedIds.add(next);
  return next;
}

function normalizeCreatedAt(value: unknown) {
  const normalized = normalizeOptionalString(value);
  return Number.isFinite(Date.parse(normalized)) ? normalized : new Date().toISOString();
}

function labelFromAiModelId(modelId: string) {
  return modelId.split('/').pop() || modelId;
}

function parseModelToggleItems(
  value: unknown,
  defaultModelId: string,
  fallbackModels: ManagedAiModelOption[],
): AdminModelToggleItem[] {
  if (Array.isArray(value)) {
    const mapped = value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return undefined;
        }

        const record = entry as Record<string, unknown>;
        const id = normalizeOptionalString(record.id);
        if (!id) {
          return undefined;
        }

        return {
          id,
          label: normalizeOptionalString(record.label) || labelFromAiModelId(id),
          enabled: record.enabled !== false,
        } satisfies AdminModelToggleItem;
      })
      .filter((entry): entry is AdminModelToggleItem => Boolean(entry));

    return ensureExplicitDefaultEnabled(mapped, defaultModelId);
  }

  const legacyText = normalizeOptionalString(value);
  if (!legacyText) {
    return ensureDefaultEnabled(
      fallbackModels.map((model) => ({
        id: model.id,
        label: model.label,
        enabled: model.enabled !== false,
      })),
      defaultModelId,
      fallbackModels,
    );
  }

  const parsed = legacyText
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap<AdminModelToggleItem>((entry) => {
      const [rawId, ...labelParts] = entry.split('|');
      const id = rawId?.trim();
      if (!id) {
        return [];
      }

      return [{
        id,
        label: labelParts.join('|').trim() || labelFromAiModelId(id),
        enabled: true,
      } satisfies AdminModelToggleItem];
    });

  return ensureDefaultEnabled(parsed, defaultModelId, fallbackModels);
}

function ensureExplicitDefaultEnabled(
  models: AdminModelToggleItem[],
  defaultModelId: string,
) {
  const next = new Map<string, AdminModelToggleItem>();

  for (const model of models) {
    next.set(model.id, model);
  }

  const safeDefaultId = next.has(defaultModelId)
    ? defaultModelId
    : [...next.values()].find((model) => model.enabled)?.id || [...next.keys()][0] || '';

  if (safeDefaultId) {
    const currentDefault = next.get(safeDefaultId);
    if (currentDefault) {
      next.set(safeDefaultId, {
        ...currentDefault,
        enabled: true,
      });
    }
  }

  return [...next.values()];
}

function ensureDefaultEnabled(
  models: AdminModelToggleItem[],
  defaultModelId: string,
  fallbackModels: ManagedAiModelOption[],
) {
  const next = new Map<string, AdminModelToggleItem>();

  for (const model of models) {
    next.set(model.id, model);
  }

  for (const fallbackModel of fallbackModels) {
    if (!next.has(fallbackModel.id)) {
      next.set(fallbackModel.id, {
        id: fallbackModel.id,
        label: fallbackModel.label,
        enabled: fallbackModel.enabled !== false,
      });
    }
  }

  const enabledModels = [...next.values()].filter((model) => model.enabled);
  const safeDefaultId = defaultModelId || enabledModels[0]?.id || [...next.keys()][0] || '';

  if (safeDefaultId) {
    const currentDefault = next.get(safeDefaultId);
    if (currentDefault) {
      next.set(safeDefaultId, {
        ...currentDefault,
        enabled: true,
      });
    } else {
      next.set(safeDefaultId, {
        id: safeDefaultId,
        label: labelFromAiModelId(safeDefaultId),
        enabled: true,
      });
    }
  }

  if ([...next.values()].every((model) => !model.enabled) && safeDefaultId) {
    const first = next.get(safeDefaultId);
    if (first) {
      next.set(safeDefaultId, { ...first, enabled: true });
    }
  }

  return [...next.values()];
}

function normalizeOpenAiCompatibleSnapshot(
  input: LegacyProviderSnapshot,
  fallback: OpenAiCompatibleProviderConfig,
): AdminOpenAiCompatibleSnapshot {
  const model = normalizeOptionalString(input.model) || fallback.model;
  const models = parseModelToggleItems(
    input.models ?? input.modelsText,
    model,
    fallback.models,
  );
  const normalizedModel = models.some((entry) => entry.id === model)
    ? model
    : models.find((entry) => entry.enabled)?.id ?? models[0]?.id ?? model;

  return {
    displayName:
      normalizeOptionalString(input.displayName) ||
      normalizeOptionalString(input.providerName) ||
      fallback.displayName ||
      defaultOpenRouterDisplayName,
    homepageUrl:
      normalizeHomepageUrl(input.homepageUrl) ||
      normalizeHomepageUrl(input.providerUrl) ||
      fallback.homepageUrl ||
      defaultOpenRouterHomepageUrl,
    note: normalizeOptionalString(input.note).slice(0, 240),
    apiKey: normalizeOptionalString(input.apiKey),
    baseUrl:
      normalizeOpenAiCompatibleBaseUrl(input.baseUrl) ||
      fallback.baseUrl ||
      defaultOpenRouterBaseUrl,
    wireApi: normalizeOpenAiCompatibleWireApi(input.wireApi, fallback.wireApi),
    reasoningEffort: normalizeOpenAiCompatibleReasoningEffort(
      input.reasoningEffort,
      fallback.reasoningEffort,
    ),
    siteUrl: normalizeOptionalString(input.siteUrl),
    siteName: normalizeOptionalString(input.siteName) || fallback.siteName,
    model: normalizedModel,
    models,
    maxPromptChars: normalizePositiveInteger(input.maxPromptChars, fallback.maxPromptChars),
    maxOutputTokens: normalizePositiveInteger(input.maxOutputTokens, fallback.maxOutputTokens),
  };
}

function normalizeAnthropicBaseUrl(value: unknown) {
  return normalizeOpenAiCompatibleBaseUrl(value)
    .replace(/\/v1\/messages$/i, '')
    .replace(/\/messages$/i, '')
    .replace(/\/+$/g, '');
}

function normalizeAnthropicSnapshot(
  input: LegacyProviderSnapshot,
  fallback?: AnthropicProviderConfig,
): AdminAnthropicSnapshot {
  const model =
    normalizeOptionalString(input.model) ||
    fallback?.model ||
    normalizeOptionalString(input.defaultOpusModel);
  const defaultSonnetModel =
    normalizeOptionalString(input.defaultSonnetModel) ||
    fallback?.defaultSonnetModel ||
    model;
  const defaultOpusModel =
    normalizeOptionalString(input.defaultOpusModel) ||
    fallback?.defaultOpusModel ||
    model;
  const defaultHaikuModel =
    normalizeOptionalString(input.defaultHaikuModel) ||
    fallback?.defaultHaikuModel ||
    model;
  const fallbackModels = fallback?.models ?? [];
  const configuredModels = [
    model,
    defaultSonnetModel,
    defaultOpusModel,
    defaultHaikuModel,
  ]
    .filter(Boolean)
    .map((id) => ({ id, label: labelFromAiModelId(id), enabled: true }));
  const models = parseModelToggleItems(
    input.models ?? input.modelsText,
    model,
    fallbackModels.length > 0 ? fallbackModels : configuredModels,
  );
  const normalizedModel = models.some((entry) => entry.id === model)
    ? model
    : models.find((entry) => entry.enabled)?.id ?? models[0]?.id ?? model;

  return {
    baseUrl:
      normalizeAnthropicBaseUrl(input.baseUrl) ||
      fallback?.baseUrl ||
      defaultAnthropicBaseUrl,
    authToken:
      normalizeOptionalString(input.authToken) ||
      fallback?.authToken ||
      '',
    model: normalizedModel,
    defaultSonnetModel,
    defaultOpusModel,
    defaultHaikuModel,
    models,
    maxPromptChars: normalizePositiveInteger(
      input.maxPromptChars,
      fallback?.maxPromptChars ?? defaultAnthropicMaxPromptChars,
    ),
    maxOutputTokens: normalizePositiveInteger(
      input.maxOutputTokens,
      fallback?.maxOutputTokens ?? defaultAnthropicMaxOutputTokens,
    ),
  };
}

function normalizeFeedbackProviders(
  value: unknown,
  fallback: ServerConfig,
): AdminFeedbackProviderSnapshot[] {
  const usedIds = new Set<string>();

  if (!Array.isArray(value)) {
    return fallback.feedbackAiProviders.map((provider, index) => {
      const id = normalizeFeedbackProviderId(provider.id, index, usedIds);
      return provider.kind === 'anthropic'
        ? {
            id,
            kind: 'anthropic',
            displayName: provider.displayName || defaultAnthropicDisplayName,
            note: provider.note || '',
            createdAt: normalizeCreatedAt(provider.createdAt),
            anthropic: normalizeAnthropicSnapshot(provider.anthropic ?? {}, provider.anthropic),
          }
        : {
            id,
            kind: 'openai-compatible',
            displayName: provider.displayName || provider.openai?.displayName || defaultOpenRouterDisplayName,
            note: provider.note || provider.openai?.note || '',
            createdAt: normalizeCreatedAt(provider.createdAt),
            openai: normalizeOpenAiCompatibleSnapshot(provider.openai ?? {}, fallback.openrouterAi),
          };
    });
  }

  return value.flatMap<AdminFeedbackProviderSnapshot>((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const record = entry as LegacyProviderSnapshot;
    const kind = record.kind === 'anthropic' || record.kind === 'openai-compatible'
      ? record.kind
      : record.anthropic ? 'anthropic' : 'openai-compatible';
    const id = normalizeFeedbackProviderId(record.id, index, usedIds);
    const createdAt = normalizeCreatedAt(record.createdAt);
    const note = normalizeOptionalString(record.note).slice(0, 240);

    if (kind === 'anthropic') {
      const anthropicInput = ((record.anthropic ?? record) || {}) as LegacyProviderSnapshot;
      const anthropic = normalizeAnthropicSnapshot(anthropicInput);
      const displayName =
        normalizeOptionalString(record.displayName) ||
        normalizeOptionalString(record.providerName) ||
        defaultAnthropicDisplayName;

      return [{
        id,
        kind,
        displayName,
        note,
        createdAt,
        anthropic,
      }];
    }

    const openaiInput = ((record.openai ?? record) || {}) as LegacyProviderSnapshot;
    const openai = normalizeOpenAiCompatibleSnapshot(openaiInput, fallback.openrouterAi);
    const displayName =
      normalizeOptionalString(record.displayName) ||
      normalizeOptionalString(record.providerName) ||
      openai.displayName ||
      defaultOpenRouterDisplayName;

    return [{
      id,
      kind,
      displayName,
      note,
      createdAt,
      openai: {
        ...openai,
        displayName,
        note,
      },
    }];
  });
}

function normalizeActiveProvider(value: unknown, feedbackProviders: AdminFeedbackProviderSnapshot[]) {
  const provider = normalizeOptionalString(value);
  if (provider === 'cloudflare' || provider === 'openrouter') {
    return provider;
  }

  if (feedbackProviders.some((entry) => entry.id === provider)) {
    return provider;
  }

  return 'cloudflare';
}

function normalizeSnapshot(
  input: PersistedAdminConfig['ai'] | AdminAiSettingsSnapshot,
  fallback: ServerConfig,
): AdminAiSettingsSnapshot {
  const cloudflareInput = (input?.cloudflare ?? {}) as LegacyProviderSnapshot;
  const openrouterInput = (input?.openrouter ?? {}) as LegacyProviderSnapshot;
  const cloudflareModel = normalizeOptionalString(cloudflareInput.model) || fallback.cloudflareAi.model;
  const cloudflareModels = parseModelToggleItems(
    cloudflareInput.models ?? cloudflareInput.modelsText,
    cloudflareModel,
    fallback.cloudflareAi.models,
  );
  const normalizedCloudflareModel = cloudflareModels.some((model) => model.id === cloudflareModel)
    ? cloudflareModel
    : cloudflareModels.find((model) => model.enabled)?.id ?? cloudflareModels[0]?.id ?? cloudflareModel;
  const feedbackProviders = normalizeFeedbackProviders(input?.feedbackProviders, fallback);

  // Build openai[] and anthropic[] from input or legacy feedbackProviders
  const openaiFromInput = (input as AdminAiSettingsSnapshot).openai;
  const anthropicFromInput = (input as AdminAiSettingsSnapshot).anthropic;

  let openaiList: AdminOpenAiCompatibleSnapshot[];
  let anthropicList: AdminAnthropicSnapshot[];

  if (Array.isArray(openaiFromInput)) {
    openaiList = openaiFromInput.map((item) => normalizeOpenAiCompatibleSnapshot(item as LegacyProviderSnapshot, fallback.openrouterAi));
  } else if (openrouterInput.baseUrl || openrouterInput.apiKey) {
    openaiList = [normalizeOpenAiCompatibleSnapshot(openrouterInput, fallback.openrouterAi)];
  } else {
    openaiList = [normalizeOpenAiCompatibleSnapshot({}, fallback.openrouterAi)];
  }

  if (Array.isArray(anthropicFromInput)) {
    anthropicList = anthropicFromInput.map((item) => normalizeAnthropicSnapshot(item as LegacyProviderSnapshot));
  } else {
    anthropicList = feedbackProviders
      .filter((p) => p.kind === 'anthropic')
      .map((p) => normalizeAnthropicSnapshot(p.anthropic as LegacyProviderSnapshot));
  }

  // Add feedback providers of openai-compatible kind that aren't already in openaiList
  const feedbackOpenAi = feedbackProviders.filter((p) => p.kind === 'openai-compatible');
  for (const fb of feedbackOpenAi) {
    openaiList.push(normalizeOpenAiCompatibleSnapshot(fb.openai as LegacyProviderSnapshot, fallback.openrouterAi));
  }

  return {
    provider: normalizeActiveProvider(input?.provider, feedbackProviders),
    systemPrompt: normalizeSystemPrompt(input?.systemPrompt, fallback.aiSystemPrompt),
    cloudflare: {
      accountId: normalizeOptionalString(cloudflareInput.accountId),
      apiToken: normalizeOptionalString(cloudflareInput.apiToken),
      model: normalizedCloudflareModel,
      models: cloudflareModels,
      freeOnly: cloudflareInput.freeOnly !== false,
      dailyNeuronBudget: normalizeNonNegativeInteger(
        cloudflareInput.dailyNeuronBudget,
        fallback.cloudflareAi.dailyNeuronBudget,
      ),
      maxPromptChars: normalizePositiveInteger(
        cloudflareInput.maxPromptChars,
        fallback.cloudflareAi.maxPromptChars,
      ),
      maxOutputTokens: normalizePositiveInteger(
        cloudflareInput.maxOutputTokens,
        fallback.cloudflareAi.maxOutputTokens,
      ),
    },
    openai: openaiList,
    anthropic: anthropicList,
  };
}

function toManagedOptions(models: AdminModelToggleItem[]): ManagedAiModelOption[] {
  return models.map((model) => ({
    id: model.id,
    label: model.label,
    enabled: model.enabled,
  }));
}

function toAdminOpenAiSnapshot(input: OpenAiCompatibleProviderConfig): AdminOpenAiCompatibleSnapshot {
  return {
    displayName: input.displayName,
    homepageUrl: input.homepageUrl,
    note: input.note,
    apiKey: input.apiKey ?? '',
    baseUrl: input.baseUrl,
    wireApi: input.wireApi,
    reasoningEffort: input.reasoningEffort,
    siteUrl: input.siteUrl ?? '',
    siteName: input.siteName,
    model: input.model,
    models: input.models.map((model) => ({
      id: model.id,
      label: model.label,
      enabled: model.enabled !== false,
    })),
    maxPromptChars: input.maxPromptChars,
    maxOutputTokens: input.maxOutputTokens,
  };
}

function toAdminAnthropicSnapshot(input: AnthropicProviderConfig): AdminAnthropicSnapshot {
  return {
    baseUrl: input.baseUrl,
    authToken: input.authToken ?? '',
    model: input.model,
    defaultSonnetModel: input.defaultSonnetModel,
    defaultOpusModel: input.defaultOpusModel,
    defaultHaikuModel: input.defaultHaikuModel,
    models: input.models.map((model) => ({
      id: model.id,
      label: model.label,
      enabled: model.enabled !== false,
    })),
    maxPromptChars: input.maxPromptChars,
    maxOutputTokens: input.maxOutputTokens,
  };
}

function toRuntimeOpenAiConfig(input: AdminOpenAiCompatibleSnapshot): OpenAiCompatibleProviderConfig {
  return {
    displayName: input.displayName,
    homepageUrl: input.homepageUrl,
    note: input.note,
    apiKey: input.apiKey || undefined,
    baseUrl: input.baseUrl,
    wireApi: input.wireApi,
    reasoningEffort: input.reasoningEffort,
    siteUrl: input.siteUrl || undefined,
    siteName: input.siteName,
    model: input.model,
    models: toManagedOptions(input.models),
    maxPromptChars: input.maxPromptChars,
    maxOutputTokens: input.maxOutputTokens,
  };
}

function toRuntimeAnthropicConfig(input: AdminAnthropicSnapshot): AnthropicProviderConfig {
  return {
    baseUrl: input.baseUrl,
    authToken: input.authToken || undefined,
    model: input.model,
    defaultSonnetModel: input.defaultSonnetModel,
    defaultOpusModel: input.defaultOpusModel,
    defaultHaikuModel: input.defaultHaikuModel,
    models: toManagedOptions(input.models),
    maxPromptChars: input.maxPromptChars,
    maxOutputTokens: input.maxOutputTokens,
  };
}

function toEnvLine(key: string, value: string) {
  return `${key}=${JSON.stringify(value)}`;
}

function syncSystemPromptToEnvFile(systemPrompt: string) {
  const nextLine = toEnvLine('AI_SYSTEM_PROMPT', systemPrompt);

  try {
    const current = readFileSync(ENV_PATH, 'utf8');
    const lines = current.split(/\r?\n/);
    const nextLines: string[] = [];
    let replaced = false;

    for (const line of lines) {
      if (line.startsWith('AI_SYSTEM_PROMPT=')) {
        if (!replaced) {
          nextLines.push(nextLine);
          replaced = true;
        }
        continue;
      }

      nextLines.push(line);
    }

    if (!replaced) {
      if (nextLines.length === 0) {
        nextLines.push(nextLine);
      } else if (nextLines[nextLines.length - 1] !== '') {
        nextLines.push(nextLine);
      } else {
        nextLines[nextLines.length - 1] = nextLine;
      }
    }

    writeFileSync(ENV_PATH, `${nextLines.join('\n').replace(/\n*$/, '\n')}`, 'utf8');
  } catch {
    writeFileSync(ENV_PATH, `${nextLine}\n`, 'utf8');
  }
}

export class AdminConfigRegistry {
  constructor(private readonly config: ServerConfig) {
    mkdirSync(ADMIN_CONFIG_ROOT, { recursive: true });
    this.load();
  }

  getAiSettingsSnapshot(): AdminAiSettingsSnapshot {
    const mainOpenAi: AdminOpenAiCompatibleSnapshot = {
      displayName: this.config.openrouterAi.displayName,
      homepageUrl: this.config.openrouterAi.homepageUrl,
      note: this.config.openrouterAi.note,
      apiKey: this.config.openrouterAi.apiKey ?? '',
      baseUrl: this.config.openrouterAi.baseUrl,
      wireApi: this.config.openrouterAi.wireApi,
      reasoningEffort: this.config.openrouterAi.reasoningEffort,
      siteUrl: this.config.openrouterAi.siteUrl ?? '',
      siteName: this.config.openrouterAi.siteName,
      model: this.config.openrouterAi.model,
      models: this.config.openrouterAi.models.map((model) => ({
        id: model.id,
        label: model.label,
        enabled: model.enabled !== false,
      })),
      maxPromptChars: this.config.openrouterAi.maxPromptChars,
      maxOutputTokens: this.config.openrouterAi.maxOutputTokens,
    };

    const openaiList: AdminOpenAiCompatibleSnapshot[] = [mainOpenAi];
    const anthropicList: AdminAnthropicSnapshot[] = [];

    for (const provider of this.config.feedbackAiProviders) {
      if (provider.kind === 'anthropic') {
        anthropicList.push(toAdminAnthropicSnapshot(provider.anthropic ?? normalizeAnthropicSnapshot({})));
      } else {
        openaiList.push(toAdminOpenAiSnapshot(provider.openai ?? normalizeOpenAiCompatibleSnapshot({}, this.config.openrouterAi)));
      }
    }

    return {
      provider: this.config.aiProvider,
      systemPrompt: this.config.aiSystemPrompt,
      cloudflare: {
        accountId: this.config.cloudflareAi.accountId ?? '',
        apiToken: this.config.cloudflareAi.apiToken ?? '',
        model: this.config.cloudflareAi.model,
        models: this.config.cloudflareAi.models.map((model) => ({
          id: model.id,
          label: model.label,
          enabled: model.enabled !== false,
        })),
        freeOnly: this.config.cloudflareAi.freeOnly,
        dailyNeuronBudget: this.config.cloudflareAi.dailyNeuronBudget,
        maxPromptChars: this.config.cloudflareAi.maxPromptChars,
        maxOutputTokens: this.config.cloudflareAi.maxOutputTokens,
      },
      openai: openaiList,
      anthropic: anthropicList,
    };
  }

  updateAiSettings(input: AdminAiSettingsSnapshot) {
    const normalized = normalizeSnapshot(input, this.config);
    this.applyAiSettings(normalized);
    this.persist({ ai: normalized });
    syncSystemPromptToEnvFile(normalized.systemPrompt);
    return this.getAiSettingsSnapshot();
  }

  private load() {
    try {
      const parsed = JSON.parse(readFileSync(ADMIN_CONFIG_PATH, 'utf8')) as PersistedAdminConfig;
      if (parsed.ai) {
        this.applyAiSettings(normalizeSnapshot(parsed.ai, this.config));
      }
    } catch {
      // Use environment defaults when no persisted admin overrides are present.
    }
  }

  private applyAiSettings(input: AdminAiSettingsSnapshot) {
    const hasOpenAi = Boolean(input.openai[0]?.baseUrl && input.openai[0]?.apiKey);
    const hasCloudflare = Boolean(input.cloudflare.accountId && input.cloudflare.apiToken);
    this.config.aiProvider = hasOpenAi ? 'openrouter' : hasCloudflare ? 'cloudflare' : this.config.aiProvider;
    this.config.aiSystemPrompt = input.systemPrompt;
    this.config.cloudflareAi.accountId = input.cloudflare.accountId || undefined;
    this.config.cloudflareAi.apiToken = input.cloudflare.apiToken || undefined;
    this.config.cloudflareAi.model = input.cloudflare.model;
    this.config.cloudflareAi.models = toManagedOptions(input.cloudflare.models);
    this.config.cloudflareAi.freeOnly = input.cloudflare.freeOnly;
    this.config.cloudflareAi.dailyNeuronBudget = input.cloudflare.dailyNeuronBudget;
    this.config.cloudflareAi.maxPromptChars = input.cloudflare.maxPromptChars;
    this.config.cloudflareAi.maxOutputTokens = input.cloudflare.maxOutputTokens;

    const mainOpenAi = input.openai[0];
    if (mainOpenAi) {
      this.config.openrouterAi.apiKey = mainOpenAi.apiKey || undefined;
      this.config.openrouterAi.displayName = mainOpenAi.displayName;
      this.config.openrouterAi.homepageUrl = mainOpenAi.homepageUrl;
      this.config.openrouterAi.note = mainOpenAi.note;
      this.config.openrouterAi.baseUrl = mainOpenAi.baseUrl;
      this.config.openrouterAi.wireApi = mainOpenAi.wireApi;
      this.config.openrouterAi.reasoningEffort = mainOpenAi.reasoningEffort;
      this.config.openrouterAi.siteUrl = mainOpenAi.siteUrl || undefined;
      this.config.openrouterAi.siteName = mainOpenAi.siteName;
      this.config.openrouterAi.model = mainOpenAi.model;
      this.config.openrouterAi.models = toManagedOptions(mainOpenAi.models);
      this.config.openrouterAi.maxPromptChars = mainOpenAi.maxPromptChars;
      this.config.openrouterAi.maxOutputTokens = mainOpenAi.maxOutputTokens;
    }

    const feedbackProviders: FeedbackAiProviderConfig[] = [];
    for (let i = 1; i < input.openai.length; i++) {
      const openai = input.openai[i];
      feedbackProviders.push({
        id: `feedback:openai-${i}`,
        kind: 'openai-compatible',
        displayName: openai.displayName,
        note: openai.note,
        createdAt: new Date().toISOString(),
        openai: toRuntimeOpenAiConfig(openai),
      });
    }
    for (let i = 0; i < input.anthropic.length; i++) {
      const anthropic = input.anthropic[i];
      feedbackProviders.push({
        id: `feedback:anthropic-${i}`,
        kind: 'anthropic',
        displayName: anthropic.displayName || 'Anthropic',
        note: '',
        createdAt: new Date().toISOString(),
        anthropic: toRuntimeAnthropicConfig(anthropic),
      });
    }
    this.config.feedbackAiProviders = feedbackProviders;
  }

  private persist(payload: PersistedAdminConfig) {
    mkdirSync(ADMIN_CONFIG_ROOT, { recursive: true });
    writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify(payload, null, 2), 'utf8');
  }
}
