import type {
  AdminAiSettings,
  AdminOnlineDeviceNameUpdate,
  AdminOnlineDevicesSnapshot,
  AdminOpenAiReasoningEffort,
  AdminOpenRouterConfig,
  AdminStateResponse,
  AdminUserQuotaUpdate,
  AdminUsersSnapshot,
} from '@/lib/ddzhilian-types'
import { ADMIN_V2_DASHBOARD_PATH, ADMIN_V2_LOGIN_PATH } from '@/admin-v2/config'

type AdminStatePayload = Partial<AdminStateResponse> & {
  authenticated?: boolean
}

export type AdminOpenAiCompatibleDetectedModel = {
  id: string
  label: string
}

export type AdminOpenAiCompatibleDetectInput = {
  baseUrl: string
  apiKey: string
  modelId?: string
  wireApi?: AdminOpenRouterConfig['wireApi']
  reasoningEffort?: AdminOpenAiReasoningEffort
}

export type AdminOpenAiCompatibleDetectResult = {
  baseUrl: string
  models: AdminOpenAiCompatibleDetectedModel[]
  selectedModelId?: string
  checkedModelCount?: number
  failedModelCount?: number
}

export type AdminAnthropicDetectInput = {
  baseUrl: string
  authToken: string
  modelId?: string
}

export type AdminAnthropicDetectResult = {
  baseUrl: string
  models: AdminOpenAiCompatibleDetectedModel[]
  selectedModelId?: string
}

export type AdminOpenAiCompatibleRefreshResult = AdminOpenAiCompatibleDetectResult & {
  refreshed: boolean
  refreshedAt: string
}

export type AdminOnlineDevicesResponse = {
  onlineDevices?: AdminOnlineDevicesSnapshot
  serverTime?: string
}

export type AdminUsersResponse = {
  users?: AdminUsersSnapshot
  serverTime?: string
}

export class AdminV2UnauthorizedError extends Error {}

export const isAdminV2DevLoginEnabled = process.env.NODE_ENV === 'development'

export function resolveAdminV2ApiBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SIGNALING_HTTP_URL?.trim() ?? ''
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  if (typeof window === 'undefined') {
    return ''
  }

  const { protocol, hostname, host } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `http://${hostname}:8787`
  }

  if (hostname === '::1') {
    return 'http://[::1]:8787'
  }

  return `${protocol}//${host}`
}

export async function readAdminV2ApiError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null
  return typeof payload?.error === 'string' && payload.error.trim() ? payload.error : fallback
}

async function assertAdminResponseOk(response: Response, fallback: string) {
  if (response.status === 401 || response.status === 403) {
    throw new AdminV2UnauthorizedError(await readAdminV2ApiError(response, '管理员账号会话已失效。'))
  }

  if (!response.ok) {
    throw new Error(await readAdminV2ApiError(response, fallback))
  }
}

async function readStatePayload(response: Response, fallback: string) {
  if (response.status === 401 || response.status === 403) {
    return { authenticated: false } satisfies AdminStatePayload
  }

  if (!response.ok) {
    throw new Error(await readAdminV2ApiError(response, fallback))
  }

  return (await response.json()) as AdminStatePayload
}

export async function fetchAdminSessionSnapshot() {
  const response = await fetch(`${resolveAdminV2ApiBaseUrl()}/api/admin/session`, {
    credentials: 'include',
  })

  return readStatePayload(response, '后台状态加载失败。')
}

export async function loginAdminSession(email: string, password: string) {
  const response = await fetch(`${resolveAdminV2ApiBaseUrl()}/api/admin/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  return readStatePayload(response, '管理员登录失败。')
}

export async function devLoginAdminSession() {
  const response = await fetch(`${resolveAdminV2ApiBaseUrl()}/api/admin/dev-login`, {
    method: 'POST',
    credentials: 'include',
  })

  return readStatePayload(response, '开发环境后台入口失败。')
}

export async function logoutAdminSession() {
  await fetch(`${resolveAdminV2ApiBaseUrl()}/api/admin/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => undefined)
}

export async function saveAdminAiConfig(aiSettings: AdminAiSettings) {
  const response = await fetch(`${resolveAdminV2ApiBaseUrl()}/api/admin/ai-config`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(aiSettings),
  })

  await assertAdminResponseOk(response, 'AI 配置保存失败。')
  return await response.json() as AdminStateResponse
}

export async function detectAdminOpenAiCompatibleModels(input: AdminOpenAiCompatibleDetectInput) {
  const response = await fetch(`${resolveAdminV2ApiBaseUrl()}/api/admin/ai-config/detect`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  await assertAdminResponseOk(response, '模型检测失败。')
  return await response.json() as AdminOpenAiCompatibleDetectResult
}

export async function detectAdminAnthropicModels(input: AdminAnthropicDetectInput) {
  const response = await fetch(`${resolveAdminV2ApiBaseUrl()}/api/admin/ai-config/detect-anthropic`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  await assertAdminResponseOk(response, '模型检测失败。')
  return await response.json() as AdminAnthropicDetectResult
}

export async function refreshAdminOpenAiCompatibleModels() {
  const response = await fetch(`${resolveAdminV2ApiBaseUrl()}/api/admin/ai-config/refresh-models`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  await assertAdminResponseOk(response, '模型列表刷新失败。')
  return await response.json() as AdminStateResponse & {
    refresh: AdminOpenAiCompatibleRefreshResult
  }
}

export async function fetchAdminOnlineDevicesSnapshot() {
  const response = await fetch(`${resolveAdminV2ApiBaseUrl()}/api/admin/online-devices`, {
    credentials: 'include',
  })

  await assertAdminResponseOk(response, '在线设备加载失败。')
  return await response.json() as AdminOnlineDevicesResponse
}

export async function updateAdminOnlineDeviceName(input: AdminOnlineDeviceNameUpdate) {
  const response = await fetch(`${resolveAdminV2ApiBaseUrl()}/api/admin/online-devices/name`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  await assertAdminResponseOk(response, '在线设备名称保存失败。')
  return await response.json() as AdminOnlineDevicesResponse
}

export async function updateAdminUserQuota(userId: string, quota: AdminUserQuotaUpdate) {
  const response = await fetch(`${resolveAdminV2ApiBaseUrl()}/api/admin/users/quota`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ userId, ...quota }),
  })

  await assertAdminResponseOk(response, '用户额度保存失败。')
  return await response.json() as AdminUsersResponse
}

export function isCompleteAdminStateResponse(payload: AdminStatePayload): payload is AdminStateResponse {
  return Boolean(
    payload.authenticated
      && payload.admin
      && payload.history
      && payload.ai
      && payload.usage
      && payload.onlineDevices
      && payload.themeSubmissions
      && payload.serverTime,
  )
}

export { ADMIN_V2_DASHBOARD_PATH, ADMIN_V2_LOGIN_PATH }
