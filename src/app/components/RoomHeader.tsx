import { useEffect, useRef, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import {
  ChevronLeft,
  Copy,
  MoreHorizontal,
  QrCode,
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
  onCopyRoomId: () => void
  onBack?: () => void
}

export function RoomHeader({
  roomCodeLabel,
  roomCodeValue,
  roomShareValue,
  shareSubtitle,
  copyLabel = '复制房间码',
  copiedLabel = '已复制',
  technicalNote = '技术信息：连接方式与历史留存取决于房间类型',
  peerLabel,
  peerTitle,
  connectionDetails = [],
  onCopyRoomId,
  onBack,
}: RoomHeaderProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const moreRef = useRef<HTMLDivElement | null>(null)
  const displayRoomCode =
    roomCodeValue || (typeof roomCodeLabel === 'string' ? roomCodeLabel : '')
  const qrPayload = roomShareValue || displayRoomCode
  const isCopied = roomCodeLabel === '已复制'
  const detailRows = connectionDetails.slice(0, 3)
  const primaryConnectionDetail = detailRows[0]
  const secondaryConnectionDetails = detailRows.slice(1)

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

  return (
    <div className="dd-snaplink__room-head">
      <div className="dd-snaplink__room-head-main">
        <div className="dd-snaplink__room-left">
          {onBack ? (
            <button
              type="button"
              className="dd-snaplink__room-back-btn"
              aria-label="返回消息列表"
              onClick={onBack}
            >
              <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
          ) : null}
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
              className={`dd-snaplink__room-more-trigger${isMoreOpen ? ' is-active' : ''}`}
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
                <div className="dd-snaplink__room-more-primary">
                  <button type="button" className="is-primary" onClick={onCopyRoomId}>
                    <Copy size={16} strokeWidth={2.2} aria-hidden="true" />
                    {isCopied ? copiedLabel : copyLabel}
                  </button>
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
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {primaryConnectionDetail ? (
        <div
          className={`dd-snaplink__room-route is-${primaryConnectionDetail.tone ?? 'default'}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label="当前连接状态"
        >
          <span className="dd-snaplink__room-route-node is-local">
            <i aria-hidden="true" />
            此设备
          </span>
          <span className="dd-snaplink__room-route-track" aria-hidden="true">
            <i />
          </span>
          <span className="dd-snaplink__room-route-state">
            <small>{primaryConnectionDetail.label}</small>
            <strong>{primaryConnectionDetail.value}</strong>
          </span>
          <span className="dd-snaplink__room-route-track" aria-hidden="true">
            <i />
          </span>
          <span className="dd-snaplink__room-route-node is-peer" title={peerTitle || peerLabel}>
            <i aria-hidden="true" />
            {peerTitle || peerLabel}
          </span>
          {secondaryConnectionDetails.length > 0 ? (
            <span className="dd-snaplink__room-route-facts">
              {secondaryConnectionDetails.map((item) => (
                <span key={item.id} className={item.tone ? `is-${item.tone}` : undefined}>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </span>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
