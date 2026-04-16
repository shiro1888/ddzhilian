import type { RoomListItem } from '../types'

type ContentGridProps = {
  roomJoinDraft: string
  sessionQuery: string
  roomListItems: RoomListItem[]
  selectedRoomId: string | null
  isContentRailCollapsed: boolean
  connectionActionLabel: string
  connectionActionDisabled: boolean
  connectAllDisabled: boolean
  isEditingDeviceName: boolean
  deviceNameDraft: string
  selfDeviceName?: string
  onSessionQueryChange: (value: string) => void
  onRoomJoinDraftChange: (value: string) => void
  onDeviceNameDraftChange: (value: string) => void
  onJoinRoom: () => void
  onConnectionAction: () => void
  onConnectAllDevices: () => void
  onCreateNewConversation: () => void
  onShowConnect: () => void
  onBeginEditDeviceName: () => void
  onSaveDeviceName: () => void
  onCancelEditDeviceName: () => void
  onOpenRoomConversation: (roomId: string) => void
  onToggleRoomPinned: (roomId: string) => void
}

export function ContentGrid({
  roomJoinDraft,
  sessionQuery,
  roomListItems,
  selectedRoomId,
  isContentRailCollapsed,
  connectionActionLabel,
  connectionActionDisabled,
  connectAllDisabled,
  isEditingDeviceName,
  deviceNameDraft,
  selfDeviceName,
  onSessionQueryChange,
  onRoomJoinDraftChange,
  onDeviceNameDraftChange,
  onJoinRoom,
  onConnectionAction,
  onConnectAllDevices,
  onCreateNewConversation,
  onShowConnect,
  onBeginEditDeviceName,
  onSaveDeviceName,
  onCancelEditDeviceName,
  onOpenRoomConversation,
  onToggleRoomPinned,
}: ContentGridProps) {
  return (
    <section className={`dd-content-grid${isContentRailCollapsed ? ' is-collapsed' : ''}`}>
      <section className="dd-panel dd-panel--devices">
        <div className="dd-connection-layer">
          <div className="dd-connection-layer__body">
            <div className={`dd-connection-layer__identity${isEditingDeviceName ? ' is-editing' : ''}`}>
              <span>我的设备名</span>
              {isEditingDeviceName ? (
                <div className="dd-device-name-editor">
                  <input
                    type="text"
                    value={deviceNameDraft}
                    onChange={(event) => onDeviceNameDraftChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        onSaveDeviceName()
                      }

                      if (event.key === 'Escape') {
                        event.preventDefault()
                        onCancelEditDeviceName()
                      }
                    }}
                    autoFocus
                  />
                  <div className="dd-device-name-editor__actions">
                    <button type="button" onClick={onSaveDeviceName}>
                      保存
                    </button>
                    <button type="button" className="is-ghost" onClick={onCancelEditDeviceName}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="dd-connection-layer__identity-button"
                  onClick={onBeginEditDeviceName}
                >
                  <strong>{selfDeviceName ?? '正在连接...'}</strong>
                  <small>在线身份</small>
                </button>
              )}
            </div>

            <div className="dd-connection-layer__actions">
              <div className="dd-connection-layer__join">
                <input
                  type="text"
                  inputMode="text"
                  placeholder="输入 roomId 加入已存在会话"
                  value={roomJoinDraft}
                  onChange={(event) => onRoomJoinDraftChange(event.target.value.toUpperCase())}
                />
                <button type="button" className="dd-button dd-button--dark" onClick={onJoinRoom}>
                  加入房间
                </button>
              </div>

              <button
                type="button"
                className="dd-button dd-button--primary"
                onClick={onConnectionAction}
                disabled={connectionActionDisabled}
              >
                {connectionActionLabel}
              </button>
              <button
                type="button"
                className="dd-button dd-button--dark"
                onClick={onConnectAllDevices}
                disabled={connectAllDisabled}
              >
                连接全部设备
              </button>
              <button
                type="button"
                className="dd-button dd-button--dark"
                onClick={onCreateNewConversation}
                disabled={connectionActionDisabled}
              >
                创建新对话
              </button>
            </div>
          </div>
        </div>

        <div className="dd-panel__head">
          <div className="dd-panel__search">
            <input
              type="search"
              placeholder="搜索对话或 roomId"
              value={sessionQuery}
              onChange={(event) => onSessionQueryChange(event.target.value)}
            />
            <button
              type="button"
              className="dd-icon-button dd-icon-button--plain"
              aria-label="新会话"
              onClick={onShowConnect}
            >
              +
            </button>
          </div>
        </div>

        {roomListItems.length > 0 ? (
          <ul className="dd-room-list">
            {roomListItems.map((item) => (
              <li key={item.roomId}>
                <div className={`dd-room-list__item${selectedRoomId === item.roomId ? ' is-selected' : ''}`}>
                  <button
                    type="button"
                    className="dd-room-list__summary"
                    title={`${item.memberCount} 位成员 · Room ${item.roomId}`}
                    onClick={() => onOpenRoomConversation(item.roomId)}
                  >
                    <span className="dd-room-list__avatar" aria-hidden="true">
                      {item.title.slice(0, 1)}
                    </span>
                    <div className="dd-room-list__body">
                      <div className="dd-room-list__head">
                        <strong>{item.title}</strong>
                        <div className="dd-room-list__head-actions">
                          {item.unreadCount > 0 && (
                            <span className="dd-room-list__unread">{item.unreadCount}</span>
                          )}
                          <small>{item.updatedAtLabel}</small>
                          {item.pinned && <span className="dd-room-list__pin-mark">★</span>}
                        </div>
                      </div>
                      <p>{item.previewText}</p>
                      <div className="dd-room-list__meta">
                        <span className={`dd-peer-badge dd-peer-badge--${item.status}`}>
                          {item.status === 'connected'
                            ? '已连接'
                            : item.status === 'online'
                              ? `${item.onlineCount} 在线`
                              : '仅历史'}
                        </span>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`dd-room-list__pin${item.pinned ? ' is-pinned' : ''}`}
                    aria-label={item.pinned ? '取消置顶' : '置顶对话'}
                    onClick={() => onToggleRoomPinned(item.roomId)}
                  >
                    ★
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dd-empty">暂无已存在对话。加入或创建会话后会显示在这里。</div>
        )}
      </section>
    </section>
  )
}
