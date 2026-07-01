import { useState } from 'react'
import type { MouseEvent } from 'react'
import { MoreHorizontal } from 'lucide-react'

type PeerActionsMenuProps = {
  onSend: () => void
  onSendText: () => void
  onTrust: () => void
  onDetail: () => void
  trusted?: boolean
}

export function PeerActionsMenu({
  onSend,
  onSendText,
  onTrust,
  onDetail,
  trusted = false,
}: PeerActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  const runAction = (action: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setIsOpen(false)
    action()
  }

  return (
    <span className="dd-snaplink__peer-actions" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="dd-snaplink__peer-send" onClick={runAction(onSend)}>
        发送
      </button>
      <button
        type="button"
        className={`dd-snaplink__peer-more${isOpen ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="更多操作"
        onClick={(event) => {
          event.stopPropagation()
          setIsOpen((current) => !current)
        }}
      >
        <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {isOpen ? (
        <>
          <button
            type="button"
            className="dd-snaplink__peer-menu-backdrop"
            aria-label="关闭设备操作菜单"
            onClick={(event) => {
              event.stopPropagation()
              setIsOpen(false)
            }}
          />
          <span className="dd-snaplink__peer-menu" role="menu" aria-label="设备更多操作">
            <button type="button" role="menuitem" onClick={runAction(onSendText)}>
              发送文本
            </button>
            <button type="button" role="menuitem" onClick={runAction(onTrust)}>
              {trusted ? '查看指纹' : '信任此设备'}
            </button>
            <button type="button" role="menuitem" onClick={runAction(onDetail)}>
              设备详情
            </button>
          </span>
        </>
      ) : null}
    </span>
  )
}
