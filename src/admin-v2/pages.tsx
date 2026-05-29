'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  BarChart3,
  Database,
  HardDriveDownload,
  MessageSquareText,
  Monitor,
  Palette,
  ShieldCheck,
  Trophy,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AdminStateResponse } from '@/lib/ddzhilian-types'
import {
  ADMIN_V2_DASHBOARD_PATH,
  ADMIN_V2_BASE_PATH,
  ADMIN_V2_LOGIN_PATH,
  ADMIN_V2_SECTION_META,
  type AdminV2Section,
} from '@/admin-v2/config'
import { formatBytes, formatDateTime, formatInteger } from '@/admin-v2/format'
import { useAdminV2Session } from '@/admin-v2/session'
import { AccountQuotaOverviewCard } from '@/admin-v2/dashboard/AccountQuotaOverviewCard'
import { ModelTokenAllocationCard } from '@/admin-v2/dashboard/ModelTokenAllocationCard'
import { UserVisitVolumeCard } from '@/admin-v2/dashboard/UserVisitVolumeCard'
import { AdminV2AiPolicyWorkspace } from '@/admin-v2/workspaces/AiPolicyWorkspace'
import { AdminV2ModelsWorkspace } from '@/admin-v2/workspaces/ModelsWorkspace'
import { AdminV2OnlineDevicesWorkspace } from '@/admin-v2/workspaces/OnlineDevicesWorkspace'
import { AdminV2ProvidersWorkspace } from '@/admin-v2/workspaces/ProvidersWorkspace'
import { AdminV2UsersWorkspace } from '@/admin-v2/workspaces/UsersWorkspace'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

type SummaryItem = {
  label: string
  value: string
  helper?: string
  icon: LucideIcon
}

type UsageOverviewItem = {
  label: string
  value: string
  helper: string
  badge?: {
    label: string
    variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'
    icon?: LucideIcon
  }
  icon: LucideIcon
}

function buildDashboardSummary(snapshot: AdminStateResponse): SummaryItem[] {
  return [
    {
      label: '历史文本',
      value: formatInteger(snapshot.history.textCount),
      helper: `最后活跃：${formatDateTime(snapshot.history.lastActivityAt ?? snapshot.history.lastTextAt)}`,
      icon: MessageSquareText,
    },
    {
      label: '历史文件',
      value: formatInteger(snapshot.history.fileCount),
      helper: `累计体积：${formatBytes(snapshot.history.totalBytes)}`,
      icon: HardDriveDownload,
    },
    {
      label: '在线设备',
      value: formatInteger(snapshot.onlineDevices.devices.length),
      helper: `快照时间：${formatDateTime(snapshot.onlineDevices.loadedAt)}`,
      icon: Monitor,
    },
    {
      label: '用户账号',
      value: formatInteger(snapshot.users?.users.length),
      helper: snapshot.users?.configured ? 'Supabase 已配置' : 'Supabase 未配置',
      icon: Users,
    },
    {
      label: '管理员角色',
      value: formatInteger(snapshot.roles?.roles.length),
      helper: snapshot.roles?.configured ? '角色快照可用' : '角色快照受限或未配置',
      icon: ShieldCheck,
    },
    {
      label: '主题反馈',
      value: formatInteger(snapshot.themeSubmissions.stats.total),
      helper: `唯一设备：${formatInteger(snapshot.themeSubmissions.stats.uniqueDevices)}`,
      icon: Palette,
    },
  ]
}

function getPrimaryProviderLabel(snapshot: AdminStateResponse) {
  if (snapshot.ai.openai.length > 0) {
    return snapshot.ai.openai[0].displayName.trim() || 'OpenAI Compatible'
  }

  if (snapshot.ai.anthropic.length > 0) {
    return 'Anthropic'
  }

  return 'Cloudflare AI'
}

