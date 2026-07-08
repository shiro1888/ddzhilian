import { appendFileSync, createWriteStream, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  type HistoryFileSummary,
  type HistoryTextSummary,
} from '../protocol.js';

const HISTORY_ROOT = fileURLToPath(new URL('../../data/history', import.meta.url));
const FILES_ROOT = join(HISTORY_ROOT, 'files');
const INDEX_PATH = join(HISTORY_ROOT, 'index.json');
const REMOTE_BATCH_SIZE = 500;

export interface HistoryFileRecord {
  historyId: string;
  roomId: string;
  sessionId?: string;
  isPublic: boolean;
  sourceDeviceId: string;
  sourceDeviceName: string;
  fileName: string;
  size: number;
  mimeType?: string;
  createdAt: string;
  storagePath: string;
}

export interface HistoryTextRecord {
  historyId: string;
  roomId: string;
  sessionId?: string;
  isPublic: boolean;
  sourceDeviceId: string;
  sourceDeviceName: string;
  text: string;
  createdAt: string;
}

export interface HistoryStats {
  fileCount: number;
  textCount: number;
  totalBytes: number;
  roomCount: number;
  activeUserCount: number;
  lastFileAt?: string;
  lastTextAt?: string;
  lastActivityAt?: string;
  textTrendBuckets: HistoryTextTrendBucket[];
}

export interface HistoryTextTrendBucket {
  bucketStartAt: string;
  messageCount: number;
}

const HOUR_BUCKET_MS = 60 * 60 * 1000;

function toHourBucketIso(value: Date) {
  const bucket = new Date(value);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket.toISOString();
}

function buildTextTrendBuckets(records: HistoryTextRecord[], hours: number) {
  const bucketsByIso = new Map<string, number>();

  for (const record of records) {
    if (record.sourceDeviceId.startsWith('bot_')) {
      continue;
    }

    const timestamp = Date.parse(record.createdAt);
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const bucketStartAt = toHourBucketIso(new Date(timestamp));
    bucketsByIso.set(bucketStartAt, (bucketsByIso.get(bucketStartAt) ?? 0) + 1);
  }

  const now = Date.now();
  const buckets: HistoryTextTrendBucket[] = [];

  for (let offset = hours - 1; offset >= 0; offset -= 1) {
    const bucketStartAt = toHourBucketIso(new Date(now - offset * HOUR_BUCKET_MS));
    buckets.push({
      bucketStartAt,
      messageCount: bucketsByIso.get(bucketStartAt) ?? 0,
    });
  }

  return buckets;
}

export interface HistoryTextRoomStats {
  count: number;
  latestAt?: string;
  latestPreview?: string;
  latestSourceDeviceId?: string;
}

export interface HistoryTextCursor {
  createdAt: string;
  historyId: string;
}

export interface HistoryTextPage {
  texts: HistoryTextRecord[];
  hasMore: boolean;
  nextCursor?: HistoryTextCursor;
}

export interface HistoryRegistryOptions {
  retentionMs: number;
  maxBytes: number;
  textRetentionMs: number;
  supabase?: {
    url: string;
    serviceRoleKey: string;
    historyFilesTable: string;
    historyTextsTable: string;
  };
}

type PersistedHistoryFileRow = {
  history_id: string;
  room_id: string;
  session_id: string | null;
  is_public: boolean;
  source_device_id: string;
  source_device_name: string;
  file_name: string;
  size: number;
  mime_type: string | null;
  created_at: string;
  storage_path: string;
};

type PersistedHistoryTextRow = {
  history_id: string;
  room_id: string;
  session_id: string | null;
  is_public: boolean;
  source_device_id: string;
  source_device_name: string;
  text: string;
  created_at: string;
};

type HistoryActorRecord = Pick<HistoryFileRecord | HistoryTextRecord, 'sourceDeviceId' | 'sourceDeviceName'>;

