import type { OcrResult, OcrResultItem } from '@paddleocr/paddleocr-js'
import { createBrowserId } from './create-browser-id'
import type { OcrHistoryResponse, OcrJobResponse, OcrLine } from './ddzhilian-types'

const BROWSER_OCR_HISTORY_STORAGE_KEY = 'ddzhilian.ocr.history.v1'

export const BROWSER_OCR_HISTORY_CACHE_KEY = BROWSER_OCR_HISTORY_STORAGE_KEY
const BROWSER_OCR_HISTORY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const BROWSER_OCR_HISTORY_LIMIT = 20

type BrowserOcrRunner = {
  predict: (input: File | Blob, params?: Record<string, unknown>) => Promise<OcrResult[]>
}

type BrowserOcrRunOptions = {
  createRunner?: () => Promise<BrowserOcrRunner>
}

let browserOcrRunnerPromise: Promise<BrowserOcrRunner> | null = null

function createOcrJobId() {
  return createBrowserId('ocr')
}

function getOcrJobExpiry(createdAt: string) {
  return new Date(new Date(createdAt).getTime() + BROWSER_OCR_HISTORY_RETENTION_MS).toISOString()
}

function isUsableOcrJob(value: unknown): value is OcrJobResponse {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Partial<OcrJobResponse>
  return typeof record.jobId === 'string'
    && ['queued', 'running', 'complete', 'failed'].includes(record.status ?? '')
}

function readBrowserOcrHistory() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(BROWSER_OCR_HISTORY_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const payload = JSON.parse(raw) as unknown
    if (!Array.isArray(payload)) {
      return []
    }

    const now = Date.now()
    return payload
      .filter(isUsableOcrJob)
      .filter((job) => !job.expiresAt || Date.parse(job.expiresAt) > now)
      .slice(0, BROWSER_OCR_HISTORY_LIMIT)
  } catch {
    return []
  }
}

function writeBrowserOcrHistory(items: OcrJobResponse[]) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      BROWSER_OCR_HISTORY_STORAGE_KEY,
      JSON.stringify(items.slice(0, BROWSER_OCR_HISTORY_LIMIT)),
    )
  } catch {
    // OCR still works when local history is unavailable.
  }
}

function saveBrowserOcrHistoryItem(job: OcrJobResponse) {
  const nextItems = [
    job,
    ...readBrowserOcrHistory().filter((item) => item.jobId !== job.jobId),
  ]
  writeBrowserOcrHistory(nextItems)
}

function normalizeOcrPoint(point: unknown): number[] | null {
  if (!Array.isArray(point) || point.length < 2) {
    return null
  }

  const x = Number(point[0])
  const y = Number(point[1])
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
}

function normalizeOcrBox(item: OcrResultItem) {
  const poly = Array.isArray(item.poly) ? item.poly : []
  const points = poly
    .map((point) => normalizeOcrPoint(point))
    .filter((point): point is number[] => Boolean(point))

  return points.length >= 2 ? points : undefined
}

function mapPaddleOcrItemToLine(item: OcrResultItem): OcrLine | null {
  const text = item.text.trim()
  if (!text) {
    return null
  }

  const box = normalizeOcrBox(item)
  return {
    text,
    ...(Number.isFinite(item.score) ? { confidence: item.score } : {}),
    ...(box ? { box } : {}),
  }
}

function mapPaddleOcrResultToLines(result: OcrResult | undefined) {
  return (result?.items ?? [])
    .map(mapPaddleOcrItemToLine)
    .filter((line): line is OcrLine => Boolean(line))
}

function normalizeBrowserOcrError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return `浏览器本地 OCR 失败：${error.message}`
  }

  return '浏览器本地 OCR 失败。'
}

async function createBrowserOcrRunner() {
  const { PaddleOCR } = await import('@paddleocr/paddleocr-js')
  const createOptions = {
    textDetectionModelName: 'PP-OCRv6_tiny_det',
    textRecognitionModelName: 'PP-OCRv6_tiny_rec',
    textRecognitionBatchSize: 4,
    worker: true,
    ortOptions: {
      backend: 'wasm',
      numThreads: 1,
      simd: true,
    },
  } as const

  try {
    return await PaddleOCR.create(createOptions) as BrowserOcrRunner
  } catch (error) {
    console.warn('PaddleOCR worker initialization failed; retrying on the main thread.', {
      message: error instanceof Error ? error.message : String(error),
    })
  }

  return PaddleOCR.create({
    ...createOptions,
    worker: false,
  }) as Promise<BrowserOcrRunner>
}

function getBrowserOcrRunner() {
  if (!browserOcrRunnerPromise) {
    browserOcrRunnerPromise = createBrowserOcrRunner().catch((error: unknown) => {
      browserOcrRunnerPromise = null
      throw error
    })
  }

  return browserOcrRunnerPromise
}

export async function startBrowserOcrJob(
  file: File,
  options: BrowserOcrRunOptions = {},
): Promise<OcrJobResponse> {
  const createdAt = new Date().toISOString()
  const baseJob: OcrJobResponse = {
    jobId: createOcrJobId(),
    status: 'running',
    fileName: file.name || '待识别图片',
    mimeType: file.type,
    byteSize: file.size,
    createdAt,
    updatedAt: createdAt,
    expiresAt: getOcrJobExpiry(createdAt),
  }

  try {
    const runner = options.createRunner ? await options.createRunner() : await getBrowserOcrRunner()
    const [result] = await runner.predict(file)
    const lines = mapPaddleOcrResultToLines(result)
    const completedAt = new Date().toISOString()
    const job: OcrJobResponse = {
      ...baseJob,
      status: 'complete',
      updatedAt: completedAt,
      text: lines.map((line) => line.text).join('\n'),
      lines,
      raw: result
        ? {
            image: result.image,
            metrics: result.metrics,
            runtime: result.runtime,
          }
        : undefined,
    }

    saveBrowserOcrHistoryItem(job)
    return job
  } catch (error) {
    const failedAt = new Date().toISOString()
    const job: OcrJobResponse = {
      ...baseJob,
      status: 'failed',
      updatedAt: failedAt,
      error: normalizeBrowserOcrError(error),
    }

    saveBrowserOcrHistoryItem(job)
    return job
  }
}

export async function listBrowserOcrHistory(): Promise<OcrHistoryResponse> {
  const items = readBrowserOcrHistory()
  writeBrowserOcrHistory(items)
  return { items }
}

export async function deleteBrowserOcrHistory(jobId: string) {
  const trimmedJobId = jobId.trim()
  const currentItems = readBrowserOcrHistory()
  const nextItems = currentItems.filter((item) => item.jobId !== trimmedJobId)

  if (nextItems.length === currentItems.length) {
    throw new Error('OCR 记录不存在或已过期。')
  }

  writeBrowserOcrHistory(nextItems)
}
