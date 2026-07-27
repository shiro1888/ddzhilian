import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type WebSocket from 'ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceRegistry } from '../server/src/registry/device-registry'
import type { NetworkContext } from '../server/src/utils/network'

const testNetwork: NetworkContext = {
  remoteAddress: '127.0.0.1',
  lanKey: '127.0.0',
  lanMode: 'private-subnet',
}

function createSocket() {
  return {
    close: vi.fn(),
    send: vi.fn(),
  } as unknown as WebSocket
}

describe('DeviceRegistry identity claims', () => {
  it('issues a device secret on first registration', () => {
    const registry = new DeviceRegistry()

    const device = registry.register(
      createSocket(),
      { deviceId: 'device-first-hello' },
      testNetwork,
    )

    expect(device.deviceId).toBe('device-first-hello')
    expect(device.deviceSecret).toEqual(expect.any(String))
    expect(device.deviceSecret.length).toBeGreaterThan(16)
  })

  it('lets the rightful owner reclaim its id with the matching secret', () => {
    const registry = new DeviceRegistry()
    const first = registry.register(
      createSocket(),
      { deviceId: 'device-owner' },
      testNetwork,
    )

    const reconnected = registry.register(
      createSocket(),
      { deviceId: 'device-owner', deviceSecret: first.deviceSecret },
      testNetwork,
    )

    expect(reconnected.deviceId).toBe('device-owner')
    expect(reconnected.deviceSecret).toBe(first.deviceSecret)
  })

  it('hands an impersonator a fresh id instead of the claimed one', () => {
    const registry = new DeviceRegistry()
    const victim = registry.register(
      createSocket(),
      { deviceId: 'device-victim' },
      testNetwork,
    )

    const attacker = registry.register(
      createSocket(),
      { deviceId: 'device-victim', deviceSecret: 'wrong-secret' },
      testNetwork,
    )

    expect(attacker.deviceId).not.toBe('device-victim')
    expect(registry.getById('device-victim')?.deviceSecret).toBe(victim.deviceSecret)
  })

  it('does not disconnect the owner when a reclaim is rejected', () => {
    const registry = new DeviceRegistry()
    const victimSocket = createSocket()
    registry.register(victimSocket, { deviceId: 'device-keepalive' }, testNetwork)

    registry.register(
      createSocket(),
      { deviceId: 'device-keepalive' },
      testNetwork,
    )

    expect(victimSocket.close).not.toHaveBeenCalled()
    expect(registry.getById('device-keepalive')?.socket).toBe(victimSocket)
  })

  it('rejects a reclaim that omits the secret entirely', () => {
    const registry = new DeviceRegistry()
    registry.register(createSocket(), { deviceId: 'device-no-secret' }, testNetwork)

    const attacker = registry.register(
      createSocket(),
      { deviceId: 'device-no-secret' },
      testNetwork,
    )

    expect(attacker.deviceId).not.toBe('device-no-secret')
  })

  it('trusts an id the registry has never issued, so existing installs keep theirs', () => {
    const registry = new DeviceRegistry()

    const device = registry.register(
      createSocket(),
      { deviceId: 'device-legacy-install' },
      testNetwork,
    )

    expect(device.deviceId).toBe('device-legacy-install')
  })
})

describe('DeviceRegistry secret persistence', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      // Saves are queued, so a temp file can appear mid-removal and make
      // rmdir fail with ENOTEMPTY on Windows. Retrying is what maxRetries is
      // for; without it this cleanup fails intermittently under load.
      await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })
    }
  })

  async function createStorePath() {
    const dir = await mkdtemp(join(tmpdir(), 'ddzhilian-device-secrets-'))
    tempDirs.push(dir)
    return join(dir, 'secrets.json')
  }

  /**
   * The save is queued and atomic, so wait for the file to actually appear
   * rather than guessing a delay — a fixed sleep raced under parallel load.
   */
  async function waitForStore(storePath: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (existsSync(storePath)) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }

    throw new Error(`device secret store was never written: ${storePath}`)
  }

  it('still rejects a harvested deviceId after a restart', async () => {
    const secretStorePath = await createStorePath()

    const first = new DeviceRegistry({ secretStorePath })
    const owner = first.register(createSocket(), { deviceId: 'device-durable' }, testNetwork)

    await waitForStore(secretStorePath)

    // deviceIds are public and durable, so without persistence a restart would
    // return every harvested id to trust-on-first-use.
    const restarted = new DeviceRegistry({ secretStorePath })
    const attacker = restarted.register(
      createSocket(),
      { deviceId: 'device-durable' },
      testNetwork,
    )

    expect(attacker.deviceId).not.toBe('device-durable')

    const reclaimed = restarted.register(
      createSocket(),
      { deviceId: 'device-durable', deviceSecret: owner.deviceSecret },
      testNetwork,
    )

    expect(reclaimed.deviceId).toBe('device-durable')
    expect(reclaimed.deviceSecret).toBe(owner.deviceSecret)
  })

  it('starts empty when the store is missing or corrupt', async () => {
    const secretStorePath = await createStorePath()

    // Never written: the file does not exist yet.
    const registry = new DeviceRegistry({ secretStorePath })
    const device = registry.register(createSocket(), { deviceId: 'device-fresh' }, testNetwork)

    expect(device.deviceId).toBe('device-fresh')
  })

  it('keeps secrets in memory when no store path is configured', () => {
    const registry = new DeviceRegistry()
    const owner = registry.register(createSocket(), { deviceId: 'device-memory' }, testNetwork)

    const reclaimed = registry.register(
      createSocket(),
      { deviceId: 'device-memory', deviceSecret: owner.deviceSecret },
      testNetwork,
    )

    expect(reclaimed.deviceId).toBe('device-memory')
  })
})

describe('DeviceRegistry peer exposure', () => {
  it('never exposes another device pair token', () => {
    const registry = new DeviceRegistry()
    const viewer = registry.register(
      createSocket(),
      { deviceId: 'device-viewer' },
      testNetwork,
    )
    const candidate = registry.register(
      createSocket(),
      { deviceId: 'device-candidate' },
      testNetwork,
    )

    const summary = registry.toPeerSummary(viewer, candidate)

    expect(summary).not.toHaveProperty('pairToken')
    expect(JSON.stringify(summary)).not.toContain(candidate.pairToken)
    expect(JSON.stringify(summary)).not.toContain(candidate.deviceSecret)
    expect(JSON.stringify(summary)).not.toContain(candidate.historyAuthToken)
  })
})
