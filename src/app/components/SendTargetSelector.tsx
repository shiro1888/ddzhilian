import type { ReactNode } from 'react'
import { Users, Wifi } from 'lucide-react'

type SendTargetSelectorProps = {
  targetSummary: ReactNode
  deviceTargets: ReactNode[]
  roomTargets?: ReactNode[]
  variant?: 'default' | 'compact'
  emptyText?: string
  roomEmptyText?: string
}

export function SendTargetSelector({
  targetSummary,
  deviceTargets,
  roomTargets,
  variant = 'default',
  emptyText = '暂无附近设备，先让另一台设备打开 DD直连。',
  roomEmptyText = '暂无房间，先创建或加入一个房间。',
}: SendTargetSelectorProps) {
  const className = [
    'dd-snaplink__send-target-grid',
    variant === 'compact' ? 'is-compact' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={className}>
      {targetSummary}
      <div className="dd-snaplink__target-selector-column">
        <div className="dd-snaplink__target-group-head">
          <strong>附近设备</strong>
          <small>{deviceTargets.length > 0 ? `${deviceTargets.length.toString()} 个可选` : '等待设备上线'}</small>
        </div>
        <div className="dd-snaplink__target-device-list" aria-label="附近设备目标">
          {deviceTargets.length > 0 ? (
            deviceTargets
          ) : (
            <div className="dd-snaplink__target-device-empty">
              <Wifi size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{emptyText}</span>
            </div>
          )}
        </div>

        {roomTargets ? (
          <div className="dd-snaplink__target-room-group">
            <div className="dd-snaplink__target-group-head">
              <strong>房间</strong>
              <small>{roomTargets.length > 0 ? '进入房间后发送' : '暂无房间'}</small>
            </div>
            <div className="dd-snaplink__target-room-list" aria-label="房间目标">
              {roomTargets.length > 0 ? (
                roomTargets
              ) : (
                <div className="dd-snaplink__target-room-empty">
                  <Users size={18} strokeWidth={1.8} aria-hidden="true" />
                  <span>{roomEmptyText}</span>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
