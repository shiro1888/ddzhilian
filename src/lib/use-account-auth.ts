import { useCallback, useEffect, useState } from 'react'
import type { AccountEmailCheckResponse, AccountSessionResponse, AccountUser } from './ddzhilian-types'

function readPublicEnv(name: 'SIGNALING_HTTP_URL') {
  const env = process.env as Record<string, string | undefined>
  return (
    env[`NEXT_PUBLIC_${name}`]?.trim() ||
    env[`VITE_${name}`]?.trim() ||
    ''
  )
}

function resolveAccountApiBaseUrl() {
  const configuredUrl = readPublicEnv('SIGNALING_HTTP_URL')
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  const { protocol, hostname, host } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8787'
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

  const refreshSession = useCallback(async () => {
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
      setUser(payload.authenticated && payload.user ? payload.user : null)
    } catch (sessionError) {
      setUser(null)
      setError(sessionError instanceof Error ? sessionError.message : '账号状态加载失败。')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  const login = useCallback(async (email: string, password: string) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const payload = await submitAccountCredentials('/api/auth/login', email, password)
      const nextUser = payload.user
      if (!payload.authenticated || !nextUser) {
        throw new Error('账号会话创建失败。')
      }

      setUser(nextUser)
      return nextUser
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : '账号登录失败。'
      setError(message)
      throw new Error(message)
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const payload = await submitAccountCredentials('/api/auth/register', email, password)
      if (payload.authenticated && payload.user) {
        setUser(payload.user)
        return payload
      }

      setUser(null)
      return payload
    } catch (registerError) {
      const message = registerError instanceof Error ? registerError.message : '账号注册失败。'
      setError(message)
      throw new Error(message)
    } finally {
      setIsSubmitting(false)
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
    setIsSubmitting(true)
    setError(null)

    try {
      await fetch(`${ACCOUNT_API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } finally {
      setUser(null)
      setIsSubmitting(false)
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