function normalizeHistoryUsername(record: HistoryActorRecord) {
  if (record.sourceDeviceId.startsWith('bot_')) {
    return undefined;
  }

  const username = record.sourceDeviceName.trim();
  return username || undefined;
}

function compareHistoryTimestamp(left: string, right: string) {
  const timeDiff = Date.parse(left) - Date.parse(right);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return left.localeCompare(right);
}

function sortByCreatedAt(
  left: Pick<{ createdAt: string; historyId?: string }, 'createdAt' | 'historyId'>,
  right: Pick<{ createdAt: string; historyId?: string }, 'createdAt' | 'historyId'>,
) {
  const dateDiff = compareHistoryTimestamp(left.createdAt, right.createdAt);
  if (dateDiff !== 0) {
    return dateDiff;
  }

  return (left.historyId ?? '').localeCompare(right.historyId ?? '');
}

function safeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

function buildStoragePath(roomId: string, historyId: string, fileName: string) {
  return join(
    FILES_ROOT,
    safeFileSegment(roomId),
    `${safeFileSegment(historyId)}-${safeFileSegment(basename(fileName))}`,
  );
}

const historyFileTooLargeMessage = 'History file exceeds maximum allowed size.';

function getChunkByteLength(chunk: Buffer | string, encoding?: BufferEncoding) {
  return Buffer.isBuffer(chunk)
    ? chunk.byteLength
    : Buffer.byteLength(chunk, encoding);
}

function createMaxBytesGuard(maxBytes: number) {
  let receivedBytes = 0;

  return new Transform({
    transform(chunk: Buffer | string, encoding: BufferEncoding, callback: TransformCallback) {
      receivedBytes += getChunkByteLength(chunk, encoding);

      if (receivedBytes > maxBytes) {
        callback(new Error(historyFileTooLargeMessage));
        return;
      }

      callback(null, chunk);
    },
  });
}

async function drainStream(stream: NodeJS.ReadableStream, maxBytes?: number) {
  let receivedBytes = 0;

  for await (const chunk of stream) {
    if (maxBytes !== undefined) {
      receivedBytes += getChunkByteLength(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));

      if (receivedBytes > maxBytes) {
        throw new Error(historyFileTooLargeMessage);
      }
    }
  }
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function toFileRow(record: HistoryFileRecord): PersistedHistoryFileRow {
  return {
    history_id: record.historyId,
    room_id: record.roomId,
    session_id: record.sessionId ?? null,
    is_public: record.isPublic,
    source_device_id: record.sourceDeviceId,
    source_device_name: record.sourceDeviceName,
    file_name: record.fileName,
    size: record.size,
    mime_type: record.mimeType ?? null,
    created_at: record.createdAt,
    storage_path: record.storagePath,
  };
}

function toTextRow(record: HistoryTextRecord): PersistedHistoryTextRow {
  return {
    history_id: record.historyId,
    room_id: record.roomId,
    session_id: record.sessionId ?? null,
    is_public: record.isPublic,
    source_device_id: record.sourceDeviceId,
    source_device_name: record.sourceDeviceName,
    text: record.text,
    created_at: record.createdAt,
  };
}

function fromFileRow(row: PersistedHistoryFileRow): HistoryFileRecord {
  return {
    historyId: row.history_id,
    roomId: row.room_id,
    sessionId: row.session_id ?? undefined,
    isPublic: row.is_public,
    sourceDeviceId: row.source_device_id,
    sourceDeviceName: row.source_device_name,
    fileName: row.file_name,
    size: row.size,
    mimeType: row.mime_type ?? undefined,
    createdAt: row.created_at,
    storagePath: row.storage_path,
  };
}

function fromTextRow(row: PersistedHistoryTextRow): HistoryTextRecord {
  return {
    historyId: row.history_id,
    roomId: row.room_id,
    sessionId: row.session_id ?? undefined,
    isPublic: row.is_public,
    sourceDeviceId: row.source_device_id,
    sourceDeviceName: row.source_device_name,
    text: row.text,
    createdAt: row.created_at,
  };
}

