type SkeletonRowsProps = {
  count?: 3 | 4
  label: string
}

const skeletonRowKeys = ['skeleton-row-1', 'skeleton-row-2', 'skeleton-row-3', 'skeleton-row-4'] as const

export function SkeletonRows({ count = 3, label }: SkeletonRowsProps) {
  return (
    <div className="dd-snaplink__skeleton-list" role="status" aria-live="polite" aria-label={label}>
      <span className="dd-snaplink__skeleton-label">{label}</span>
      {skeletonRowKeys.slice(0, count).map((key) => (
        <article key={key} className="dd-snaplink__device-skeleton" aria-hidden="true">
          <span className="dd-snaplink__device-skeleton-icon" />
          <span className="dd-snaplink__device-skeleton-copy">
            <span className="is-title" />
            <span className="is-meta" />
            <span className="is-short" />
          </span>
          <span className="dd-snaplink__device-skeleton-actions">
            <span />
            <span />
          </span>
        </article>
      ))}
    </div>
  )
}
