import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type ThemeSubmissionColors = {
  self: string;
  peer: string;
  ai: string;
};

export type ThemeSubmissionRecord = {
  submissionId: string;
  source: 'snaplink-beta';
  colors: ThemeSubmissionColors;
  deviceId?: string;
  deviceName?: string;
  accountId?: string;
  userAgent?: string;
  createdAt: string;
};

export type ThemeSubmissionStats = {
  total: number;
  listed: number;
  uniqueDevices: number;
  latestAt?: string;
};

export type ThemeSubmissionSnapshot = {
  configured: boolean;
  storage: 'supabase' | 'local' | 'local-fallback';
  submissions: ThemeSubmissionRecord[];
  stats: ThemeSubmissionStats;
  error?: string;
  loadedAt: string;
};

export type ThemeSubmissionInput = {
  colors: ThemeSubmissionColors;
  source?: 'snaplink-beta';
  deviceId?: string;
  deviceName?: string;
  accountId?: string;
  userAgent?: string;
};

export type ThemeSubmissionRegistryOptions = {
  localFilePath: string;
  supabase?: {
    url: string;
    serviceRoleKey: string;
    themeSubmissionsTable: string;
  };
};

type ThemeSubmissionRow = {
  submission_id: string;
  source: string;
  self_color: string;
  peer_color: string;
  ai_color: string;
  device_id: string | null;
  device_name: string | null;
  account_id: string | null;
  user_agent: string | null;
  created_at: string;
};

type LocalThemeSubmissionStore = {
  submissions?: unknown;
};

const SNAPLINK_THEME_SOURCE = 'snaplink-beta';
const DEFAULT_SNAPSHOT_LIMIT = 100;

function compareCreatedAtDesc(left: ThemeSubmissionRecord, right: ThemeSubmissionRecord) {
  const timeDiff = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return right.submissionId.localeCompare(left.submissionId);
}

function isThemeSubmissionRecord(value: unknown): value is ThemeSubmissionRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<ThemeSubmissionRecord>;
  return (
    typeof record.submissionId === 'string' &&
    record.source === SNAPLINK_THEME_SOURCE &&
    Boolean(record.colors) &&
    typeof record.colors?.self === 'string' &&
    typeof record.colors?.peer === 'string' &&
    typeof record.colors?.ai === 'string' &&
    typeof record.createdAt === 'string'
  );
}

function toThemeSubmissionRow(record: ThemeSubmissionRecord): ThemeSubmissionRow {
  return {
    submission_id: record.submissionId,
    source: record.source,
    self_color: record.colors.self,
    peer_color: record.colors.peer,
    ai_color: record.colors.ai,
    device_id: record.deviceId ?? null,
    device_name: record.deviceName ?? null,
    account_id: record.accountId ?? null,
    user_agent: record.userAgent ?? null,
    created_at: record.createdAt,
  };
}

function fromThemeSubmissionRow(row: ThemeSubmissionRow): ThemeSubmissionRecord {
  return {
    submissionId: row.submission_id,
    source: SNAPLINK_THEME_SOURCE,
    colors: {
      self: row.self_color,
      peer: row.peer_color,
      ai: row.ai_color,
    },
    deviceId: row.device_id ?? undefined,
    deviceName: row.device_name ?? undefined,
    accountId: row.account_id ?? undefined,
    userAgent: row.user_agent ?? undefined,
    createdAt: row.created_at,
  };
}

function buildStats(submissions: ThemeSubmissionRecord[], total: number): ThemeSubmissionStats {
  const uniqueDevices = new Set(
    submissions
      .map((submission) => submission.deviceId)
      .filter((deviceId): deviceId is string => Boolean(deviceId)),
  ).size;

  return {
    total,
    listed: submissions.length,
    uniqueDevices,
    latestAt: submissions[0]?.createdAt,
  };
}

