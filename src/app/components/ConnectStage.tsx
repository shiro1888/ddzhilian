import type { PeerSummary } from '../../lib/ddzhilian-types'
import type { PeerConnectionStatus, StageMeta } from '../types'
import { deviceConnectionLabel } from '../utils'

type ConnectStageProps = {
  joinCode: string
  currentMeta: StageMeta
  onlinePeers: PeerSummary[]
  effectiveSelectedPeerId: string | null
  peerStatusById: Map<string, PeerConnectionStatus>
  selfShortCode?: string
  isEditingDeviceName: boolean
  deviceNameDraft: string
  selfDeviceName?: string
  onJoinCodeChange: (value: string) => void
  onPrimaryConnect: () => void
  onRequestSnapshot: () => void
  onSelectPeer: (peerId: string) => void
  onBeginEditDeviceName: () => void
  onDeviceNameDraftChange: (value: string) => void
  onSaveDeviceName: () => void
  onCancelEditDeviceName: () => void
}

export function ConnectStage({
  joinCode,
  currentMeta,
  onlinePeers,
  effectiveSelectedPeerId,
  peerStatusById,
  selfShortCode,
  isEditingDeviceName,
  deviceNameDraft,
  selfDeviceName,
  onJoinCodeChange,
  onPrimaryConnect,
  onRequestSnapshot,
  onSelectPeer,
  onBeginEditDeviceName,
  onDeviceNameDraftChange,
  onSaveDeviceName,
  onCancelEditDeviceName,
}: ConnectStageProps) {
  return (
    <>
      <div className="dd-stage__toolbar">
        <div className="dd-joinbox">
          <input
            type="text"
            inputMode="text"
            placeholder="输入互传码"
            value={joinCode}
            onChange={(event) => onJoinCodeChange(event.target.value.toUpperCase())}
          />
          <button type="button" className="dd-button dd-button--primary" onClick={onPrimaryConnect}>
            {currentMeta.primaryAction}
          </button>
          <button type="button" className="dd-button dd-button--dark" onClick={onRequestSnapshot}>
            {currentMeta.secondaryAction}
          </button>
        </div>
      </div>

      <div className="dd-stage__grid">
        <section className="dd-composer">
          <div className="dd-connectbox">
            <div className="dd-receivebox__head">
              <span>在线设备</span>
              <small>{onlinePeers.length} 台设备</small>
            </div>

            {onlinePeers.length > 0 ? (
              <ul className="dd-device-list dd-device-list--stage">
                {onlinePeers.map((peer) => (
                  <li key={peer.deviceId}>
                    <button
                      type="button"
                      className={effectiveSelectedPeerId === peer.deviceId ? 'is-selected' : ''}
                      onClick={() => onSelectPeer(peer.deviceId)}
                    >
                      <strong>{peer.deviceName}</strong>
                      <span>
                        {peer.platform} · {peer.shortCode}
                      </span>
                      <small>
                        {peer.relation.sameLan ? '同网设备' : peer.relation.sameAccount ? '同账号设备' : '可连接设备'}
                      </small>
                      <small className={`dd-peer-badge dd-peer-badge--${peerStatusById.get(peer.deviceId) ?? 'online'}`}>
                        {deviceConnectionLabel(peerStatusById.get(peer.deviceId))}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dd-empty">当前没有可见设备。可以输入互传码，或等待另一台设备上线。</div>
            )}
          </div>
        </section>

        <aside className="dd-stage__side">
          <div className="dd-codecard">
            <p>我的互传码</p>
            <strong>{selfShortCode ?? '------'}</strong>
            <span>另一台设备输入此码即可发起连接。</span>
          </div>

          <div className="dd-detailcard">
            <p>当前设备</p>
            <ul>
              <li
                className={`dd-device-name-row${isEditingDeviceName ? ' is-editing' : ''}`}
                onClick={() => {
                  if (!isEditingDeviceName) {
                    onBeginEditDeviceName()
                  }
                }}
              >
                <span>设备名</span>
                {isEditingDeviceName ? (
                  <div className="dd-device-name-editor" onClick={(event) => event.stopPropagation()}>
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
                  <div className="dd-device-name-display">
                    <strong>{selfDeviceName ?? '正在连接…'}</strong>
                    <small>点击名称可修改</small>
                  </div>
                )}
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  )
}
