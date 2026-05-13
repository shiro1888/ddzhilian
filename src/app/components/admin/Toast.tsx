import type { AdminToast } from '../../../lib/use-admin'

export function AdminToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: AdminToast[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="dd-admin-toast-viewport" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`dd-admin-toast is-${toast.kind}`}
          onClick={() => onDismiss(toast.id)}
        >
          <strong>{toast.kind === 'success' ? '完成' : '错误'}</strong>
          <span>{toast.message}</span>
        </button>
      ))}
    </div>
  )
}

