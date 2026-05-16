import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AdminAiSettings,
  AdminCloudflareConfig,
  AdminHistoryStats,
  AdminOnlineDeviceNameUpdate,
  AdminOnlineDevicesSnapshot,
  AdminOpenAiReasoningEffort,
  AdminOpenRouterConfig,
  AdminRolesSnapshot,
  AdminSessionInfo,
  AdminStateResponse,
  AdminUsageSnapshot,
  AdminUserQuotaUpdate,
  AdminUsersSnapshot,
} from './ddzhilian-types'

const ADMIN_LOGIN_EXIT_ANIMATION_MS = 720
const ADMIN_TOAST_TIMEOUT_MS = 4200

type AdminToastKind = 'success' | 'error'

export type AdminToast = {
  id: string
  kind: AdminToastKind
  message: string
}

type AdminOpenAiCompatibleDetectedModel = {
  id: string
  label: string
}

export type AdminOpenAiCompatibleDetectInput = {
  baseUrl: string
  apiKey: string
  modelId?: string
}

export type AdminOpenAiCompatibleDetectResult = {
  baseUrl: string
  models: AdminOpenAiCompatibleDetectedModel[]
  selectedModelId?: string
}

export type AdminManualOpenAiApiDraft = {
  label: string
  baseUrl: string
  wireApi: AdminOpenRouterConfig['wireApi']
  reasoningEffort: AdminOpenAiReasoningEffort
  apiKey: string
  modelId: string
}

type UseAdminOptions = {
  enabled: boolean
}

export function resolveAdminApiBaseUrl() {
  const env = process.env as Record<string, string | undefined>
  const configuredUrl = env.NEXT_PUBLIC_SIGNALING_HTTP_URL?.trim() || ''

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  if (typeof window === 'undefined') {
    return ''
  }

  const { protocol, hostname, host } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8787'
  }

  return `${protocol}//${host}`
}

export async function readAdminApiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: unknown } | null
  return typeof payload?.error === 'string' && payload.error.trim()
    ? payload.error
    : fallback
}

