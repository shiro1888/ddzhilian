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
  } as unknown as WebSocket
}

describe('DeviceRegistry device name rules', () => {
  it('keeps a custom Chinese device name during registration', () => {
    const registry = new DeviceRegistry()

    const device = registry.register(
      createSocket(),
      {
        deviceId: 'device-register-rule',
        deviceName: '陈冠嵘',
      },
      testNetwork,
    )

    expect(device.deviceName).toBe('陈冠嵘')
  })

  it('trims and keeps a custom Chinese device name during updates', () => {
    const registry = new DeviceRegistry()
    registry.register(
      createSocket(),
      {
        deviceId: 'device-update-rule',
        deviceName: 'windows-TEST',
      },
      testNetwork,
    )

    const updated = registry.update('device-update-rule', {
      deviceName: ' 陈冠嵘 ',
    })

    expect(updated?.deviceName).toBe('陈冠嵘')
  })
})
