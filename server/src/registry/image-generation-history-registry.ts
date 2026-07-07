import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface ImageGenerationImage {
  b64Json?: string;
  url?: string;
  mimeType: string;
  revisedPrompt?: string;
  byteSize?: number;
  width?: number;
  height?: number;
}

export interface ImageGenerationRecord {
  generationId: string;
  userId: string;
  prompt: string;
  provider: 'codex-reverse-proxy';
  model: string;
  size: string;
  quality: string;
  images: ImageGenerationImage[];
  createdAt: string;
}

export interface ImageGenerationCursor {
  createdAt: string;
  generationId: string;
}

export interface ImageGenerationPage {
  items: ImageGenerationRecord[];
  hasMore: boolean;
  nextCursor?: ImageGenerationCursor;
}

export interface ImageGenerationHistoryRegistryOptions {
  url: string;
  serviceRoleKey: string;
  imageGenerationsTable: string;
}

type PersistedImageGenerationRow = {
  generation_id: string;
  user_id: string;
  prompt: string;
  provider: string;
  model: string;
  size: string;
  quality: string;
  images: unknown;
  created_at: string;
};

function normalizePositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function normalizeImageEntries(value: unknown): ImageGenerationImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const b64Json = typeof candidate.b64Json === 'string' && candidate.b64Json.trim()
      ? candidate.b64Json.trim()
      : undefined;
    const url = typeof candidate.url === 'string' && candidate.url.trim()
      ? candidate.url.trim()
      : undefined;

    if (!b64Json && !url) {
      return [];
    }

    return [{
      b64Json,
      url,
      mimeType: typeof candidate.mimeType === 'string' && candidate.mimeType.trim()
        ? candidate.mimeType.trim()
        : 'image/png',
      revisedPrompt: typeof candidate.revisedPrompt === 'string' && candidate.revisedPrompt.trim()
        ? candidate.revisedPrompt.trim()
        : undefined,
      byteSize: normalizePositiveInteger(candidate.byteSize),
      width: normalizePositiveInteger(candidate.width),
      height: normalizePositiveInteger(candidate.height),
    }];
  });
}

function toRow(record: ImageGenerationRecord): PersistedImageGenerationRow {
  return {
    generation_id: record.generationId,
    user_id: record.userId,
    prompt: record.prompt,
    provider: record.provider,
    model: record.model,
    size: record.size,
    quality: record.quality,
    images: record.images,
    created_at: record.createdAt,
  };
}

function fromRow(row: PersistedImageGenerationRow): ImageGenerationRecord {
  return {
    generationId: row.generation_id,
    userId: row.user_id,
    prompt: row.prompt,
    provider: 'codex-reverse-proxy',
    model: row.model,
    size: row.size,
    quality: row.quality,
    images: normalizeImageEntries(row.images),
    createdAt: row.created_at,
  };
}

function toCursor(record: ImageGenerationRecord): ImageGenerationCursor {
  return {
    createdAt: record.createdAt,
    generationId: record.generationId,
  };
}

export class ImageGenerationHistoryRegistry {
  private readonly supabaseClient: SupabaseClient;

  private readonly imageGenerationsTable: string;

  constructor(options: ImageGenerationHistoryRegistryOptions) {
    this.supabaseClient = createClient(options.url, options.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.imageGenerationsTable = options.imageGenerationsTable;
  }

  async assertReady() {
    const { error } = await this.supabaseClient
      .from(this.imageGenerationsTable)
      .select('generation_id')
      .limit(1);

    if (error) {
      throw error;
    }
  }

  async save(input: Omit<ImageGenerationRecord, 'generationId'> & { generationId?: string }) {
    const record: ImageGenerationRecord = {
      generationId: input.generationId ?? randomUUID(),
      userId: input.userId,
      prompt: input.prompt,
      provider: input.provider,
      model: input.model,
      size: input.size,
      quality: input.quality,
      images: input.images,
      createdAt: input.createdAt,
    };

    const { error } = await this.supabaseClient
      .from(this.imageGenerationsTable)
      .upsert(toRow(record), { onConflict: 'generation_id' });

    if (error) {
      throw error;
    }

    return record;
  }

  async getForUser(userId: string, generationId: string): Promise<ImageGenerationRecord | null> {
    const { data, error } = await this.supabaseClient
      .from(this.imageGenerationsTable)
      .select('*')
      .eq('user_id', userId)
      .eq('generation_id', generationId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? fromRow(data as PersistedImageGenerationRow) : null;
  }

  async deleteForUser(userId: string, generationId: string): Promise<void> {
    const { error } = await this.supabaseClient
      .from(this.imageGenerationsTable)
      .delete()
      .eq('user_id', userId)
      .eq('generation_id', generationId);

    if (error) {
      throw error;
    }
  }

  async listForUser(userId: string, limit: number, cursor?: ImageGenerationCursor): Promise<ImageGenerationPage> {
    const pageSize = Math.max(1, Math.min(limit, 100));
    let query = this.supabaseClient
      .from(this.imageGenerationsTable)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('generation_id', { ascending: false })
      .limit(pageSize + 1);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},generation_id.lt.${cursor.generationId})`,
      );
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const records = ((data ?? []) as PersistedImageGenerationRow[]).map(fromRow);
    const items = records.slice(0, pageSize);
    const oldest = items[items.length - 1];

    return {
      items,
      hasMore: records.length > pageSize,
      nextCursor: oldest ? toCursor(oldest) : undefined,
    };
  }

}
