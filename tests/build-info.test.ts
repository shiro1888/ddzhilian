import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadBuildInfo } from '../server/src/build-info'

const tempDirectories: string[] = []

async function createTempDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'ddzhilian-build-info-'))
  tempDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => (
    rm(directory, { force: true, recursive: true })
  )))
})

describe('loadBuildInfo', () => {
  it('loads deployment metadata from the staged build-info file', async () => {
    const directory = await createTempDirectory()
    const file = join(directory, '.build-info.json')
    await writeFile(file, JSON.stringify({
      sha: 'abc123',
      builtAt: '2026-08-06T12:00:00.000Z',
      runId: '456',
    }))

    await expect(loadBuildInfo({ file, env: {} })).resolves.toEqual({
      sha: 'abc123',
      builtAt: '2026-08-06T12:00:00.000Z',
      runId: '456',
    })
  })

  it('falls back to environment metadata when the file is unavailable', async () => {
    const directory = await createTempDirectory()

    await expect(loadBuildInfo({
      file: join(directory, 'missing.json'),
      env: {
        GITHUB_SHA: 'fallback-sha',
        GITHUB_RUN_ID: '789',
        DDZHILIAN_BUILD_AT: '2026-08-06T13:00:00.000Z',
      },
    })).resolves.toEqual({
      sha: 'fallback-sha',
      builtAt: '2026-08-06T13:00:00.000Z',
      runId: '789',
    })
  })

  it('returns nullable fields for malformed metadata', async () => {
    const directory = await createTempDirectory()
    const file = join(directory, '.build-info.json')
    await writeFile(file, '{not-json')

    await expect(loadBuildInfo({ file, env: {} })).resolves.toEqual({
      sha: null,
      builtAt: null,
      runId: null,
    })
  })
})
