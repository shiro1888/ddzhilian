import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SnapLinkStage } from '@/app/components/SnapLinkStage'
import type { FileConversationEntry, UnifiedConversationEntry } from '@/app/types'

import { createSnapLinkBaseProps } from './helpers/snaplink'

const soundMocks = vi.hoisted(() => ({
  playMessageSentSound: vi.fn(),
  playMessageReceivedSound: vi.fn(),
  playPeerConnectedSound: vi.fn(),
  playTransferCompletedSound: vi.fn(),
}))

vi.mock('@/lib/sound/sound-effects', () => soundMocks)

const incomingEntry = (id: string): UnifiedConversationEntry => ({
  id,
  entryType: 'text',
  sessionId: 'session-1',
  fromSelf: false,
  senderName: 'peer',
  createdAt: '2026-08-25T00:00:00.000Z',
  text: id,
})

const transferEntry = (
  tone: FileConversationEntry['tone'],
): FileConversationEntry => ({
  id: 'transfer-1',
  kind: 'incoming',
  fromSelf: false,
  createdAt: '2026-08-25T00:00:00.000Z',
  fileName: 'report.pdf',
  fileSize: 1024,
  subtitle: 'peer',
  detail: '',
  statusLabel: tone,
  tone,
  progress: tone === 'completed' ? 100 : 20,
})

describe('SnapLinkStage sound effect triggers', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not treat switching rooms as a newly received message', () => {
    const { rerender } = render(
      <SnapLinkStage
        {...createSnapLinkBaseProps({
          selectedRoomId: 'ROOM01',
          unifiedConversationEntries: [incomingEntry('room-1-message')],
        })}
      />,
    )

    soundMocks.playMessageReceivedSound.mockClear()

    rerender(
      <SnapLinkStage
        {...createSnapLinkBaseProps({
          selectedRoomId: 'ROOM02',
          unifiedConversationEntries: [incomingEntry('room-2-history')],
        })}
      />,
    )

    expect(soundMocks.playMessageReceivedSound).not.toHaveBeenCalled()

    rerender(
      <SnapLinkStage
        {...createSnapLinkBaseProps({
          selectedRoomId: 'ROOM02',
          unifiedConversationEntries: [
            incomingEntry('room-2-history'),
            incomingEntry('room-2-new-message'),
          ],
        })}
      />,
    )

    expect(soundMocks.playMessageReceivedSound).toHaveBeenCalledOnce()
    expect(soundMocks.playMessageReceivedSound).toHaveBeenCalledWith(true)
  })

  it('detects a newly connected device even when the online count is unchanged', () => {
    const { rerender } = render(
      <SnapLinkStage
        {...createSnapLinkBaseProps({
          onlineDeviceItems: [{
            deviceId: 'device-a',
            deviceName: 'A',
            platform: 'windows',
            scopeLabel: '附近',
            lastSeenLabel: '在线',
          }],
        })}
      />,
    )

    soundMocks.playPeerConnectedSound.mockClear()

    rerender(
      <SnapLinkStage
        {...createSnapLinkBaseProps({
          onlineDeviceItems: [{
            deviceId: 'device-b',
            deviceName: 'B',
            platform: 'android',
            scopeLabel: '附近',
            lastSeenLabel: '在线',
          }],
        })}
      />,
    )

    expect(soundMocks.playPeerConnectedSound).toHaveBeenCalledOnce()
    expect(soundMocks.playPeerConnectedSound).toHaveBeenCalledWith(true)
  })

  it('plays the transfer sound only when an existing transfer becomes complete', () => {
    const { rerender } = render(
      <SnapLinkStage
        {...createSnapLinkBaseProps({ globalTransferEntries: [transferEntry('active')] })}
      />,
    )

    soundMocks.playTransferCompletedSound.mockClear()

    rerender(
      <SnapLinkStage
        {...createSnapLinkBaseProps({ globalTransferEntries: [transferEntry('completed')] })}
      />,
    )

    expect(soundMocks.playTransferCompletedSound).toHaveBeenCalledOnce()
    expect(soundMocks.playTransferCompletedSound).toHaveBeenCalledWith(true)
  })

  it('persists the sound preference through the existing settings callback', () => {
    const onDevicePreferencesChange = vi.fn()

    render(
      <SnapLinkStage
        {...createSnapLinkBaseProps({
          devicePreferences: { enterToSend: true, soundEffects: true },
          onDevicePreferencesChange,
        })}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: '我的' })[0])
    fireEvent.click(screen.getByRole('switch', { name: /操作提示音/ }))

    expect(onDevicePreferencesChange).toHaveBeenCalledWith({
      enterToSend: true,
      soundEffects: false,
    })
  })
})
