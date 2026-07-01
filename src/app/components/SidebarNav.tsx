import {
  History,
  MessageCircle,
  MonitorSmartphone,
  User,
} from 'lucide-react'

export type SidebarNavMode = 'nearby' | 'rooms' | 'files' | 'transfers' | 'text' | 'history' | 'settings'
export type SidebarNavTool = 'ai-chat' | 'image' | 'command'

type SidebarNavProps = {
  deviceName: string
  activeMode?: SidebarNavMode | null
  activeTool?: SidebarNavTool | null
  onShowNearby: () => void
  onShowRooms: () => void
  onShowFiles: () => void
  onShowQueue: () => void
  onShowText: () => void
  onShowHistory: () => void
  onOpenAiChat: () => void
  onOpenImage: () => void
  onOpenCommand: () => void
  onShowSettings: () => void
}

function getSidebarInitial(value: string) {
  const normalizedValue = value.trim()
  return (normalizedValue ? Array.from(normalizedValue)[0] : 'D').toUpperCase()
}

export function SidebarNav({
  deviceName,
  activeMode = null,
  activeTool = null,
  onShowRooms,
  onShowNearby,
  onShowQueue,
  onShowSettings,
}: SidebarNavProps) {
  const isMessagesActive = activeMode === 'rooms' || activeMode === 'text' || activeMode === 'files'
  const isDevicesActive = activeMode === 'nearby'
  const isTransfersActive = activeMode === 'transfers' || activeMode === 'history'
  const isMeActive = activeMode === 'settings' || Boolean(activeTool)

  return (
    <aside className="dd-snaplink__rail" aria-label="主导航">
      <div className="dd-snaplink__rail-logo">
        <img src="/logo-dd-link.svg" alt="" />
      </div>
      <nav className="dd-snaplink__rail-nav" aria-label="DD直连主功能">
        <button
          type="button"
          className={isMessagesActive ? 'is-active' : ''}
          aria-pressed={isMessagesActive}
          onClick={onShowRooms}
          title="会话"
        >
          <MessageCircle size={22} strokeWidth={1.8} aria-hidden="true" />
          <span>会话</span>
        </button>
        <button
          type="button"
          className={isDevicesActive ? 'is-active' : ''}
          aria-pressed={isDevicesActive}
          onClick={onShowNearby}
          title="附近"
        >
          <MonitorSmartphone size={21} strokeWidth={1.8} aria-hidden="true" />
          <span>附近</span>
        </button>
        <button
          type="button"
          className={isTransfersActive ? 'is-active' : ''}
          aria-pressed={isTransfersActive}
          onClick={onShowQueue}
          title="传输"
        >
          <History size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>传输</span>
        </button>
        <button
          type="button"
          className={isMeActive ? 'is-active' : ''}
          aria-pressed={isMeActive}
          onClick={onShowSettings}
          title="更多"
        >
          <User size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>更多</span>
        </button>
      </nav>
      <span className="dd-snaplink__rail-avatar">{getSidebarInitial(deviceName)}</span>
    </aside>
  )
}
