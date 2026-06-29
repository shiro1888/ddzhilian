import type { ReactNode } from 'react'

type RoomHeaderStat = {
  id: string
  label: string
  value: ReactNode
  tone?: 'default' | 'online' | 'transfer'
}

type RoomHeaderProps = {
  roomCodeLabel: ReactNode
  peerLabel: string
  peerTitle: string
  stats?: RoomHeaderStat[]
  sharedContentCount: number
  isSharedContentOpen: boolean
  onCopyRoomId: () => void
  onToggleSharedContent: () => void
  onLeave: () => void
}

export function RoomHeader({
  roomCodeLabel,
  peerLabel,
  peerTitle,
  stats = [],
  sharedContentCount,
  isSharedContentOpen,
  onCopyRoomId,
  onToggleSharedContent,
  onLeave,
}: RoomHeaderProps) {
  return (
    <div className="dd-snaplink__room-head">
      <div className="dd-snaplink__room-head-main">
        <div className="dd-snaplink__room-left">
          <button
            type="button"
            className="dd-snaplink__room-code"
            title="点击复制 roomId"
            onClick={onCopyRoomId}
          >
            {roomCodeLabel}
          </button>
          <span className="dd-snaplink__status-dot" aria-hidden="true" />
          <span className="dd-snaplink__peer" title={peerTitle}>
            {peerLabel}
          </span>
        </div>
        <div className="dd-snaplink__room-actions">
          <button
            type="button"
            className={isSharedContentOpen ? 'is-active' : ''}
            aria-expanded={isSharedContentOpen}
            aria-label="查看历史文件、媒体和链接"
            onClick={onToggleSharedContent}
          >
            历史内容
            {sharedContentCount > 0 ? ` ${sharedContentCount.toString()}` : ''}
          </button>
          <button type="button" onClick={onLeave}>
            离开
          </button>
        </div>
      </div>
      {stats.length > 0 ? (
        <div className="dd-snaplink__room-meta-strip" aria-label="房间状态">
          {stats.map((item) => (
            <span
              key={item.id}
              className={item.tone ? `is-${item.tone}` : undefined}
            >
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
