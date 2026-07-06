'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import type {
  AdminAiSettings,
  AdminOnlineDeviceNameUpdate,
  AdminSessionInfo,
  AdminStateResponse,
  AdminUserQuotaUpdate,
} from '@/lib/ddzhilian-types'
import {
  AdminV2UnauthorizedError,
  type AdminAnthropicDetectInput,
  type AdminAnthropicDetectResult,
  type AdminOpenAiCompatibleDetectInput,
  type AdminOpenAiCompatibleDetectResult,
  type AdminOpenAiCompatibleRefreshResult,
  detectAdminAnthropicModels,
  detectAdminOpenAiCompatibleModels,
  devLoginAdminSession,
  fetchAdminOnlineDevicesSnapshot,
  fetchAdminSessionSnapshot,
  isAdminV2DevLoginEnabled,
  isCompleteAdminStateResponse,
  loginAdminSession,
  logoutAdminSession,
  refreshAdminOpenAiCompatibleModels,
  saveAdminAiConfig,
  updateAdminOnlineDeviceName,
  updateAdminUserQuota,
} from '@/admin-v2/api'

type AdminV2SessionContextValue = {
  snapshot: AdminStateResponse | null
  aiDraft: AdminAiSettings | null
  adminSession: AdminSessionInfo | null
  isAuthenticated: boolean
  isBootstrapping: boolean
  isAuthSubmitting: boolean
  isAiSaving: boolean
  isModelRefreshSubmitting: boolean
  isOnlineDevicesRefreshing: boolean
  isRenamingOnlineDevice: boolean
  isUpdatingUser: boolean
  hasAiDraftChanges: boolean
  error: string | null
  isDevLoginEnabled: boolean
  clearError: () => void
  refresh: () => Promise<void>
  refreshOnlineDevices: () => Promise<void>
  login: (email: string, password: string) => Promise<boolean>
  devLogin: () => Promise<boolean>
  logout: () => Promise<void>
  updateAiDraft: (updater: (current: AdminAiSettings) => AdminAiSettings) => void
  resetAiDraft: () => void
  saveAiDraft: (draftOverride?: AdminAiSettings, options?: { showSuccessToast?: boolean }) => Promise<boolean>
  detectOpenAiCompatibleModels: (input: AdminOpenAiCompatibleDetectInput) => Promise<AdminOpenAiCompatibleDetectResult>
  detectAnthropicModels: (input: AdminAnthropicDetectInput) => Promise<AdminAnthropicDetectResult>
  refreshOpenAiCompatibleModels: () => Promise<AdminOpenAiCompatibleRefreshResult | null>
  renameOnlineDevice: (input: AdminOnlineDeviceNameUpdate) => Promise<boolean>
  updateUserQuota: (userId: string, quota: AdminUserQuotaUpdate) => Promise<boolean>
}

const AdminV2SessionContext = createContext<AdminV2SessionContextValue | null>(null)

function normalizeAdminState(payload: Partial<AdminStateResponse> & { authenticated?: boolean }) {
  if (!payload.authenticated) {
    return null
  }

  if (!isCompleteAdminStateResponse(payload)) {
    throw new Error('后台状态响应不完整。')
  }

  return payload
}

function cloneAiSettings(settings: AdminAiSettings) {
  // JSON 深拷贝代替 structuredClone,兼容 Chrome 98 以下;设置数据来自 JSON API,无特殊类型
  return JSON.parse(JSON.stringify(settings)) as AdminAiSettings
}

