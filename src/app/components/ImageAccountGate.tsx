import { useState } from 'react'
import type { FormEvent } from 'react'

type ImageAccountGateProps = {
  isLoading: boolean
  isSubmitting: boolean
  error: string | null
  onLogin: (email: string, password: string) => Promise<unknown>
  onRegister: (email: string, password: string) => Promise<{
    email?: string
    message?: string
    requiresEmailConfirmation?: boolean
  }>
}

type AccountMode = 'login' | 'register'

const imageAuthHighlights = [
  '历史与额度同步',
  '参考图按需上传',
    '传输仍走 DD直连记录',
] as const

const imageAuthSteps = [
  {
    title: '生成图片',
    description: '输入提示词或参考图，生成结果保存在账号历史中。',
  },
  {
    title: '本地确认',
    description: '下载、编辑或挑选图片后，再决定是否发送。',
  },
  {
    title: '直连分享',
    description: '通过附近设备或房间发送，传输状态进入 DD直连记录。',
  },
] as const

export function ImageAccountGate({
  isLoading,
  isSubmitting,
  error,
  onLogin,
  onRegister,
}: ImageAccountGateProps) {
  const [mode, setMode] = useState<AccountMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const isBusy = isLoading || isSubmitting
  const isRegistering = mode === 'register'
  const canSubmit =
    !isBusy &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    (!isRegistering || confirmPassword.length > 0)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLocalError(null)
    setLocalNotice(null)

    if (!email.trim()) {
      setLocalError('请输入邮箱。')
      return
    }

    if (password.length < 8) {
      setLocalError('密码至少 8 个字符。')
      return
    }

    if (isRegistering && !confirmPassword) {
      setLocalError('请再次输入密码。')
      return
    }

    if (isRegistering && confirmPassword !== password) {
      setLocalError('两次输入的密码不一致。')
      return
    }

    try {
      if (mode === 'login') {
        await onLogin(email.trim(), password)
      } else {
        const result = await onRegister(email.trim(), password)
        setMode('login')
        setPassword('')
        setConfirmPassword('')
        setLocalNotice(
          result.message ||
          `确认邮件已发送到 ${result.email || email.trim()}，请先完成邮箱确认后再登录。`,
        )
      }
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : '账号请求失败。')
    }
  }

  return (
    <section className="dd-image-auth-gate" aria-label="图片生成账号登录">
      <div className="dd-image-auth-shell">
        <div className="dd-image-auth-card">
          <div className="dd-image-auth-card__intro">
            <div className="dd-image-auth-kicker">
              <div className="dd-image-stage__mark" aria-hidden="true" />
              <span>AI 图片工作台</span>
            </div>
            <h2>{mode === 'login' ? '登录后同步生图历史' : '创建图片账号'}</h2>
            <p>
            图片账号只同步生成额度和历史记录；图片文件的发送、接收和进度，仍由 DD直连的传输记录管理。
            </p>

            <div className="dd-image-auth-facts" aria-label="图片工具说明">
              {imageAuthHighlights.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>

            <div className="dd-image-auth-flow" aria-label="图片生成到直连发送流程">
              {imageAuthSteps.map((item, index) => (
                <span key={item.title}>
                  <small>{(index + 1).toString().padStart(2, '0')}</small>
                  <strong>{item.title}</strong>
                  <em>{item.description}</em>
                </span>
              ))}
            </div>

            <div className="dd-image-auth-preview" aria-hidden="true">
              <span className="is-large" />
              <span />
              <span />
            </div>
          </div>

          <div className="dd-image-auth-card__form">
            <div className="dd-image-auth-form-head">
              <span>{mode === 'login' ? '账号登录' : '账号注册'}</span>
              <strong>{mode === 'login' ? '继续使用图片工具' : '开启图片历史同步'}</strong>
              <p>{mode === 'login' ? '登录后可读取图片额度、历史记录和参考图任务。' : '创建后需要按邮件提示完成确认，再回到这里登录。'}</p>
            </div>

            <div className="dd-image-auth-tabs" role="tablist" aria-label="账号操作">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                className={mode === 'login' ? 'is-active' : ''}
                disabled={isBusy}
                onClick={() => {
                  setMode('login')
                  setLocalError(null)
                  setLocalNotice(null)
                  setConfirmPassword('')
                }}
              >
                登录
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                className={mode === 'register' ? 'is-active' : ''}
                disabled={isBusy}
                onClick={() => {
                  setMode('register')
                  setLocalError(null)
                  setLocalNotice(null)
                  setConfirmPassword('')
                }}
              >
                注册
              </button>
            </div>

            <form className="dd-image-auth-form" onSubmit={handleSubmit}>
              <label>
                <span>邮箱</span>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={email}
                  disabled={isBusy}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label>
                <span>密码</span>
                <input
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="至少 8 个字符"
                  value={password}
                  disabled={isBusy}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {isRegistering ? (
                <label>
                  <span>确认密码</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="再次输入密码"
                    value={confirmPassword}
                    disabled={isBusy}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </label>
              ) : null}
              <button
                type="submit"
                className="dd-button dd-button--primary dd-image-auth-submit"
                disabled={!canSubmit}
              >
                {isSubmitting ? '处理中...' : mode === 'login' ? '登录图片工具' : '创建账号'}
              </button>
            </form>
            {localNotice ? <p className="dd-success-note">{localNotice}</p> : null}
            {localError || error ? <p className="dd-error-note">{localError ?? error}</p> : null}
            <p className="dd-image-auth-safe-note">
          图片生成需要账号；附近设备发现、文件直传和传输记录不依赖图片账号。
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
