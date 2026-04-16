import { navItems } from '../config'
import type { NavView } from '../types'

type AppSidebarProps = {
  isMobileNavOpen: boolean
  effectiveNavView: NavView
  visibleNavItems: typeof navItems
  onToggleMobileNav: () => void
  onToggleContentRail: () => void
  onViewChange: (view: NavView) => void
}

export function AppSidebar({
  isMobileNavOpen,
  effectiveNavView,
  visibleNavItems,
  onToggleMobileNav,
  onToggleContentRail,
  onViewChange,
}: AppSidebarProps) {
  return (
    <aside className={`dd-sidebar${isMobileNavOpen ? ' is-mobile-open' : ''}`}>
      <div className="dd-brand">
        <span className="dd-brand__mark">CC</span>
        <div className="dd-brand__copy">
          <strong>ddzhilian</strong>
          <small>V0.1.0</small>
        </div>
        <button
          type="button"
          className="dd-sidebar__toggle"
          aria-expanded={isMobileNavOpen}
          aria-controls="dd-primary-nav"
          onClick={onToggleMobileNav}
        >
          {isMobileNavOpen ? '收起' : '菜单'}
        </button>
      </div>

      <div className="dd-sidebar__menu" id="dd-primary-nav">
        <div className="dd-sidebar__actions">
          <button type="button" onClick={() => onViewChange('connect')}>
            新会话
          </button>
          <button type="button" className="is-secondary" onClick={() => onViewChange('sessions')}>
            会话记录
          </button>
        </div>

        <nav className="dd-nav" aria-label="功能导航">
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={effectiveNavView === item.id ? 'is-active' : ''}
              title={item.label}
              aria-label={item.label}
              onClick={() => {
                if (effectiveNavView === item.id) {
                  onToggleContentRail()
                  return
                }

                onViewChange(item.id)
              }}
            >
              <span className="dd-nav__icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {item.icon}
                </svg>
              </span>
              <span className="dd-nav__copy">
                <strong>{item.label}</strong>
                <span>{item.hint}</span>
              </span>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  )
}
