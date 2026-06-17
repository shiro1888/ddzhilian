import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminV2ProtectedLayout } from '@/admin-v2/shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PreferencesStoreProvider } from '@/stores/preferences/preferences-provider'

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  useAdminV2Session: vi.fn(),
}))

vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: 'font-geist' }),
  Geist_Mono: () => ({ variable: 'font-geist-mono' }),
}))

vi.mock('@/admin-v2/session', () => ({
  useAdminV2Session: mocks.useAdminV2Session,
}))

function renderAdminShell() {
  mocks.useAdminV2Session.mockReturnValue({
    adminSession: {
      userId: 'admin-user-1',
      email: 'admin@example.com',
      role: 'super_admin',
      isSuperAdmin: true,
    },
    error: null,
    isAuthenticated: true,
    isBootstrapping: false,
    logout: mocks.logout,
  })

  render(
    <TooltipProvider>
      <PreferencesStoreProvider
        themeMode="light"
        themePreset="default"
        font="geist"
        contentLayout="centered"
        navbarStyle="sticky"
      >
        <AdminV2ProtectedLayout>
          <div>管理内容</div>
        </AdminV2ProtectedLayout>
      </PreferencesStoreProvider>
    </TooltipProvider>,
  )
}

function getDesktopSidebarStateNode() {
  const sidebar = document.querySelector('[data-slot="sidebar"][data-state]')
  expect(sidebar).toBeInstanceOf(HTMLElement)
  return sidebar as HTMLElement
}

function getDesktopSidebarHoverNode() {
  const sidebar = document.querySelector('[data-slot="sidebar-container"]')
  expect(sidebar).toBeInstanceOf(HTMLElement)
  return sidebar as HTMLElement
}

afterEach(() => {
  cleanup()
  mocks.logout.mockReset()
  mocks.useAdminV2Session.mockReset()
})

describe('AdminV2ProtectedLayout sidebar', () => {
  it('expands the desktop admin sidebar on hover and collapses after leave', () => {
    renderAdminShell()

    expect(getDesktopSidebarStateNode()).toHaveAttribute('data-state', 'collapsed')

    fireEvent.mouseEnter(getDesktopSidebarHoverNode())
    expect(getDesktopSidebarStateNode()).toHaveAttribute('data-state', 'expanded')

    fireEvent.mouseLeave(getDesktopSidebarHoverNode())
    expect(getDesktopSidebarStateNode()).toHaveAttribute('data-state', 'collapsed')
  })
})
