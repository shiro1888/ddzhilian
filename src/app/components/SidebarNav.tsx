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
  activeTransferCount?: number
  onShowNearby: () => void
  onShowRooms: () => void
  onShowQueue: () => void
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
  activeTransferCount = 0,
  onShowRooms,
  onShowNearby,
  onShowQueue,
  onShowSettings,
}: SidebarNavProps) {
  const isMessagesActive = activeMode === 'rooms' || activeMode === 'text' || activeMode === 'files'
  const isDevicesActive = activeMode === 'nearby'
  const isTransfersActive = activeMode === 'transfers'
  const isMeActive = activeMode === 'settings' || activeMode === 'history' || Boolean(activeTool)
  const transferLabel = activeTransferCount > 0
    ? `传输 · ${activeTransferCount.toString()} 个进行中`
    : '传输'

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
          title="消息"
        >
          <MessageCircle size={22} strokeWidth={1.8} aria-hidden="true" />
          <span>消息</span>
        </button>
        <button
          type="button"
          className={isDevicesActive ? 'is-active' : ''}
          aria-pressed={isDevicesActive}
          onClick={onShowNearby}
          title="设备"
        >
          <MonitorSmartphone size={21} strokeWidth={1.8} aria-hidden="true" />
          <span>设备</span>
        </button>
        <button
          type="button"
          className={isTransfersActive ? 'is-active' : ''}
          aria-pressed={isTransfersActive}
          aria-label={transferLabel}
          onClick={onShowQueue}
          title={transferLabel}
        >
          <History size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>传输</span>
          {activeTransferCount > 0 ? (
            <em className="dd-snaplink__rail-badge" aria-hidden="true">
              {activeTransferCount > 99 ? '99+' : activeTransferCount.toString()}
            </em>
          ) : null}
        </button>
        <button
          type="button"
          className={isMeActive ? 'is-active' : ''}
          aria-pressed={isMeActive}
          onClick={onShowSettings}
          title="我的"
        >
          <User size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>我的</span>
        </button>
      </nav>
      <span
        className="dd-snaplink__rail-avatar"
        role="img"
        aria-label={`当前设备：${deviceName}`}
        title={`当前设备：${deviceName}`}
      >
        {getSidebarInitial(deviceName)}
      </span>
    </aside>
  )
}
