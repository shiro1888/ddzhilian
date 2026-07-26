// @vitest-environment node
// HistoryRegistry resolves its default storage root from import.meta.url,
// which is not a file: URL under the jsdom environment this project defaults
// to. Each test also gets its own storageRoot so nothing touches real data.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HistoryRegistry } from '../server/src/registry/history-registry'

const tempDirs: string[] = []

async function createRegistry() {
  const storageRoot = await mkdtemp(join(tmpdir(), 'ddzhilian-history-'))
  tempDirs.push(storageRoot)

  return HistoryRegistry.create({
    storageRoot,
    retentionMs: 24 * 60 * 60 * 1000,
    textRetentionMs: 24 * 60 * 60 * 1000,
    maxBytes: 10 * 1024 * 1024,
  })
}

function baseInput(historyId: string) {
  return {
    historyId,
    roomId: 'ROOM01',
    isPublic: false,
    sourceDeviceId: 'device-test',
    sourceDeviceName: 'Test Device',
    fileName: 'sample.bin',
    createdAt: new Date().toISOString(),
  }
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe('HistoryRegistry.saveFileChunk', () => {
  it('assembles sequential chunks into the declared total', async () => {
    const registry = await createRegistry()

    const first = await registry.saveFileChunk({
      ...baseInput('history-sequential'),
      start: 0,
      end: 3,
      total: 8,
      data: Buffer.from('AAAA'),
    })

    expect(first.accepted).toBe(true)
    expect(first.complete).toBe(false)
    expect(first.offset).toBe(4)

    const second = await registry.saveFileChunk({
      ...baseInput('history-sequential'),
      start: 4,
      end: 7,
      total: 8,
      data: Buffer.from('BBBB'),
    })

    expect(second.complete).toBe(true)
    expect(second.offset).toBe(8)
  })

  it('rejects a chunk that does not start at the current offset', async () => {
    const registry = await createRegistry()

    const result = await registry.saveFileChunk({
      ...baseInput('history-offset-mismatch'),
      start: 64,
      end: 67,
      total: 128,
      data: Buffer.from('CCCC'),
    })

    expect(result.accepted).toBe(false)
    expect(result.offset).toBe(0)
  })

  it('serializes concurrent chunks so duplicates cannot corrupt the file', async () => {
    const registry = await createRegistry()
    const chunk = Buffer.from('DDDD')

    // Both requests observe offset 0. Before the per-historyId lock both
    // appended, leaving a correctly-sized file holding chunk0 twice.
    const results = await Promise.all([
      registry.saveFileChunk({
        ...baseInput('history-concurrent'),
        start: 0,
        end: 3,
        total: 8,
        data: chunk,
      }),
      registry.saveFileChunk({
        ...baseInput('history-concurrent'),
        start: 0,
        end: 3,
        total: 8,
        data: chunk,
      }),
    ])

    expect(results.filter((result) => result.accepted)).toHaveLength(1)

    const rejected = results.filter((result) => !result.accepted)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].offset).toBe(4)
  })

  it('rejects a chunk whose body does not match its declared range', async () => {
    const registry = await createRegistry()

    await expect(
      registry.saveFileChunk({
        ...baseInput('history-size-mismatch'),
        start: 0,
        end: 99,
        total: 100,
        data: Buffer.from('short'),
      }),
    ).rejects.toThrow(/Content-Range/)
  })

  it('rejects an upload declaring more than the configured capacity', async () => {
    const registry = await createRegistry()

    await expect(
      registry.saveFileChunk({
        ...baseInput('history-too-large'),
        start: 0,
        end: 3,
        total: 100 * 1024 * 1024,
        data: Buffer.from('EEEE'),
      }),
    ).rejects.toThrow()
  })
})
