import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SnapLinkStage } from '@/app/components/SnapLinkStage'

import { createSnapLinkBaseProps, createSnapLinkRoom, setInitialWorkbenchMode } from './helpers/snaplink'

type TestRoom = ReturnType<typeof createSnapLinkRoom>

function renderSelectedRoom(room: TestRoom, autoOpen = true) {
  return render(
    <SnapLinkStage
      {...createSnapLinkBaseProps({
        selectedRoomId: room.roomId,
        autoOpenRoomId: autoOpen ? room.roomId : null,
        selectedConversationName: room.title,
        roomListItems: [room],
      })}
    />,
  )
}

describe('SnapLinkStage truthful room status and retention copy', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setInitialWorkbenchMode('rooms')
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('distinguishes a public room with only the local device from peer availability', async () => {
    const room = createSnapLinkRoom({
      roomId: 'PUBLIC-LOCAL',
      title: '世界对话 1',
      memberCount: 1,
      onlineCount: 0,
      status: 'online',
    })

    renderSelectedRoom(room, false)

    expect(screen.getByText(/暂无对端在线/)).toBeInTheDocument()
    const roomLink = screen.getByRole('link', { name: /世界对话 1/ })
    expect(within(roomLink).getByText('仅本机在线')).toBeInTheDocument()

    fireEvent.click(roomLink)

    const ribbon = await screen.findByRole('status', { name: '当前连接状态' })
    expect(ribbon).toHaveClass('is-warning')
    expect(within(ribbon).getByText('等待对端上线')).toBeInTheDocument()
    expect(within(ribbon).getByText('连接到当前服务的设备')).toBeInTheDocument()
    expect(within(ribbon).getByText('最长 24 小时')).toBeInTheDocument()
    expect(
      screen.getByText('内容经服务器同步 · 文件会上传历史副本，最长保留 24 小时'),
    ).toBeInTheDocument()
    expect(screen.queryByText('同一网络内的设备')).not.toBeInTheDocument()
  })

  it('reports a public peer as online without claiming a WebRTC connection', async () => {
    renderSelectedRoom(createSnapLinkRoom({
      roomId: 'PUBLIC-PEER',
      title: '世界对话 2',
      memberCount: 2,
      onlineCount: 1,
      status: 'online',
    }))

    const ribbon = await screen.findByRole('status', { name: '当前连接状态' })
    expect(ribbon).toHaveClass('is-safe')
    expect(within(ribbon).getByText('1 台对端在线')).toBeInTheDocument()
    expect(within(ribbon).queryByText('WebRTC 直连')).not.toBeInTheDocument()
  })

  it('separates private peer presence from an established direct connection', async () => {
    const onlineRoom = createSnapLinkRoom({
      roomId: 'PRIVATE-PEER',
      title: 'android-PEER',
      isPublic: false,
      publicIndex: undefined,
      memberCount: 2,
      onlineCount: 1,
      status: 'online',
    })
    const { rerender } = renderSelectedRoom(onlineRoom)

    const waitingRibbon = await screen.findByRole('status', { name: '当前连接状态' })
    expect(waitingRibbon).toHaveClass('is-warning')
    expect(within(waitingRibbon).getByText('对方在线，等待直连')).toBeInTheDocument()
    expect(
      screen.getByText('通过 WebRTC 在设备间直连 · 文件不上传服务器历史副本'),
    ).toBeInTheDocument()

    const connectedRoom = { ...onlineRoom, status: 'connected' as const }
    rerender(
      <SnapLinkStage
        {...createSnapLinkBaseProps({
          selectedRoomId: connectedRoom.roomId,
          autoOpenRoomId: connectedRoom.roomId,
          selectedConversationName: connectedRoom.title,
          roomListItems: [connectedRoom],
        })}
      />,
    )

    await waitFor(() => {
      const connectedRibbon = screen.getByRole('status', { name: '当前连接状态' })
      expect(connectedRibbon).toHaveClass('is-safe')
      expect(within(connectedRibbon).getByText('WebRTC 直连')).toBeInTheDocument()
    })
  })

  it('makes partial group availability explicit and does not present it as a connection', async () => {
    renderSelectedRoom(createSnapLinkRoom({
      roomId: 'GROUP-PARTIAL',
      title: '设计协作组',
      isPublic: false,
      publicIndex: undefined,
      memberCount: 3,
      onlineCount: 1,
      status: 'online',
    }))

    const ribbon = await screen.findByRole('status', { name: '当前连接状态' })
    expect(ribbon).toHaveClass('is-warning')
    expect(within(ribbon).getByText('成员在线，等待直连')).toBeInTheDocument()
    expect(within(ribbon).getByText('2/3 在线（含本机）')).toBeInTheDocument()
  })

  it('discloses that the assistant uses recent room context', async () => {
    renderSelectedRoom(createSnapLinkRoom({
      roomId: 'ASSISTANT',
      title: 'DD助手',
      isPublic: false,
      publicIndex: undefined,
      isAssistant: true,
      memberCount: 1,
      onlineCount: 0,
      status: 'online',
    }))

    const ribbon = await screen.findByRole('status', { name: '当前连接状态' })
    expect(within(ribbon).getByText('最多近 24 小时')).toBeInTheDocument()
    expect(
      screen.getByText('内容经后端代理处理 · 最多读取当前房间近 24 小时的对话上下文'),
    ).toBeInTheDocument()
    expect(screen.queryByText('只读取你发送的内容')).not.toBeInTheDocument()
  })
})