export function useAdmin({ enabled }: UseAdminOptions) {
  const [adminEmailDraft, setAdminEmailDraft] = useState('')
  const [adminPasswordDraft, setAdminPasswordDraft] = useState('')
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false)
  const [isAdminLoading, setIsAdminLoading] = useState(false)
  const [isAdminLoginTransitioning, setIsAdminLoginTransitioning] = useState(false)
  const [isAdminSaving, setIsAdminSaving] = useState(false)
  const [isAdminClearingHistory, setIsAdminClearingHistory] = useState(false)
  const [isAdminRenamingOnlineDevice, setIsAdminRenamingOnlineDevice] = useState(false)
  const [isAdminUpdatingUser, setIsAdminUpdatingUser] = useState(false)
  const [isAdminUpdatingRole, setIsAdminUpdatingRole] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminSession, setAdminSession] = useState<AdminSessionInfo | null>(null)
  const [adminHistoryStats, setAdminHistoryStats] = useState<AdminHistoryStats | null>(null)
  const [adminAiSettings, setAdminAiSettings] = useState<AdminAiSettings | null>(null)
  const [adminUsage, setAdminUsage] = useState<AdminUsageSnapshot | null>(null)
  const [adminOnlineDevices, setAdminOnlineDevices] = useState<AdminOnlineDevicesSnapshot | null>(null)
  const [adminUsers, setAdminUsers] = useState<AdminUsersSnapshot | null>(null)
  const [adminRoles, setAdminRoles] = useState<AdminRolesSnapshot | null>(null)
  const [adminToasts, setAdminToasts] = useState<AdminToast[]>([])
  const adminLoginTransitionTimeoutRef = useRef<number | null>(null)
  const toastTimeoutsRef = useRef<number[]>([])
  const toastSequenceRef = useRef(0)

  const pushAdminToast = useCallback((kind: AdminToastKind, message: string) => {
    const id = `${Date.now()}-${toastSequenceRef.current++}`
    setAdminToasts((previous) => [...previous, { id, kind, message }])

    if (typeof window !== 'undefined') {
      const timeout = window.setTimeout(() => {
        setAdminToasts((previous) => previous.filter((toast) => toast.id !== id))
      }, ADMIN_TOAST_TIMEOUT_MS)
      toastTimeoutsRef.current.push(timeout)
    }
  }, [])

  const dismissAdminToast = (id: string) => {
    setAdminToasts((previous) => previous.filter((toast) => toast.id !== id))
  }

  const setAdminErrorMessage = useCallback((message: string) => {
    setAdminError(message)
    pushAdminToast('error', message)
  }, [pushAdminToast])

  const clearAdminSnapshots = () => {
    setAdminSession(null)
    setAdminHistoryStats(null)
    setAdminAiSettings(null)
    setAdminUsage(null)
    setAdminOnlineDevices(null)
    setAdminUsers(null)
    setAdminRoles(null)
  }

  useEffect(() => {
    return () => {
      if (adminLoginTransitionTimeoutRef.current) {
        clearTimeout(adminLoginTransitionTimeoutRef.current)
        adminLoginTransitionTimeoutRef.current = null
      }

      for (const timeout of toastTimeoutsRef.current) {
        clearTimeout(timeout)
      }
      toastTimeoutsRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let isCancelled = false

    const loadAdminSession = async () => {
      setIsAdminLoading(true)
      setAdminError(null)

      try {
        const response = await fetch(`${resolveAdminApiBaseUrl()}/api/admin/session`, {
          credentials: 'include',
        })
        if (!response.ok) {
          throw new Error(await readAdminApiError(response, '管理员状态加载失败。'))
        }

        const payload = await response.json() as Partial<AdminStateResponse> & { authenticated?: boolean }
        if (isCancelled) {
          return
        }

        if (!payload.authenticated) {
          setIsAdminAuthenticated(false)
          setIsAdminLoginTransitioning(false)
          clearAdminSnapshots()
          return
        }

        setIsAdminAuthenticated(true)
        setIsAdminLoginTransitioning(false)
        setAdminSession(payload.admin ?? null)
        setAdminHistoryStats(payload.history ?? null)
        setAdminAiSettings(payload.ai ?? null)
        setAdminUsage(payload.usage ?? null)
        setAdminOnlineDevices(payload.onlineDevices ?? null)
        setAdminUsers(payload.users ?? null)
        setAdminRoles(payload.roles ?? null)
      } catch (error) {
        if (isCancelled) {
          return
        }

        setAdminErrorMessage(error instanceof Error ? error.message : '管理员状态加载失败。')
      } finally {
        if (!isCancelled) {
          setIsAdminLoading(false)
        }
      }
    }

    void loadAdminSession()

    return () => {
      isCancelled = true
    }
  }, [enabled, setAdminErrorMessage])

  const handleAdminConnect = () => {
    const nextEmail = adminEmailDraft.trim()
    const nextPassword = adminPasswordDraft.trim()
    if (!nextEmail) {
      setAdminErrorMessage('请输入管理员邮箱。')
      return
    }

    if (!nextPassword) {
      setAdminErrorMessage('请输入账号密码。')
      return
    }

    setIsAdminLoading(true)
    setIsAdminLoginTransitioning(false)
    setAdminError(null)

    void fetch(`${resolveAdminApiBaseUrl()}/api/admin/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: nextEmail, password: nextPassword }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readAdminApiError(response, '管理员登录失败。'))
        }

        return response.json() as Promise<AdminStateResponse & { authenticated?: boolean }>
      })
      .then((payload) => {
        if (!payload.authenticated) {
          setIsAdminAuthenticated(false)
          setIsAdminLoginTransitioning(false)
          setAdminErrorMessage('管理员登录失败。')
          return
        }

        setAdminSession(payload.admin ?? null)
        setAdminHistoryStats(payload.history)
        setAdminAiSettings(payload.ai)
        setAdminUsage(payload.usage)
        setAdminOnlineDevices(payload.onlineDevices)
        setAdminUsers(payload.users ?? null)
        setAdminRoles(payload.roles ?? null)
        setIsAdminLoginTransitioning(true)
        pushAdminToast('success', '已进入后台。')

        if (adminLoginTransitionTimeoutRef.current) {
          clearTimeout(adminLoginTransitionTimeoutRef.current)
        }

        adminLoginTransitionTimeoutRef.current = window.setTimeout(() => {
          setIsAdminAuthenticated(true)
          setIsAdminLoginTransitioning(false)
          adminLoginTransitionTimeoutRef.current = null
        }, ADMIN_LOGIN_EXIT_ANIMATION_MS)
      })
      .catch((error) => {
        setIsAdminLoginTransitioning(false)
        setAdminErrorMessage(error instanceof Error ? error.message : '管理员登录失败。')
      })
      .finally(() => {
        setIsAdminLoading(false)
      })
  }

  const handleAdminDisconnect = () => {
    if (adminLoginTransitionTimeoutRef.current) {
      clearTimeout(adminLoginTransitionTimeoutRef.current)
      adminLoginTransitionTimeoutRef.current = null
    }

    setIsAdminLoading(true)
    void fetch(`${resolveAdminApiBaseUrl()}/api/admin/logout`, {
      method: 'POST',
      credentials: 'include',
    }).finally(() => {
      setIsAdminLoading(false)
    })
    setIsAdminAuthenticated(false)
    setIsAdminLoginTransitioning(false)
    setAdminEmailDraft('')
    setAdminPasswordDraft('')
    clearAdminSnapshots()
    setAdminError(null)
    pushAdminToast('success', '已退出后台。')
  }

  const handleAdminProviderChange = (provider: AdminAiSettings['provider']) => {
    setAdminAiSettings((previous) => (previous ? { ...previous, provider } : previous))
  }

  const handleAdminSystemPromptChange = (systemPrompt: string) => {
    setAdminAiSettings((previous) => (previous ? { ...previous, systemPrompt } : previous))
  }

  const handleAdminCloudflareFieldChange = <Field extends keyof AdminCloudflareConfig,>(
    field: Field,
    value: AdminCloudflareConfig[Field],
  ) => {
    setAdminAiSettings((previous) =>
      previous
        ? {
            ...previous,
            cloudflare: {
              ...previous.cloudflare,
              [field]: value,
            },
          }
        : previous,
    )
  }

  const handleAdminOpenRouterFieldChange = <Field extends keyof AdminOpenRouterConfig,>(
    field: Field,
    value: AdminOpenRouterConfig[Field],
  ) => {
    setAdminAiSettings((previous) =>
      previous
        ? {
            ...previous,
            openrouter: {
              ...previous.openrouter,
              [field]: value,
            },
          }
        : previous,
    )
  }

  const handleAdminOpenRouterModelsDetect = (
    input: AdminOpenAiCompatibleDetectInput,
  ): Promise<AdminOpenAiCompatibleDetectResult> => {
    return fetch(`${resolveAdminApiBaseUrl()}/api/admin/ai-config/detect`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    }).then(async (response) => {
      if (!response.ok) {
        const message = await readAdminApiError(response, '模型检测失败。')
        pushAdminToast('error', message)
        throw new Error(message)
      }

      const payload = await response.json() as AdminOpenAiCompatibleDetectResult
      pushAdminToast('success', `已检测到 ${payload.models.length} 个模型。`)
      return payload
    })
  }

  const handleAdminSave = () => {
    if (!isAdminAuthenticated || !adminAiSettings) {
      setAdminErrorMessage('请先登录后台。')
      return
    }

    setIsAdminSaving(true)
    setAdminError(null)

    void fetch(`${resolveAdminApiBaseUrl()}/api/admin/ai-config`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(adminAiSettings),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readAdminApiError(response, 'AI 配置保存失败。'))
        }

        return response.json() as Promise<{
          admin?: AdminSessionInfo
          ai: AdminAiSettings
          history: AdminHistoryStats
          usage?: AdminUsageSnapshot
          onlineDevices?: AdminOnlineDevicesSnapshot
          users?: AdminUsersSnapshot
          roles?: AdminRolesSnapshot
        }>
      })
      .then((payload) => {
        setAdminSession(payload.admin ?? adminSession)
        setAdminAiSettings(payload.ai)
        setAdminHistoryStats(payload.history)
        setAdminUsage(payload.usage ?? null)
        setAdminOnlineDevices(payload.onlineDevices ?? null)
        setAdminUsers(payload.users ?? null)
        setAdminRoles(payload.roles ?? adminRoles)
        pushAdminToast('success', 'AI 配置已保存。')
      })
      .catch((error) => {
        setAdminErrorMessage(error instanceof Error ? error.message : 'AI 配置保存失败。')
      })
      .finally(() => {
        setIsAdminSaving(false)
      })
  }

  const handleAdminClearHistory = () => {
    if (!isAdminAuthenticated) {
      setAdminErrorMessage('请先登录后台。')
      return
    }

    setIsAdminClearingHistory(true)
    setAdminError(null)

    void fetch(`${resolveAdminApiBaseUrl()}/api/admin/history/clear`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readAdminApiError(response, '历史记录清空失败。'))
        }

        return response.json() as Promise<{
          admin?: AdminSessionInfo
          history: AdminHistoryStats
          usage?: AdminUsageSnapshot
          onlineDevices?: AdminOnlineDevicesSnapshot
          users?: AdminUsersSnapshot
          roles?: AdminRolesSnapshot
        }>
      })
      .then((payload) => {
        setAdminSession(payload.admin ?? adminSession)
        setAdminHistoryStats(payload.history)
        setAdminUsage(payload.usage ?? null)
        setAdminOnlineDevices(payload.onlineDevices ?? null)
        setAdminUsers(payload.users ?? null)
        setAdminRoles(payload.roles ?? adminRoles)
        pushAdminToast('success', '历史记录已清空。')
      })
      .catch((error) => {
        setAdminErrorMessage(error instanceof Error ? error.message : '历史记录清空失败。')
      })
      .finally(() => {
        setIsAdminClearingHistory(false)
      })
  }

  const handleAdminOnlineDeviceRename = ({ deviceId, deviceName }: AdminOnlineDeviceNameUpdate) => {
    if (!isAdminAuthenticated) {
      const message = '请先登录后台。'
      setAdminErrorMessage(message)
      return Promise.reject(new Error(message))
    }

    setIsAdminRenamingOnlineDevice(true)
    setAdminError(null)

    return fetch(`${resolveAdminApiBaseUrl()}/api/admin/online-devices/name`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ deviceId, deviceName }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readAdminApiError(response, '在线设备名称保存失败。'))
        }

        return response.json() as Promise<{
          onlineDevices?: AdminOnlineDevicesSnapshot
        }>
      })
      .then((payload) => {
        setAdminOnlineDevices(payload.onlineDevices ?? null)
        pushAdminToast('success', '在线设备名称已保存。')
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : '在线设备名称保存失败。'
        setAdminErrorMessage(message)
        throw new Error(message)
      })
      .finally(() => {
        setIsAdminRenamingOnlineDevice(false)
      })
  }

  const handleAdminUserQuotaUpdate = (userId: string, quota: AdminUserQuotaUpdate) => {
    if (!isAdminAuthenticated) {
      const message = '请先登录后台。'
      setAdminErrorMessage(message)
      return Promise.reject(new Error(message))
    }

    setIsAdminUpdatingUser(true)
    setAdminError(null)

    return fetch(`${resolveAdminApiBaseUrl()}/api/admin/users/quota`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ userId, ...quota }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readAdminApiError(response, '用户额度保存失败。'))
        }

        return response.json() as Promise<{
          users?: AdminUsersSnapshot
        }>
      })
      .then((payload) => {
        setAdminUsers(payload.users ?? null)
        pushAdminToast('success', '用户额度已保存。')
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : '用户额度保存失败。'
        setAdminErrorMessage(message)
        throw new Error(message)
      })
      .finally(() => {
        setIsAdminUpdatingUser(false)
      })
  }

  const handleAdminRoleCreate = (email: string) => {
    if (!isAdminAuthenticated || !adminSession?.isSuperAdmin) {
      const message = '仅超级管理员可以管理角色。'
      setAdminErrorMessage(message)
      return Promise.reject(new Error(message))
    }

    setIsAdminUpdatingRole(true)
    setAdminError(null)

    return fetch(`${resolveAdminApiBaseUrl()}/api/admin/roles`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readAdminApiError(response, '管理员添加失败。'))
        }

        return response.json() as Promise<{
          roles?: AdminRolesSnapshot
        }>
      })
      .then((payload) => {
        setAdminRoles(payload.roles ?? null)
        pushAdminToast('success', '管理员已添加。')
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : '管理员添加失败。'
        setAdminErrorMessage(message)
        throw new Error(message)
      })
      .finally(() => {
        setIsAdminUpdatingRole(false)
      })
  }

  const handleAdminRoleDelete = (userId: string) => {
    if (!isAdminAuthenticated || !adminSession?.isSuperAdmin) {
      const message = '仅超级管理员可以管理角色。'
      setAdminErrorMessage(message)
      return Promise.reject(new Error(message))
    }

    setIsAdminUpdatingRole(true)
    setAdminError(null)

    return fetch(`${resolveAdminApiBaseUrl()}/api/admin/roles/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readAdminApiError(response, '管理员删除失败。'))
        }

        return response.json() as Promise<{
          roles?: AdminRolesSnapshot
        }>
      })
      .then((payload) => {
        setAdminRoles(payload.roles ?? null)
        pushAdminToast('success', '管理员已删除。')
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : '管理员删除失败。'
        setAdminErrorMessage(message)
        throw new Error(message)
      })
      .finally(() => {
        setIsAdminUpdatingRole(false)
      })
  }

  return {
    adminEmailDraft,
    adminPasswordDraft,
    adminSession,
    isAdminAuthenticated,
    isAdminLoading,
    isAdminLoginTransitioning,
    isAdminSaving,
    isAdminClearingHistory,
    isAdminRenamingOnlineDevice,
    isAdminUpdatingUser,
    isAdminUpdatingRole,
    adminError,
    adminHistoryStats,
    adminAiSettings,
    adminUsage,
    adminOnlineDevices,
    adminUsers,
    adminRoles,
    adminToasts,
    setAdminEmailDraft,
    setAdminPasswordDraft,
    dismissAdminToast,
    handleAdminConnect,
    handleAdminDisconnect,
    handleAdminProviderChange,
    handleAdminSystemPromptChange,
    handleAdminCloudflareFieldChange,
    handleAdminOpenRouterFieldChange,
    handleAdminOpenRouterModelsDetect,
    handleAdminSave,
    handleAdminClearHistory,
    handleAdminOnlineDeviceRename,
    handleAdminUserQuotaUpdate,
    handleAdminRoleCreate,
    handleAdminRoleDelete,
  }
}
