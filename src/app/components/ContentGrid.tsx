import type { PeerSummary } from '../../lib/ccconnect-types'
import type { DeviceBarItem, PeerConnectionStatus, UiSession } from '../types'
import {
  deviceBarStatusLabel,
  deviceConnectionLabel,
  deviceRelationText,
  formatRelativeTime,
} from '../utils'

type ContentGridProps = {
  isChatDesktopTheme: boolean
  sessionQuery: string
  selfName: string
  deviceBarItems: DeviceBarItem[]
  filteredSessions: UiSession[]
  selectedUiSession?: UiSession
  effectiveSelectedPeerId: string | null
  onlinePeers: PeerSummary[]
  peerStatusById: Map<string, PeerConnectionStatus>
  onSessionQueryChange: (value: string) => void
  onShowConnect: () => void
  onOpenDeviceConversation: (peerId: string, latestSessionId: string | null) => void
  onDeviceAction: (item: DeviceBarItem) => void
  onSelectSession: (sessionId: string) => void
}

export function ContentGrid({
  isChatDesktopTheme,
  sessionQuery,
  selfName,
  deviceBarItems,
  filteredSessions,
  selectedUiSession,
  effectiveSelectedPeerId,
  onlinePeers,
  peerStatusById,
  onSessionQueryChange,
  onShowConnect,
  onOpenDeviceConversation,
  onDeviceAction,
  onSelectSession,
}: ContentGridProps) {
  return (
    <section className="pp-content-grid">
      <section className={`pp-panel ${isChatDesktopTheme ? 'pp-panel--devices' : 'pp-panel--sessions'}`}>
        <div className="pp-panel__head">
          {!isChatDesktopTheme && (
            <div>
              <p>当前会话</p>
              <h2>会话列表</h2>
            </div>
          )}
          <div className="pp-panel__search">
            <input
              type="search"
              placeholder={isChatDesktopTheme ? '搜索设备名称或互传码' : '搜索会话码、设备或载荷'}
              value={sessionQuery}
              onChange={(event) => onSessionQueryChange(event.target.value)}
            />
            {isChatDesktopTheme && (
              <button
                type="button"
                className="pp-icon-button pp-icon-button--plain"
                aria-label="新会话"
                onClick={onShowConnect}
              >
                +
              </button>
            )}
          </div>
        </div>

        {isChatDesktopTheme ? (
          deviceBarItems.length > 0 ? (
            <ul className="pp-device-bar">
              {deviceBarItems.map((item) => (
                <li key={item.peer.deviceId}>
                  <div className={`pp-device-bar__item${effectiveSelectedPeerId === item.peer.deviceId ? ' is-selected' : ''}`}>
                    <button
                      type="button"
                      className="pp-device-bar__summary"
                      onClick={() => onOpenDeviceConversation(item.peer.deviceId, item.latestSessionId)}
                    >
                      <span className="pp-device-bar__avatar" aria-hidden="true">
                        {item.peer.deviceName.slice(0, 1)}
                      </span>
                      <div className="pp-device-bar__body">
                        <div className="pp-device-bar__head">
                          <strong>{item.peer.deviceName}</strong>
                          <small>{formatRelativeTime(item.peer.lastSeenAt)}</small>
                        </div>
                        <p>{item.previewText}</p>
                        <div className="pp-device-bar__meta">
                          <small>{item.peer.platform} · {deviceRelationText(item.peer)}</small>
                          <span className={`pp-peer-badge pp-peer-badge--${item.deviceStatus}`}>
                            {deviceBarStatusLabel(item.deviceStatus)}
                          </span>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`pp-device-bar__action is-${item.deviceStatus}`}
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
            <div className="pp-empty">当前没有发现设备。新发现的设备会在这里按时间竖向排列。</div>
          )
        ) : (
          <ul className="pp-session-list">
            {filteredSessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  className={selectedUiSession?.id === session.id ? 'is-selected' : ''}
                  onClick={() => onSelectSession(session.id)}
                >
                  <span className={`pp-session-list__avatar is-${session.kind}`} aria-hidden="true">
                    {session.kind === 'file'
                      ? '文'
                      : session.source === selfName
                        ? session.target.slice(0, 1)
                        : session.source.slice(0, 1)}
                  </span>
                  <div className="pp-session-list__body">
                    <div className="pp-session-list__head">
                      <strong>{session.source === selfName ? session.target : session.source}</strong>
                      <small>{session.updatedAt}</small>
                    </div>
                    <p>{session.kind === 'file' ? `[文件] ${session.summary}` : session.summary}</p>
                    <div className="pp-session-list__meta-row">
                      <small>
                        {session.source} {'->'} {session.target}
                      </small>
                      <span className={`is-${session.status}`}>
                        {session.status === 'waiting' ? '待接收' : session.status === 'active' ? '传输中' : '已关闭'}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!isChatDesktopTheme && (
        <aside className="pp-side-stack">
          <section className="pp-panel">
            <div className="pp-panel__head pp-panel__head--compact">
              <div>
                <p>选中会话</p>
                <h2>会话详情</h2>
              </div>
            </div>

            {selectedUiSession ? (
              <div className="pp-session-detail">
                <div className="pp-codecard pp-codecard--small">
                  <p>Session code</p>
                  <strong>{selectedUiSession.id.slice(0, 6).toUpperCase()}</strong>
                  <span>{selectedUiSession.kind === 'file' ? '文件会话' : '文本会话'}</span>
                </div>

                <ul>
                  <li>
                    <span>来源</span>
                    <strong>{selectedUiSession.source}</strong>
                  </li>
                  <li>
                    <span>目标</span>
                    <strong>{selectedUiSession.target}</strong>
                  </li>
                  <li>
                    <span>载荷</span>
                    <strong>{selectedUiSession.summary}</strong>
                  </li>
                  <li>
                    <span>剩余状态</span>
                    <strong>{selectedUiSession.expiresIn}</strong>
                  </li>
                </ul>
              </div>
            ) : (
              <div className="pp-empty">选中一条会话后，这里会显示详细信息。</div>
            )}
          </section>

          <section className="pp-panel">
            <div className="pp-panel__head pp-panel__head--compact">
              <div>
                <p>在线设备</p>
                <h2>设备列表</h2>
              </div>
            </div>

            <ul className="pp-device-list">
              {onlinePeers.map((peer) => (
                <li key={peer.deviceId}>
                  <strong>{peer.deviceName}</strong>
                  <span>
                    {peer.platform} · {peer.shortCode}
                  </span>
                  <small>{peer.relation.sameLan ? '同网设备' : peer.relation.sameAccount ? '同账号设备' : '在线设备'}</small>
                  <small className={`pp-peer-badge pp-peer-badge--${peerStatusById.get(peer.deviceId) ?? 'online'}`}>
                    {deviceConnectionLabel(peerStatusById.get(peer.deviceId))}
                  </small>
                  <small>{formatRelativeTime(peer.lastSeenAt)}</small>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      )}
    </section>
  )
}
