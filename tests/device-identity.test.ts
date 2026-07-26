import type WebSocket from 'ws'
import { describe, expect, it, vi } from 'vitest'
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
