import { useState } from 'react'
import type { FormEvent } from 'react'

type ImageAccountGateProps = {
  isLoading: boolean
  isSubmitting: boolean
  error: string | null
  onLogin: (email: string, password: string) => Promise<unknown>
  onRegister: (email: string, password: string, inviteCode: string) => Promise<unknown>
}

type AccountMode = 'login' | 'register'

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
  const [inviteCode, setInviteCode] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const isBusy = isLoading || isSubmitting
  const isRegistering = mode === 'register'
  const canSubmit =
    !isBusy &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    (!isRegistering || (confirmPassword.length > 0 && inviteCode.trim().length > 0))

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLocalError(null)

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

    if (isRegistering && !inviteCode.trim()) {
      setLocalError('请输入邀请码。')
      return
    }

    try {
      if (mode === 'login') {
        await onLogin(email.trim(), password)
      } else {
        await onRegister(email.trim(), password, inviteCode.trim())
      }
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : '账号请求失败。')
    }
  }

  return (
    <section className="dd-image-auth-gate" aria-label="图片生成账号登录">
      <div className="dd-image-auth-card">
        <div className="dd-image-stage__mark" aria-hidden="true" />
        <h2>{mode === 'login' ? '登录后生图' : '注册账号'}</h2>
        <p>图片生成和历史记录会绑定到当前账号。</p>
        <div className="dd-image-auth-tabs" role="tablist" aria-label="账号操作">
          <button
            type="button"
            className={mode === 'login' ? 'is-active' : ''}
            disabled={isBusy}
            onClick={() => {
              setMode('login')
              setLocalError(null)
              setConfirmPassword('')
              setInviteCode('')
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'is-active' : ''}
            disabled={isBusy}
            onClick={() => {
              setMode('register')
              setLocalError(null)
              setConfirmPassword('')
              setInviteCode('')
            }}
          >
            注册
          </button>
        </div>
        <form className="dd-image-auth-form" onSubmit={handleSubmit}>
          <input
            type="email"
            autoComplete="email"
            placeholder="邮箱"
            value={email}
            disabled={isBusy}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="密码"
            value={password}
            disabled={isBusy}
            onChange={(event) => setPassword(event.target.value)}
          />
          {isRegistering ? (
            <input
              type="password"
              autoComplete="new-password"
              placeholder="确认密码"
              value={confirmPassword}
              disabled={isBusy}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          ) : null}
          {isRegistering ? (
            <input
              type="text"
              autoComplete="off"
              placeholder="邀请码"
              value={inviteCode}
              disabled={isBusy}
              onChange={(event) => setInviteCode(event.target.value)}
            />
          ) : null}
          <button
            type="submit"
            className="dd-button dd-button--primary"
            disabled={!canSubmit}
          >
            {isSubmitting ? '处理中...' : mode === 'login' ? '登录' : '创建账号'}
          </button>
        </form>
        {localError || error ? <p className="dd-error-note">{localError ?? error}</p> : null}
      </div>
    </section>
  )
}
