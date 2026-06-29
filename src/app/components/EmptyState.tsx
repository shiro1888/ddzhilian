import type { ReactNode } from 'react'

type EmptyStateProps = {
  className: string
  icon?: ReactNode
  title: string
  description?: ReactNode
  actions?: ReactNode
}

export function EmptyState({
  className,
  icon,
  title,
  description,
  actions,
}: EmptyStateProps) {
  return (
    <div className={className}>
      {icon}
      <strong>{title}</strong>
      {description}
      {actions}
    </div>
  )
}
