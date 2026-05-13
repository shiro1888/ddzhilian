export function AdminSkeletonBlock({ rows = 3 }: { rows?: number }) {
  return (
    <section className="dd-admin-skeleton" aria-label="正在加载">
      {Array.from({ length: rows }).map((_, index) => (
        <span key={index} />
      ))}
    </section>
  )
}

export function AdminTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="dd-admin-table-skeleton" aria-label="正在加载表格">
      {Array.from({ length: rows }).map((_, index) => (
        <span key={index} />
      ))}
    </div>
  )
}