function buildCurrentProviderUsageOverview(snapshot: AdminStateResponse) {
  const currentProviderItems = snapshot.usage.models
  if (currentProviderItems.length === 0) {
    return null
  }

  const totalCalls = currentProviderItems.reduce((sum, item) => sum + item.totalCalls, 0)
  const successCalls = currentProviderItems.reduce((sum, item) => sum + item.successCalls, 0)
  const failedCalls = currentProviderItems.reduce((sum, item) => sum + item.failedCalls, 0)
  const rejectedCalls = currentProviderItems.reduce((sum, item) => sum + item.quotaRejectedCalls, 0)
  const topModel = [...currentProviderItems].sort((left, right) => right.totalCalls - left.totalCalls)[0] ?? null
  const successRate = totalCalls > 0 ? (successCalls / totalCalls) * 100 : 0
  const providerLabel = getPrimaryProviderLabel(snapshot)

  return {
    providerLabel,
    items: [
      {
        label: '总调用量',
        value: formatInteger(totalCalls),
        helper: providerLabel,
        badge: {
          label: providerLabel,
          variant: 'secondary',
        },
        icon: BarChart3,
      },
      {
        label: '成功率',
        value: `${successRate.toFixed(1)}%`,
        helper: `成功 ${formatInteger(successCalls)} 次`,
        badge: {
          label: successRate >= 95 ? '稳定' : '关注',
          variant: successRate >= 95 ? 'secondary' : 'outline',
          icon: TrendingUp,
        },
        icon: TrendingUp,
      },
      {
        label: '失败 / 拒绝',
        value: formatInteger(failedCalls + rejectedCalls),
        helper: `失败 ${formatInteger(failedCalls)} · 拒绝 ${formatInteger(rejectedCalls)}`,
        badge: {
          label: failedCalls + rejectedCalls > 0 ? '有异常' : '正常',
          variant: failedCalls + rejectedCalls > 0 ? 'destructive' : 'secondary',
          icon: AlertTriangle,
        },
        icon: AlertTriangle,
      },
      {
        label: 'Top model',
        value: topModel?.modelLabel || '无',
        helper: topModel ? `${formatInteger(topModel.totalCalls)} 次调用` : '暂无模型数据',
        badge: topModel
          ? {
              label: topModel.modelId,
              variant: 'outline',
            }
          : undefined,
        icon: Trophy,
      },
    ] satisfies UsageOverviewItem[],
  }
}

function SnapshotSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index.toString()}>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-28" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SummaryGrid({
  items,
}: Readonly<{
  items: SummaryItem[]
}>) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="mt-2 text-2xl">{item.value}</CardTitle>
            </div>
            <div className="rounded-xl bg-muted p-3 text-muted-foreground">
              <item.icon className="size-5" />
            </div>
          </CardHeader>
          {item.helper ? (
            <CardContent className="pt-0 text-xs text-muted-foreground">
              {item.helper}
            </CardContent>
          ) : null}
        </Card>
      ))}
    </div>
  )
}

