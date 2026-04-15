import type { StageMeta } from '../types'

type AppHeaderProps = {
  isChatConversationView: boolean
  currentMeta: StageMeta
  currentRoomId?: string | null
  localError: string | null
  errorMessage: string | null
}

export function AppHeader({
  isChatConversationView,
  currentMeta,
  currentRoomId,
  localError,
  errorMessage,
}: AppHeaderProps) {
  return (
    <header className="pp-header">
      <div>
        <p className="pp-header__eyebrow">{isChatConversationView ? '当前对话' : '连接 · 传输 · 共享'}</p>
        <div className="pp-header__title-row">
          <h1>{currentMeta.title}</h1>
          {isChatConversationView && currentRoomId ? (
            <span className="pp-header__room-chip">Room ID: {currentRoomId}</span>
          ) : null}
        </div>
        <p>{currentMeta.description}</p>
        {(localError || errorMessage) && <p className="pp-error-note">{localError ?? errorMessage}</p>}
      </div>
    </header>
  )
}
