import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDdzhilian } from '../src/lib/use-ddzhilian'
import type { ChannelMessage, DirectorySnapshotPayload } from '../src/lib/ddzhilian-types'

class TestSocket extends EventTarget {
  static OPEN = 1
  static instances: TestSocket[] = []
  readyState = 1
  send = vi.fn()
  constructor() { super(); TestSocket.instances.push(this) }
  close() { this.readyState = 3 }
  receive(type: string, payload: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type, payload }) }))
  }
}

class TestChannel extends EventTarget {
  readyState = 'open'
  bufferedAmount = 0
  bufferedAmountLowThreshold = 0
  binaryType = 'arraybuffer'
  send = vi.fn((value: string | ArrayBuffer) => { void value })
  receive(message: ChannelMessage) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }))
  }
  close() { this.readyState = 'closed'; this.dispatchEvent(new Event('close')) }
}

class TestPeer extends EventTarget {
  static instances: TestPeer[] = []
  connectionState = 'connected'
  constructor() { super(); TestPeer.instances.push(this) }
  close() {}
  attach(channel: TestChannel) {
    this.dispatchEvent(Object.assign(new Event('datachannel'), { channel }))
  }
}

function snapshot(): DirectorySnapshotPayload {
  return {
    self: { deviceId: 'self', deviceName: 'Self', deviceSecret: 'secret', shortCode: 'SELF', pairToken: 'pair',
      historyAuthToken: 'test-token', autoConnect: false, discoverable: true, allowShortCode: true, platform: 'web',
      preferences: { enterToSend: true } },
    peers: [], lanPeers: [], accountPeers: [], rooms: [], sessions: [], roomStates: [],
    historyFiles: [], historyTexts: [], rtcConfig: { iceServers: [] }, publicWsUrl: 'ws://localhost/ws',
    serverTime: new Date().toISOString(),
  }
}

async function mountClient() {
  const view = renderHook(() => useDdzhilian())
  const socket = TestSocket.instances.at(-1)!
  await act(async () => socket.receive('welcome', snapshot()))
  return { ...view, socket }
}

async function attachPeer(socket: TestSocket, id = 'peer') {
  const sessionId = `session-${id}`
  await act(async () => socket.receive('session-created', {
    sessionId, roomId: 'ROOM01', initiator: false, reason: 'manual',
    peer: { deviceId: id, deviceName: id, platform: 'web', online: true, shortCode: 'PEER',
      relation: { sameAccount: false, sameLan: false, autoConnectEligible: false, discoverable: true },
      lastSeenAt: new Date().toISOString() },
  }))
  const channel = new TestChannel()
  await act(async () => { TestPeer.instances.at(-1)!.attach(channel); channel.dispatchEvent(new Event('open')) })
  return { channel, sessionId }
}

function metadata(channel: TestChannel) {
  return channel.send.mock.calls.flatMap(([value]) => {
    if (typeof value !== 'string') return []
    const message = JSON.parse(value) as ChannelMessage
    return message.type === 'file-meta' ? [message] : []
  })
}

