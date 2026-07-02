import type { SidebarNavMode } from './SidebarNav'
import type { SidebarNavTool } from './SidebarNav'

type MobileWorkbenchNavProps = {
  activeMode?: SidebarNavMode | null
  activeTool?: SidebarNavTool | null
  className?: string
  ariaLabel: string
  onShowNearby: () => void
  onShowRooms: () => void
  onShowQueue: () => void
  onShowSettings: () => void
}

type MobileWorkbenchNavItem = {
  mode: SidebarNavMode
  label: string
  onClick: () => void
}

export function MobileWorkbenchNav({
  activeMode = null,
  activeTool = null,
  className = 'dd-snaplink__mobile-nav dd-snaplink__mobile-workbench-nav',
  ariaLabel,
  onShowRooms,
  onShowNearby,
  onShowQueue,
  onShowSettings,
}: MobileWorkbenchNavProps) {
  const items: Array<MobileWorkbenchNavItem & { isActive?: boolean }> = [
    {
      mode: 'rooms',
      label: '消息',
      onClick: onShowRooms,
      isActive: activeMode === 'rooms' || activeMode === 'text' || activeMode === 'files',
    },
    {
      mode: 'nearby',
      label: '设备',
      onClick: onShowNearby,
      isActive: activeMode === 'nearby',
    },
    { mode: 'transfers', label: '传输', onClick: onShowQueue },
    {
      mode: 'settings',
      label: '我的',
      onClick: onShowSettings,
      isActive: activeMode === 'settings' || activeMode === 'history' || Boolean(activeTool),
    },
  ]

  return (
    <nav className={className} aria-label={ariaLabel}>
      {items.map((item) => {
        const isActive = item.isActive ?? activeMode === item.mode

        return (
          <button
            key={item.mode}
            type="button"
            className={isActive ? 'is-active' : ''}
            aria-pressed={isActive}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
