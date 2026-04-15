import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
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
  sourceDeviceId: string;
  sourceDeviceName: string;
  text: string;
  createdAt: string;
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

export class HistoryRegistry {
  constructor(private readonly retentionMs: number) {
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

  listTextsForRoom(roomId: string) {
    this.prune();
    const ids = this.textIdsByRoomId.get(roomId);
    if (!ids) {
      return [];
    }

    return [...ids]
      .map((historyId) => this.textsById.get(historyId))
      .filter((record): record is HistoryTextRecord => Boolean(record))
      .sort(sortByCreatedAt);
  }

  async saveFile(input: {
    historyId: string;
    roomId: string;
    sessionId?: string;
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

    const roomDir = join(FILES_ROOT, safeFileSegment(input.roomId));
    await fs.mkdir(roomDir, { recursive: true });

    const storagePath = join(
      roomDir,
      `${safeFileSegment(input.historyId)}-${safeFileSegment(basename(input.fileName))}`,
    );

    await fs.writeFile(storagePath, input.data);

    const record: HistoryFileRecord = {
      historyId: input.historyId,
      roomId: input.roomId,
      sessionId: input.sessionId,
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
    this.persist();

    return record;
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

  prune(now = Date.now()) {
    let changed = false;

    for (const record of [...this.filesById.values()]) {
      if (now - Date.parse(record.createdAt) <= this.retentionMs) {
        continue;
      }

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

      changed = true;
    }

    for (const record of [...this.textsById.values()]) {
      if (now - Date.parse(record.createdAt) <= this.retentionMs) {
        continue;
      }

      this.textsById.delete(record.historyId);
      const roomIds = this.textIdsByRoomId.get(record.roomId);
      roomIds?.delete(record.historyId);
      if (roomIds && roomIds.size === 0) {
        this.textIdsByRoomId.delete(record.roomId);
      }

      changed = true;
    }

    if (changed) {
      this.persist();
    }
  }

  toSummary(record: HistoryFileRecord, publicBaseUrl?: string): HistoryFileSummary {
    const downloadPath = `/api/history/download/${encodeURIComponent(record.historyId)}`;
    return {
      historyId: record.historyId,
      roomId: record.roomId,
      sessionId: record.sessionId,
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

  toTextSummary(record: HistoryTextRecord): HistoryTextSummary {
    return {
      historyId: record.historyId,
      roomId: record.roomId,
      sessionId: record.sessionId,
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
        this.filesById.set(record.historyId, record);
        const roomIds = this.fileIdsByRoomId.get(record.roomId) ?? new Set<string>();
        roomIds.add(record.historyId);
        this.fileIdsByRoomId.set(record.roomId, roomIds);
      }

      for (const record of texts) {
        this.textsById.set(record.historyId, record);
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
}