beforeEach(() => {
  TestSocket.instances = []; TestPeer.instances = []
  localStorage.clear()
  vi.stubGlobal('WebSocket', TestSocket)
  vi.stubGlobal('RTCPeerConnection', TestPeer)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ texts: [], hasMore: false }))))
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('file transfer lifecycle through the real client hook', () => {
  it('starts sending again when retry is clicked on an already-open channel', async () => {
    const { result, socket } = await mountClient()
    const { channel, sessionId } = await attachPeer(socket)
    let id = ''
    await act(async () => { id = result.current.createTransferItems([new File([], 'empty.bin')], sessionId, { archiveHistory: false })[0].id })
    let sending!: Promise<void>
    await act(async () => { sending = result.current.startPendingTransfers([id]) })
    expect(metadata(channel)).toHaveLength(1)
    await act(async () => { channel.receive({ type: 'file-reject', id, reason: 'try again' }); await sending })
    expect(result.current.transferItems[0].status).toBe('failed')
    await act(async () => result.current.retryTransfer(id))
    expect(metadata(channel)).toHaveLength(2)
    await act(async () => result.current.cancelTransfer(id))
  })

  it('finishes the task immediately if the channel closes while awaiting acceptance', async () => {
    const { result, socket } = await mountClient()
    const { channel, sessionId } = await attachPeer(socket)
    let id = ''
    await act(async () => { id = result.current.createTransferItems([new File([], 'empty.bin')], sessionId)[0].id })
    let sending!: Promise<void>
    await act(async () => { sending = result.current.startPendingTransfers([id]) })
    await act(async () => { channel.close(); await sending })
    expect(result.current.transferItems[0].status).toBe('failed')
  })

  it('aborts the actual HTTP upload and does not send more chunks or add history', async () => {
    const { result } = await mountClient()
    let uploadSignal: AbortSignal | undefined
    const upload = vi.fn((_url: unknown, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      uploadSignal = options.signal!
      uploadSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', upload)
    let sending!: Promise<void>
    await act(async () => { sending = result.current.sendRoomFiles('ROOM01', [{ id: 'upload', file: new File([new Uint8Array(3 * 1024 * 1024)], 'large.bin') }]) })
    await act(async () => { result.current.cancelTransfer('upload'); await sending })
    expect(uploadSignal?.aborted).toBe(true)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(result.current.transferItems[0].status).toBe('cancelled')
    expect(result.current.historyFiles).toHaveLength(0)
  })

  it('does not send a chunk after cancellation during asynchronous file reading', async () => {
    const { result, socket } = await mountClient()
    const { channel, sessionId } = await attachPeer(socket)
    let finishRead!: (value: ArrayBuffer) => void
    const file = new File(['test'], 'delayed.bin')
    Object.defineProperty(file, 'slice', { value: () => ({ arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => { finishRead = resolve }) }) })
    let id = ''
    await act(async () => { id = result.current.createTransferItems([file], sessionId)[0].id })
    let sending!: Promise<void>
    await act(async () => { sending = result.current.startPendingTransfers([id]) })
    await act(async () => channel.receive({ type: 'file-resume', id, receivedBytes: 0, nextIndex: 0 }))
    expect(finishRead).toBeTypeOf('function')
    await act(async () => { result.current.cancelTransfer(id); finishRead(new ArrayBuffer(4)); await sending })
    expect(channel.send.mock.calls.every(([value]) => typeof value === 'string')).toBe(true)
    expect(result.current.transferItems[0].status).toBe('cancelled')
  })

  it('ignores forged acknowledgements from a different connected peer', async () => {
    const { result, socket } = await mountClient()
    const { channel, sessionId } = await attachPeer(socket)
    const other = await attachPeer(socket, 'other')
    let id = ''
    await act(async () => { id = result.current.createTransferItems([new File([], 'empty.bin')], sessionId, { archiveHistory: false })[0].id })
    let sending!: Promise<void>
    await act(async () => { sending = result.current.startPendingTransfers([id]) })
    await act(async () => other.channel.receive({ type: 'file-resume', id, receivedBytes: 0, nextIndex: 0 }))
    expect(result.current.transferItems[0].status).toBe('ready')
    await act(async () => channel.receive({ type: 'file-resume', id, receivedBytes: 0, nextIndex: 0 }))
    await act(async () => other.channel.receive({ type: 'file-ack', id, receivedBytes: 0, completed: true }))
    expect(result.current.transferItems[0].status).toBe('transferring')
    await act(async () => { channel.receive({ type: 'file-ack', id, receivedBytes: 0, completed: true }); await sending })
    expect(result.current.transferItems[0].status).toBe('completed')
  })

  it('preserves loaded older messages and avoids fetching the same latest page on each snapshot', async () => {
    const { result, socket } = await mountClient()
    const records = Array.from({ length: 100 }, (_, index) => ({
      historyId: `text-${String(index).padStart(3, '0')}`, roomId: 'ROOM01', isPublic: true,
      sourceDeviceId: 'peer', sourceDeviceName: 'Peer', text: `message ${index}`,
      createdAt: new Date(Date.UTC(2026, 8, 12, 0, index)).toISOString(),
    }))
    const historySnapshot = snapshot()
    historySnapshot.rooms = [{ roomId: 'ROOM01', members: [], isPublic: true, reason: 'manual',
      historyTextCount: 100, historyTextLatestAt: records.at(-1)!.createdAt, updatedAt: records.at(-1)!.createdAt }]
    const fetchPage = vi.fn(async (url: unknown) => {
      const older = String(url).includes('beforeCreatedAt=')
      const page = older ? records.slice(0, 50) : records.slice(50)
      return new Response(JSON.stringify({ texts: page, hasMore: !older,
        nextCursor: { historyId: page[0].historyId, createdAt: page[0].createdAt } }))
    })
    vi.stubGlobal('fetch', fetchPage)
    await act(async () => socket.receive('directory-snapshot', historySnapshot))
    await act(async () => { result.current.ensureRoomHistoryLoaded('ROOM01'); result.current.ensureRoomHistoryLoaded('ROOM01') })
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(result.current.historyTexts).toHaveLength(50)
    await act(async () => socket.receive('directory-snapshot', historySnapshot))
    expect(fetchPage).toHaveBeenCalledTimes(1)
    await act(async () => result.current.loadOlderRoomHistoryTexts('ROOM01'))
    expect(result.current.historyTexts).toHaveLength(100)
    const next = { ...records[99], historyId: 'text-100', text: 'new arrival', createdAt: new Date(Date.UTC(2026, 8, 12, 0, 100)).toISOString() }
    fetchPage.mockImplementation(async () => new Response(JSON.stringify({ texts: [...records.slice(51), next], hasMore: true,
      nextCursor: { historyId: records[51].historyId, createdAt: records[51].createdAt } })))
    historySnapshot.rooms[0].historyTextCount = 101
    historySnapshot.rooms[0].historyTextLatestAt = next.createdAt
    await act(async () => socket.receive('directory-snapshot', historySnapshot))
    expect(result.current.historyTexts).toHaveLength(101)
    expect(result.current.historyTexts[0].historyId).toBe('text-000')
    expect(result.current.historyTextPaginationByRoomId.ROOM01.hasMore).toBe(false)
  })
})
