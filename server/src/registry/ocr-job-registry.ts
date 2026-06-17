import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

export type OcrJobStatus = 'queued' | 'running' | 'complete' | 'failed';

export type OcrLine = {
  text: string;
  confidence?: number;
  box?: number[][];
};

export type OcrJobResult = {
  text: string;
  lines: OcrLine[];
  raw: unknown;
};

export type OcrJobRecord = {
  jobId: string;
  status: OcrJobStatus;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  result?: OcrJobResult;
  error?: string;
};

type OcrJobStore = {
  jobs: OcrJobRecord[];
};

type OcrJobCreateInput = {
  jobId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
  expiresAt?: string;
};

type OcrJobRegistryOptions = {
  filePath: string;
  retentionMs: number;
  maxJobs: number;
};

export class OcrJobRegistry {
  private readonly jobs = new Map<string, OcrJobRecord>();
  private saveQueue = Promise.resolve();

  private constructor(private readonly options: OcrJobRegistryOptions) {}

  static async create(options: OcrJobRegistryOptions) {
    const registry = new OcrJobRegistry(options);
    await registry.load();
    registry.pruneExpired({ persist: false });
    await registry.save();
    return registry;
  }

  create(input: OcrJobCreateInput) {
    const createdAtMs = Date.parse(input.createdAt);
    const expiresAt = input.expiresAt ?? new Date(
      (Number.isFinite(createdAtMs) ? createdAtMs : Date.now()) + this.options.retentionMs,
    ).toISOString();
    const job: OcrJobRecord = {
      jobId: input.jobId,
      status: 'queued',
      fileName: input.fileName,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      expiresAt,
    };

    this.jobs.set(job.jobId, job);
    this.pruneOverflow();
    this.enqueueSave();
    return job;
  }

  get(jobId: string) {
    this.pruneExpired();
    return this.jobs.get(jobId);
  }

  list(limit = 20) {
    this.pruneExpired();
    return [...this.jobs.values()]
      .filter((job) => job.status === 'complete' || job.status === 'failed')
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, Math.max(1, limit));
  }

  updateStatus(jobId: string, status: OcrJobStatus) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return undefined;
    }

    const nextJob = {
      ...job,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, nextJob);
    this.enqueueSave();
    return nextJob;
  }

  complete(jobId: string, result: OcrJobResult) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return undefined;
    }

    const nextJob: OcrJobRecord = {
      ...job,
      status: 'complete',
      result,
      error: undefined,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, nextJob);
    this.enqueueSave();
    return nextJob;
  }

  fail(jobId: string, error: string) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return undefined;
    }

    const nextJob: OcrJobRecord = {
      ...job,
      status: 'failed',
      error,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, nextJob);
    this.enqueueSave();
    return nextJob;
  }

  delete(jobId: string) {
    const deleted = this.jobs.delete(jobId);
    if (deleted) {
      this.enqueueSave();
    }
    return deleted;
  }

  countActive() {
    this.pruneExpired();
    return [...this.jobs.values()].filter((job) => job.status === 'queued' || job.status === 'running').length;
  }

  async flush() {
    await this.saveQueue;
  }

  private async load() {
    let payload: OcrJobStore;

    try {
      payload = JSON.parse(await fs.readFile(this.options.filePath, 'utf8')) as OcrJobStore;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }

      throw error;
    }

    if (!Array.isArray(payload.jobs)) {
      return;
    }

    for (const job of payload.jobs) {
      if (isValidJobRecord(job)) {
        this.jobs.set(job.jobId, job);
      }
    }
  }

  private pruneExpired(options: { persist?: boolean } = {}) {
    const now = Date.now();
    let changed = false;
    for (const [jobId, job] of this.jobs) {
      const expiresAt = Date.parse(job.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= now) {
        this.jobs.delete(jobId);
        changed = true;
      }
    }

    if (changed && options.persist !== false) {
      this.enqueueSave();
    }
  }

  private pruneOverflow() {
    if (this.jobs.size <= this.options.maxJobs) {
      return;
    }

    const removable = [...this.jobs.values()]
      .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt));

    for (const job of removable) {
      if (this.jobs.size <= this.options.maxJobs) {
        return;
      }

      this.jobs.delete(job.jobId);
    }
  }

  private enqueueSave() {
    this.saveQueue = this.saveQueue
      .then(() => this.save())
      .catch((error) => {
        console.error('OCR job registry save failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }

  private async save() {
    await fs.mkdir(dirname(this.options.filePath), { recursive: true });
    const payload: OcrJobStore = {
      jobs: [...this.jobs.values()]
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    };
    const tempPath = `${this.options.filePath}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, this.options.filePath);
  }
}

function isValidJobRecord(value: unknown): value is OcrJobRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<OcrJobRecord>;
  return (
    typeof record.jobId === 'string' &&
    typeof record.fileName === 'string' &&
    typeof record.mimeType === 'string' &&
    typeof record.byteSize === 'number' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    typeof record.expiresAt === 'string' &&
    (record.status === 'queued' ||
      record.status === 'running' ||
      record.status === 'complete' ||
      record.status === 'failed')
  );
}
