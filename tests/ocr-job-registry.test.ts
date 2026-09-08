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
    retentionMs: options.retentionMs ?? 7 * 24 * 60 * 60 * 1000,
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
      ownerKey: 'device:alpha',
      fileName: 'expired.png',
      mimeType: 'image/png',
      byteSize: 12,
      createdAt: expiredCreatedAt,
      expiresAt: new Date(now - 1).toISOString(),
    })
    registry.create({
      jobId: 'active-job',
      ownerKey: 'device:alpha',
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
      retentionMs: 7 * 24 * 60 * 60 * 1000,
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
        ownerKey: 'device:alpha',
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

  it('scopes job lookup, listing, and deletion by owner key', async () => {
    const registry = await createTempRegistry()
    const createdAt = new Date().toISOString()

    registry.create({
      jobId: 'alpha-job',
      ownerKey: 'device:alpha',
      fileName: 'alpha.png',
      mimeType: 'image/png',
      byteSize: 12,
      createdAt,
    })
    registry.create({
      jobId: 'beta-job',
      ownerKey: 'device:beta',
      fileName: 'beta.png',
      mimeType: 'image/png',
      byteSize: 24,
      createdAt,
    })
    registry.complete('alpha-job', {
      text: 'alpha',
      lines: [{ text: 'alpha' }],
      raw: { ok: true },
    })
    registry.complete('beta-job', {
      text: 'beta',
      lines: [{ text: 'beta' }],
      raw: { ok: true },
    })

    expect(registry.get('alpha-job', 'device:alpha')).toEqual(expect.objectContaining({ jobId: 'alpha-job' }))
    expect(registry.get('alpha-job', 'device:beta')).toBeUndefined()
    expect(registry.list(20, 'device:alpha')).toEqual([
      expect.objectContaining({ jobId: 'alpha-job' }),
    ])
    expect(registry.delete('alpha-job', 'device:beta')).toBe(false)
    expect(registry.get('alpha-job', 'device:alpha')).toBeDefined()
    expect(registry.delete('alpha-job', 'device:alpha')).toBe(true)
    expect(registry.get('alpha-job', 'device:alpha')).toBeUndefined()
  })
})
