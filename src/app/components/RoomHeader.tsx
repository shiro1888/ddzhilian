import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Bot,
  Copy,
  FileClock,
  Image as ImageIcon,
  LogOut,
  MoreHorizontal,
  QrCode,
  ScanText,
  SquareTerminal,
} from 'lucide-react'

type RoomHeaderStat = {
  id: string
  label: string
  value: ReactNode
  tone?: 'default' | 'online' | 'transfer'
}

type RoomHeaderConnectionDetail = {
  id: string
  label: string
  value: ReactNode
  tone?: 'default' | 'safe' | 'warning'
}

type RoomHeaderProps = {
  roomCodeLabel: ReactNode
  peerLabel: string
  peerTitle: string
  stats?: RoomHeaderStat[]
  connectionDetails?: RoomHeaderConnectionDetail[]
  sharedContentCount: number
  isSharedContentOpen: boolean
  onCopyRoomId: () => void
  onToggleSharedContent: () => void
  onLeave: () => void
  onOpenAssistant?: () => void
  onOpenImageTool?: () => void
  onOpenOcr?: () => void
  onOpenCommandTool?: () => void
}

export function RoomHeader({
  roomCodeLabel,
  peerLabel,
  peerTitle,
  stats = [],
  connectionDetails = [],
  sharedContentCount,
  isSharedContentOpen,
  onCopyRoomId,
  onToggleSharedContent,
  onLeave,
  onOpenAssistant,
  onOpenImageTool,
  onOpenOcr,
  onOpenCommandTool,
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

  const toolItems = [
    onOpenAssistant
      ? {
          id: 'assistant',
          label: 'DD助手',
          icon: <Bot size={17} strokeWidth={2} aria-hidden="true" />,
          action: onOpenAssistant,
        }
      : null,
    onOpenImageTool
      ? {
          id: 'image',
          label: '图片工具',
          icon: <ImageIcon size={17} strokeWidth={2} aria-hidden="true" />,
          action: onOpenImageTool,
        }
      : null,
    onOpenOcr
      ? {
          id: 'ocr',
          label: '提取文字',
          icon: <ScanText size={17} strokeWidth={2} aria-hidden="true" />,
          action: onOpenOcr,
        }
      : null,
    onOpenCommandTool
      ? {
          id: 'command',
          label: '命令行',
          icon: <SquareTerminal size={17} strokeWidth={2} aria-hidden="true" />,
          action: onOpenCommandTool,
        }
      : null,
  ].filter((item): item is {
    id: string
    label: string
    icon: ReactNode
    action: () => void
  } => Boolean(item))

  return (
    <div className="dd-snaplink__room-head">
      <div className="dd-snaplink__room-head-main">
        <div className="dd-snaplink__room-left">
          <span className="dd-snaplink__room-title-block">
            <strong title={peerTitle}>{peerTitle || peerLabel}</strong>
            <small title={peerLabel}>
              <span className="dd-snaplink__status-dot" aria-hidden="true" />
              {peerLabel}
            </small>
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
              <MoreHorizontal size={20} strokeWidth={2.2} aria-hidden="true" />
            </button>
            {isMoreOpen ? (
              <div className="dd-snaplink__room-more-panel" role="dialog" aria-label="房间详情">
                <div className="dd-snaplink__room-more-hero">
                  <span className="dd-snaplink__room-more-code-card">
                    <QrCode size={22} strokeWidth={2.2} aria-hidden="true" />
                    <small>房间码</small>
                    <strong>{roomCodeLabel}</strong>
                  </span>
                  <span>
                    <strong>{peerTitle || peerLabel}</strong>
                    <small>{peerLabel}</small>
                  </span>
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
                {connectionDetails.length > 0 ? (
                  <div className="dd-snaplink__room-more-security" aria-label="连接与安全">
                    <strong>详情</strong>
                    <div>
                      {connectionDetails.map((item) => (
                        <span
                          key={item.id}
                          className={item.tone ? `is-${item.tone}` : undefined}
                        >
                          <small>{item.label}</small>
                          <em>{item.value}</em>
                        </span>
                      ))}
                    </div>
                    <p>技术信息：WebRTC 端到端直连 · 文件不经过服务器</p>
                  </div>
                ) : null}
                <div className="dd-snaplink__room-more-actions">
                  <button type="button" className="is-primary" onClick={() => handleMenuAction(onCopyRoomId)}>
                    <Copy size={16} strokeWidth={2.2} aria-hidden="true" />
                    {roomCodeLabel === '已复制' ? '房间码已复制' : '复制房间码'}
                  </button>
                  <button
                    type="button"
                    className={isSharedContentOpen ? 'is-active' : ''}
                    onClick={() => handleMenuAction(onToggleSharedContent)}
                  >
                    <FileClock size={16} strokeWidth={2.2} aria-hidden="true" />
                    历史内容
                    {sharedContentCount > 0 ? ` ${sharedContentCount.toString()}` : ''}
                  </button>
                  <button type="button" onClick={() => handleMenuAction(onLeave)}>
                    <LogOut size={16} strokeWidth={2.2} aria-hidden="true" />
                    离开房间
                  </button>
                </div>
                {toolItems.length > 0 ? (
                  <div className="dd-snaplink__room-more-tools" aria-label="常用工具">
                    {toolItems.map((item) => (
                      <button key={item.id} type="button" onClick={() => handleMenuAction(item.action)}>
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
