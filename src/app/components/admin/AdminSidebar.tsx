import type { AdminSection, AdminNavIconName } from './constants'
import type { ReactNode } from 'react'
import { ADMIN_BRAND_NAME, ADMIN_PRIMARY_NAV_ITEMS } from './constants'

export function AdminSidebarBrand() {
  return (
    <div className="dd-admin-sidebar__brand">
      <img className="dd-admin-sidebar__logo" src="/logo-dd-link.png" alt="" />
      <strong>{ADMIN_BRAND_NAME}</strong>
    </div>
  )
}

function AdminNavIcon({ name }: { name: AdminNavIconName }) {
  const icons: Record<AdminNavIconName, ReactNode> = {
    audit: <path d="M7 5h10M7 9h10M7 13h6M5 19l3-3 2 2 5-6 4 5" />,
    config: <path d="M5 7h14M8 7v10M16 7v10M5 17h14" />,
    dashboard: <path d="M4 12a8 8 0 1 1 16 0M12 12l4-4M7 17h10" />,
    detail: <path d="M6 5h12M6 10h12M6 15h8M6 19h5" />,
    history: <path d="M12 7v5l3 2M5 12a7 7 0 1 0 2-5.02M5 4v4h4" />,
    limit: <path d="M12 3l8 4v5c0 5-3.4 7.7-8 9-4.6-1.3-8-4-8-9V7l8-4ZM9 12h6" />,
    log: <path d="M7 4h8l3 3v13H7V4ZM14 4v4h4M9 12h6M9 16h6" />,
    logout: <path d="M10 5H6v14h4M14 8l4 4-4 4M8 12h10" />,
    model: <path d="M12 4l7 4v8l-7 4-7-4V8l7-4ZM5 8l7 4 7-4M12 12v8" />,
    online: <path d="M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 21a7 7 0 0 1 14 0M18 9h3M19.5 7.5v3M17 17h4M17 21h4" />,
    provider: <path d="M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.5 7l2.2 9M15.5 7l-2.2 9" />,
    role: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0M16 13l2 2 3-4" />,
    settings: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4" />,
    usage: <path d="M5 19V5M5 19h14M9 16V9M13 16V6M17 16v-4" />,
    user: <path d="M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 21a7 7 0 0 1 14 0M17 8v6M14 11h6" />,
  }

  return (
    <svg className="dd-admin-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {icons[name]}
    </svg>
  )
}

export function AdminSidebar({
  activeSection,
  isSidebarCollapsed,
  isSuperAdmin,
  themeMode,
  onDisconnect,
  onSectionChange,
  onThemeToggle,
  onToggleCollapsed,
}: {
  activeSection: AdminSection
  isSidebarCollapsed: boolean
  isSuperAdmin: boolean
  themeMode: 'system' | 'light' | 'dark'
  onDisconnect: () => void
  onSectionChange: (section: AdminSection) => void
  onThemeToggle: () => void
  onToggleCollapsed: () => void
}) {
  return (
    <aside className="dd-admin-sidebar">
      <AdminSidebarBrand />
      <button
        type="button"
        className="dd-admin-sidebar__toggle"
        aria-label={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        title={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        onClick={onToggleCollapsed}
      >
        <span />
        <span />
        <span />
      </button>
      <nav className="dd-admin-sidebar__nav" aria-label="后台导航">
        <section className="dd-admin-nav-group">
          <div className="dd-admin-nav-group__title">后台功能</div>
          {ADMIN_PRIMARY_NAV_ITEMS.map((item) => {
            const disabled = Boolean(item.superAdminOnly && !isSuperAdmin)

            return (
              <button
                key={item.section}
                type="button"
                className={activeSection === item.section ? 'is-active' : 'is-subtle'}
                title={disabled ? '仅超级管理员可访问' : item.label}
                aria-label={item.label}
                disabled={disabled}
                onClick={() => {
                  if (!disabled) {
                    onSectionChange(item.section)
                  }
                }}
              >
                <AdminNavIcon name={item.icon} />
                <span className="dd-admin-nav-label">
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            )
          })}
        </section>
      </nav>
      <button
        type="button"
        className="dd-admin-sidebar__theme"
        aria-label="切换后台主题"
        title="切换后台主题"
        onClick={onThemeToggle}
      >
        {themeMode === 'dark' ? 'Light' : themeMode === 'light' ? 'Auto' : 'Dark'}
      </button>
      <button type="button" className="dd-admin-sidebar__collapse" title="退出后台" aria-label="退出后台" onClick={onDisconnect}>
        <AdminNavIcon name="logout" />
        <span className="dd-admin-nav-label">退出后台</span>
      </button>
    </aside>
  )
}

