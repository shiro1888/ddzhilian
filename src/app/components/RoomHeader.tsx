import { useEffect, useRef, useState, type ReactNode } from 'react'

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
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isMoreOpen) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (moreRef.current?.contains(event.target as Node)) {
        return
      }

      setIsMoreOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMoreOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMoreOpen])

  const handleMenuAction = (action: () => void) => {
    setIsMoreOpen(false)
    action()
  }

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
          <div ref={moreRef} className="dd-snaplink__room-more">
            <button
              type="button"
              className={`dd-snaplink__room-more-trigger${isMoreOpen || isSharedContentOpen ? ' is-active' : ''}`}
              aria-expanded={isMoreOpen}
              aria-label="查看房间详情和更多操作"
              onClick={() => setIsMoreOpen((current) => !current)}
            >
              更多
            </button>
            {isMoreOpen ? (
              <div className="dd-snaplink__room-more-panel" role="dialog" aria-label="房间详情">
                <div className="dd-snaplink__room-more-head">
                  <strong>房间详情</strong>
                  <span>{peerTitle}</span>
                </div>
                {stats.length > 0 ? (
                  <div className="dd-snaplink__room-more-stats" aria-label="房间状态">
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
                <div className="dd-snaplink__room-more-actions">
                  <button type="button" onClick={() => handleMenuAction(onCopyRoomId)}>
                    {roomCodeLabel === '已复制' ? '房间码已复制' : '复制房间码'}
                  </button>
                  <button
                    type="button"
                    className={isSharedContentOpen ? 'is-active' : ''}
                    onClick={() => handleMenuAction(onToggleSharedContent)}
                  >
                    历史内容
                    {sharedContentCount > 0 ? ` ${sharedContentCount.toString()}` : ''}
                  </button>
                  <button type="button" onClick={() => handleMenuAction(onLeave)}>
                    离开房间
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
