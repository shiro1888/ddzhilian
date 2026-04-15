import type { StageMeta } from '../types'

type AppHeaderProps = {
  isChatConversationView: boolean
  currentMeta: StageMeta
  localError: string | null
  errorMessage: string | null
}

export function AppHeader({
  isChatConversationView,
  currentMeta,
  localError,
  errorMessage,
}: AppHeaderProps) {
  return (
    <header className="pp-header">
      <div>
        <p className="pp-header__eyebrow">{isChatConversationView ? '当前对话' : '连接 · 传输 · 共享'}</p>
        <h1>{currentMeta.title}</h1>
        <p>{currentMeta.description}</p>
        {(localError || errorMessage) && <p className="pp-error-note">{localError ?? errorMessage}</p>}
      </div>
    </header>
  )
}
