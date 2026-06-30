import { useState } from 'react'
import type { SidebarNavMode } from './SidebarNav'
import type { SidebarNavTool } from './SidebarNav'

type MobileWorkbenchNavProps = {
  activeMode?: SidebarNavMode | null
  activeTool?: SidebarNavTool | null
  className?: string
  ariaLabel: string
  onShowNearby: () => void
  onShowRooms: () => void
  onShowFiles: () => void
  onShowQueue: () => void
  onShowText: () => void
  onShowHistory: () => void
  onShowSettings: () => void
  onOpenAiChat: () => void
  onOpenImage: () => void
  onOpenCommand: () => void
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
  onShowNearby,
  onShowRooms,
  onShowFiles,
  onShowQueue,
  onShowHistory,
  onShowSettings,
  onOpenAiChat,
  onOpenImage,
  onOpenCommand,
}: MobileWorkbenchNavProps) {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const items: MobileWorkbenchNavItem[] = [
    { mode: 'nearby', label: '附近', onClick: onShowNearby },
    { mode: 'rooms', label: '房间', onClick: onShowRooms },
    { mode: 'files', label: '发送', onClick: onShowFiles },
    { mode: 'transfers', label: '传输', onClick: onShowQueue },
  ]
  const isMoreActive = Boolean(
    activeTool || activeMode === 'text' || activeMode === 'history' || activeMode === 'settings',
  )

  const openMoreAction = (action: () => void) => {
    setIsMoreMenuOpen(false)
    action()
  }

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
      <span className="dd-snaplink__mobile-more-wrap">
        <button
          type="button"
          className={isMoreActive || isMoreMenuOpen ? 'is-active' : ''}
          aria-pressed={isMoreActive || isMoreMenuOpen}
          aria-expanded={isMoreMenuOpen}
          aria-haspopup="menu"
          onClick={() => setIsMoreMenuOpen((current) => !current)}
        >
          更多
        </button>
        {isMoreMenuOpen ? (
          <>
            <button
              type="button"
              className="dd-snaplink__mobile-more-backdrop"
              aria-label="关闭更多功能菜单"
              onClick={() => setIsMoreMenuOpen(false)}
            />
            <span className="dd-snaplink__mobile-more-menu" role="menu" aria-label="更多功能">
              <button
                type="button"
                role="menuitem"
                className={activeTool === 'ai-chat' ? 'is-current' : ''}
                onClick={() => openMoreAction(onOpenAiChat)}
              >
                AI 助手
              </button>
              <button
                type="button"
                role="menuitem"
                className={activeTool === 'image' ? 'is-current' : ''}
                onClick={() => openMoreAction(onOpenImage)}
              >
                图片工具
              </button>
              <button
                type="button"
                role="menuitem"
                className={activeTool === 'command' ? 'is-current' : ''}
                onClick={() => openMoreAction(onOpenCommand)}
              >
                Web 命令行
              </button>
              <button
                type="button"
                role="menuitem"
                className={activeMode === 'history' ? 'is-current' : ''}
                onClick={() => openMoreAction(onShowHistory)}
              >
                历史记录
              </button>
              <button
                type="button"
                role="menuitem"
                className={activeMode === 'settings' ? 'is-current' : ''}
                onClick={() => openMoreAction(onShowSettings)}
              >
                设置
              </button>
            </span>
          </>
        ) : null}
      </span>
    </nav>
  )
}