export function AdminV2SessionProvider({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const [snapshot, setSnapshot] = useState<AdminStateResponse | null>(null)
  const [aiDraft, setAiDraft] = useState<AdminAiSettings | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false)
  const [isAiSaving, setIsAiSaving] = useState(false)
  const [isModelRefreshSubmitting, setIsModelRefreshSubmitting] = useState(false)
  const [isOnlineDevicesRefreshing, setIsOnlineDevicesRefreshing] = useState(false)
  const [isRenamingOnlineDevice, setIsRenamingOnlineDevice] = useState(false)
  const [isUpdatingUser, setIsUpdatingUser] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const aiDraftRef = useRef<AdminAiSettings | null>(null)
  const snapshotRef = useRef<AdminStateResponse | null>(null)
  const aiSaveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))

  const applySnapshot = useCallback((nextSnapshot: AdminStateResponse | null) => {
    setSnapshot(nextSnapshot)
    setAiDraft(nextSnapshot ? cloneAiSettings(nextSnapshot.ai) : null)
    snapshotRef.current = nextSnapshot
    aiDraftRef.current = nextSnapshot ? cloneAiSettings(nextSnapshot.ai) : null
    setIsAuthenticated(Boolean(nextSnapshot))
  }, [])

  const patchSnapshot = useCallback((updater: (current: AdminStateResponse) => AdminStateResponse) => {
    let resolvedPreviousSnapshot: AdminStateResponse | undefined
    let resolvedNextSnapshot: AdminStateResponse | undefined

    setSnapshot((current) => {
      if (!current) {
        return current
      }

      resolvedPreviousSnapshot = current
      resolvedNextSnapshot = updater(current)
      return resolvedNextSnapshot
    })

    if (resolvedPreviousSnapshot && resolvedNextSnapshot) {
      const currentSnapshot = resolvedPreviousSnapshot
      const nextSnapshot = resolvedNextSnapshot
      snapshotRef.current = nextSnapshot
      setAiDraft((currentDraft) => {
        if (!currentDraft) {
          const nextDraft = cloneAiSettings(nextSnapshot.ai)
          aiDraftRef.current = nextDraft
          return nextDraft
        }

        if (JSON.stringify(currentDraft) !== JSON.stringify(currentSnapshot.ai)) {
          aiDraftRef.current = currentDraft
          return currentDraft
        }

        const nextDraft = cloneAiSettings(nextSnapshot.ai)
        aiDraftRef.current = nextDraft
        return nextDraft
      })
    }
  }, [])

  const handleUnauthorized = useCallback((message: string) => {
    applySnapshot(null)
    setError(message)
    toast.error(message)
  }, [applySnapshot])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const applyPayload = useCallback((payload: Partial<AdminStateResponse> & { authenticated?: boolean }) => {
    const nextSnapshot = normalizeAdminState(payload)
    applySnapshot(nextSnapshot)
    return Boolean(nextSnapshot)
  }, [applySnapshot])

  const refresh = useCallback(async () => {
    try {
      const payload = await fetchAdminSessionSnapshot()
      setError(null)
      applyPayload(payload)
    } catch (nextError) {
      applySnapshot(null)
      setError(nextError instanceof Error ? nextError.message : '后台状态加载失败。')
    } finally {
      setIsBootstrapping(false)
    }
  }, [applyPayload, applySnapshot])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    setIsAuthSubmitting(true)
    setError(null)

    try {
      const payload = await loginAdminSession(email, password)
      const authenticated = applyPayload(payload)
      if (!authenticated) {
        throw new Error('管理员登录失败。')
      }

      toast.success('已进入后台。')
      return true
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : '管理员登录失败。'
      setError(message)
      toast.error(message)
      return false
    } finally {
      setIsAuthSubmitting(false)
      setIsBootstrapping(false)
    }
  }, [applyPayload])

  const devLogin = useCallback(async () => {
    if (!isAdminV2DevLoginEnabled) {
      const message = '开发环境入口不可用。'
      setError(message)
      toast.error(message)
      return false
    }

    setIsAuthSubmitting(true)
    setError(null)

    try {
      const payload = await devLoginAdminSession()
      const authenticated = applyPayload(payload)
      if (!authenticated) {
        throw new Error('开发环境后台入口失败。')
      }

      toast.success('已通过开发入口进入后台。')
      return true
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : '开发环境后台入口失败。'
      setError(message)
      toast.error(message)
      return false
    } finally {
      setIsAuthSubmitting(false)
      setIsBootstrapping(false)
    }
  }, [applyPayload])

  const logout = useCallback(async () => {
    setIsAuthSubmitting(true)

    try {
      await logoutAdminSession()
    } finally {
      applySnapshot(null)
      setError(null)
      setIsAuthSubmitting(false)
      toast.success('已退出后台。')
    }
  }, [applySnapshot])

  const updateAiDraft = useCallback((updater: (current: AdminAiSettings) => AdminAiSettings) => {
    const currentDraft = aiDraftRef.current
    if (!currentDraft) {
      return
    }

    const nextDraft = updater(cloneAiSettings(currentDraft))
    aiDraftRef.current = nextDraft
    setAiDraft(nextDraft)
  }, [])

  const resetAiDraft = useCallback(() => {
    if (!snapshot) {
      return
    }

    const nextDraft = cloneAiSettings(snapshot.ai)
    aiDraftRef.current = nextDraft
    setAiDraft(nextDraft)
  }, [snapshot])

  const saveAiDraft = useCallback(async (
    draftOverride?: AdminAiSettings,
    options?: { showSuccessToast?: boolean },
  ) => {
    const requestedDraft = draftOverride ?? aiDraftRef.current
    if (!requestedDraft || !isAuthenticated) {
      const message = '请先登录后台。'
      setError(message)
      toast.error(message)
      return false
    }

    aiDraftRef.current = requestedDraft

    const queuedSave = aiSaveQueueRef.current.catch(() => false).then(async () => {
      const currentDraft = aiDraftRef.current
      const currentSnapshot = snapshotRef.current

      if (!currentDraft || !currentSnapshot) {
        return false
      }

      if (JSON.stringify(currentDraft) === JSON.stringify(currentSnapshot.ai)) {
        return true
      }

      setIsAiSaving(true)
      setError(null)

      try {
        const nextSnapshot = await saveAdminAiConfig(currentDraft)
        applySnapshot(nextSnapshot)
        if (options?.showSuccessToast ?? true) {
          toast.success('AI 配置已保存。')
        }
        return true
      } catch (nextError) {
        if (nextError instanceof AdminV2UnauthorizedError) {
          handleUnauthorized(nextError.message)
          return false
        }

        const message = nextError instanceof Error ? nextError.message : 'AI 配置保存失败。'
        setError(message)
        toast.error(message)
        return false
      } finally {
        setIsAiSaving(false)
      }
    })

    aiSaveQueueRef.current = queuedSave
    return queuedSave
  }, [applySnapshot, handleUnauthorized, isAuthenticated])

  const detectOpenAiCompatibleModels = useCallback(async (input: AdminOpenAiCompatibleDetectInput) => {
    try {
      const result = await detectAdminOpenAiCompatibleModels(input)
      toast.success(`已检测到 ${result.models.length.toString()} 个模型。`)
      return result
    } catch (nextError) {
      if (nextError instanceof AdminV2UnauthorizedError) {
        handleUnauthorized(nextError.message)
        throw nextError
      }

      const message = nextError instanceof Error ? nextError.message : '模型检测失败。'
      setError(message)
      toast.error(message)
      throw new Error(message)
    }
  }, [handleUnauthorized])

  const detectAnthropicModels = useCallback(async (input: AdminAnthropicDetectInput) => {
    try {
      const result = await detectAdminAnthropicModels(input)
      toast.success(`已检测到 ${result.models.length.toString()} 个模型。`)
      return result
    } catch (nextError) {
      if (nextError instanceof AdminV2UnauthorizedError) {
        handleUnauthorized(nextError.message)
        throw nextError
      }

      const message = nextError instanceof Error ? nextError.message : '模型检测失败。'
      setError(message)
      toast.error(message)
      throw new Error(message)
    }
  }, [handleUnauthorized])

  const refreshOpenAiCompatibleModels = useCallback(async () => {
    if (!isAuthenticated) {
      const message = '请先登录后台。'
      setError(message)
      toast.error(message)
      return null
    }

    setIsModelRefreshSubmitting(true)
    setError(null)

    try {
      const payload = await refreshAdminOpenAiCompatibleModels()
      applySnapshot(payload)
      toast.success(`已刷新 ${payload.refresh.models.length.toString()} 个可用模型。`)
      return payload.refresh
    } catch (nextError) {
      if (nextError instanceof AdminV2UnauthorizedError) {
        handleUnauthorized(nextError.message)
        return null
      }

      const message = nextError instanceof Error ? nextError.message : '模型列表刷新失败。'
      setError(message)
      toast.error(message)
      return null
    } finally {
      setIsModelRefreshSubmitting(false)
    }
  }, [applySnapshot, handleUnauthorized, isAuthenticated])

  const refreshOnlineDevices = useCallback(async () => {
    if (!isAuthenticated) {
      return
    }

    setIsOnlineDevicesRefreshing(true)
    try {
      const payload = await fetchAdminOnlineDevicesSnapshot()
      patchSnapshot((current) => ({
        ...current,
        onlineDevices: payload.onlineDevices ?? current.onlineDevices,
        serverTime: payload.serverTime ?? current.serverTime,
      }))
    } catch (nextError) {
      if (nextError instanceof AdminV2UnauthorizedError) {
        handleUnauthorized(nextError.message)
        return
      }

      const message = nextError instanceof Error ? nextError.message : '在线设备加载失败。'
      setError(message)
    } finally {
      setIsOnlineDevicesRefreshing(false)
    }
  }, [handleUnauthorized, isAuthenticated, patchSnapshot])

  const renameOnlineDevice = useCallback(async (input: AdminOnlineDeviceNameUpdate) => {
    if (!isAuthenticated) {
      const message = '请先登录后台。'
      setError(message)
      toast.error(message)
      return false
    }

    setIsRenamingOnlineDevice(true)
    setError(null)

    try {
      const payload = await updateAdminOnlineDeviceName(input)
      patchSnapshot((current) => ({
        ...current,
        onlineDevices: payload.onlineDevices ?? current.onlineDevices,
        serverTime: payload.serverTime ?? current.serverTime,
      }))
      toast.success('在线设备名称已保存。')
      return true
    } catch (nextError) {
      if (nextError instanceof AdminV2UnauthorizedError) {
        handleUnauthorized(nextError.message)
        return false
      }

      const message = nextError instanceof Error ? nextError.message : '在线设备名称保存失败。'
      setError(message)
      toast.error(message)
      return false
    } finally {
      setIsRenamingOnlineDevice(false)
    }
  }, [handleUnauthorized, isAuthenticated, patchSnapshot])

  const updateUserQuota = useCallback(async (userId: string, quota: AdminUserQuotaUpdate) => {
    if (!isAuthenticated) {
      const message = '请先登录后台。'
      setError(message)
      toast.error(message)
      return false
    }

    setIsUpdatingUser(true)
    setError(null)

    try {
      const payload = await updateAdminUserQuota(userId, quota)
      patchSnapshot((current) => ({
        ...current,
        users: payload.users ?? current.users,
        serverTime: payload.serverTime ?? current.serverTime,
      }))
      toast.success('用户额度已保存。')
      return true
    } catch (nextError) {
      if (nextError instanceof AdminV2UnauthorizedError) {
        handleUnauthorized(nextError.message)
        return false
      }

      const message = nextError instanceof Error ? nextError.message : '用户额度保存失败。'
      setError(message)
      toast.error(message)
      return false
    } finally {
      setIsUpdatingUser(false)
    }
  }, [handleUnauthorized, isAuthenticated, patchSnapshot])

  const hasAiDraftChanges = useMemo(() => {
    if (!snapshot || !aiDraft) {
      return false
    }

    return JSON.stringify(snapshot.ai) !== JSON.stringify(aiDraft)
  }, [aiDraft, snapshot])

  const value = useMemo<AdminV2SessionContextValue>(() => ({
    snapshot,
    aiDraft,
    adminSession: snapshot?.admin ?? null,
    isAuthenticated,
    isBootstrapping,
    isAuthSubmitting,
    isAiSaving,
    isModelRefreshSubmitting,
    isOnlineDevicesRefreshing,
    isRenamingOnlineDevice,
    isUpdatingUser,
    hasAiDraftChanges,
    error,
    isDevLoginEnabled: isAdminV2DevLoginEnabled,
    clearError,
    refresh,
    refreshOnlineDevices,
    login,
    devLogin,
    logout,
    updateAiDraft,
    resetAiDraft,
    saveAiDraft,
    detectOpenAiCompatibleModels,
    detectAnthropicModels,
    refreshOpenAiCompatibleModels,
    renameOnlineDevice,
    updateUserQuota,
  }), [
    aiDraft,
    clearError,
    detectAnthropicModels,
    detectOpenAiCompatibleModels,
    devLogin,
    error,
    hasAiDraftChanges,
    isAiSaving,
    isAuthenticated,
    isAuthSubmitting,
    isBootstrapping,
    isModelRefreshSubmitting,
    isOnlineDevicesRefreshing,
    isRenamingOnlineDevice,
    isUpdatingUser,
    login,
    logout,
    refresh,
    refreshOnlineDevices,
    refreshOpenAiCompatibleModels,
    renameOnlineDevice,
    resetAiDraft,
    saveAiDraft,
    snapshot,
    updateAiDraft,
    updateUserQuota,
  ])

  return (
    <AdminV2SessionContext.Provider value={value}>
      {children}
    </AdminV2SessionContext.Provider>
  )
}

export function useAdminV2Session() {
  const value = useContext(AdminV2SessionContext)
  if (!value) {
    throw new Error('useAdminV2Session must be used within AdminV2SessionProvider.')
  }

  return value
}
