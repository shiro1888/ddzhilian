import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RoomCard } from '@/app/components/RoomCard'

import { createSnapLinkRoom } from './helpers/snaplink'

describe('RoomCard peer presence', () => {
  afterEach(() => {
    cleanup()
  })

  it('labels a room with no peer as local-only', () => {
    const { container } = render(
      <RoomCard
        room={createSnapLinkRoom({ memberCount: 1, onlineCount: 0 })}
        onOpen={vi.fn()}
        onTogglePinned={vi.fn()}
      />,
    )

    expect(screen.getByText('仅本机在线')).toBeInTheDocument()
    expect(
      container.querySelector('.dd-snaplink__workbench-room-avatar > i'),
    ).not.toHaveClass('is-online')
  })

  it('labels the number of online peers without counting the local device', () => {
    const { container } = render(
      <RoomCard
        room={createSnapLinkRoom({ memberCount: 3, onlineCount: 2 })}
        onOpen={vi.fn()}
        onTogglePinned={vi.fn()}
      />,
    )

    expect(screen.getByText('2 台对端在线')).toBeInTheDocument()
    expect(
      container.querySelector('.dd-snaplink__workbench-room-avatar > i'),
    ).toHaveClass('is-online')
  })
})