function UsageOverviewGrid({
  items,
}: Readonly<{
  items: UsageOverviewItem[]
}>) {
  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader>
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <item.icon className="size-4" />
              </div>
            </CardTitle>
            <CardDescription>{item.label}</CardDescription>
            {item.badge ? (
              <CardAction>
                <Badge variant={item.badge.variant ?? 'secondary'}>
                  {item.badge.icon ? <item.badge.icon data-icon="inline-start" /> : null}
                  {item.badge.label}
                </Badge>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="font-medium text-3xl leading-none tracking-tight">
              {item.value}
            </div>
            <p className="text-sm text-muted-foreground">{item.helper}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ReadOnlyPlaceholder({
  section,
  snapshot,
}: Readonly<{
  section: Extract<AdminV2Section, 'themes' | 'roles'>
  snapshot: AdminStateResponse
}>) {
  const meta = ADMIN_V2_SECTION_META[section]
  const isRoles = section === 'roles'

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{meta.title}</Badge>
            <Badge variant="outline">占位保留</Badge>
            {meta.requiresSuperAdmin ? <Badge variant="secondary">仅超级管理员</Badge> : null}
          </div>
          <CardTitle className="mt-3 text-2xl">{meta.title}</CardTitle>
          <CardDescription>{meta.description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {meta.phaseSummary}
        </CardContent>
      </Card>

      <SummaryGrid
        items={isRoles
          ? [
              {
                label: '角色数量',
                value: formatInteger(snapshot.roles?.roles.length),
                helper: snapshot.roles?.configured ? '角色快照可见' : '当前账号或后端未提供角色快照',
                icon: ShieldCheck,
              },
              {
                label: '当前身份',
                value: snapshot.admin?.role ?? 'unknown',
                helper: snapshot.admin?.isSuperAdmin ? '具备超级管理员权限' : '普通管理员只读访问',
                icon: Users,
              },
            ]
          : [
              {
                label: '提交总数',
                value: formatInteger(snapshot.themeSubmissions.stats.total),
                helper: `唯一设备：${formatInteger(snapshot.themeSubmissions.stats.uniqueDevices)}`,
                icon: Palette,
              },
              {
                label: '存储后端',
                value: snapshot.themeSubmissions.storage,
                helper: `最后提交：${formatDateTime(snapshot.themeSubmissions.stats.latestAt)}`,
                icon: Database,
              },
            ]}
      />
    </div>
  )
}

export function AdminV2IndexPage() {
  const router = useRouter()
  const { isAuthenticated, isBootstrapping } = useAdminV2Session()

  useEffect(() => {
    if (!isBootstrapping) {
      router.replace(isAuthenticated ? ADMIN_V2_DASHBOARD_PATH : ADMIN_V2_LOGIN_PATH)
    }
  }, [isAuthenticated, isBootstrapping, router])

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>正在进入管理台</CardTitle>
          <CardDescription>根据当前 Cookie 会话决定跳转到登录页还是仪表盘。</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

export function AdminV2LoginPage() {
  const router = useRouter()
  const {
    error,
    clearError,
    isAuthenticated,
    isBootstrapping,
    isAuthSubmitting,
    isDevLoginEnabled,
    login,
    devLogin,
  } = useAdminV2Session()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (!isBootstrapping && isAuthenticated) {
      router.replace(ADMIN_V2_DASHBOARD_PATH)
    }
  }, [isAuthenticated, isBootstrapping, router])

  const submitDisabled = isBootstrapping || isAuthSubmitting

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge>Phase 2</Badge>
            <Badge variant="outline">{ADMIN_V2_BASE_PATH}</Badge>
          </div>
          <CardTitle className="mt-3 text-2xl">全新独立管理台</CardTitle>
          <CardDescription>
            当前已接通模板骨架、登录态、session 首帧，以及 4 个优先工作区的真实交互。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="admin-v2-email">
              管理员邮箱
            </label>
            <Input
              id="admin-v2-email"
              type="email"
              autoComplete="username"
              placeholder="admin@example.com"
              value={email}
              onChange={(event) => {
                clearError()
                setEmail(event.target.value)
              }}
              disabled={submitDisabled}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="admin-v2-password">
              账号密码
            </label>
            <Input
              id="admin-v2-password"
              type="password"
              autoComplete="current-password"
              placeholder="请输入管理员密码"
              value={password}
              onChange={(event) => {
                clearError()
                setPassword(event.target.value)
              }}
              disabled={submitDisabled}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              登录成功后直接使用返回的聚合快照进入后台，不额外补拉一次 session。
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={submitDisabled}
              onClick={async () => {
                if (!email.trim() || !password.trim()) {
                  return
                }
                const ok = await login(email.trim(), password.trim())
                if (ok) {
                  router.replace(ADMIN_V2_DASHBOARD_PATH)
                }
              }}
            >
              {isAuthSubmitting ? '登录中...' : '进入后台'}
            </Button>
            {isDevLoginEnabled ? (
              <Button
                type="button"
                variant="outline"
                disabled={submitDisabled}
                onClick={async () => {
                  const ok = await devLogin()
                  if (ok) {
                    router.replace(ADMIN_V2_DASHBOARD_PATH)
                  }
                }}
              >
                开发环境一键登录
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function AdminV2DashboardPage() {
  const { snapshot } = useAdminV2Session()

  if (!snapshot) {
    return <SnapshotSkeleton />
  }

  const usageOverview = buildCurrentProviderUsageOverview(snapshot)

  return (
    <div className="grid gap-6">
      <SummaryGrid items={buildDashboardSummary(snapshot)} />
      <Card>
        <CardHeader>
          <CardTitle>模型调用概览</CardTitle>
          <CardDescription>按所有已配置供应商聚合的调用结果</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {usageOverview ? (
            <UsageOverviewGrid items={usageOverview.items} />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BarChart3 />
                </EmptyMedia>
                <EmptyTitle>当前供应商暂无调用记录</EmptyTitle>
                <EmptyDescription>
                  这里展示所有已配置供应商的模型调用概览。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <UserVisitVolumeCard className="h-full" snapshot={snapshot} />
        </div>
        <div className="xl:col-span-5">
          <ModelTokenAllocationCard className="h-full" snapshot={snapshot} />
        </div>
      </div>
      <AccountQuotaOverviewCard snapshot={snapshot} />
    </div>
  )
}

function SuperAdminPermissionGuard({
  title,
  description,
}: Readonly<{
  title: string
  description: string
}>) {
  return (
    <Card className="border-destructive/20 bg-destructive/5 ring-destructive/10">
      <CardHeader>
        <CardTitle className="text-base text-destructive">权限受限</CardTitle>
        <CardDescription className="text-destructive/80">
          当前账号不是超级管理员。{title} 已保留正式入口，但只有超级管理员能{description}。
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

export function AdminV2AiPolicyPage() {
  const {
    aiDraft,
    adminSession,
    snapshot,
    isAiSaving,
    hasAiDraftChanges,
    error,
    clearError,
    updateAiDraft,
    saveAiDraft,
  } = useAdminV2Session()

  if (!snapshot || !aiDraft) {
    return <SnapshotSkeleton />
  }

  if (!adminSession?.isSuperAdmin) {
    return (
      <SuperAdminPermissionGuard
        title="AI 策略页"
        description="修改全局 system prompt 和非 provider 级策略项"
      />
    )
  }

  return (
    <AdminV2AiPolicyWorkspace
      systemPromptDraft={aiDraft.systemPrompt}
      savedSystemPrompt={snapshot.ai.systemPrompt}
      canEdit
      isSaving={isAiSaving}
      hasUnsavedChanges={hasAiDraftChanges}
      error={error}
      onClearError={clearError}
      onDraftChange={(value) => {
        updateAiDraft((current) => ({
          ...current,
          systemPrompt: value,
        }))
      }}
      onAutosave={() => {
        void saveAiDraft(undefined, { showSuccessToast: false })
      }}
    />
  )
}

export function AdminV2WorkspacePage({
  section,
}: Readonly<{
  section: AdminV2Section
}>) {
  const {
    aiDraft,
    adminSession,
    snapshot,
    isAiSaving,
    isOnlineDevicesRefreshing,
    isRenamingOnlineDevice,
    isUpdatingUser,
    hasAiDraftChanges,
    error,
    clearError,
    updateAiDraft,
    resetAiDraft,
    saveAiDraft,
    detectAnthropicModels,
    detectOpenAiCompatibleModels,
    refreshOnlineDevices,
    renameOnlineDevice,
    updateUserQuota,
  } = useAdminV2Session()

  if (!snapshot) {
    return <SnapshotSkeleton />
  }

  if (section === 'models' && aiDraft) {
    return (
      <AdminV2ModelsWorkspace
        aiDraft={aiDraft}
        canEdit={Boolean(adminSession?.isSuperAdmin)}
        hasChanges={hasAiDraftChanges}
        isSaving={isAiSaving}
        onReset={resetAiDraft}
        onSave={() => {
          void saveAiDraft()
        }}
        onChange={updateAiDraft}
      />
    )
  }

  if (section === 'providers') {
    if (!adminSession?.isSuperAdmin || !aiDraft) {
      return (
        <SuperAdminPermissionGuard
          title="供应商配置页"
          description="修改连接配置和模型探测设置"
        />
      )
    }

    return (
      <AdminV2ProvidersWorkspace
        aiDraft={aiDraft}
        savedSettings={snapshot.ai}
        canEdit
        isSaving={isAiSaving}
        hasUnsavedChanges={hasAiDraftChanges}
        error={error}
        onClearError={clearError}
        onChange={updateAiDraft}
        onAutosave={(draftOverride, options) => {
          return saveAiDraft(draftOverride, options)
        }}
        onDetectAnthropicModels={detectAnthropicModels}
        onDetectOpenAiCompatibleModels={detectOpenAiCompatibleModels}
      />
    )
  }

  if (section === 'ai-policy') {
    return <AdminV2AiPolicyPage />
  }

  if (section === 'online') {
    return (
      <AdminV2OnlineDevicesWorkspace
        onlineDevices={snapshot.onlineDevices}
        isRefreshing={isOnlineDevicesRefreshing}
        isSaving={isRenamingOnlineDevice}
        onRefresh={refreshOnlineDevices}
        onRename={async (deviceId, deviceName) => renameOnlineDevice({ deviceId, deviceName })}
      />
    )
  }

  if (section === 'users') {
    return (
      <AdminV2UsersWorkspace
        users={snapshot.users}
        isSaving={isUpdatingUser}
        onSaveQuota={updateUserQuota}
      />
    )
  }

  if (section === 'themes' || section === 'roles') {
    return <ReadOnlyPlaceholder section={section} snapshot={snapshot} />
  }

  return null
}
