import { useEffect, useRef, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
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

type RoomHeaderConnectionDetail = {
  id: string
  label: string
  value: ReactNode
  tone?: 'default' | 'safe' | 'warning'
}

type RoomHeaderProps = {
  roomCodeLabel: ReactNode
  roomCodeValue?: string
  roomShareValue?: string
  shareSubtitle?: string
  copyLabel?: string
  copiedLabel?: string
  technicalNote?: string
  peerLabel: string
  peerTitle: string
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
  roomCodeValue,
  roomShareValue,
  shareSubtitle,
  copyLabel = '复制房间码',
  copiedLabel = '已复制',
  technicalNote = '技术信息：WebRTC 端到端直连 · 文件不经过服务器',
  peerLabel,
  peerTitle,
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
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const moreRef = useRef<HTMLDivElement | null>(null)
  const displayRoomCode =
    roomCodeValue || (typeof roomCodeLabel === 'string' ? roomCodeLabel : '')
  const qrPayload = roomShareValue || displayRoomCode
  const isCopied = roomCodeLabel === '已复制'
  const detailRows = connectionDetails.slice(0, 3)

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

  useEffect(() => {
    let isCancelled = false

    if (!qrPayload) {
      return () => {
        isCancelled = true
      }
    }

    QRCode.toDataURL(qrPayload, {
      width: 152,
      margin: 1,
      color: {
        dark: '#111827',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!isCancelled) {
          setQrDataUrl(url)
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setQrDataUrl(null)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [qrPayload])

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
              aria-label="查看更多功能"
              onClick={() => setIsMoreOpen((current) => !current)}
            >
              <MoreHorizontal size={20} strokeWidth={2.2} aria-hidden="true" />
            </button>
            {isMoreOpen ? (
              <div className="dd-snaplink__room-more-panel" role="dialog" aria-label="更多功能">
                <div className="dd-snaplink__room-more-hero">
                  <span className="dd-snaplink__room-more-code-card">
                    {qrPayload && qrDataUrl ? (
                      <img src={qrDataUrl} alt={`房间码 ${displayRoomCode || '当前会话'} 的二维码`} />
                    ) : (
                      <QrCode size={22} strokeWidth={2.2} aria-hidden="true" />
                    )}
                  </span>
                  <span>
                    <strong>{peerTitle || peerLabel}</strong>
                    <small>{shareSubtitle ?? (displayRoomCode ? `房间码 ${displayRoomCode}` : peerLabel)}</small>
                  </span>
                </div>
                {detailRows.length > 0 ? (
                  <div className="dd-snaplink__room-more-security" aria-label="连接与安全">
                    <strong>详情</strong>
                    <div>
                      {detailRows.map((item) => (
                        <span
                          key={item.id}
                          className={item.tone ? `is-${item.tone}` : undefined}
                        >
                          <small>{item.label}</small>
                          <em>{item.value}</em>
                        </span>
                      ))}
                    </div>
                    <p>{technicalNote}</p>
                  </div>
                ) : null}
                <div className="dd-snaplink__room-more-actions">
                  <button type="button" className="is-primary" onClick={() => handleMenuAction(onCopyRoomId)}>
                    <Copy size={16} strokeWidth={2.2} aria-hidden="true" />
                    {isCopied ? copiedLabel : copyLabel}
                  </button>
                  <button
                    type="button"
                    className={`is-secondary${isSharedContentOpen ? ' is-active' : ''}`}
                    onClick={() => handleMenuAction(onToggleSharedContent)}
                  >
                    <FileClock size={16} strokeWidth={2.2} aria-hidden="true" />
                    传输记录
                    {sharedContentCount > 0 ? ` ${sharedContentCount.toString()}` : ''}
                  </button>
                  <button type="button" className="is-secondary" onClick={() => handleMenuAction(onLeave)}>
                    <LogOut size={16} strokeWidth={2.2} aria-hidden="true" />
                    回到列表
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
