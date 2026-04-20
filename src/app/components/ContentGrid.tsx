import type { RoomListItem } from '../types'

type ContentGridProps = {
  roomJoinDraft: string
  roomListItems: RoomListItem[]
  selectedRoomId: string | null
  isContentRailCollapsed: boolean
  connectionActionLabel: string
  connectionActionDisabled: boolean
  connectAllDisabled: boolean
  isEditingDeviceName: boolean
  deviceNameDraft: string
  selfDeviceName?: string
  onRoomJoinDraftChange: (value: string) => void
  onDeviceNameDraftChange: (value: string) => void
  onJoinRoom: () => void
  onConnectionAction: () => void
  onConnectAllDevices: () => void
  onCreateNewConversation: () => void
  onCreatePublicRoom: () => void
  onCopyPublicRoomLink: (roomId: string) => void
  onBeginEditDeviceName: () => void
  onSaveDeviceName: () => void
  onCancelEditDeviceName: () => void
  onOpenRoomConversation: (roomId: string) => void
  onToggleRoomPinned: (roomId: string) => void
}

export function ContentGrid({
  roomJoinDraft,
  roomListItems,
  selectedRoomId,
  isContentRailCollapsed,
  connectionActionLabel,
  connectionActionDisabled,
  connectAllDisabled,
  isEditingDeviceName,
  deviceNameDraft,
  selfDeviceName,
  onRoomJoinDraftChange,
  onDeviceNameDraftChange,
  onJoinRoom,
  onConnectionAction,
  onConnectAllDevices,
  onCreateNewConversation,
  onCreatePublicRoom,
  onCopyPublicRoomLink,
  onBeginEditDeviceName,
  onSaveDeviceName,
  onCancelEditDeviceName,
  onOpenRoomConversation,
  onToggleRoomPinned,
}: ContentGridProps) {
  return (
    <section className={`dd-content-grid${isContentRailCollapsed ? ' is-collapsed' : ''}`}>
      <section className="dd-panel dd-panel--devices">
        <div className="dd-rail-join">
          <input
            type="text"
            inputMode="text"
            placeholder="输入 roomId 加入会话"
            value={roomJoinDraft}
            onChange={(event) => onRoomJoinDraftChange(event.target.value.toUpperCase())}
          />
          <button type="button" className="dd-button dd-button--dark" onClick={onJoinRoom}>
            加入
          </button>
        </div>

        <button type="button" className="dd-rail-public-button" onClick={onCreatePublicRoom}>
          进入公共对话
        </button>

        <div className={`dd-rail-identity${isEditingDeviceName ? ' is-editing' : ''}`}>
          <span>我的设备</span>
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
            <button type="button" onClick={onBeginEditDeviceName}>
              <strong>{selfDeviceName ?? '正在连接...'}</strong>
              <small>在线身份</small>
            </button>
          )}
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
                          {item.isPublic && <span className="dd-room-list__public-mark">公开</span>}
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
                              ? item.onlineCount > 0
                                ? `${item.onlineCount} 在线`
                                : '在线'
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
                  {item.isPublic && (
                    <button
                      type="button"
                      className="dd-room-list__link"
                      aria-label="复制公共对话链接"
                      title="复制公共对话链接"
                      onClick={() => onCopyPublicRoomLink(item.roomId)}
                    >
                      链
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dd-empty">暂无已存在对话。加入或创建会话后会显示在这里。</div>
        )}

        <details className="dd-connection-layer dd-connection-layer--settings">
          <summary className="dd-connection-layer__summary">
            <span>连接设置</span>
            <strong>{selfDeviceName ?? '正在连接...'}</strong>
          </summary>
          <div className="dd-connection-layer__body">
            <div className="dd-connection-layer__actions">
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
        </details>
      </section>
    </section>
  )
}
