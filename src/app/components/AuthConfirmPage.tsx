'use client'

import { useEffect, useState } from 'react'

type ConfirmViewState =
  | {
      kind: 'loading'
      title: string
      message: string
    }
  | {
      kind: 'action'
      title: string
      message: string
      confirmationUrl: string
    }
  | {
      kind: 'success'
      title: string
      message: string
    }
  | {
      kind: 'error'
      title: string
      message: string
    }
  | {
      kind: 'idle'
      title: string
      message: string
    }

const authConfirmLandingPath = '/auth/confirm'
const authPostConfirmPath = '/image'

function appendForwardedParam(url: URL, params: URLSearchParams, name: string) {
  const value = params.get(name)
  if (value && !url.searchParams.has(name)) {
    url.searchParams.set(name, value)
  }
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function buildAccountConfirmUrl(
  origin: string,
  tokenHash: string,
  type: string | null | undefined,
  nextPath: string | null | undefined,
) {
  const url = new URL('/api/auth/confirm', origin)
  url.searchParams.set('token_hash', tokenHash)
  url.searchParams.set('type', type?.trim() || 'email')
  url.searchParams.set('next', normalizeLocalNextPath(nextPath))
  return url.toString()
}

function normalizeLocalNextPath(value: string | null | undefined) {
  const normalizedValue = value?.trim()
  if (!normalizedValue || !normalizedValue.startsWith('/') || normalizedValue.startsWith('//')) {
    return authPostConfirmPath
  }

  return normalizedValue
}

function normalizeConfirmationUrl(params: URLSearchParams, origin: string) {
  const directTokenHash =
    params.get('token_hash')?.trim() ||
    params.get('tokenHash')?.trim() ||
    params.get('token')?.trim()
  if (directTokenHash) {
    return buildAccountConfirmUrl(
      origin,
      directTokenHash,
      params.get('type'),
      params.get('next') || params.get('redirect_to'),
    )
  }

  const rawUrl = params.get('confirmation_url')?.trim()
  if (!rawUrl) {
    return null
  }

  const candidateUrls = [
    rawUrl,
    safeDecodeURIComponent(rawUrl),
    safeDecodeURIComponent(safeDecodeURIComponent(rawUrl)),
  ]

  for (const candidateUrl of candidateUrls) {
    try {
      const url = new URL(candidateUrl)
      if (!isSupabaseVerificationUrl(url)) {
        continue
      }

      appendForwardedParam(url, params, 'token')
      appendForwardedParam(url, params, 'token_hash')
      appendForwardedParam(url, params, 'type')
      appendForwardedParam(url, params, 'redirect_to')
      const tokenHash =
        url.searchParams.get('token_hash')?.trim() ||
        url.searchParams.get('token')?.trim()
      if (tokenHash) {
        return buildAccountConfirmUrl(
          origin,
          tokenHash,
          url.searchParams.get('type') || params.get('type'),
          params.get('next') || url.searchParams.get('redirect_to'),
        )
      }

      if (!url.searchParams.has('redirect_to')) {
        url.searchParams.set('redirect_to', new URL(authConfirmLandingPath, origin).toString())
      }
      return url.toString()
    } catch {
      // Some email clients split the nested confirmation URL query string onto
      // the landing page URL, so keep trying the decoded variants above.
    }
  }

  return null
}

function isSupabaseVerificationUrl(url: URL) {
  return url.protocol === 'https:' && url.pathname === '/auth/v1/verify'
}

function readAuthError(params: URLSearchParams) {
  const description = params.get('error_description') || params.get('error')
  return description ? safeDecodeURIComponent(description.replaceAll('+', ' ')) : null
}

function hasSupabaseSessionSignal(params: URLSearchParams) {
  return (
    params.has('access_token') ||
    params.has('refresh_token') ||
    params.has('code')
  )
}

function shouldCleanUrl(searchParams: URLSearchParams, hashParams: URLSearchParams) {
  return (
    hasSupabaseSessionSignal(searchParams) ||
    hasSupabaseSessionSignal(hashParams) ||
    Boolean(readAuthError(searchParams)) ||
    Boolean(readAuthError(hashParams))
  )
}

function resolveConfirmViewState(location: Location): ConfirmViewState {
  const searchParams = new URLSearchParams(location.search)
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''))
  const errorMessage = readAuthError(hashParams) || readAuthError(searchParams)

  if (errorMessage) {
    return {
      kind: 'error',
      title: '邮箱确认失败',
      message: errorMessage,
    }
  }

  const confirmationUrl = normalizeConfirmationUrl(searchParams, location.origin)
  if (confirmationUrl) {
    return {
      kind: 'action',
      title: '正在确认邮箱',
      message: '正在完成邮箱验证，稍后会进入图片生成页。',
      confirmationUrl,
    }
  }

  if (searchParams.has('confirmation_url')) {
    return {
      kind: 'error',
      title: '确认链接无效',
      message: '当前确认链接格式无法识别，请从最新的确认邮件重新进入。若仍失败，请重新注册发送新的确认邮件。',
    }
  }

  if (hasSupabaseSessionSignal(hashParams) || hasSupabaseSessionSignal(searchParams)) {
    return {
      kind: 'success',
      title: '邮箱已确认',
      message: '邮箱验证已完成，正在前往图片生成登录页。',
    }
  }

  return {
    kind: 'idle',
    title: '等待邮箱确认',
    message: '请从 ddzhilian 发出的注册确认或登录确认邮件进入此页面。',
  }
}

