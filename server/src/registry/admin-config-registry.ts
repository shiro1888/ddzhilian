import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type ManagedAiModelOption,
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

export type AdminModelToggleItem = {
  id: string;
  label: string;
  enabled: boolean;
};

export type AdminAiSettingsSnapshot = {
  provider: 'cloudflare' | 'openrouter';
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
  openrouter: {
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
};

type LegacyProviderSnapshot = {
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

function normalizeSnapshot(
  input: PersistedAdminConfig['ai'] | AdminAiSettingsSnapshot,
  fallback: ServerConfig,
): AdminAiSettingsSnapshot {
  const provider = input?.provider === 'openrouter' ? 'openrouter' : 'cloudflare';
  const cloudflareInput = (input?.cloudflare ?? {}) as LegacyProviderSnapshot;
  const openrouterInput = (input?.openrouter ?? {}) as LegacyProviderSnapshot;
  const cloudflareModel = normalizeOptionalString(cloudflareInput.model) || fallback.cloudflareAi.model;
  const openrouterModel = normalizeOptionalString(openrouterInput.model) || fallback.openrouterAi.model;
  const openrouterDisplayName =
    normalizeOptionalString(openrouterInput.displayName) ||
    normalizeOptionalString(openrouterInput.providerName) ||
    fallback.openrouterAi.displayName ||
    defaultOpenRouterDisplayName;
  const cloudflareModels = parseModelToggleItems(
    cloudflareInput.models ?? cloudflareInput.modelsText,
    cloudflareModel,
    fallback.cloudflareAi.models,
  );
  const openrouterModels = parseModelToggleItems(
    openrouterInput.models ?? openrouterInput.modelsText,
    openrouterModel,
    fallback.openrouterAi.models,
  );
  const normalizedCloudflareModel = cloudflareModels.some((model) => model.id === cloudflareModel)
    ? cloudflareModel
    : cloudflareModels.find((model) => model.enabled)?.id ?? cloudflareModels[0]?.id ?? cloudflareModel;
  const normalizedOpenrouterModel = openrouterModels.some((model) => model.id === openrouterModel)
    ? openrouterModel
    : openrouterModels.find((model) => model.enabled)?.id ?? openrouterModels[0]?.id ?? openrouterModel;

  return {
    provider,
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
    openrouter: {
      displayName: openrouterDisplayName,
      homepageUrl:
        normalizeHomepageUrl(openrouterInput.homepageUrl) ||
        normalizeHomepageUrl(openrouterInput.providerUrl) ||
        fallback.openrouterAi.homepageUrl ||
        defaultOpenRouterHomepageUrl,
      note: normalizeOptionalString(openrouterInput.note).slice(0, 240),
      apiKey: normalizeOptionalString(openrouterInput.apiKey),
      baseUrl:
        normalizeOpenAiCompatibleBaseUrl(openrouterInput.baseUrl) ||
        fallback.openrouterAi.baseUrl ||
        defaultOpenRouterBaseUrl,
      wireApi: normalizeOpenAiCompatibleWireApi(
        openrouterInput.wireApi,
        fallback.openrouterAi.wireApi,
      ),
      reasoningEffort: normalizeOpenAiCompatibleReasoningEffort(
        openrouterInput.reasoningEffort,
        fallback.openrouterAi.reasoningEffort,
      ),
      siteUrl: normalizeOptionalString(openrouterInput.siteUrl),
      siteName: normalizeOptionalString(openrouterInput.siteName) || fallback.openrouterAi.siteName,
      model: normalizedOpenrouterModel,
      models: openrouterModels,
      maxPromptChars: normalizePositiveInteger(
        openrouterInput.maxPromptChars,
        fallback.openrouterAi.maxPromptChars,
      ),
      maxOutputTokens: normalizePositiveInteger(
        openrouterInput.maxOutputTokens,
        fallback.openrouterAi.maxOutputTokens,
      ),
    },
  };
}

function toManagedOptions(models: AdminModelToggleItem[]): ManagedAiModelOption[] {
  return models.map((model) => ({
    id: model.id,
    label: model.label,
    enabled: model.enabled,
  }));
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
      openrouter: {
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
      },
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
    this.config.aiProvider = input.provider;
    this.config.aiSystemPrompt = input.systemPrompt;
    this.config.cloudflareAi.accountId = input.cloudflare.accountId || undefined;
    this.config.cloudflareAi.apiToken = input.cloudflare.apiToken || undefined;
    this.config.cloudflareAi.model = input.cloudflare.model;
    this.config.cloudflareAi.models = toManagedOptions(input.cloudflare.models);
    this.config.cloudflareAi.freeOnly = input.cloudflare.freeOnly;
    this.config.cloudflareAi.dailyNeuronBudget = input.cloudflare.dailyNeuronBudget;
    this.config.cloudflareAi.maxPromptChars = input.cloudflare.maxPromptChars;
    this.config.cloudflareAi.maxOutputTokens = input.cloudflare.maxOutputTokens;

    this.config.openrouterAi.apiKey = input.openrouter.apiKey || undefined;
    this.config.openrouterAi.displayName = input.openrouter.displayName;
    this.config.openrouterAi.homepageUrl = input.openrouter.homepageUrl;
    this.config.openrouterAi.note = input.openrouter.note;
    this.config.openrouterAi.baseUrl = input.openrouter.baseUrl;
    this.config.openrouterAi.wireApi = input.openrouter.wireApi;
    this.config.openrouterAi.reasoningEffort = input.openrouter.reasoningEffort;
    this.config.openrouterAi.siteUrl = input.openrouter.siteUrl || undefined;
    this.config.openrouterAi.siteName = input.openrouter.siteName;
    this.config.openrouterAi.model = input.openrouter.model;
    this.config.openrouterAi.models = toManagedOptions(input.openrouter.models);
    this.config.openrouterAi.maxPromptChars = input.openrouter.maxPromptChars;
    this.config.openrouterAi.maxOutputTokens = input.openrouter.maxOutputTokens;
  }

  private persist(payload: PersistedAdminConfig) {
    mkdirSync(ADMIN_CONFIG_ROOT, { recursive: true });
    writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify(payload, null, 2), 'utf8');
  }
}
