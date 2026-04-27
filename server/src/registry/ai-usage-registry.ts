import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type ProviderKey = 'cloudflare' | 'openrouter';

export type AiUsageIncrement = {
  provider: ProviderKey;
  modelId: string;
  modelLabel: string;
  outcome: 'success' | 'failed' | 'quota_rejected';
  promptChars: number;
  responseChars?: number;
  promptTokens?: number;
  completionTokens?: number;
};

type StoredAiModelUsage = {
  provider: ProviderKey;
  modelId: string;
  modelLabel: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  quotaRejectedCalls: number;
  promptChars: number;
  responseChars: number;
  promptTokens: number;
  completionTokens: number;
  lastCalledAt?: string;
};

type StoredAiTrendBucket = {
  provider: ProviderKey;
  bucketStartAt: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  quotaRejectedCalls: number;
};

type StoredAiUsageState = {
  models: StoredAiModelUsage[];
  trendBuckets?: StoredAiTrendBucket[];
};

function createEmptyRecord(provider: ProviderKey, modelId: string, modelLabel: string): StoredAiModelUsage {
  return {
    provider,
    modelId,
    modelLabel,
    totalCalls: 0,
    successCalls: 0,
    failedCalls: 0,
    quotaRejectedCalls: 0,
    promptChars: 0,
    responseChars: 0,
    promptTokens: 0,
    completionTokens: 0,
  };
}

export class AiUsageRegistry {
  constructor(private readonly storagePath: string) {
    mkdirSync(dirname(this.storagePath), { recursive: true });
    this.load();
  }

  private readonly usageByKey = new Map<string, StoredAiModelUsage>();
  private readonly trendBucketsByKey = new Map<string, StoredAiTrendBucket>();

  record(input: AiUsageIncrement) {
    const key = `${input.provider}:${input.modelId}`;
    const current = this.usageByKey.get(key) ?? createEmptyRecord(input.provider, input.modelId, input.modelLabel);
    const next: StoredAiModelUsage = {
      ...current,
      modelLabel: input.modelLabel,
      totalCalls: current.totalCalls + 1,
      successCalls: current.successCalls + (input.outcome === 'success' ? 1 : 0),
      failedCalls: current.failedCalls + (input.outcome === 'failed' ? 1 : 0),
      quotaRejectedCalls: current.quotaRejectedCalls + (input.outcome === 'quota_rejected' ? 1 : 0),
      promptChars: current.promptChars + Math.max(0, Math.floor(input.promptChars)),
      responseChars: current.responseChars + Math.max(0, Math.floor(input.responseChars ?? 0)),
      promptTokens: current.promptTokens + Math.max(0, Math.floor(input.promptTokens ?? 0)),
      completionTokens: current.completionTokens + Math.max(0, Math.floor(input.completionTokens ?? 0)),
      lastCalledAt: new Date().toISOString(),
    };

    this.usageByKey.set(key, next);
    this.recordTrendBucket(input.provider, input.outcome);
    this.persist();
    return next;
  }

  list() {
    return [...this.usageByKey.values()].sort((left, right) => {
      const leftTime = Date.parse(left.lastCalledAt ?? '') || 0;
      const rightTime = Date.parse(right.lastCalledAt ?? '') || 0;
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return right.totalCalls - left.totalCalls;
    });
  }

  listTrendBuckets(hours = 24) {
    this.pruneTrendBuckets();
    const now = new Date();
    const buckets: StoredAiTrendBucket[] = [];

    for (const provider of ['cloudflare', 'openrouter'] as const) {
      for (let offset = hours - 1; offset >= 0; offset -= 1) {
        const bucketStartAt = toHourBucketIso(new Date(now.getTime() - offset * 60 * 60 * 1000));
        const bucketKey = `${provider}:${bucketStartAt}`;
        buckets.push(
          this.trendBucketsByKey.get(bucketKey) ?? {
            provider,
            bucketStartAt,
            totalCalls: 0,
            successCalls: 0,
            failedCalls: 0,
            quotaRejectedCalls: 0,
          },
        );
      }
    }

    return buckets;
  }

  private listStoredTrendBuckets() {
    this.pruneTrendBuckets();
    return [...this.trendBucketsByKey.values()].sort((left, right) => {
      const leftTime = Date.parse(left.bucketStartAt) || 0;
      const rightTime = Date.parse(right.bucketStartAt) || 0;
      if (left.provider !== right.provider) {
        return left.provider.localeCompare(right.provider);
      }

      return leftTime - rightTime;
    });
  }

  private recordTrendBucket(provider: ProviderKey, outcome: AiUsageIncrement['outcome']) {
    const bucketStartAt = toHourBucketIso(new Date());
    const key = `${provider}:${bucketStartAt}`;
    const current = this.trendBucketsByKey.get(key) ?? {
      provider,
      bucketStartAt,
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      quotaRejectedCalls: 0,
    };

    this.trendBucketsByKey.set(key, {
      ...current,
      totalCalls: current.totalCalls + 1,
      successCalls: current.successCalls + (outcome === 'success' ? 1 : 0),
      failedCalls: current.failedCalls + (outcome === 'failed' ? 1 : 0),
      quotaRejectedCalls: current.quotaRejectedCalls + (outcome === 'quota_rejected' ? 1 : 0),
    });
    this.pruneTrendBuckets();
  }

  private pruneTrendBuckets(retentionHours = 72) {
    const threshold = Date.now() - retentionHours * 60 * 60 * 1000;

    for (const [key, bucket] of this.trendBucketsByKey.entries()) {
      const bucketTime = Date.parse(bucket.bucketStartAt);
      if (Number.isFinite(bucketTime) && bucketTime >= threshold) {
        continue;
      }

      this.trendBucketsByKey.delete(key);
    }
  }

  private load() {
    try {
      const parsed = JSON.parse(readFileSync(this.storagePath, 'utf8')) as StoredAiUsageState;
      for (const record of parsed.models ?? []) {
        this.usageByKey.set(`${record.provider}:${record.modelId}`, {
          ...createEmptyRecord(record.provider, record.modelId, record.modelLabel),
          ...record,
        });
      }

      for (const bucket of parsed.trendBuckets ?? []) {
        this.trendBucketsByKey.set(`${bucket.provider}:${bucket.bucketStartAt}`, {
          provider: bucket.provider,
          bucketStartAt: bucket.bucketStartAt,
          totalCalls: Math.max(0, Math.floor(bucket.totalCalls ?? 0)),
          successCalls: Math.max(0, Math.floor(bucket.successCalls ?? 0)),
          failedCalls: Math.max(0, Math.floor(bucket.failedCalls ?? 0)),
          quotaRejectedCalls: Math.max(0, Math.floor(bucket.quotaRejectedCalls ?? 0)),
        });
      }

      this.pruneTrendBuckets();
    } catch {
      this.persist();
    }
  }

  private persist() {
    writeFileSync(
      this.storagePath,
      JSON.stringify({ models: this.list(), trendBuckets: this.listStoredTrendBuckets() }, null, 2),
      'utf8',
    );
  }
}

function toHourBucketIso(value: Date) {
  const bucket = new Date(value);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket.toISOString();
}
