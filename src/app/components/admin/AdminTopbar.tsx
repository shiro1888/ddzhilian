import type { AdminSessionInfo } from '../../../lib/ddzhilian-types'
import type { AdminSection } from './constants'
import { ADMIN_SECTION_META } from './constants'

export function AdminTopbar({
  activeSection,
  adminSession,
  isModuleCustomizerOpen,
  onToggleModuleCustomizer,
}: {
  activeSection: AdminSection
  adminSession: AdminSessionInfo | null
  isModuleCustomizerOpen: boolean
  onToggleModuleCustomizer: () => void
}) {
  const activeSectionMeta = ADMIN_SECTION_META[activeSection]

  return (
    <header className="dd-admin-topbar">
      <div className="dd-admin-topbar__title">
        <span className="dd-admin-topbar__eyebrow">{activeSectionMeta.eyebrow}</span>
        <strong>{activeSectionMeta.title}</strong>
        <p>{activeSectionMeta.subtitle}</p>
      </div>
      <div className="dd-admin-topbar__actions">
        {activeSection === 'dashboard' ? (
          <button
            type="button"
            className={`dd-admin-topbar__module-toggle${isModuleCustomizerOpen ? ' is-active' : ''}`}
            aria-label="自定义首页展示模块"
            onClick={onToggleModuleCustomizer}
          >
            {isModuleCustomizerOpen ? '完成整理' : '整理模块'}
          </button>
        ) : null}
        <button type="button" className="dd-admin-topbar__user" title={adminSession?.email}>
          {adminSession?.email || '系统管理员'}
        </button>
      </div>
    </header>
  )
}

