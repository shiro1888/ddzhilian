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
    <aside className={`pp-sidebar${isMobileNavOpen ? ' is-mobile-open' : ''}`}>
      <div className="pp-brand">
        <span className="pp-brand__mark">CC</span>
        <div className="pp-brand__copy">
          <strong>CCConnect</strong>
          <small>V0.1.0</small>
        </div>
        <button
          type="button"
          className="pp-sidebar__toggle"
          aria-expanded={isMobileNavOpen}
          aria-controls="pp-primary-nav"
          onClick={onToggleMobileNav}
        >
          {isMobileNavOpen ? '收起' : '菜单'}
        </button>
      </div>

      <div className="pp-sidebar__menu" id="pp-primary-nav">
        <div className="pp-sidebar__actions">
          <button type="button" onClick={() => onViewChange('connect')}>
            新会话
          </button>
          <button type="button" className="is-secondary" onClick={() => onViewChange('sessions')}>
            会话记录
          </button>
        </div>

        <nav className="pp-nav" aria-label="功能导航">
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
              <span className="pp-nav__icon" aria-hidden="true">
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
              <span className="pp-nav__copy">
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
