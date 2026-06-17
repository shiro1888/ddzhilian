import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { OcrJobRegistry } from '../server/src/registry/ocr-job-registry'

let tempDir: string | null = null
const registries: OcrJobRegistry[] = []

async function createTempRegistry(options: { retentionMs?: number; maxJobs?: number } = {}) {
  tempDir = await mkdtemp(join(tmpdir(), 'ddzhilian-ocr-jobs-'))
  const registry = await OcrJobRegistry.create({
    filePath: join(tempDir, 'jobs.json'),
    retentionMs: options.retentionMs ?? 24 * 60 * 60 * 1000,
    maxJobs: options.maxJobs ?? 20,
  })
  registries.push(registry)
  return registry
}

afterEach(async () => {
  await Promise.all(registries.map((registry) => registry.flush()))
  registries.length = 0

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

describe('OcrJobRegistry', () => {
  it('persists completed jobs and prunes expired local history', async () => {
    const registry = await createTempRegistry()
    const now = Date.now()
    const activeCreatedAt = new Date(now).toISOString()
    const expiredCreatedAt = new Date(now - 120_000).toISOString()

    registry.create({
      jobId: 'expired-job',
      fileName: 'expired.png',
      mimeType: 'image/png',
      byteSize: 12,
      createdAt: expiredCreatedAt,
      expiresAt: new Date(now - 1).toISOString(),
    })
    registry.create({
      jobId: 'active-job',
      fileName: 'active.png',
      mimeType: 'image/png',
      byteSize: 24,
      createdAt: activeCreatedAt,
      expiresAt: new Date(now + 60_000).toISOString(),
    })
    registry.complete('active-job', {
      text: 'hello',
      lines: [{ text: 'hello' }],
      raw: { ok: true },
    })

    expect(registry.get('expired-job')).toBeUndefined()
    expect(registry.list()).toEqual([
      expect.objectContaining({
        jobId: 'active-job',
        status: 'complete',
        result: expect.objectContaining({ text: 'hello' }),
      }),
    ])

    await registry.flush()
    const restored = await OcrJobRegistry.create({
      filePath: join(tempDir ?? '', 'jobs.json'),
      retentionMs: 24 * 60 * 60 * 1000,
      maxJobs: 20,
    })
    registries.push(restored)

    expect(restored.get('expired-job')).toBeUndefined()
    expect(restored.get('active-job')).toEqual(expect.objectContaining({ jobId: 'active-job' }))
  })

  it('keeps the newest records when the local job cap is exceeded', async () => {
    const registry = await createTempRegistry({ maxJobs: 2 })
    const baseTime = Date.now()

    for (let index = 0; index < 3; index += 1) {
      registry.create({
        jobId: `job-${index.toString()}`,
        fileName: `image-${index.toString()}.png`,
        mimeType: 'image/png',
        byteSize: 10 + index,
        createdAt: new Date(baseTime + index * 1000).toISOString(),
      })
    }

    expect(registry.get('job-0')).toBeUndefined()
    expect(registry.get('job-1')).toEqual(expect.objectContaining({ jobId: 'job-1' }))
    expect(registry.get('job-2')).toEqual(expect.objectContaining({ jobId: 'job-2' }))
  })
})
