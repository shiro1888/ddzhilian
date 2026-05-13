import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'

export function AdminLogin({
  adminEmailDraft,
  adminPasswordDraft,
  adminError,
  isAdminLoading,
  isAdminLoginTransitioning,
  onAdminEmailDraftChange,
  onAdminPasswordDraftChange,
  onConnect,
}: {
  adminEmailDraft: string
  adminPasswordDraft: string
  adminError: string | null
  isAdminLoading: boolean
  isAdminLoginTransitioning: boolean
  onAdminEmailDraftChange: (value: string) => void
  onAdminPasswordDraftChange: (value: string) => void
  onConnect: () => void
}) {
  const isLoginLocked = isAdminLoading || isAdminLoginTransitioning

  return (
    <section className={`dd-admin-login-layout${isAdminLoginTransitioning ? ' is-auth-exiting' : ''}`}>
      <div className="dd-admin-login-surface">
        <div className="dd-admin-login-card dd-admin-login-card--full">
          <div className="dd-admin-login-card__copy">
            <h2>进入后台控制台</h2>
          </div>
          <div className="dd-admin-login-card__form">
            <Input
              type="email"
              placeholder="管理员邮箱"
              value={adminEmailDraft}
              onChange={(event) => onAdminEmailDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onConnect()
                }
              }}
            />
            <Input
              type="password"
              placeholder="账号密码"
              value={adminPasswordDraft}
              onChange={(event) => onAdminPasswordDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onConnect()
                }
              }}
            />
            <Button
              type="button"
              className="dd-button dd-button--primary"
              disabled={isLoginLocked || !adminEmailDraft.trim() || !adminPasswordDraft.trim()}
              onClick={onConnect}
            >
              {isAdminLoginTransitioning ? '正在进入...' : isAdminLoading ? '登录中...' : '进入后台'}
            </Button>
          </div>
          {adminError ? <p className="dd-error-note">{adminError}</p> : null}
        </div>
      </div>
    </section>
  )
}

