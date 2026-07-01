import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

type ConnDetail = {
  id: string
  label: ReactNode
}

type StatusPillsCollapsibleProps = {
  summary: ReactNode
  details: ConnDetail[]
  online?: boolean
  ariaLabel?: string
}

export function StatusPillsCollapsible({
  summary,
  details,
  online = true,
  ariaLabel = '连接状态',
}: StatusPillsCollapsibleProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="dd-snaplink__conn" aria-label={ariaLabel}>
      <button
        type="button"
        className={`dd-snaplink__conn-chip${isOpen ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span
          className={`dd-snaplink__conn-dot${online ? ' is-online' : ''}`}
          aria-hidden="true"
        />
        <span className="dd-snaplink__conn-summary">{summary}</span>
        <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
      </button>
      {isOpen ? (
        <>
          <button
            type="button"
            className="dd-snaplink__conn-backdrop"
            aria-label="关闭连接详情"
            onClick={() => setIsOpen(false)}
          />
          <span className="dd-snaplink__conn-menu" role="list" aria-label="连接方式">
            {details.map((detail) => (
              <span key={detail.id} className="dd-snaplink__conn-item" role="listitem">
                {detail.label}
              </span>
            ))}
          </span>
        </>
      ) : null}
    </div>
  )
}
