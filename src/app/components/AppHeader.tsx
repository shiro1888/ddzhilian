import type { StageMeta } from '../types'

type AppHeaderProps = {
  isChatConversationView: boolean
  currentMeta: StageMeta
  currentRoomId?: string | null
  isSharedPanelOpen?: boolean
  isEditingDeviceName?: boolean
  deviceNameDraft?: string
  selfDeviceName?: string
  localError: string | null
  errorMessage: string | null
  isReconnectDisabled?: boolean
  onBeginEditDeviceName?: () => void
  onDeviceNameDraftChange?: (value: string) => void
  onSaveDeviceName?: () => void
  onCancelEditDeviceName?: () => void
  onReconnect?: () => void
  onToggleSharedPanel?: () => void
}

export function AppHeader({
  isChatConversationView,
  currentMeta,
  currentRoomId,
  isSharedPanelOpen = false,
  isEditingDeviceName = false,
  deviceNameDraft = '',
  selfDeviceName,
  localError,
  errorMessage,
  isReconnectDisabled = false,
  onBeginEditDeviceName,
  onDeviceNameDraftChange,
  onSaveDeviceName,
  onCancelEditDeviceName,
  onReconnect,
  onToggleSharedPanel,
}: AppHeaderProps) {
  const avatarLabel = (selfDeviceName ?? currentMeta.title).trim().slice(0, 1).toUpperCase() || 'D'

  return (
    <header className="dd-header">
      <div className="dd-header__identity">
        <button
          type="button"
          className="dd-header__avatar"
          aria-label={isEditingDeviceName ? '正在编辑在线身份' : '修改在线身份'}
          onClick={onBeginEditDeviceName}
        >
          {avatarLabel}
        </button>
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
          {isEditingDeviceName ? (
            <div className="dd-header__identity-editor">
              <input
                type="text"
                value={deviceNameDraft}
                onChange={(event) => onDeviceNameDraftChange?.(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onSaveDeviceName?.()
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onCancelEditDeviceName?.()
                  }
                }}
                autoFocus
              />
              <div className="dd-header__identity-editor-actions">
                <button type="button" onClick={onSaveDeviceName}>
                  保存
                </button>
                <button type="button" className="is-ghost" onClick={onCancelEditDeviceName}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <p className="dd-header__device-name">{selfDeviceName ?? '正在连接...'}</p>
          )}
          <p>{currentMeta.description}</p>
          {(localError || errorMessage) && <p className="dd-error-note">{localError ?? errorMessage}</p>}
        </div>
      </div>
    </header>
  )
}
