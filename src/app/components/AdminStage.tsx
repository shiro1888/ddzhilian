/**
 * V1 admin stage — replaced by admin-v2 (Next.js standalone app).
 * Kept as a minimal stub to preserve the adminElement prop contract in App.tsx.
 */
export function AdminStage() {
  return (
    <section className="dd-admin-workbench">
      <p style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
        Admin UI 已迁移到 v2，请通过 <code>/admin</code> 访问。
      </p>
    </section>
  )
}
