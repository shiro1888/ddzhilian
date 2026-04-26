import type { StageMeta } from '../types'

type AppHeaderProps = {
  isChatConversationView: boolean
  currentMeta: StageMeta
  currentRoomId?: string | null
  isSharedPanelOpen?: boolean
  localError: string | null
  errorMessage: string | null
  isReconnectDisabled?: boolean
  onReconnect?: () => void
  onToggleSharedPanel?: () => void
}

export function AppHeader({
  isChatConversationView,
  currentMeta,
  currentRoomId,
  isSharedPanelOpen = false,
  localError,
  errorMessage,
  isReconnectDisabled = false,
  onReconnect,
  onToggleSharedPanel,
}: AppHeaderProps) {
  const avatarLabel = currentMeta.title.trim().slice(0, 1) || 'D'

  return (
    <header className="dd-header">
      <div className="dd-header__identity">
        <span className="dd-header__avatar" aria-hidden="true">
          {avatarLabel}
        </span>
        <div className="dd-header__copy">
          <p className="dd-header__eyebrow">{isChatConversationView ? '当前对话' : '连接 · 传输 · 共享'}</p>
          <div className="dd-header__title-row">
            <h1>{currentMeta.title}</h1>
            {isChatConversationView && currentRoomId ? (
              <span className="dd-header__room-chip">Room ID: {currentRoomId}</span>
            ) : null}
            {isChatConversationView && onReconnect ? (
              <button
                type="button"
                className="dd-header__reconnect"
                disabled={isReconnectDisabled}
                onClick={onReconnect}
              >
                重连公共 Room
              </button>
            ) : null}
            {isChatConversationView && onToggleSharedPanel ? (
              <button
                type="button"
                className={`dd-chatbox__shared-trigger dd-header__shared-trigger${isSharedPanelOpen ? ' is-active' : ''}`}
                aria-expanded={isSharedPanelOpen}
                onClick={onToggleSharedPanel}
              >
                {isSharedPanelOpen ? '关闭共享内容' : '共享内容'}
              </button>
            ) : null}
          </div>
          <p>{currentMeta.description}</p>
          {(localError || errorMessage) && <p className="dd-error-note">{localError ?? errorMessage}</p>}
        </div>
      </div>
    </header>
  )
}
