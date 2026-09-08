import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SnapLinkStage } from '@/app/components/SnapLinkStage'

import { createSnapLinkBaseProps as createBaseProps, setInitialWorkbenchMode } from './helpers/snaplink'

describe('SnapLinkStage initial room opening', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setInitialWorkbenchMode('rooms')
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('opens the default room conversation automatically when selectedRoomId is provided', async () => {
    const onOpenRoomConversation = vi.fn()
    const { rerender } = render(<SnapLinkStage {...createBaseProps()} />)

    expect(screen.getByRole('region', { name: 'DD直连文件互传工作台' })).toBeInTheDocument()

    rerender(
      <SnapLinkStage
        {...createBaseProps({
          onOpenRoomConversation,
          selectedRoomId: 'ROOM123',
          selectedConversationName: '世界对话',
          activeTransferLabel: '世界对话 · 等待连接',
          roomListItems: [
            {
              roomId: 'ROOM123',
              title: '世界对话',
              previewText: '[文本] 空消息',
              updatedAt: '2026-06-16T10:00:00.000Z',
              updatedAtLabel: '刚刚',
              isPublic: true,
              publicIndex: 1,
              memberCount: 1,
              onlineCount: 0,
              status: 'history',
              pinned: false,
              unreadCount: 0,
              members: [],
            },
          ],
          unifiedConversationEntries: [
            {
              id: 'entry-1',
              entryType: 'text',
              sessionId: 'session-1',
              fromSelf: false,
              senderName: 'windows-PEER',
              createdAt: '2026-06-16T10:00:00.000Z',
              text: '你好，房间已经打开了',
            },
          ],
        })}
      />,
    )

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'DD直连文件互传工作台' })).not.toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'DD直连房间会话工作台' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '查看更多功能' })).toBeInTheDocument()
      expect(screen.getByText('你好，房间已经打开了')).toBeInTheDocument()
    })
  })
})
