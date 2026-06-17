import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminV2OnlineDevicesWorkspace } from '@/admin-v2/workspaces/OnlineDevicesWorkspace'

function renderWorkspace() {
  render(
    <AdminV2OnlineDevicesWorkspace
      onlineDevices={{
        devices: [],
        loadedAt: '2026-06-17T12:27:00.000Z',
      }}
      isRefreshing={false}
      isSaving={false}
      onRefresh={vi.fn(async () => undefined)}
      onRename={vi.fn(async () => true)}
    />,
  )
}

afterEach(() => {
  cleanup()
})

describe('AdminV2OnlineDevicesWorkspace', () => {
  it('renders compact online summary copy and taller status badges', () => {
    renderWorkspace()

    expect(screen.queryByText(/GET \/api\/admin\/online-devices/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '立即刷新' })).not.toBeInTheDocument()
    expect(screen.getByText('在线 0')).toHaveClass('h-[30px]')
    expect(screen.getByText('已关联 0')).toHaveClass('h-[30px]')
  })
})
