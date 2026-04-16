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
    <header className="dd-header">
      <div>
        <p className="dd-header__eyebrow">{isChatConversationView ? '当前对话' : '连接 · 传输 · 共享'}</p>
        <div className="dd-header__title-row">
          <h1>{currentMeta.title}</h1>
          {isChatConversationView && currentRoomId ? (
            <span className="dd-header__room-chip">Room ID: {currentRoomId}</span>
          ) : null}
        </div>
        <p>{currentMeta.description}</p>
        {(localError || errorMessage) && <p className="dd-error-note">{localError ?? errorMessage}</p>}
      </div>
    </header>
  )
}
