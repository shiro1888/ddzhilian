import { useCallback, useEffect, useRef, useState } from 'react'
import type { AccountEmailCheckResponse, AccountSessionResponse, AccountUser } from './ddzhilian-types'

function readPublicSignalingHttpUrl() {
  // Keep the access static so Next.js can inline it into the browser bundle.
  return process.env.NEXT_PUBLIC_SIGNALING_HTTP_URL?.trim() || ''
}

function resolveAccountApiBaseUrl() {
  const configuredUrl = readPublicSignalingHttpUrl()
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  const { protocol, hostname, host } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:8787`
  }

  return `${protocol}//${host}`
}

const ACCOUNT_API_BASE_URL = resolveAccountApiBaseUrl()

async function readAccountApiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: unknown } | null
  return typeof payload?.error === 'string' && payload.error.trim()
    ? payload.error
    : fallback
}

async function submitAccountCredentials(
  endpoint: '/api/auth/login' | '/api/auth/register',
  email: string,
  password: string,
) {
  const response = await fetch(`${ACCOUNT_API_BASE_URL}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    throw new Error(await readAccountApiError(response, '账号请求失败。'))
  }

  const payload = await response.json() as AccountSessionResponse
  if (endpoint === '/api/auth/login' && (!payload.authenticated || !payload.user)) {
    throw new Error('账号会话创建失败。')
  }

  return payload
}

async function checkAccountEmail(email: string) {
  const response = await fetch(`${ACCOUNT_API_BASE_URL}/api/auth/check-email`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email }),
  })

  if (!response.ok) {
    throw new Error(await readAccountApiError(response, '账号检测失败。'))
  }

  return await response.json() as AccountEmailCheckResponse
}

export function useAccountAuth() {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionRevisionRef = useRef(0)
  const authMutationRef = useRef(false)

  const refreshSession = useCallback(async () => {
    if (authMutationRef.current) return
    const revision = ++sessionRevisionRef.current
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`${ACCOUNT_API_BASE_URL}/api/auth/session`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(await readAccountApiError(response, '账号状态加载失败。'))
      }

      const payload = await response.json() as AccountSessionResponse
      if (revision === sessionRevisionRef.current) {
        setUser(payload.authenticated && payload.user ? payload.user : null)
      }
    } catch (sessionError) {
      if (revision === sessionRevisionRef.current) {
        setUser(null)
        setError(sessionError instanceof Error ? sessionError.message : '账号状态加载失败。')
      }
    } finally {
      if (revision === sessionRevisionRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  const login = useCallback(async (email: string, password: string) => {
    authMutationRef.current = true
    const revision = ++sessionRevisionRef.current
    setIsLoading(false)
    setIsSubmitting(true)
    setError(null)

    try {
      const payload = await submitAccountCredentials('/api/auth/login', email, password)
      const nextUser = payload.user
      if (!payload.authenticated || !nextUser) {
        throw new Error('账号会话创建失败。')
      }

      if (revision === sessionRevisionRef.current) setUser(nextUser)
      return nextUser
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : '账号登录失败。'
      if (revision === sessionRevisionRef.current) setError(message)
      throw new Error(message)
    } finally {
      if (revision === sessionRevisionRef.current) {
        authMutationRef.current = false
        setIsSubmitting(false)
      }
    }
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    authMutationRef.current = true
    const revision = ++sessionRevisionRef.current
    setIsLoading(false)
    setIsSubmitting(true)
    setError(null)

    try {
      const payload = await submitAccountCredentials('/api/auth/register', email, password)
      if (payload.authenticated && payload.user) {
        if (revision === sessionRevisionRef.current) setUser(payload.user)
        return payload
      }

      if (revision === sessionRevisionRef.current) setUser(null)
      return payload
    } catch (registerError) {
      const message = registerError instanceof Error ? registerError.message : '账号注册失败。'
      if (revision === sessionRevisionRef.current) setError(message)
      throw new Error(message)
    } finally {
      if (revision === sessionRevisionRef.current) {
        authMutationRef.current = false
        setIsSubmitting(false)
      }
    }
  }, [])

  const checkEmailRegistration = useCallback(async (email: string) => {
    setIsSubmitting(true)
    setError(null)

    try {
      return await checkAccountEmail(email)
    } catch (checkError) {
      const message = checkError instanceof Error ? checkError.message : '账号检测失败。'
      setError(message)
      throw new Error(message)
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  const logout = useCallback(async () => {
    authMutationRef.current = true
    const revision = ++sessionRevisionRef.current
    setIsLoading(false)
    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`${ACCOUNT_API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error(await readAccountApiError(response, '退出账号失败，请重试。'))
      if (revision === sessionRevisionRef.current) setUser(null)
    } catch (logoutError) {
      const message = logoutError instanceof Error ? logoutError.message : '退出账号失败，请重试。'
      if (revision === sessionRevisionRef.current) setError(message)
      throw new Error(message)
    } finally {
      if (revision === sessionRevisionRef.current) {
        authMutationRef.current = false
        setIsSubmitting(false)
      }
    }
  }, [])

  return {
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    isSubmitting,
    error,
    login,
    register,
    checkEmailRegistration,
    logout,
    refreshSession,
  }
}
