import { describe, expect, it } from 'vitest'
import { parseClientEvent } from '../server/src/protocol'

describe('parseClientEvent', () => {
  it('accepts a well-formed event', () => {
    const event = parseClientEvent(
      JSON.stringify({ type: 'join-room', payload: { roomId: 'ROOM01' } }),
    )

    expect(event).toEqual({ type: 'join-room', payload: { roomId: 'ROOM01' } })
  })

  it('accepts events whose payload is optional', () => {
    expect(parseClientEvent(JSON.stringify({ type: 'request-snapshot' }))).toEqual({
      type: 'request-snapshot',
    })
    expect(parseClientEvent(JSON.stringify({ type: 'create-public-room' }))).toEqual({
      type: 'create-public-room',
    })
  })

  it('rejects a known type whose required payload is missing', () => {
    // The dispatcher reads event.payload.roomId without guarding, so letting
    // this through would throw inside the websocket message handler.
    expect(parseClientEvent(JSON.stringify({ type: 'join-room' }))).toBeNull()
    expect(parseClientEvent(JSON.stringify({ type: 'update-room-state' }))).toBeNull()
    expect(parseClientEvent(JSON.stringify({ type: 'pair-by-short-code' }))).toBeNull()
    expect(parseClientEvent(JSON.stringify({ type: 'signal' }))).toBeNull()
  })

  it('rejects a payload whose required fields have the wrong type', () => {
    expect(
      parseClientEvent(JSON.stringify({ type: 'join-room', payload: { roomId: 42 } })),
    ).toBeNull()
    expect(
      parseClientEvent(
        JSON.stringify({ type: 'signal', payload: { sessionId: 'a', targetDeviceId: 'b' } }),
      ),
    ).toBeNull()
    expect(
      parseClientEvent(
        JSON.stringify({
          type: 'signal',
          payload: { sessionId: 'a', targetDeviceId: 'b', signal: { kind: 7 } },
        }),
      ),
    ).toBeNull()
  })

  it('rejects unknown event types', () => {
    expect(parseClientEvent(JSON.stringify({ type: 'noop' }))).toBeNull()
    expect(parseClientEvent(JSON.stringify({ type: 'constructor' }))).toBeNull()
    expect(parseClientEvent(JSON.stringify({ type: '__proto__' }))).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(parseClientEvent('not json')).toBeNull()
    expect(parseClientEvent(JSON.stringify(null))).toBeNull()
    expect(parseClientEvent(JSON.stringify([{ type: 'hello' }]))).toBeNull()
    expect(parseClientEvent(JSON.stringify({ type: 123 }))).toBeNull()
  })

  it('accepts a hello with no payload fields', () => {
    expect(parseClientEvent(JSON.stringify({ type: 'hello', payload: {} }))).toEqual({
      type: 'hello',
      payload: {},
    })
  })

  it('accepts image avatars without a product-level size cap', () => {
    const avatarDataUrl = `data:image/jpeg;base64,${'A'.repeat(256 * 1024)}`

    expect(
      parseClientEvent(
        JSON.stringify({ type: 'update-settings', payload: { avatarDataUrl } }),
      ),
    ).toEqual({ type: 'update-settings', payload: { avatarDataUrl } })
  })

  it('rejects non-image and scriptable avatar sources', () => {
    expect(
      parseClientEvent(
        JSON.stringify({
          type: 'update-settings',
          payload: { avatarDataUrl: 'https://example.com/avatar.jpg' },
        }),
      ),
    ).toBeNull()
    expect(
      parseClientEvent(
        JSON.stringify({
          type: 'update-settings',
          payload: { avatarDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
        }),
      ),
    ).toBeNull()
  })

  it('accepts boolean preference updates, including sound effects', () => {
    expect(
      parseClientEvent(
        JSON.stringify({
          type: 'update-preferences',
          payload: { enterToSend: false, soundEffects: false },
        }),
      ),
    ).toEqual({
      type: 'update-preferences',
      payload: { enterToSend: false, soundEffects: false },
    })
  })

  it('rejects malformed settings and preference values before dispatch', () => {
    expect(
      parseClientEvent(
        JSON.stringify({ type: 'update-preferences', payload: { soundEffects: 'yes' } }),
      ),
    ).toBeNull()
    expect(
      parseClientEvent(
        JSON.stringify({ type: 'update-settings', payload: { discoverable: 'yes' } }),
      ),
    ).toBeNull()
    expect(
      parseClientEvent(
        JSON.stringify({
          type: 'update-settings',
          payload: {
            nativeLan: {
              lanNativeEnabled: true,
              lanDiscoveryEnabled: true,
              lanTransferEnabled: true,
              localPort: 70_000,
            },
          },
        }),
      ),
    ).toBeNull()
    expect(
      parseClientEvent(
        JSON.stringify({ type: 'hello', payload: { deviceName: 42 } }),
      ),
    ).toBeNull()
    expect(
      parseClientEvent(
        JSON.stringify({
          type: 'update-room-state',
          payload: { roomId: 'ROOM01', pinned: 'yes' },
        }),
      ),
    ).toBeNull()
  })
})
