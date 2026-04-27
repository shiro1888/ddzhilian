import { appendFileSync, createWriteStream, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import {
  type HistoryFileSummary,
  type HistoryTextSummary,
} from '../protocol.js';

const HISTORY_ROOT = fileURLToPath(new URL('../../data/history', import.meta.url));
const FILES_ROOT = join(HISTORY_ROOT, 'files');
const INDEX_PATH = join(HISTORY_ROOT, 'index.json');

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
  lastFileAt?: string;
  lastTextAt?: string;
  lastActivityAt?: string;
}

function sortByCreatedAt(
  left: Pick<{ createdAt: string }, 'createdAt'>,
  right: Pick<{ createdAt: string }, 'createdAt'>,
) {
  return Date.parse(left.createdAt) - Date.parse(right.createdAt);
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

async function drainStream(stream: NodeJS.ReadableStream) {
  for await (const chunk of stream) {
    void chunk;
    // Intentionally drain duplicate upload bodies so the HTTP connection closes cleanly.
  }
}

export class HistoryRegistry {
  constructor(
    private readonly retentionMs: number,
    private readonly maxBytes: number,
    private readonly textRetentionMs: number,
  ) {
    mkdirSync(FILES_ROOT, { recursive: true });
    this.load();
    this.prune();
  }

  private readonly filesById = new Map<string, HistoryFileRecord>();

  private readonly fileIdsByRoomId = new Map<string, Set<string>>();

  private readonly textsById = new Map<string, HistoryTextRecord>();

  private readonly textIdsByRoomId = new Map<string, Set<string>>();

  listForRoom(roomId: string) {
    this.prune();
    const ids = this.fileIdsByRoomId.get(roomId);
    if (!ids) {
      return [];
    }

    return [...ids]
      .map((historyId) => this.filesById.get(historyId))
      .filter((record): record is HistoryFileRecord => Boolean(record))
      .sort(sortByCreatedAt);
  }

  getById(historyId: string) {
    this.prune();
    return this.filesById.get(historyId);
  }

  getLatestPublicRoomId() {
    this.prune();
    const publicRecords = [
      ...this.filesById.values(),
      ...this.textsById.values(),
    ].filter((record) => record.isPublic);

    return publicRecords
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0]
      ?.roomId;
  }

  listTextsForRoom(roomId: string) {
    this.prune();
    return this.listTextRecordsForRoom(roomId);
  }

  getTextById(historyId: string) {
    this.prune();
    return this.textsById.get(historyId);
  }

  getTextStatsForRoom(roomId: string) {
    this.prune();
    const records = this.listTextRecordsForRoom(roomId);
    const latest = records.at(-1);

    return {
      count: records.length,
      latestAt: latest?.createdAt,
    };
  }

  getStats(): HistoryStats {
    this.prune();
    const fileRecords = [...this.filesById.values()].sort(sortByCreatedAt);
    const textRecords = [...this.textsById.values()].sort(sortByCreatedAt);
    const lastFileAt = fileRecords.at(-1)?.createdAt;
    const lastTextAt = textRecords.at(-1)?.createdAt;
    const lastActivityAt = [lastFileAt, lastTextAt]
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0];

    return {
      fileCount: fileRecords.length,
      textCount: textRecords.length,
      totalBytes: fileRecords.reduce((total, record) => total + record.size, 0),
      roomCount: new Set([
        ...fileRecords.map((record) => record.roomId),
        ...textRecords.map((record) => record.roomId),
      ]).size,
      lastFileAt,
      lastTextAt,
      lastActivityAt,
    };
  }

  clearAll() {
    this.filesById.clear();
    this.fileIdsByRoomId.clear();
    this.textsById.clear();
    this.textIdsByRoomId.clear();

    rmSync(FILES_ROOT, { recursive: true, force: true });
    mkdirSync(FILES_ROOT, { recursive: true });
    this.persist();
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

    this.filesById.set(record.historyId, record);
    const roomIds = this.fileIdsByRoomId.get(record.roomId) ?? new Set<string>();
    roomIds.add(record.historyId);
    this.fileIdsByRoomId.set(record.roomId, roomIds);
    this.pruneRoomCapacity(record.roomId);
    this.persist();

    return record;
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
      await drainStream(input.stream);
      return existing;
    }

    const roomDir = join(FILES_ROOT, safeFileSegment(input.roomId));
    await fs.mkdir(roomDir, { recursive: true });

    const storagePath = buildStoragePath(input.roomId, input.historyId, input.fileName);
    const tempPath = `${storagePath}.part-${Date.now().toString(36)}`;

    try {
      await pipeline(input.stream, createWriteStream(tempPath));
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

      this.filesById.set(record.historyId, record);
      const roomIds = this.fileIdsByRoomId.get(record.roomId) ?? new Set<string>();
      roomIds.add(record.historyId);
      this.fileIdsByRoomId.set(record.roomId, roomIds);
      this.pruneRoomCapacity(record.roomId);
      this.persist();

      return record;
    } catch (error) {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore partial-file cleanup failures.
      }

      throw error;
    }
  }

  saveText(input: HistoryTextRecord) {
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

    this.textsById.set(record.historyId, record);
    const roomIds = this.textIdsByRoomId.get(record.roomId) ?? new Set<string>();
    roomIds.add(record.historyId);
    this.textIdsByRoomId.set(record.roomId, roomIds);
    this.persist();

    return record;
  }

  deleteText(historyId: string) {
    this.prune();
    const record = this.textsById.get(historyId);
    if (!record) {
      return false;
    }

    this.textsById.delete(historyId);
    const roomIds = this.textIdsByRoomId.get(record.roomId);
    roomIds?.delete(historyId);
    if (roomIds && roomIds.size === 0) {
      this.textIdsByRoomId.delete(record.roomId);
    }
    this.persist();
    return true;
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

    this.filesById.set(record.historyId, record);
    const roomIds = this.fileIdsByRoomId.get(record.roomId) ?? new Set<string>();
    roomIds.add(record.historyId);
    this.fileIdsByRoomId.set(record.roomId, roomIds);
    this.pruneRoomCapacity(record.roomId);
    this.persist();

    return {
      complete: true as const,
      accepted: true as const,
      offset: record.size,
      record,
    };
  }

  prune(now = Date.now()) {
    let changed = false;

    for (const record of [...this.filesById.values()]) {
      if (now - Date.parse(record.createdAt) <= this.retentionMs) {
        continue;
      }

      this.removeFileRecord(record);
      changed = true;
    }

    for (const roomId of [...this.fileIdsByRoomId.keys()]) {
      changed = this.pruneRoomCapacity(roomId) || changed;
    }

    if (this.textRetentionMs > 0) {
      for (const record of [...this.textsById.values()]) {
        if (now - Date.parse(record.createdAt) <= this.textRetentionMs) {
          continue;
        }

        this.removeTextRecord(record);
        changed = true;
      }
    }

    if (changed) {
      this.persist();
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

  private load() {
    try {
      const raw = readFileSync(INDEX_PATH, 'utf8');
      const parsed = JSON.parse(raw) as {
        files?: HistoryFileRecord[];
        texts?: HistoryTextRecord[];
      };
      const files = parsed.files ?? [];
      const texts = parsed.texts ?? [];

      for (const record of files) {
        this.filesById.set(record.historyId, {
          ...record,
          isPublic: record.isPublic ?? false,
        });
        const roomIds = this.fileIdsByRoomId.get(record.roomId) ?? new Set<string>();
        roomIds.add(record.historyId);
        this.fileIdsByRoomId.set(record.roomId, roomIds);
      }

      for (const record of texts) {
        this.textsById.set(record.historyId, {
          ...record,
          isPublic: record.isPublic ?? false,
        });
        const roomIds = this.textIdsByRoomId.get(record.roomId) ?? new Set<string>();
        roomIds.add(record.historyId);
        this.textIdsByRoomId.set(record.roomId, roomIds);
      }
    } catch {
      this.persist();
    }
  }

  private persist() {
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
      return false;
    }

    const records = this.listFileRecordsForRoom(roomId);
    let totalSize = records.reduce((total, record) => total + record.size, 0);
    let changed = false;

    for (const record of records) {
      if (totalSize <= this.maxBytes) {
        break;
      }

      this.removeFileRecord(record);
      totalSize -= record.size;
      changed = true;
    }

    return changed;
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

  private removeFileRecord(record: HistoryFileRecord) {
    this.filesById.delete(record.historyId);
    const roomIds = this.fileIdsByRoomId.get(record.roomId);
    roomIds?.delete(record.historyId);
    if (roomIds && roomIds.size === 0) {
      this.fileIdsByRoomId.delete(record.roomId);
    }

    try {
      unlinkSync(record.storagePath);
    } catch {
      // Ignore missing files during cleanup.
    }
  }

  private removeTextRecord(record: HistoryTextRecord) {
    this.textsById.delete(record.historyId);
    const roomIds = this.textIdsByRoomId.get(record.roomId);
    roomIds?.delete(record.historyId);
    if (roomIds && roomIds.size === 0) {
      this.textIdsByRoomId.delete(record.roomId);
    }
  }
}
