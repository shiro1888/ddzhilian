import type { ReactNode } from 'react'

type TopStatusPill = {
  id: string
  label: ReactNode
  className?: string
}

type TopStatusBarProps = {
  title: string
  subtitle: string
  icon: ReactNode
  pills: TopStatusPill[]
  pillAriaLabel: string
  className?: string
}

export function TopStatusBar({
  title,
  subtitle,
  icon,
  pills,
  pillAriaLabel,
  className,
}: TopStatusBarProps) {
  return (
    <header className={['dd-snaplink__workbench-status', className ?? ''].filter(Boolean).join(' ')}>
      <div className="dd-snaplink__identity">
        <span className="dd-snaplink__identity-icon">
          {icon}
        </span>
        <span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
      </div>
      <div className="dd-snaplink__status-pills" aria-label={pillAriaLabel}>
        {pills.map((pill) => (
          <span key={pill.id} className={pill.className}>
            {pill.label}
          </span>
        ))}
      </div>
    </header>
  )
}