function isBeforeCursor(record: HistoryTextRecord, cursor: HistoryTextCursor) {
  const createdAtDiff = compareHistoryTimestamp(record.createdAt, cursor.createdAt);
  if (createdAtDiff !== 0) {
    return createdAtDiff < 0;
  }

  return record.historyId.localeCompare(cursor.historyId) < 0;
}

export class HistoryRegistry {
  static async create(options: HistoryRegistryOptions) {
    const registry = new HistoryRegistry(options);
    await registry.load();
    registry.prune();
    return registry;
  }

  private readonly retentionMs: number;

  private readonly maxBytes: number;

  private readonly textRetentionMs: number;

  private readonly supabaseClient?: SupabaseClient;

  private readonly historyFilesTable?: string;

  private readonly historyTextsTable?: string;

  private constructor(options: HistoryRegistryOptions) {
    this.retentionMs = options.retentionMs;
    this.maxBytes = options.maxBytes;
    this.textRetentionMs = options.textRetentionMs;
    this.supabaseClient = options.supabase
      ? createClient(options.supabase.url, options.supabase.serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : undefined;
    this.historyFilesTable = options.supabase?.historyFilesTable;
    this.historyTextsTable = options.supabase?.historyTextsTable;

    mkdirSync(FILES_ROOT, { recursive: true });
  }

  private readonly filesById = new Map<string, HistoryFileRecord>();

  private readonly fileIdsByRoomId = new Map<string, Set<string>>();

  private readonly textsById = new Map<string, HistoryTextRecord>();

  private readonly textIdsByRoomId = new Map<string, Set<string>>();

  listForRoom(roomId: string) {
    this.prune();
    return this.listFileRecordsForRoom(roomId);
  }

  getById(historyId: string) {
    this.prune();
    return this.filesById.get(historyId);
  }

  async deleteFile(historyId: string) {
    this.prune();
    const record = this.filesById.get(historyId);
    if (!record) {
      return false;
    }

    await this.deleteRemoteFiles([historyId]);
    this.removeFileRecord(record);

    if (!this.supabaseClient) {
      this.persistLocalIndex();
    }

    return true;
  }

  getLatestPublicRoomId() {
    this.prune();
    const publicRecords = [
      ...this.filesById.values(),
      ...this.textsById.values(),
    ].filter((record) => record.isPublic);

    return publicRecords
      .sort((left, right) => sortByCreatedAt(right, left))[0]
      ?.roomId;
  }

  listTextsForRoom(roomId: string) {
    this.prune();
    return this.listTextRecordsForRoom(roomId);
  }

  listTextPageForRoom(roomId: string, limit: number, cursor?: HistoryTextCursor): HistoryTextPage {
    this.prune();
    const records = this.listTextRecordsForRoom(roomId);
    const filtered = cursor
      ? records.filter((record) => isBeforeCursor(record, cursor))
      : records;
    const page = filtered.slice(Math.max(0, filtered.length - limit));
    const oldest = page[0];

    return {
      texts: page,
      hasMore: filtered.length > page.length,
      nextCursor: oldest
        ? {
            createdAt: oldest.createdAt,
            historyId: oldest.historyId,
          }
        : undefined,
    };
  }

  getTextById(historyId: string) {
    this.prune();
    return this.textsById.get(historyId);
  }

  getTextStatsForRoom(roomId: string): HistoryTextRoomStats {
    this.prune();
    const records = this.listTextRecordsForRoom(roomId);
    const latest = records[records.length - 1];

    return {
      count: records.length,
      latestAt: latest?.createdAt,
      latestPreview: latest?.text,
      latestSourceDeviceId: latest?.sourceDeviceId,
    };
  }

  getStats(): HistoryStats {
    this.prune();
    const fileRecords = [...this.filesById.values()].sort(sortByCreatedAt);
    const textRecords = [...this.textsById.values()].sort(sortByCreatedAt);
    const lastFileAt = fileRecords[fileRecords.length - 1]?.createdAt;
    const lastTextAt = textRecords[textRecords.length - 1]?.createdAt;
    const lastActivityAt = [lastFileAt, lastTextAt]
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => compareHistoryTimestamp(right, left))[0];

    return {
      fileCount: fileRecords.length,
      textCount: textRecords.length,
      totalBytes: fileRecords.reduce((total, record) => total + record.size, 0),
      roomCount: new Set([
        ...fileRecords.map((record) => record.roomId),
        ...textRecords.map((record) => record.roomId),
      ]).size,
      activeUserCount: new Set([
        ...fileRecords.map(normalizeHistoryUsername),
        ...textRecords.map(normalizeHistoryUsername),
      ].filter((username): username is string => Boolean(username))).size,
      lastFileAt,
      lastTextAt,
      lastActivityAt,
      textTrendBuckets: buildTextTrendBuckets(textRecords, 24),
    };
  }

