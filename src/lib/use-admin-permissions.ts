import { useEffect, useState } from 'react'
import type { AdminPermissionsResponse } from './ddzhilian-types'
import { readAdminApiError, resolveAdminApiBaseUrl } from './use-admin'

type UseAdminPermissionsOptions = {
  enabled: boolean
  refreshKey?: string
}

type AdminPermissionsState = {
  canRecallAnyMessage: boolean
  adminPermissionError: string | null
}

const initialAdminPermissionsState: AdminPermissionsState = {
  canRecallAnyMessage: false,
  adminPermissionError: null,
}

export function useAdminPermissions({ enabled, refreshKey = '' }: UseAdminPermissionsOptions) {
  const [state, setState] = useState<AdminPermissionsState>(initialAdminPermissionsState)

  useEffect(() => {
    let isCancelled = false

    if (!enabled) {
      return undefined
    }

    const refreshPermissions = () => {
      void fetch(`${resolveAdminApiBaseUrl()}/api/admin/permissions`, {
        credentials: 'include',
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await readAdminApiError(response, '管理员权限读取失败。'))
          }

          return response.json() as Promise<AdminPermissionsResponse>
        })
        .then((payload) => {
          if (isCancelled) {
            return
          }

          setState({
            canRecallAnyMessage: Boolean(payload.authenticated && payload.canRecallAnyMessage),
            adminPermissionError: null,
          })
        })
        .catch((error) => {
          if (isCancelled) {
            return
          }

          setState({
            canRecallAnyMessage: false,
            adminPermissionError: error instanceof Error ? error.message : '管理员权限读取失败。',
          })
        })
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshPermissions()
      }
    }

    refreshPermissions()
    window.addEventListener('focus', refreshPermissions)
    window.addEventListener('pageshow', refreshPermissions)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      isCancelled = true
      window.removeEventListener('focus', refreshPermissions)
      window.removeEventListener('pageshow', refreshPermissions)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [enabled, refreshKey])

  return enabled ? state : initialAdminPermissionsState
}
