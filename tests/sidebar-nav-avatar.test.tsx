import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SidebarNav } from '../src/app/components/SidebarNav'

describe('SidebarNav avatar', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders an actual image layer so theme backgrounds cannot cover the avatar', async () => {
    const avatarDataUrl = 'data:image/png;base64,ZmFrZQ=='
    const onShowSettings = vi.fn()

    const { container } = render(
      <SidebarNav
        deviceName="测试设备"
        avatarDataUrl={avatarDataUrl}
        onShowRooms={vi.fn()}
        onShowQueue={vi.fn()}
        onShowSettings={onShowSettings}
      />,
    )

    const avatarButton = screen.getByRole('button', { name: '我的' })
    const avatarImage = container.querySelector('.dd-snaplink__rail-avatar-img')

    expect(avatarButton).toHaveClass('has-image')
    expect(avatarImage).toHaveAttribute('src', avatarDataUrl)
    expect(avatarImage).toHaveAttribute('alt', '')

    await userEvent.click(avatarButton)
    expect(onShowSettings).toHaveBeenCalledTimes(1)
  })
})
