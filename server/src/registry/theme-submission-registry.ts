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

export type ThemeSubmissionStoredResult = {
  stored: true;
  storedIn: 'supabase' | 'local' | 'local-fallback';
  record: ThemeSubmissionRecord;
};

export type ThemeSubmissionSkippedReason = 'built-in-theme' | 'duplicate-colors';

export type ThemeSubmissionSkippedResult = {
  stored: false;
  storedIn?: undefined;
  skippedReason: ThemeSubmissionSkippedReason;
};

export type ThemeSubmissionRecordResult = ThemeSubmissionStoredResult | ThemeSubmissionSkippedResult;

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
const SNAPSHOT_SCAN_LIMIT = 1000;
const BUILT_IN_THEME_COLOR_KEYS = new Set([
  { self: '#F9887F', peer: '#F5F4F1', ai: '#EFF6FF' },
  { self: '#F9887F', peer: '#FFF4F2', ai: '#FFE8E5' },
  { self: '#95EC69', peer: '#F2F8ED', ai: '#EAF7E1' },
  { self: '#6EA8FE', peer: '#F3F7FF', ai: '#EAF2FF' },
  { self: '#B7E36D', peer: '#F6FAEE', ai: '#EEF8D8' },
  { self: '#F6B35D', peer: '#FFF7ED', ai: '#FFEED8' },
].map(themeColorsKey));

function normalizeThemeColorKeyPart(color: string) {
  return color.trim().toUpperCase();
}

function themeColorsKey(colors: ThemeSubmissionColors) {
  return [
    normalizeThemeColorKeyPart(colors.self),
    normalizeThemeColorKeyPart(colors.peer),
    normalizeThemeColorKeyPart(colors.ai),
  ].join('|');
}

function normalizeThemeColors(colors: ThemeSubmissionColors): ThemeSubmissionColors {
  return {
    self: normalizeThemeColorKeyPart(colors.self),
    peer: normalizeThemeColorKeyPart(colors.peer),
    ai: normalizeThemeColorKeyPart(colors.ai),
  };
}

function isBuiltInThemeColors(colors: ThemeSubmissionColors) {
  return BUILT_IN_THEME_COLOR_KEYS.has(themeColorsKey(colors));
}

function containsThemeColors(submissions: ThemeSubmissionRecord[], colors: ThemeSubmissionColors) {
  const targetKey = themeColorsKey(colors);
  return submissions.some((submission) => themeColorsKey(submission.colors) === targetKey);
}

function getReportableSubmissions(submissions: ThemeSubmissionRecord[]) {
  const seenColorKeys = new Set<string>();
  return submissions.filter((submission) => {
    const colorKey = themeColorsKey(submission.colors);
    if (BUILT_IN_THEME_COLOR_KEYS.has(colorKey) || seenColorKeys.has(colorKey)) {
      return false;
    }

    seenColorKeys.add(colorKey);
    return true;
  });
}

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

  async record(input: ThemeSubmissionInput): Promise<ThemeSubmissionRecordResult> {
    const colors = normalizeThemeColors(input.colors);
    if (isBuiltInThemeColors(colors)) {
      return {
        stored: false,
        skippedReason: 'built-in-theme',
      };
    }

    if (containsThemeColors(this.localSubmissions, colors)) {
      return {
        stored: false,
        skippedReason: 'duplicate-colors',
      };
    }

    if (
      this.supabaseClient &&
      this.themeSubmissionsTable &&
      await this.hasSupabaseThemeColors(colors)
    ) {
      return {
        stored: false,
        skippedReason: 'duplicate-colors',
      };
    }

    const record: ThemeSubmissionRecord = {
      submissionId: randomUUID(),
      source: input.source ?? SNAPLINK_THEME_SOURCE,
      colors,
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
          stored: true,
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
      stored: true,
      record,
      storedIn: this.supabaseClient ? 'local-fallback' as const : 'local' as const,
    };
  }

  async getSnapshot(limit = DEFAULT_SNAPSHOT_LIMIT): Promise<ThemeSubmissionSnapshot> {
    const loadedAt = new Date().toISOString();

    if (this.supabaseClient && this.themeSubmissionsTable) {
      const { data, error } = await this.supabaseClient
        .from(this.themeSubmissionsTable)
        .select('*')
        .order('created_at', { ascending: false })
        .order('submission_id', { ascending: false })
        .limit(Math.max(limit, SNAPSHOT_SCAN_LIMIT));

      if (!error && data) {
        const reportableSubmissions = getReportableSubmissions(
          (data as ThemeSubmissionRow[]).map(fromThemeSubmissionRow),
        );
        const submissions = reportableSubmissions.slice(0, limit);
        return {
          configured: true,
          storage: 'supabase',
          submissions,
          stats: buildStats(submissions, reportableSubmissions.length),
          loadedAt,
        };
      }

      const fallbackReportableSubmissions = this.getLocalReportableSubmissions();
      const fallbackSubmissions = fallbackReportableSubmissions.slice(0, limit);
      return {
        configured: true,
        storage: 'local-fallback',
        submissions: fallbackSubmissions,
        stats: buildStats(fallbackSubmissions, fallbackReportableSubmissions.length),
        error: error?.message ?? '主题配色提交读取失败。',
        loadedAt,
      };
    }

    const reportableSubmissions = this.getLocalReportableSubmissions();
    const submissions = reportableSubmissions.slice(0, limit);
    return {
      configured: false,
      storage: 'local',
      submissions,
      stats: buildStats(submissions, reportableSubmissions.length),
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

  private getLocalReportableSubmissions() {
    return getReportableSubmissions(this.localSubmissions
      .slice()
      .sort(compareCreatedAtDesc));
  }

  private async hasSupabaseThemeColors(colors: ThemeSubmissionColors) {
    if (!this.supabaseClient || !this.themeSubmissionsTable) {
      return false;
    }

    const { data, error } = await this.supabaseClient
      .from(this.themeSubmissionsTable)
      .select('submission_id')
      .ilike('self_color', colors.self)
      .ilike('peer_color', colors.peer)
      .ilike('ai_color', colors.ai)
      .limit(1);

    if (error) {
      console.warn('Theme submission duplicate check failed; continuing with insert.', {
        message: error.message,
      });
      return false;
    }

    return Array.isArray(data) && data.length > 0;
  }
}
