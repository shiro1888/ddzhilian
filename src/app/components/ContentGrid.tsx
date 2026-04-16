import type { DeviceBarItem } from '../types'
import {
  deviceBarStatusLabel,
  deviceRelationText,
  formatRelativeTime,
} from '../utils'

type ContentGridProps = {
  roomJoinDraft: string
  sessionQuery: string
  deviceBarItems: DeviceBarItem[]
  effectiveSelectedPeerId: string | null
  isContentRailCollapsed: boolean
  connectionActionLabel: string
  connectionActionDisabled: boolean
  onSessionQueryChange: (value: string) => void
  onRoomJoinDraftChange: (value: string) => void
  onJoinRoom: () => void
  onConnectionAction: () => void
  onShowConnect: () => void
  onOpenDeviceConversation: (peerId: string, latestSessionId: string | null) => void
  onDeviceAction: (item: DeviceBarItem) => void
}

export function ContentGrid({
  roomJoinDraft,
  sessionQuery,
  deviceBarItems,
  effectiveSelectedPeerId,
  isContentRailCollapsed,
  connectionActionLabel,
  connectionActionDisabled,
  onSessionQueryChange,
  onRoomJoinDraftChange,
  onJoinRoom,
  onConnectionAction,
  onShowConnect,
  onOpenDeviceConversation,
  onDeviceAction,
}: ContentGridProps) {
  return (
    <section className={`dd-content-grid${isContentRailCollapsed ? ' is-collapsed' : ''}`}>
      <section className="dd-panel dd-panel--devices">
        <div className="dd-connection-layer">
          <div className="dd-connection-layer__body">
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
            </div>
          </div>
        </div>

        <div className="dd-panel__head">
          <div className="dd-panel__search">
            <input
              type="search"
              placeholder="搜索设备名称或互传码"
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

        {deviceBarItems.length > 0 ? (
          <ul className="dd-device-bar">
            {deviceBarItems.map((item) => (
              <li key={item.peer.deviceId}>
                <div className={`dd-device-bar__item${effectiveSelectedPeerId === item.peer.deviceId ? ' is-selected' : ''}`}>
                  <button
                    type="button"
                    className="dd-device-bar__summary"
                    onClick={() => onOpenDeviceConversation(item.peer.deviceId, item.latestSessionId)}
                  >
                    <span className="dd-device-bar__avatar" aria-hidden="true">
                      {item.peer.deviceName.slice(0, 1)}
                    </span>
                    <div className="dd-device-bar__body">
                      <div className="dd-device-bar__head">
                        <strong>{item.peer.deviceName}</strong>
                        <small>{formatRelativeTime(item.peer.lastSeenAt)}</small>
                      </div>
                      <p>{item.previewText}</p>
                      <div className="dd-device-bar__meta">
                        <small>{item.peer.platform} · {deviceRelationText(item.peer)}</small>
                        <span className={`dd-peer-badge dd-peer-badge--${item.deviceStatus}`}>
                          {deviceBarStatusLabel(item.deviceStatus)}
                        </span>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`dd-device-bar__action is-${item.deviceStatus}`}
                    onClick={() => onDeviceAction(item)}
                    disabled={item.deviceStatus === 'connecting'}
                  >
                    {item.deviceStatus === 'connected' ? '断开' : item.deviceStatus === 'connecting' ? '连接中' : '连接'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dd-empty">当前没有发现设备。新发现的设备会在这里按时间竖向排列。</div>
        )}
      </section>
    </section>
  )
}
