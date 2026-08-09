import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RoomHeader } from '@/app/components/RoomHeader'

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,room-code'),
  },
}))

describe('RoomHeader connection ribbon', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the supplied live connection facts without inventing status data', () => {
    render(
      <RoomHeader
        roomCodeLabel="KDUVGP"
        roomCodeValue="KDUVGP"
        peerLabel="2 台设备在线"
        peerTitle="设计协作室"
        connectionDetails={[
          { id: 'channel', label: '连接', value: 'WebRTC 直连', tone: 'safe' },
          { id: 'network', label: '网络', value: '局域网', tone: 'safe' },
          { id: 'trust', label: '保护', value: '端到端加密', tone: 'safe' },
        ]}
        onCopyRoomId={vi.fn()}
      />,
    )

    const ribbon = screen.getByLabelText('当前连接状态')

    expect(ribbon).toHaveClass('is-safe')
    expect(within(ribbon).getByText('此设备')).toBeInTheDocument()
    expect(within(ribbon).getByText('设计协作室')).toBeInTheDocument()
    expect(within(ribbon).getByText('WebRTC 直连')).toBeInTheDocument()
    expect(within(ribbon).getByText('局域网')).toBeInTheDocument()
    expect(within(ribbon).getByText('端到端加密')).toBeInTheDocument()
  })

  it('does not render the ribbon when no connection facts are available', () => {
    render(
      <RoomHeader
        roomCodeLabel="KDUVGP"
        peerLabel="等待连接"
        peerTitle="设计协作室"
        onCopyRoomId={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('当前连接状态')).not.toBeInTheDocument()
  })
})
