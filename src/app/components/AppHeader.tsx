import type { NavView, StageMeta } from '../types'

type AppHeaderProps = {
  isChatDesktopTheme: boolean
  isChatConversationView: boolean
  currentMeta: StageMeta
  localError: string | null
  errorMessage: string | null
  onlineCount: number
  activeCount: number
  socketState: string
  onRequestSnapshot: () => void
  onViewChange: (view: NavView) => void
}

export function AppHeader({
  isChatDesktopTheme,
  isChatConversationView,
  currentMeta,
  localError,
  errorMessage,
  onlineCount,
  activeCount,
  socketState,
  onRequestSnapshot,
  onViewChange,
}: AppHeaderProps) {
  return (
    <header className="pp-header">
      <div>
        <p className="pp-header__eyebrow">{isChatConversationView ? '当前对话' : '连接 · 传输 · 共享'}</p>
        <h1>{currentMeta.title}</h1>
        <p>{currentMeta.description}</p>
        {(localError || errorMessage) && <p className="pp-error-note">{localError ?? errorMessage}</p>}
      </div>

      {isChatDesktopTheme ? (
        <div className="pp-header__actions">
          <button type="button" className="pp-icon-button pp-icon-button--plain" aria-label="刷新" onClick={onRequestSnapshot}>
            ↻
          </button>
          <button
            type="button"
            className="pp-icon-button pp-icon-button--plain"
            aria-label="连接设备"
            onClick={() => onViewChange('connect')}
          >
            ⊕
          </button>
          <button
            type="button"
            className="pp-icon-button pp-icon-button--plain"
            aria-label="会话记录"
            onClick={() => onViewChange('sessions')}
          >
            ⋯
          </button>
        </div>
      ) : (
        <div className="pp-header__status">
          <span>{onlineCount} 台设备在线</span>
          <span>{activeCount} 个活跃会话</span>
          <span>{socketState}</span>
        </div>
      )}
    </header>
  )
}
