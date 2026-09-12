import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SnapLinkStage } from '@/app/components/SnapLinkStage'
import type { UnifiedConversationEntry } from '@/app/types'
import { createSnapLinkBaseProps, createSnapLinkRoom } from './helpers/snaplink'

function entry(index: number): UnifiedConversationEntry {
  return { id: `entry-${index}`, entryType: 'text', sessionId: 'session', fromSelf: false,
    senderName: 'Peer', text: `message ${index}`, createdAt: new Date(Date.UTC(2026, 8, 12, 0, index)).toISOString() }
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
afterEach(cleanup)

describe('rendered conversation scroll behavior', () => {
  it('anchors the first message when earlier history is prepended after a notice row', () => {
    const entries = Array.from({ length: 100 }, (_, index) => entry(index))
    entries[20] = { id: 'entry-20', entryType: 'notice', fromSelf: false, sessionId: 'session',
      createdAt: entries[20].createdAt, text: 'Notice' }
    const props = createSnapLinkBaseProps({ selectedRoomId: 'ROOM01', roomListItems: [createSnapLinkRoom()], unifiedConversationEntries: entries })
    const { container } = render(<SnapLinkStage {...props} />)
    const messages = container.querySelector<HTMLDivElement>('.dd-snaplink__messages')!
    let top = 50
    Object.defineProperties(messages, { scrollTop: { configurable: true, get: () => top, set: (value: number) => { top = value } },
      scrollHeight: { configurable: true, get: () => messages.children.length * 100 }, clientHeight: { configurable: true, value: 400 } })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const rows = Array.from(messages.children)
      const index = rows.indexOf(this.closest('.dd-snaplink__entry')!)
      return { top: index * 100 - top } as DOMRect
    })
    fireEvent.scroll(messages)
    expect(screen.getByText('message 0')).toBeInTheDocument()
    expect(top).toBe(2050)
  })
  it('preserves the reading position and oldest visible row when new messages reach the render cap', async () => {
    const entries = Array.from({ length: 100 }, (_, index) => entry(index))
    const props = createSnapLinkBaseProps({ selectedRoomId: 'ROOM01', roomListItems: [createSnapLinkRoom()], unifiedConversationEntries: entries })
    const { container, rerender } = render(<SnapLinkStage {...props} />)
    const messages = container.querySelector<HTMLDivElement>('.dd-snaplink__messages')!
    expect(messages).not.toBeNull()
    let scrollTop = 600
    Object.defineProperties(messages, { scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = Math.min(600, value) } } })
    fireEvent.scroll(messages)
    scrollTop = 590
    fireEvent.scroll(messages)
    expect(screen.getByText('message 20')).toBeInTheDocument()
    await act(async () => rerender(<SnapLinkStage {...props} unifiedConversationEntries={[...entries, entry(100)]} />))
    expect(screen.getByText('message 20')).toBeInTheDocument()
    expect(scrollTop).toBe(590)
    scrollTop = 600
    fireEvent.scroll(messages)
    Object.defineProperty(messages, 'scrollHeight', { configurable: true, value: 1100 })
    Object.defineProperty(messages, 'scrollTop', { configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = Math.min(700, value) } })
    await act(async () => rerender(<SnapLinkStage {...props} unifiedConversationEntries={[...entries, entry(100), entry(101)]} />))
    expect(scrollTop).toBe(700)
  })

  it('does not write scrollTop repeatedly when only file progress changes', async () => {
    const file: Extract<UnifiedConversationEntry, { entryType: 'file' }> = {
      id: 'file-entry', entryType: 'file', sessionId: 'session', fromSelf: false, senderName: 'Peer',
      createdAt: new Date().toISOString(), file: { id: 'file', kind: 'incoming', fromSelf: false, createdAt: new Date().toISOString(),
        fileName: 'large.bin', fileSize: 1000, subtitle: 'Peer', detail: '1 / 1000', statusLabel: '正在接收',
        tone: 'active', progress: 0.001, transferStatus: 'transferring' },
    }
    const props = createSnapLinkBaseProps({ selectedRoomId: 'ROOM01', roomListItems: [createSnapLinkRoom()], unifiedConversationEntries: [file] })
    const { container, rerender } = render(<SnapLinkStage {...props} />)
    const messages = container.querySelector<HTMLDivElement>('.dd-snaplink__messages')!
    let writes = 0
    Object.defineProperty(messages, 'scrollTop', { configurable: true, get: () => 500, set: () => { writes++ } })
    for (let i = 1; i <= 5; i++) {
      await act(async () => rerender(<SnapLinkStage {...props} unifiedConversationEntries={[{ ...file, file: { ...file.file, progress: i / 5 } }]} />))
    }
    expect(writes).toBe(0)
  })
})
