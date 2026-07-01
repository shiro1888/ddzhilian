import { Bot, Users } from 'lucide-react'

import type { RoomListItem } from '../types'
import { EmptyState } from './EmptyState'
import { RoomCard } from './RoomCard'

type RoomsPageVariant = 'compact' | 'full'

type RoomsPageProps = {
  variant?: RoomsPageVariant
  rooms: RoomListItem[]
  totalRoomCount: number
  publicRoomCount: number
  roomJoinDraft: string
  roomJoinError: string | null
  onCreatePublicRoom: () => void
  onJoinDraftChange: (value: string) => void
  onJoinRoomSubmit: () => void
  onOpenRoom: (roomId: string) => void
  onToggleRoomPinned: (room: RoomListItem) => void
  onOpenAssistant?: () => void
}

export function RoomsPage({
  variant = 'compact',
  rooms,
  totalRoomCount,
  publicRoomCount,
  roomJoinDraft,
  roomJoinError,
  onCreatePublicRoom,
  onJoinDraftChange,
  onJoinRoomSubmit,
  onOpenRoom,
  onToggleRoomPinned,
  onOpenAssistant,
}: RoomsPageProps) {
  const isFull = variant === 'full'
  const publicRoom = rooms.find((room) => room.isPublic)
  const canJoinRoom = roomJoinDraft.trim().length > 0
  const hasConversationRows = rooms.length > 0 || Boolean(onOpenAssistant)

  return (
    <section
      className={`dd-snaplink__workbench-rooms dd-snaplink__workbench-page is-rooms${isFull ? ' is-full' : ''}`}
      aria-label="房间"
    >
      <div className="dd-snaplink__section-head">
        <span>
          <strong>消息</strong>
          <small>
            {totalRoomCount > 0
              ? `${publicRoomCount.toString()} 个公共 · ${totalRoomCount.toString()} 个会话`
              : '世界对话、房间和设备会话会显示在这里'}
          </small>
        </span>
        {rooms[0] ? (
          <button type="button" onClick={() => onOpenRoom(rooms[0].roomId)}>
            进入最近
          </button>
        ) : null}
      </div>
      {isFull ? (
        <div className="dd-snaplink__room-actions-panel" aria-label="房间操作">
          <div className="dd-snaplink__room-action-card">
            <span className="dd-snaplink__room-action-icon">
              <Users size={19} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <span>
              <strong>公共房间</strong>
              <small>
                {publicRoom
                  ? '公共房间已创建，进入后可复制短码分享给别人。'
                  : '创建一个可分享短码的房间，用来收发文件和文本。'}
              </small>
            </span>
            <button
              type="button"
              onClick={publicRoom ? () => onOpenRoom(publicRoom.roomId) : onCreatePublicRoom}
            >
              {publicRoom ? '进入房间' : '创建房间'}
            </button>
          </div>
          <form
            className="dd-snaplink__room-join-card"
            onSubmit={(event) => {
              event.preventDefault()
              onJoinRoomSubmit()
            }}
          >
            <label>
              <span>加入房间</span>
              <input
                value={roomJoinDraft}
                placeholder="输入房间短码"
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={Boolean(roomJoinError)}
                onChange={(event) => onJoinDraftChange(event.target.value)}
              />
            </label>
            <button type="submit" disabled={!canJoinRoom}>加入</button>
            {roomJoinError ? <p>{roomJoinError}</p> : null}
          </form>
        </div>
      ) : null}
      {hasConversationRows ? (
        <div className="dd-snaplink__workbench-room-list">
          {onOpenAssistant ? (
            <article className="dd-snaplink__workbench-room is-assistant is-pinned">
              <button
                type="button"
                className="dd-snaplink__workbench-room-open"
                onClick={onOpenAssistant}
                title="打开 DD助手"
              >
                <span className="dd-snaplink__workbench-room-avatar is-assistant" aria-hidden="true">
                  <Bot size={18} strokeWidth={1.9} />
                </span>
                <span className="dd-snaplink__workbench-room-main">
                  <span className="dd-snaplink__workbench-room-title">
                    <strong>DD助手</strong>
                    <em>置顶</em>
                  </span>
                  <span className="dd-snaplink__workbench-room-preview">总结传输记录，生成文件说明</span>
                </span>
                <span className="dd-snaplink__workbench-room-side">
                  <small>刚刚</small>
                </span>
              </button>
            </article>
          ) : null}
          {rooms.map((room) => (
            <RoomCard
              key={room.roomId}
              room={room}
              onOpen={onOpenRoom}
              onTogglePinned={onToggleRoomPinned}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          className="dd-snaplink__workbench-room-empty"
          icon={<Users size={22} strokeWidth={1.8} aria-hidden="true" />}
          title="暂无房间"
          description={<span>创建或加入公共房间后，会出现在这里。</span>}
          actions={(
            <div className="dd-snaplink__empty-actions" aria-label="房间快捷操作">
              <button type="button" onClick={onCreatePublicRoom}>
                创建房间
              </button>
            </div>
          )}
        />
      )}
    </section>
  )
}
