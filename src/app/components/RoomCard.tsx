import type { RoomListItem } from '../types'
import { getRoomPeerOnlineCount, resolveRoomPeerPresenceLabel } from '../room-presence'

type RoomCardProps = {
  room: RoomListItem
  onOpen: (roomId: string) => void
  onTogglePinned: (room: RoomListItem) => void
}

export function RoomCard({ room, onOpen, onTogglePinned }: RoomCardProps) {
  const avatarLabel = room.isPublic ? '世' : Array.from(room.title.trim() || '房')[0]
  const peerOnlineCount = getRoomPeerOnlineCount(room)
  const peerPresenceLabel = resolveRoomPeerPresenceLabel(room)

  return (
    <article
      className={[
        'dd-snaplink__workbench-room',
        room.isPublic ? 'is-public' : '',
        room.unreadCount > 0 ? 'has-unread' : '',
        room.pinned ? 'is-pinned' : '',
        'has-avatar',
      ].filter(Boolean).join(' ')}
      onContextMenu={(event) => {
        event.preventDefault()
        onTogglePinned(room)
      }}
    >
      <button
        type="button"
        className="dd-snaplink__workbench-room-open"
        onClick={() => onOpen(room.roomId)}
        title={`进入${room.title}`}
      >
        <span className="dd-snaplink__workbench-room-avatar" aria-hidden="true">
          {avatarLabel}
          <i className={peerOnlineCount > 0 ? 'is-online' : ''} />
        </span>
        <span className="dd-snaplink__workbench-room-main">
          <span className="dd-snaplink__workbench-room-title">
            <strong>{room.title}</strong>
            <em>{room.isPublic ? '公共' : '房间'}</em>
            {room.pinned ? <em className="is-pinned">置顶</em> : null}
          </span>
          <span className="dd-snaplink__workbench-room-preview">{room.previewText || '暂无消息'}</span>
        </span>
        <span className="dd-snaplink__workbench-room-side">
          <small>{room.updatedAtLabel}</small>
          {room.unreadCount > 0 ? (
            <strong>{room.unreadCount > 99 ? '99+' : room.unreadCount}</strong>
          ) : (
            <em>{peerPresenceLabel}</em>
          )}
        </span>
      </button>
      <button
        type="button"
        className="dd-snaplink__workbench-room-pin"
        aria-pressed={room.pinned}
        title={room.pinned ? '取消置顶房间' : '置顶房间'}
        onClick={() => onTogglePinned(room)}
      >
        {room.pinned ? '取消置顶' : '置顶'}
      </button>
    </article>
  )
}
