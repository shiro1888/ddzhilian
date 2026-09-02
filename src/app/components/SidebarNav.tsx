import {
  ArrowLeftRight,
  MessageCircle,
  MonitorSmartphone,
  Sparkles,
  User,
} from 'lucide-react'
import type { CSSProperties } from 'react'

export type SidebarNavMode = 'nearby' | 'rooms' | 'files' | 'transfers' | 'text' | 'history' | 'workshop' | 'settings'
export type SidebarNavTool = 'ai-chat' | 'image' | 'command'

type SidebarNavProps = {
  deviceName: string
  avatarDataUrl?: string | null
  activeMode?: SidebarNavMode | null
  activeTool?: SidebarNavTool | null
  activeTransferCount?: number
  onAvatarClick?: () => void
  onShowNearby: () => void
  onShowRooms: () => void
  onShowQueue: () => void
  onShowWorkshop?: () => void
  onShowSettings: () => void
}

function getSidebarInitial(value: string) {
  const normalizedValue = value.trim()
  return (normalizedValue ? Array.from(normalizedValue)[0] : 'D').toUpperCase()
}

export function SidebarNav({
  deviceName,
  avatarDataUrl = null,
  activeMode = null,
  activeTool = null,
  activeTransferCount = 0,
  onAvatarClick,
  onShowRooms,
  onShowNearby,
  onShowQueue,
  onShowWorkshop,
  onShowSettings,
}: SidebarNavProps) {
  const isMessagesActive = activeMode === 'rooms' || activeMode === 'text' || activeMode === 'files'
  const isDevicesActive = activeMode === 'nearby'
  const isTransfersActive = activeMode === 'transfers'
  const isWorkshopActive = activeMode === 'workshop' || Boolean(activeTool)
  const isMeActive = activeMode === 'settings' || activeMode === 'history'
  const transferLabel = activeTransferCount > 0
    ? `传输 · ${activeTransferCount.toString()} 个进行中`
    : '传输'

  return (
    <aside className="dd-snaplink__rail" aria-label="主导航">
      <div className="dd-snaplink__rail-logo" title="DD直连">
        <img src="/logo-dd-link.svg" alt="DD直连" />
      </div>
      <nav className="dd-snaplink__rail-nav" aria-label="DD直连主功能">
        <button
          type="button"
          className={isMessagesActive ? 'is-active' : ''}
          aria-pressed={isMessagesActive}
          onClick={onShowRooms}
          title="消息"
        >
          <MessageCircle size={20} strokeWidth={1.8} aria-hidden="true" />
          <span className="dd-snaplink__rail-label">消息</span>
        </button>
        <button
          type="button"
          className={isDevicesActive ? 'is-active' : ''}
          aria-pressed={isDevicesActive}
          onClick={onShowNearby}
          title="设备"
        >
          <MonitorSmartphone size={20} strokeWidth={1.8} aria-hidden="true" />
          <span className="dd-snaplink__rail-label">设备</span>
        </button>
        <button
          type="button"
          className={isTransfersActive ? 'is-active' : ''}
          aria-pressed={isTransfersActive}
          aria-label={transferLabel}
          onClick={onShowQueue}
          title={transferLabel}
        >
          <ArrowLeftRight size={19} strokeWidth={1.8} aria-hidden="true" />
          <span className="dd-snaplink__rail-label">传输</span>
          {activeTransferCount > 0 ? (
            <em className="dd-snaplink__rail-badge" aria-hidden="true">
              {activeTransferCount > 99 ? '99+' : activeTransferCount.toString()}
            </em>
          ) : null}
        </button>
        {onShowWorkshop ? (
          <button
            type="button"
            className={isWorkshopActive ? 'is-active' : ''}
            aria-pressed={isWorkshopActive}
            onClick={onShowWorkshop}
            title="工坊"
          >
            <Sparkles size={19} strokeWidth={1.8} aria-hidden="true" />
            <span className="dd-snaplink__rail-label">工坊</span>
          </button>
        ) : null}
        <button
          type="button"
          className={isMeActive ? 'is-active' : ''}
          aria-pressed={isMeActive}
          onClick={onShowSettings}
          title="我的"
        >
          <User size={19} strokeWidth={1.8} aria-hidden="true" />
          <span className="dd-snaplink__rail-label">我的</span>
        </button>
      </nav>
      <button
        type="button"
        className={`dd-snaplink__rail-avatar${avatarDataUrl ? ' has-image' : ''}`}
        style={avatarDataUrl ? { '--dd-avatar': `url("${avatarDataUrl}")` } as CSSProperties : undefined}
        aria-label={`当前设备：${deviceName}`}
        title={onAvatarClick ? '更换头像' : `当前设备：${deviceName}`}
        onClick={onAvatarClick}
      >
        {avatarDataUrl ? null : getSidebarInitial(deviceName)}
      </button>
    </aside>
  )
}
