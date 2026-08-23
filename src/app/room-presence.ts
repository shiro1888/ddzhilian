import type { RoomListItem } from './types'

export function getRoomPeerOnlineCount(room: RoomListItem) {
  const memberCount = Math.max(room.memberCount, 0)
  const peerCapacity = Math.max(memberCount - 1, 0)

  return Math.min(peerCapacity, Math.max(room.onlineCount, 0))
}

export function getRoomOnlineMemberCount(room: RoomListItem) {
  const memberCount = Math.max(room.memberCount, 0)

  if (memberCount === 0) {
    return 0
  }

  return Math.min(memberCount, getRoomPeerOnlineCount(room) + 1)
}

export function resolveRoomPeerPresenceLabel(room: RoomListItem) {
  const peerOnlineCount = getRoomPeerOnlineCount(room)

  return peerOnlineCount > 0
    ? `${peerOnlineCount.toString()} 台对端在线`
    : '仅本机在线'
}
