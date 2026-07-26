import {
  History,
  MessageCircle,
  MonitorSmartphone,
  User,
  type LucideIcon,
} from 'lucide-react'
import type { SidebarNavMode } from './SidebarNav'
import type { SidebarNavTool } from './SidebarNav'

type MobileWorkbenchNavProps = {
  activeMode?: SidebarNavMode | null
  activeTool?: SidebarNavTool | null
  className?: string
  ariaLabel: string
  activeTransferCount?: number
  onShowNearby: () => void
  onShowRooms: () => void
  onShowQueue: () => void
  onShowSettings: () => void
}

type MobileWorkbenchNavItem = {
  mode: SidebarNavMode
  label: string
  // Same glyphs as the desktop rail, so a mode is recognisable by the same
  // mark on both surfaces.
  icon: LucideIcon
  onClick: () => void
  badgeCount?: number
}

export function MobileWorkbenchNav({
  activeMode = null,
  activeTool = null,
  className = 'dd-snaplink__mobile-nav dd-snaplink__mobile-workbench-nav',
  ariaLabel,
  activeTransferCount = 0,
  onShowRooms,
  onShowNearby,
  onShowQueue,
  onShowSettings,
}: MobileWorkbenchNavProps) {
  const items: Array<MobileWorkbenchNavItem & { isActive?: boolean }> = [
    {
      mode: 'rooms',
      label: '消息',
      icon: MessageCircle,
      onClick: onShowRooms,
      isActive: activeMode === 'rooms' || activeMode === 'text' || activeMode === 'files',
    },
    {
      mode: 'nearby',
      label: '设备',
      icon: MonitorSmartphone,
      onClick: onShowNearby,
      isActive: activeMode === 'nearby',
    },
    {
      mode: 'transfers',
      label: '传输',
      icon: History,
      onClick: onShowQueue,
      badgeCount: activeTransferCount,
    },
    {
      mode: 'settings',
      label: '我的',
      icon: User,
      onClick: onShowSettings,
      isActive: activeMode === 'settings' || activeMode === 'history' || Boolean(activeTool),
    },
  ]

  return (
    <nav className={className} aria-label={ariaLabel}>
      {items.map((item) => {
        const isActive = item.isActive ?? activeMode === item.mode
        const itemAriaLabel = item.badgeCount && item.badgeCount > 0
          ? `${item.label} · ${item.badgeCount.toString()} 个进行中`
          : item.label

        const Icon = item.icon

        return (
          <button
            key={item.mode}
            type="button"
            className={isActive ? 'is-active' : ''}
            aria-pressed={isActive}
            aria-label={itemAriaLabel}
            onClick={item.onClick}
          >
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
            <span className="dd-snaplink__mobile-nav-label">{item.label}</span>
            {item.badgeCount && item.badgeCount > 0 ? (
              <span className="dd-snaplink__mobile-nav-badge" aria-hidden="true">
                {item.badgeCount > 99 ? '99+' : item.badgeCount.toString()}
              </span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}
