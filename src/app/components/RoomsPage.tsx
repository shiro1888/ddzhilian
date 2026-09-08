import { useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'

import type { OnlineDeviceListItem, RoomListItem } from '../types'
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
  deviceConversations?: OnlineDeviceListItem[]
  onOpenDeviceConversation?: (deviceId: string) => void
}

function getConversationInitial(value: string, fallback: string) {
  const normalizedValue = value.trim()
  return (normalizedValue ? Array.from(normalizedValue)[0] : fallback).toUpperCase()
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
  deviceConversations = [],
  onOpenDeviceConversation,
}: RoomsPageProps) {
  const isFull = variant === 'full'
  const publicRoom = rooms.find((room) => room.isPublic)
  const canJoinRoom = roomJoinDraft.trim().length > 0
  const [conversationQuery, setConversationQuery] = useState('')
  const normalizedConversationQuery = conversationQuery.trim().toLowerCase()
  const filteredRooms = useMemo(() => {
    if (!normalizedConversationQuery) {
      return rooms
    }

    return rooms.filter((room) =>
      [
        room.title,
        room.previewText,
        room.roomId,
        room.isPublic ? '公共 世界对话' : '房间 会话',
      ].filter(Boolean).join(' ').toLowerCase().includes(normalizedConversationQuery),
    )
  }, [normalizedConversationQuery, rooms])
  const filteredDeviceConversations = useMemo(() => {
    if (!normalizedConversationQuery) {
      return deviceConversations
    }

    return deviceConversations.filter((device) =>
      [
        device.deviceName,
        device.platform,
        device.scopeLabel,
        device.shortCode,
        '设备 私聊 附近',
      ].filter(Boolean).join(' ').toLowerCase().includes(normalizedConversationQuery),
    )
  }, [deviceConversations, normalizedConversationQuery])
  const hasDeviceConversations = filteredDeviceConversations.length > 0 && Boolean(onOpenDeviceConversation)
  const hasRawConversationRows = rooms.length > 0 || (deviceConversations.length > 0 && Boolean(onOpenDeviceConversation))
  const hasConversationRows = filteredRooms.length > 0 || hasDeviceConversations

  return (
    <section
      className={`dd-snaplink__workbench-rooms dd-snaplink__workbench-page is-rooms${isFull ? ' is-full' : ''}`}
      aria-label="房间"
    >
      <div className="dd-snaplink__section-head">
        <span>
          <strong>会话</strong>
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
                  ? '已创建，可复制短码邀请他人加入。'
                  : '创建共享空间，快捷收发文件与文本。'}
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
      {hasRawConversationRows ? (
        <label className="dd-snaplink__room-search">
          <Search size={15} strokeWidth={2} aria-hidden="true" />
          <span className="sr-only">搜索会话或设备</span>
          <input
            value={conversationQuery}
            placeholder="搜索会话或设备"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setConversationQuery(event.target.value)}
          />
          {conversationQuery ? (
            <button
              type="button"
              className="dd-snaplink__room-search-clear"
              aria-label="清空搜索"
              title="清空搜索"
              onClick={() => setConversationQuery('')}
            >
              ×
            </button>
          ) : (
            <kbd className="dd-snaplink__room-search-kbd" aria-hidden="true">
              ⌘K
            </kbd>
          )}
        </label>
      ) : null}
      {hasConversationRows ? (
        <div className="dd-snaplink__workbench-room-list">
          {filteredRooms.map((room) => (
            <RoomCard
              key={room.roomId}
              room={room}
              onOpen={onOpenRoom}
              onTogglePinned={onToggleRoomPinned}
            />
          ))}
          {onOpenDeviceConversation
            ? filteredDeviceConversations.map((device) => (
                <article key={device.deviceId} className="dd-snaplink__workbench-room is-device has-avatar">
                  <button
                    type="button"
                    className="dd-snaplink__workbench-room-open"
                    onClick={() => onOpenDeviceConversation(device.deviceId)}
                    title={`打开 ${device.deviceName} 的设备会话`}
                  >
                    <span className="dd-snaplink__workbench-room-avatar is-device" aria-hidden="true">
                      {getConversationInitial(device.deviceName, '设')}
                      <i className="is-online" />
                    </span>
                    <span className="dd-snaplink__workbench-room-main">
                      <span className="dd-snaplink__workbench-room-title">
                        <strong>{device.deviceName}</strong>
                      </span>
                      <span className="dd-snaplink__workbench-room-preview">
                        {device.scopeLabel || device.platform || '附近设备'} · {device.lastSeenLabel || '在线'}
                      </span>
                    </span>
                    <span className="dd-snaplink__workbench-room-side">
                      <small>在线</small>
                    </span>
                  </button>
                </article>
              ))
            : null}
        </div>
      ) : (
        <EmptyState
          className="dd-snaplink__workbench-room-empty"
          icon={<Users size={22} strokeWidth={1.8} aria-hidden="true" />}
          title={normalizedConversationQuery ? `没有匹配「${conversationQuery.trim()}」的会话或设备` : '暂无房间'}
          description={(
            <span>
              {normalizedConversationQuery
                ? '换个关键词试试，或清空搜索恢复全部列表。'
                : '创建或加入公共房间后，会出现在这里。'}
            </span>
          )}
          actions={(
            <div className="dd-snaplink__empty-actions" aria-label="房间快捷操作">
              {normalizedConversationQuery ? (
                <button type="button" onClick={() => setConversationQuery('')}>
                  清空搜索
                </button>
              ) : (
                <button type="button" onClick={onCreatePublicRoom}>
                  创建房间
                </button>
              )}
            </div>
          )}
        />
      )}
      {isFull ? (
        <details className="dd-snaplink__mobile-room-actions">
          <summary>
            <span>
              <strong>房间工具</strong>
              <small>创建或加入公共房间</small>
            </span>
          </summary>
          <div className="dd-snaplink__mobile-room-actions-body">
            <button
              type="button"
              className="dd-snaplink__mobile-room-create"
              onClick={publicRoom ? () => onOpenRoom(publicRoom.roomId) : onCreatePublicRoom}
            >
              {publicRoom ? '进入公共房间' : '创建公共房间'}
            </button>
            <form
              className="dd-snaplink__mobile-room-join"
              onSubmit={(event) => {
                event.preventDefault()
                onJoinRoomSubmit()
              }}
            >
              <input
                value={roomJoinDraft}
                placeholder="输入房间短码"
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={Boolean(roomJoinError)}
                aria-label="输入房间短码"
                onChange={(event) => onJoinDraftChange(event.target.value)}
              />
              <button type="submit" disabled={!canJoinRoom}>加入</button>
              {roomJoinError ? <p>{roomJoinError}</p> : null}
            </form>
          </div>
        </details>
      ) : null}
    </section>
  )
}
