import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteBrowserOcrHistory, listBrowserOcrHistory, startBrowserOcrJob } from '../src/lib/browser-ocr'

describe('browser OCR runtime', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('runs OCR in the browser and stores a short local history item', async () => {
    const predict = vi.fn().mockResolvedValue([
      {
        image: { width: 320, height: 180 },
        items: [
          {
            text: '  第一行文字  ',
            score: 0.94,
            poly: [[12, 20], [220, 20], [220, 52], [12, 52]],
          },
          {
            text: '',
            score: 0.5,
            poly: [[0, 0], [1, 1]],
          },
        ],
        metrics: {
          detMs: 12,
          recMs: 8,
          totalMs: 20,
          detectedBoxes: 2,
          recognizedCount: 1,
        },
        runtime: {
          requestedBackend: 'wasm',
          detProvider: 'wasm',
          recProvider: 'wasm',
          webgpuAvailable: false,
        },
      },
    ])

    const job = await startBrowserOcrJob(
      new File(['image'], 'receipt.png', { type: 'image/png' }),
      { createRunner: async () => ({ predict }) },
    )

    expect(job.status).toBe('complete')
    expect(job.text).toBe('第一行文字')
    expect(job.createdAt).toBeDefined()
    expect(job.expiresAt).toBeDefined()
    expect(Date.parse(job.expiresAt ?? '') - Date.parse(job.createdAt ?? '')).toBe(
      90 * 24 * 60 * 60 * 1000,
    )
    expect(job.lines).toEqual([
      {
        text: '第一行文字',
        confidence: 0.94,
        box: [[12, 20], [220, 20], [220, 52], [12, 52]],
      },
    ])
    expect(predict).toHaveBeenCalledTimes(1)

    const history = await listBrowserOcrHistory()
    expect(history.items).toHaveLength(1)
    expect(history.items[0]?.jobId).toBe(job.jobId)
  })

  it('keeps failed browser OCR attempts in local history', async () => {
    const job = await startBrowserOcrJob(
      new File(['image'], 'broken.webp', { type: 'image/webp' }),
      {
        createRunner: async () => ({
          predict: vi.fn().mockRejectedValue(new Error('model load failed')),
        }),
      },
    )

    expect(job.status).toBe('failed')
    expect(job.error).toBe('浏览器本地 OCR 失败：model load failed')

    const history = await listBrowserOcrHistory()
    expect(history.items[0]?.jobId).toBe(job.jobId)
    expect(history.items[0]?.status).toBe('failed')
  })

  it('deletes browser OCR history items locally', async () => {
    const job = await startBrowserOcrJob(
      new File(['image'], 'note.jpg', { type: 'image/jpeg' }),
      {
        createRunner: async () => ({
          predict: vi.fn().mockResolvedValue([
            {
              image: { width: 1, height: 1 },
              items: [{ text: 'note', score: 1, poly: [[0, 0], [1, 0], [1, 1], [0, 1]] }],
              metrics: {
                detMs: 1,
                recMs: 1,
                totalMs: 2,
                detectedBoxes: 1,
                recognizedCount: 1,
              },
              runtime: {
                requestedBackend: 'wasm',
                detProvider: 'wasm',
                recProvider: 'wasm',
                webgpuAvailable: false,
              },
            },
          ]),
        }),
      },
    )

    await deleteBrowserOcrHistory(job.jobId)

    const history = await listBrowserOcrHistory()
    expect(history.items).toEqual([])
  })
})
