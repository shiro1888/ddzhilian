import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SnapLinkStage } from '@/app/components/SnapLinkStage'

import { createSnapLinkBaseProps as createBaseProps } from './helpers/snaplink'

describe('SnapLinkStage private chat entry', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not render the private chat starter while the entry is disabled', () => {
    const onStartPrivateChat = vi.fn()

    render(
      <SnapLinkStage
        {...createBaseProps({
          onStartPrivateChat,
          onlineDeviceItems: [
            {
              deviceId: 'device-peer',
              deviceName: 'android-PEER',
              platform: 'android',
              scopeLabel: '局域网',
              lastSeenLabel: '刚刚',
            },
          ],
        })}
      />,
    )

    expect(screen.getByRole('region', { name: 'DD直连文件互传工作台' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /发起私聊/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '选择在线设备' })).not.toBeInTheDocument()
    expect(onStartPrivateChat).not.toHaveBeenCalled()
  })

  it('still opens an existing private room when selected by state', () => {
    const onStartPrivateChat = vi.fn()
    const onOpenRoomConversation = vi.fn()
    const peerAvatarDataUrl = 'data:image/jpeg;base64,ZmFrZQ=='

    const { container } = render(
      <SnapLinkStage
        {...createBaseProps({
          onOpenRoomConversation,
          onStartPrivateChat,
          selectedRoomId: 'PRIVATE123',
          autoOpenRoomId: 'PRIVATE123',
          selectedConversationName: 'android-PEER',
          activeTransferLabel: 'android-PEER · 正在连接',
          roomListItems: [
            {
              roomId: 'PRIVATE123',
              title: 'android-PEER',
              previewText: '[文本] 私聊已建立',
              updatedAt: '2026-06-16T10:00:00.000Z',
              updatedAtLabel: '刚刚',
              isPublic: false,
              memberCount: 2,
              onlineCount: 1,
              status: 'connected',
              pinned: false,
              unreadCount: 0,
              members: [],
            },
          ],
          unifiedConversationEntries: [
            {
              id: 'entry-private',
              entryType: 'text',
              sessionId: 'session-private',
              sourceDeviceId: 'device-peer',
              avatarDataUrl: peerAvatarDataUrl,
              fromSelf: false,
              senderName: 'android-PEER',
              createdAt: '2026-06-16T10:00:00.000Z',
              text: '私聊已建立',
            },
          ],
          onlineDeviceItems: [
            {
              deviceId: 'device-peer',
              deviceName: 'android-PEER',
              platform: 'android',
              scopeLabel: '局域网',
              lastSeenLabel: '刚刚',
            },
          ],
        })}
      />,
    )

    return waitFor(() => {
      expect(screen.queryByRole('region', { name: 'DD直连文件互传工作台' })).not.toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'DD直连房间会话工作台' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '查看更多功能' })).toBeInTheDocument()
      expect(screen.getByText('私聊已建立')).toBeInTheDocument()
      expect(
        container.querySelector('.dd-snaplink__row.is-peer .dd-snaplink__avatar-img'),
      ).toHaveAttribute('src', peerAvatarDataUrl)
      expect(onOpenRoomConversation).not.toHaveBeenCalled()
      expect(onStartPrivateChat).not.toHaveBeenCalled()
    })
  })
})