  async clearAll() {
    if (this.supabaseClient && this.historyFilesTable && this.historyTextsTable) {
      await Promise.all([
        this.supabaseClient
          .from(this.historyFilesTable)
          .delete()
          .not('history_id', 'is', null),
        this.supabaseClient
          .from(this.historyTextsTable)
          .delete()
          .not('history_id', 'is', null),
      ]).then((results) => {
        const firstError = results.find((result) => result.error)?.error;
        if (firstError) {
          throw firstError;
        }
      });
    }

    this.filesById.clear();
    this.fileIdsByRoomId.clear();
    this.textsById.clear();
    this.textIdsByRoomId.clear();

    rmSync(FILES_ROOT, { recursive: true, force: true });
    mkdirSync(FILES_ROOT, { recursive: true });

    if (!this.supabaseClient) {
      this.persistLocalIndex();
    }
  }

  async saveFile(input: {
    historyId: string;
    roomId: string;
    sessionId?: string;
    isPublic: boolean;
    sourceDeviceId: string;
    sourceDeviceName: string;
    fileName: string;
    mimeType?: string;
    createdAt: string;
    data: Buffer;
  }) {
    this.prune();
    const existing = this.filesById.get(input.historyId);
    if (existing) {
      return existing;
    }

    this.assertWithinMaxBytes(input.data.byteLength);

    const roomDir = join(FILES_ROOT, safeFileSegment(input.roomId));
    await fs.mkdir(roomDir, { recursive: true });

    const storagePath = buildStoragePath(input.roomId, input.historyId, input.fileName);
    await fs.writeFile(storagePath, input.data);

    const record: HistoryFileRecord = {
      historyId: input.historyId,
      roomId: input.roomId,
      sessionId: input.sessionId,
      isPublic: input.isPublic,
      sourceDeviceId: input.sourceDeviceId,
      sourceDeviceName: input.sourceDeviceName,
      fileName: input.fileName,
      size: input.data.byteLength,
      mimeType: input.mimeType,
      createdAt: input.createdAt,
      storagePath,
    };

    this.addFileRecord(record);

    try {
      await this.persistFileRecord(record);
      return record;
    } catch (error) {
      this.removeFileRecord(record);
      try {
        await fs.unlink(storagePath);
      } catch {
        // Ignore cleanup failure after persistence rejection.
      }
      throw error;
    }
  }