export class ThemeSubmissionRegistry {
  static async create(options: ThemeSubmissionRegistryOptions) {
    const registry = new ThemeSubmissionRegistry(options);
    await registry.loadLocal();
    return registry;
  }

  private readonly localFilePath: string;

  private readonly supabaseClient?: SupabaseClient;

  private readonly themeSubmissionsTable?: string;

  private localSubmissions: ThemeSubmissionRecord[] = [];

  private constructor(options: ThemeSubmissionRegistryOptions) {
    this.localFilePath = options.localFilePath;

    if (options.supabase) {
      this.supabaseClient = createClient(options.supabase.url, options.supabase.serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      this.themeSubmissionsTable = options.supabase.themeSubmissionsTable;
    }
  }

  async record(input: ThemeSubmissionInput) {
    const record: ThemeSubmissionRecord = {
      submissionId: randomUUID(),
      source: input.source ?? SNAPLINK_THEME_SOURCE,
      colors: input.colors,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      accountId: input.accountId,
      userAgent: input.userAgent,
      createdAt: new Date().toISOString(),
    };

    if (this.supabaseClient && this.themeSubmissionsTable) {
      const { error } = await this.supabaseClient
        .from(this.themeSubmissionsTable)
        .insert(toThemeSubmissionRow(record));

      if (!error) {
        return {
          record,
          storedIn: 'supabase' as const,
        };
      }

      console.warn('Theme submission Supabase insert failed; using local fallback.', {
        message: error.message,
      });
    }

    await this.recordLocal(record);
    return {
      record,
      storedIn: this.supabaseClient ? 'local-fallback' as const : 'local' as const,
    };
  }

  async getSnapshot(limit = DEFAULT_SNAPSHOT_LIMIT): Promise<ThemeSubmissionSnapshot> {
    const loadedAt = new Date().toISOString();

    if (this.supabaseClient && this.themeSubmissionsTable) {
      const { data, count, error } = await this.supabaseClient
        .from(this.themeSubmissionsTable)
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('submission_id', { ascending: false })
        .limit(limit);

      if (!error && data) {
        const submissions = (data as ThemeSubmissionRow[]).map(fromThemeSubmissionRow);
        return {
          configured: true,
          storage: 'supabase',
          submissions,
          stats: buildStats(submissions, count ?? submissions.length),
          loadedAt,
        };
      }

      const fallbackSubmissions = this.getLocalSubmissions(limit);
      return {
        configured: true,
        storage: 'local-fallback',
        submissions: fallbackSubmissions,
        stats: buildStats(fallbackSubmissions, this.localSubmissions.length),
        error: error?.message ?? '主题配色提交读取失败。',
        loadedAt,
      };
    }

    const submissions = this.getLocalSubmissions(limit);
    return {
      configured: false,
      storage: 'local',
      submissions,
      stats: buildStats(submissions, this.localSubmissions.length),
      loadedAt,
    };
  }

  private async loadLocal() {
    let payload: LocalThemeSubmissionStore;
    try {
      payload = JSON.parse(await readFile(this.localFilePath, 'utf8')) as LocalThemeSubmissionStore;
    } catch {
      this.localSubmissions = [];
      return;
    }

    const submissions = Array.isArray(payload.submissions) ? payload.submissions : [];
    this.localSubmissions = submissions
      .filter(isThemeSubmissionRecord)
      .sort(compareCreatedAtDesc);
  }

  private async recordLocal(record: ThemeSubmissionRecord) {
    this.localSubmissions = [record, ...this.localSubmissions]
      .sort(compareCreatedAtDesc)
      .slice(0, 1000);
    await mkdir(dirname(this.localFilePath), { recursive: true });
    await writeFile(
      this.localFilePath,
      JSON.stringify({ submissions: this.localSubmissions }, null, 2),
      'utf8',
    );
  }

  private getLocalSubmissions(limit: number) {
    return this.localSubmissions
      .slice()
      .sort(compareCreatedAtDesc)
      .slice(0, limit);
  }
}
