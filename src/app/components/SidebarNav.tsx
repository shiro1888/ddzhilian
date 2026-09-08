import {
  ArrowLeftRight,
  MessageCircle,
  Monitor,
  Sparkles,
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
  onShowHome?: () => void
  onShowNearby?: () => void
  onShowRooms: () => void
  onShowQueue: () => void
  onShowWorkshop?: () => void
  onShowSettings: () => void
}

export function SidebarNav({
  deviceName,
  avatarDataUrl = null,
  activeMode = null,
  activeTool = null,
  activeTransferCount = 0,
  onShowHome,
  onShowRooms,
  onShowQueue,
  onShowWorkshop,
  onShowSettings,
}: SidebarNavProps) {
  const isMessagesActive = activeMode === 'rooms' || activeMode === 'text' || activeMode === 'nearby'
  const isTransfersActive = activeMode === 'transfers' || activeMode === 'files'
  const isWorkshopActive = activeMode === 'workshop' || Boolean(activeTool)
  const isMeActive = activeMode === 'settings'
  const shouldShowTransfers = isTransfersActive || activeTransferCount > 0
  const handleLogoClick = onShowHome ?? onShowRooms

  const transferLabel = activeTransferCount > 0
    ? `传输 · ${activeTransferCount.toString()} 个进行中`
    : '传输'

  return (
    <aside className="dd-snaplink__rail" aria-label="主导航">
      <div
        className="dd-snaplink__rail-logo"
        title="DD直连 首页"
        role="button"
        tabIndex={0}
        aria-label="DD直连 首页"
        onClick={handleLogoClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleLogoClick()
          }
        }}
      >
        <img src="/logo-dd-link.png" alt="DD直连" />
      </div>
      <nav className="dd-snaplink__rail-nav" aria-label="DD直连主功能">
        <button
          type="button"
          className={isMessagesActive ? 'is-active' : ''}
          aria-pressed={isMessagesActive}
          onClick={onShowRooms}
          title="消息与设备"
        >
          <MessageCircle size={20} strokeWidth={1.8} aria-hidden="true" />
          <span className="dd-snaplink__rail-label">消息</span>
        </button>
        {shouldShowTransfers ? (
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
        ) : null}
        {onShowWorkshop ? (
          <button
            type="button"
            className={isWorkshopActive ? 'is-active' : ''}
            aria-pressed={isWorkshopActive}
            onClick={onShowWorkshop}
            title="工具"
          >
            <Sparkles size={19} strokeWidth={1.8} aria-hidden="true" />
            <span className="dd-snaplink__rail-label">工具</span>
          </button>
        ) : null}
      </nav>
      <div className="dd-snaplink__rail-avatar-wrap">
        <button
          type="button"
          className={`dd-snaplink__rail-avatar${avatarDataUrl ? ' has-image' : ''}${isMeActive ? ' is-active' : ''}`}
          style={avatarDataUrl ? { '--dd-avatar': `url("${avatarDataUrl}")` } as CSSProperties : undefined}
          aria-label="我的"
          aria-pressed={isMeActive}
          title={`我的设置 · ${deviceName}`}
          onClick={onShowSettings}
        >
          {avatarDataUrl ? null : <Monitor size={18} strokeWidth={1.8} aria-hidden="true" />}
        </button>
        <span className="dd-snaplink__rail-avatar-status" title="本机在线" aria-hidden="true" />
      </div>
    </aside>
  )
}