  async saveFileStream(input: {
    historyId: string;
    roomId: string;
    sessionId?: string;
    isPublic: boolean;
    sourceDeviceId: string;
    sourceDeviceName: string;
    fileName: string;
    mimeType?: string;
    createdAt: string;
    stream: NodeJS.ReadableStream;
  }) {
    this.prune();
    const existing = this.filesById.get(input.historyId);
    if (existing) {
      await drainStream(input.stream, this.maxBytes);
      return existing;
    }

    const roomDir = join(FILES_ROOT, safeFileSegment(input.roomId));
    await fs.mkdir(roomDir, { recursive: true });

    const storagePath = buildStoragePath(input.roomId, input.historyId, input.fileName);
    const tempPath = `${storagePath}.part-${Date.now().toString(36)}`;

    try {
      await pipeline(input.stream, createMaxBytesGuard(this.maxBytes), createWriteStream(tempPath));
      const stat = await fs.stat(tempPath);
      this.assertWithinMaxBytes(stat.size);
      await fs.rename(tempPath, storagePath);

      const record: HistoryFileRecord = {
        historyId: input.historyId,
        roomId: input.roomId,
        sessionId: input.sessionId,
        isPublic: input.isPublic,
        sourceDeviceId: input.sourceDeviceId,
        sourceDeviceName: input.sourceDeviceName,
        fileName: input.fileName,
        size: stat.size,
        mimeType: input.mimeType,
        createdAt: input.createdAt,
        storagePath,
      };

      this.addFileRecord(record);
      await this.persistFileRecord(record);
      return record;
    } catch (error) {
      const persistedRecord = this.filesById.get(input.historyId);
      if (persistedRecord) {
        this.removeFileRecord(persistedRecord);
      }
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore partial-file cleanup failures.
      }
      throw error;
    }
  }

  async saveText(input: HistoryTextRecord) {
    this.prune();
    const existing = this.textsById.get(input.historyId);
    if (existing) {
      return existing;
    }

    const record: HistoryTextRecord = {
      historyId: input.historyId,
      roomId: input.roomId,
      sessionId: input.sessionId,
      isPublic: input.isPublic,
      sourceDeviceId: input.sourceDeviceId,
      sourceDeviceName: input.sourceDeviceName,
      text: input.text,
      createdAt: input.createdAt,
    };

    this.addTextRecord(record);

    try {
      await this.persistTextRecord(record);
      return record;
    } catch (error) {
      this.removeTextRecord(record);
      throw error;
    }
  }

  async deleteText(historyId: string) {
    this.prune();
    const record = this.textsById.get(historyId);
    if (!record) {
      return false;
    }

    this.removeTextRecord(record);

    try {
      await this.deleteRemoteTexts([historyId]);
      if (!this.supabaseClient) {
        this.persistLocalIndex();
      }
      return true;
    } catch (error) {
      this.addTextRecord(record);
      throw error;
    }
  }

  async saveFileChunk(input: {
    historyId: string;
    roomId: string;
    sessionId?: string;
    isPublic: boolean;
    sourceDeviceId: string;
    sourceDeviceName: string;
    fileName: string;
    mimeType?: string;
    createdAt: string;
    start: number;
    end: number;
    total: number;
    data: Buffer;
  }) {
    this.prune();
    const existing = this.filesById.get(input.historyId);
    if (existing) {
      return {
        complete: true as const,
        accepted: true as const,
        offset: existing.size,
        record: existing,
      };
    }

    this.assertWithinMaxBytes(input.total);

    const expectedSize = input.end - input.start + 1;
    if (input.data.byteLength !== expectedSize) {
      throw new Error('Chunk size does not match Content-Range.');
    }

    const roomDir = join(FILES_ROOT, safeFileSegment(input.roomId));
    await fs.mkdir(roomDir, { recursive: true });

    const storagePath = buildStoragePath(input.roomId, input.historyId, input.fileName);
    const tempPath = `${storagePath}.part`;
    const currentOffset = await this.readPartialSize(tempPath);

    if (input.start !== currentOffset) {
      return {
        complete: false as const,
        accepted: false as const,
        offset: currentOffset,
      };
    }

    appendFileSync(tempPath, input.data);
    const nextOffset = currentOffset + input.data.byteLength;

    if (nextOffset < input.total) {
      return {
        complete: false as const,
        accepted: true as const,
        offset: nextOffset,
      };
    }

    if (nextOffset !== input.total) {
      throw new Error('Chunk upload exceeded declared file size.');
    }

    await fs.rename(tempPath, storagePath);

    const record: HistoryFileRecord = {
      historyId: input.historyId,
      roomId: input.roomId,
      sessionId: input.sessionId,
      isPublic: input.isPublic,
      sourceDeviceId: input.sourceDeviceId,
      sourceDeviceName: input.sourceDeviceName,
      fileName: input.fileName,
      size: input.total,
      mimeType: input.mimeType,
      createdAt: input.createdAt,
      storagePath,
    };

    this.addFileRecord(record);

    try {
      await this.persistFileRecord(record);
    } catch (error) {
      this.removeFileRecord(record);
      try {
        await fs.unlink(storagePath);
      } catch {
        // Ignore cleanup failures after remote persistence rejection.
      }
      throw error;
    }

    return {
      complete: true as const,
      accepted: true as const,
      offset: record.size,
      record,
    };
  }

  prune(now = Date.now()) {
    let changed = false;
    const prunedFileIds: string[] = [];
    const prunedTextIds: string[] = [];

    for (const record of [...this.filesById.values()]) {
      if (now - Date.parse(record.createdAt) <= this.retentionMs) {
        continue;
      }

      this.removeFileRecord(record);
      prunedFileIds.push(record.historyId);
      changed = true;
    }

    for (const roomId of [...this.fileIdsByRoomId.keys()]) {
      const removedIds = this.pruneRoomCapacity(roomId);
      if (removedIds.length > 0) {
        prunedFileIds.push(...removedIds);
        changed = true;
      }
    }

    if (this.textRetentionMs > 0) {
      for (const record of [...this.textsById.values()]) {
        if (now - Date.parse(record.createdAt) <= this.textRetentionMs) {
          continue;
        }

        this.removeTextRecord(record);
        prunedTextIds.push(record.historyId);
        changed = true;
      }
    }

    if (changed) {
      if (this.supabaseClient) {
        void this.syncPrunedRemoteRecords(prunedFileIds, prunedTextIds);
      } else {
        this.persistLocalIndex();
      }
    }

    return changed;
  }

  toSummary(record: HistoryFileRecord, publicBaseUrl?: string, isPublic = record.isPublic): HistoryFileSummary {
    const downloadPath = `/api/history/download/${encodeURIComponent(record.historyId)}`;
    return {
      historyId: record.historyId,
      roomId: record.roomId,
      sessionId: record.sessionId,
      isPublic,
      sourceDeviceId: record.sourceDeviceId,
      sourceDeviceName: record.sourceDeviceName,
      fileName: record.fileName,
      size: record.size,
      mimeType: record.mimeType,
      createdAt: record.createdAt,
      downloadPath: publicBaseUrl
        ? `${publicBaseUrl.replace(/\/$/, '')}${downloadPath}`
        : downloadPath,
    };
  }

  toTextSummary(record: HistoryTextRecord, isPublic = record.isPublic): HistoryTextSummary {
    return {
      historyId: record.historyId,
      roomId: record.roomId,
      sessionId: record.sessionId,
      isPublic,
      sourceDeviceId: record.sourceDeviceId,
      sourceDeviceName: record.sourceDeviceName,
      text: record.text,
      createdAt: record.createdAt,
    };
  }

  private async load() {
    this.resetRecords();

    if (!this.supabaseClient || !this.historyFilesTable || !this.historyTextsTable) {
      this.loadFromLocalIndex();
      return;
    }

    const [fileRows, textRows] = await Promise.all([
      this.fetchAllRows<PersistedHistoryFileRow>(this.historyFilesTable),
      this.fetchAllRows<PersistedHistoryTextRow>(this.historyTextsTable),
    ]);

    if (fileRows.length === 0 && textRows.length === 0) {
      const imported = this.loadFromLocalIndex();
      if (imported.fileCount > 0 || imported.textCount > 0) {
        await Promise.all([
          this.upsertFileRows([...this.filesById.values()]),
          this.upsertTextRows([...this.textsById.values()]),
        ]);
      }
      return;
    }

    for (const row of fileRows) {
      this.addFileRecord(fromFileRow(row));
    }

    for (const row of textRows) {
      this.addTextRecord(fromTextRow(row));
    }
  }

  private resetRecords() {
    this.filesById.clear();
    this.fileIdsByRoomId.clear();
    this.textsById.clear();
    this.textIdsByRoomId.clear();
  }

  private loadFromLocalIndex() {
    try {
      const raw = readFileSync(INDEX_PATH, 'utf8');
      const parsed = JSON.parse(raw) as {
        files?: HistoryFileRecord[];
        texts?: HistoryTextRecord[];
      };
      const files = parsed.files ?? [];
      const texts = parsed.texts ?? [];

      for (const record of files) {
        this.addFileRecord({
          ...record,
          isPublic: record.isPublic ?? false,
        });
      }

      for (const record of texts) {
        this.addTextRecord({
          ...record,
          isPublic: record.isPublic ?? false,
        });
      }

      return {
        fileCount: files.length,
        textCount: texts.length,
      };
    } catch {
      this.persistLocalIndex();
      return {
        fileCount: 0,
        textCount: 0,
      };
    }
  }

  private persistLocalIndex() {
    mkdirSync(HISTORY_ROOT, { recursive: true });
    const files = [...this.filesById.values()].sort(sortByCreatedAt);
    const texts = [...this.textsById.values()].sort(sortByCreatedAt);
    writeFileSync(
      INDEX_PATH,
      JSON.stringify({ files, texts }, null, 2),
      'utf8',
    );
  }

  private assertWithinMaxBytes(size: number) {
    if (this.maxBytes > 0 && size > this.maxBytes) {
      throw new Error('File exceeds history storage limit.');
    }
  }

  private pruneRoomCapacity(roomId: string) {
    if (this.maxBytes <= 0) {
      return [];
    }

    const records = this.listFileRecordsForRoom(roomId);
    let totalSize = records.reduce((total, record) => total + record.size, 0);
    const removedIds: string[] = [];

    for (const record of records) {
      if (totalSize <= this.maxBytes) {
        break;
      }

      this.removeFileRecord(record);
      totalSize -= record.size;
      removedIds.push(record.historyId);
    }

    return removedIds;
  }

  private listFileRecordsForRoom(roomId: string) {
    const ids = this.fileIdsByRoomId.get(roomId);
    if (!ids) {
      return [];
    }

    return [...ids]
      .map((historyId) => this.filesById.get(historyId))
      .filter((record): record is HistoryFileRecord => Boolean(record))
      .sort(sortByCreatedAt);
  }

  private listTextRecordsForRoom(roomId: string) {
    const ids = this.textIdsByRoomId.get(roomId);
    if (!ids) {
      return [];
    }

    return [...ids]
      .map((historyId) => this.textsById.get(historyId))
      .filter((record): record is HistoryTextRecord => Boolean(record))
      .sort(sortByCreatedAt);
  }

  private async readPartialSize(tempPath: string) {
    try {
      const stat = await fs.stat(tempPath);
      return stat.size;
    } catch {
      return 0;
    }
  }

  private addFileRecord(record: HistoryFileRecord) {
    this.filesById.set(record.historyId, record);
    const roomIds = this.fileIdsByRoomId.get(record.roomId) ?? new Set<string>();
    roomIds.add(record.historyId);
    this.fileIdsByRoomId.set(record.roomId, roomIds);
  }

  private removeFileRecord(record: HistoryFileRecord) {
    this.removeFileRecordById(record.historyId);

    try {
      unlinkSync(record.storagePath);
    } catch {
      // Ignore missing files during cleanup.
    }
  }

  private removeFileRecordById(historyId: string) {
    const record = this.filesById.get(historyId);
    if (!record) {
      return;
    }

    this.filesById.delete(historyId);
    const roomIds = this.fileIdsByRoomId.get(record.roomId);
    roomIds?.delete(historyId);
    if (roomIds && roomIds.size === 0) {
      this.fileIdsByRoomId.delete(record.roomId);
    }
  }

  private addTextRecord(record: HistoryTextRecord) {
    this.textsById.set(record.historyId, record);
    const roomIds = this.textIdsByRoomId.get(record.roomId) ?? new Set<string>();
    roomIds.add(record.historyId);
    this.textIdsByRoomId.set(record.roomId, roomIds);
  }

  private removeTextRecord(record: HistoryTextRecord) {
    this.textsById.delete(record.historyId);
    const roomIds = this.textIdsByRoomId.get(record.roomId);
    roomIds?.delete(record.historyId);
    if (roomIds && roomIds.size === 0) {
      this.textIdsByRoomId.delete(record.roomId);
    }
  }

  private async persistFileRecord(record: HistoryFileRecord) {
    if (this.supabaseClient && this.historyFilesTable) {
      await this.upsertFileRows([record]);
      return;
    }

    this.persistLocalIndex();
  }

  private async persistTextRecord(record: HistoryTextRecord) {
    if (this.supabaseClient && this.historyTextsTable) {
      await this.upsertTextRows([record]);
      return;
    }

    this.persistLocalIndex();
  }

  private async upsertFileRows(records: HistoryFileRecord[]) {
    if (!this.supabaseClient || !this.historyFilesTable || records.length === 0) {
      return;
    }

    for (const batch of chunkArray(records, REMOTE_BATCH_SIZE)) {
      const { error } = await this.supabaseClient
        .from(this.historyFilesTable)
        .upsert(batch.map(toFileRow), { onConflict: 'history_id' });

      if (error) {
        throw error;
      }
    }
  }

  private async upsertTextRows(records: HistoryTextRecord[]) {
    if (!this.supabaseClient || !this.historyTextsTable || records.length === 0) {
      return;
    }

    for (const batch of chunkArray(records, REMOTE_BATCH_SIZE)) {
      const { error } = await this.supabaseClient
        .from(this.historyTextsTable)
        .upsert(batch.map(toTextRow), { onConflict: 'history_id' });

      if (error) {
        throw error;
      }
    }
  }

  private async deleteRemoteFiles(historyIds: string[]) {
    if (!this.supabaseClient || !this.historyFilesTable || historyIds.length === 0) {
      return;
    }

    for (const batch of chunkArray(historyIds, REMOTE_BATCH_SIZE)) {
      const { error } = await this.supabaseClient
        .from(this.historyFilesTable)
        .delete()
        .in('history_id', batch);

      if (error) {
        throw error;
      }
    }
  }

  private async deleteRemoteTexts(historyIds: string[]) {
    if (!this.supabaseClient || !this.historyTextsTable || historyIds.length === 0) {
      return;
    }

    for (const batch of chunkArray(historyIds, REMOTE_BATCH_SIZE)) {
      const { error } = await this.supabaseClient
        .from(this.historyTextsTable)
        .delete()
        .in('history_id', batch);

      if (error) {
        throw error;
      }
    }
  }

  private async syncPrunedRemoteRecords(fileIds: string[], textIds: string[]) {
    try {
      await Promise.all([
        this.deleteRemoteFiles(fileIds),
        this.deleteRemoteTexts(textIds),
      ]);
    } catch (error) {
      console.error('[history] failed to prune remote metadata', error);
    }
  }

  private async fetchAllRows<Row>(tableName: string) {
    if (!this.supabaseClient) {
      return [];
    }

    const rows: Row[] = [];
    let from = 0;

    while (true) {
      const to = from + REMOTE_BATCH_SIZE - 1;
      const { data, error } = await this.supabaseClient
        .from(tableName)
        .select('*')
        .order('created_at', { ascending: true })
        .order('history_id', { ascending: true })
        .range(from, to);

      if (error) {
        throw error;
      }

      const batch = (data ?? []) as Row[];
      rows.push(...batch);

      if (batch.length < REMOTE_BATCH_SIZE) {
        break;
      }

      from += REMOTE_BATCH_SIZE;
    }

    return rows;
  }
}
