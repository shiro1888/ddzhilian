import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SnapLinkStage } from '@/app/components/SnapLinkStage'

import { createSnapLinkBaseProps as createBaseProps, setInitialWorkbenchMode } from './helpers/snaplink'

describe('SnapLinkStage sidebar logo navigation', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setInitialWorkbenchMode('rooms')
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('clicking the logo avatar jumps from a room conversation back to the home lobby', async () => {
    const onOpenRoomHome = vi.fn()
    render(
      <SnapLinkStage
        {...createBaseProps({
          onOpenRoomHome,
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
        })}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'DD直连房间会话工作台' })).toBeInTheDocument()
    })

    const logoButton = screen.getByRole('button', { name: 'DD直连 首页' })
    expect(logoButton).toBeInTheDocument()

    fireEvent.click(logoButton)

    expect(onOpenRoomHome).toHaveBeenCalled()

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'DD直连文件互传工作台' })).toBeInTheDocument()
      expect(screen.getByText('开启点对点极速流转')).toBeInTheDocument()
    })
  })

  it('pressing Enter or Space on the logo avatar also jumps to the home lobby', async () => {
    const onOpenRoomHome = vi.fn()
    render(
      <SnapLinkStage
        {...createBaseProps({
          onOpenRoomHome,
          selectedRoomId: 'ROOM123',
          selectedConversationName: '世界对话',
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
        })}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'DD直连房间会话工作台' })).toBeInTheDocument()
    })

    const logoButton = screen.getByRole('button', { name: 'DD直连 首页' })
    fireEvent.keyDown(logoButton, { key: 'Enter' })

    expect(onOpenRoomHome).toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'DD直连文件互传工作台' })).toBeInTheDocument()
      expect(screen.getByText('开启点对点极速流转')).toBeInTheDocument()
    })
  })

  it('clicking the tools navigation button switches directly to the workshop page on the first click', async () => {
    const onOpenRoomHome = vi.fn()
    render(
      <SnapLinkStage
        {...createBaseProps({
          onOpenRoomHome,
          selectedRoomId: 'ROOM123',
          selectedConversationName: '世界对话',
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
        })}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'DD直连房间会话工作台' })).toBeInTheDocument()
    })

    const toolsButton = screen.getByRole('button', { name: '工具' })
    expect(toolsButton).toBeInTheDocument()

    fireEvent.click(toolsButton)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: '实用工具' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'DD直连房间会话工作台' })).not.toBeInTheDocument()
    })
  })
})