export function AuthConfirmPage() {
  const [viewState, setViewState] = useState<ConfirmViewState>({
    kind: 'loading',
    title: '正在读取确认状态',
    message: '请稍候。',
  })

  useEffect(() => {
    let isActive = true
    let redirectTimer: number | undefined

    const timer = window.setTimeout(() => {
      if (!isActive) {
        return
      }

      const nextViewState = resolveConfirmViewState(window.location)
      setViewState(nextViewState)

      const searchParams = new URLSearchParams(window.location.search)
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      if (shouldCleanUrl(searchParams, hashParams)) {
        window.history.replaceState(null, document.title, authConfirmLandingPath)
      }

      if (nextViewState.kind === 'action') {
        redirectTimer = window.setTimeout(() => {
          if (isActive) {
            window.location.replace(nextViewState.confirmationUrl)
          }
        }, 300)
        return
      }

      if (nextViewState.kind === 'success') {
        redirectTimer = window.setTimeout(() => {
          if (isActive) {
            window.location.replace(authPostConfirmPath)
          }
        }, 500)
      }
    }, 0)

    return () => {
      isActive = false
      window.clearTimeout(timer)
      if (redirectTimer !== undefined) {
        window.clearTimeout(redirectTimer)
      }
    }
  }, [])

  const isAction = viewState.kind === 'action'
  const isSuccess = viewState.kind === 'success'
  const isError = viewState.kind === 'error'

  return (
    <main className="dd-auth-confirm" aria-live="polite">
      <section className="dd-auth-confirm__panel" aria-labelledby="auth-confirm-title">
        <div className="dd-auth-confirm__brand">
          <img src="/logo-dd-link.svg" alt="" />
          <span>ddzhilian</span>
        </div>

        <span
          className={[
            'dd-auth-confirm__status',
            isSuccess ? 'is-success' : '',
            isError ? 'is-error' : '',
          ].filter(Boolean).join(' ')}
        >
          {isAction ? '需要确认' : isSuccess ? '已完成' : isError ? '未完成' : '待处理'}
        </span>

        <div className="dd-auth-confirm__copy">
          <h1 id="auth-confirm-title">{viewState.title}</h1>
          <p>{viewState.message}</p>
        </div>

        <div className="dd-auth-confirm__actions">
          {isAction ? (
            <a className="dd-auth-confirm__primary" href={viewState.confirmationUrl}>
              立即继续
            </a>
          ) : null}
          <a className="dd-auth-confirm__secondary" href="/image">
            前往登录
          </a>
          <a className="dd-auth-confirm__link" href="/">
            返回首页
          </a>
        </div>
      </section>
    </main>
  )
}
