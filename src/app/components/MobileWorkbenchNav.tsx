import type { SidebarNavMode } from './SidebarNav'

type MobileWorkbenchNavProps = {
  activeMode?: SidebarNavMode | null
  className?: string
  ariaLabel: string
  onShowNearby: () => void
  onShowRooms: () => void
  onShowFiles: () => void
  onShowQueue: () => void
  onShowText: () => void
  onShowHistory: () => void
  onShowSettings: () => void
}

type MobileWorkbenchNavItem = {
  mode: SidebarNavMode
  label: string
  onClick: () => void
}

export function MobileWorkbenchNav({
  activeMode = null,
  className = 'dd-snaplink__mobile-nav dd-snaplink__mobile-workbench-nav',
  ariaLabel,
  onShowNearby,
  onShowRooms,
  onShowFiles,
  onShowQueue,
  onShowText,
  onShowHistory,
  onShowSettings,
}: MobileWorkbenchNavProps) {
  const items: MobileWorkbenchNavItem[] = [
    { mode: 'nearby', label: '附近', onClick: onShowNearby },
    { mode: 'rooms', label: '房间', onClick: onShowRooms },
    { mode: 'files', label: '文件', onClick: onShowFiles },
    { mode: 'transfers', label: '传输', onClick: onShowQueue },
    { mode: 'text', label: '文本', onClick: onShowText },
    { mode: 'history', label: '历史', onClick: onShowHistory },
    { mode: 'settings', label: '设置', onClick: onShowSettings },
  ]

  return (
    <nav className={className} aria-label={ariaLabel}>
      {items.map((item) => {
        const isActive = activeMode === item.mode

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
