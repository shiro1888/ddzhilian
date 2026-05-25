'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LogOut,
  MoonStar,
  ShieldCheck,
  Sparkles,
  SunMedium,
} from 'lucide-react'
import { useAdminV2Session } from '@/admin-v2/session'
import {
  ADMIN_V2_DASHBOARD_PATH,
  ADMIN_V2_LOGIN_PATH,
  ADMIN_V2_NAV_ITEMS,
  ADMIN_V2_SECTION_META,
  resolveAdminV2SectionFromPathname,
} from '@/admin-v2/config'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { applyThemeMode } from '@/lib/preferences/theme-utils'
import { usePreferencesStore } from '@/stores/preferences/preferences-provider'

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

function writeClientPreference(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`
}

function AdminV2ThemeToggle() {
  const themeMode = usePreferencesStore((state) => state.themeMode)
  const resolvedThemeMode = usePreferencesStore((state) => state.resolvedThemeMode)
  const setThemeMode = usePreferencesStore((state) => state.setThemeMode)

  const currentMode = themeMode === 'system' ? resolvedThemeMode : themeMode
  const nextMode = currentMode === 'dark' ? 'light' : 'dark'

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={() => {
        setThemeMode(nextMode)
        writeClientPreference('theme_mode', nextMode)
        applyThemeMode(nextMode)
      }}
      aria-label={currentMode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
    >
      {currentMode === 'dark' ? <SunMedium /> : <MoonStar />}
    </Button>
  )
}

function AdminV2Sidebar() {
  const pathname = usePathname()
  const adminSession = useAdminV2Session().adminSession
  const sidebarVariant = usePreferencesStore((state) => state.sidebarVariant)
  const sidebarCollapsible = usePreferencesStore((state) => state.sidebarCollapsible)
  const isSynced = usePreferencesStore((state) => state.isSynced)

  return (
    <Sidebar
      variant={isSynced ? sidebarVariant : 'inset'}
      collapsible={isSynced ? sidebarCollapsible : 'icon'}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" isActive={pathname === ADMIN_V2_DASHBOARD_PATH}>
              <Link href={ADMIN_V2_DASHBOARD_PATH} prefetch={false}>
                <Sparkles />
                <span>ddzhilian Admin V2</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {ADMIN_V2_NAV_ITEMS.map((item) => {
            const active = pathname === item.href
            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                  <Link href={item.href} prefetch={false}>
                    <item.icon />
                    <span>{item.label}</span>
                    {item.requiresSuperAdmin ? (
                      <Badge variant="outline" className="ml-auto group-data-[collapsible=icon]:hidden">
                        超管
                      </Badge>
                    ) : null}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <Card size="sm" className="bg-sidebar-accent/40 ring-sidebar-border">
          <CardHeader className="gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4" />
              当前管理员
            </CardTitle>
            <CardDescription>{adminSession?.email ?? '未登录'}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Badge>{adminSession?.role === 'super_admin' ? 'super_admin' : 'admin'}</Badge>
            {adminSession?.isSuperAdmin ? (
              <Badge variant="secondary">已启用高级权限</Badge>
            ) : null}
          </CardContent>
        </Card>
      </SidebarFooter>
    </Sidebar>
  )
}

function AdminV2ShellChrome({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const pathname = usePathname()
  const router = useRouter()
  const { adminSession, error, logout } = useAdminV2Session()
  const section = resolveAdminV2SectionFromPathname(pathname)
  const meta = ADMIN_V2_SECTION_META[section]

  return (
    <SidebarProvider
      defaultOpen
      style={{ '--sidebar-width': '17rem' } as CSSProperties}
    >
      <AdminV2Sidebar />
      <SidebarInset className="peer-data-[variant=inset]:border [html[data-content-layout=centered]_&>*]:mx-auto [html[data-content-layout=centered]_&>*]:w-full [html[data-content-layout=centered]_&>*]:max-w-screen-2xl">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center border-b bg-background/80 backdrop-blur-md">
          <div className="flex w-full items-center justify-between gap-4 px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mx-1 h-4" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{meta.title}</p>
                <p className="truncate text-xs text-muted-foreground">{meta.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {adminSession?.isSuperAdmin ? <Badge variant="secondary">super_admin</Badge> : null}
              <AdminV2ThemeToggle />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await logout()
                  router.replace(ADMIN_V2_LOGIN_PATH)
                }}
              >
                <LogOut data-icon="inline-start" />
                退出
              </Button>
            </div>
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6">
          {error ? (
            <Card className="mb-4 border-destructive/20 bg-destructive/5 text-destructive ring-destructive/10">
              <CardHeader>
                <CardTitle className="text-sm">后台状态提示</CardTitle>
                <CardDescription className="text-destructive/80">{error}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function AdminV2LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>正在初始化管理台</CardTitle>
          <CardDescription>后台首帧依赖真实 session 快照，正在检查当前登录态。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

export function AdminV2ProtectedLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const router = useRouter()
  const { isAuthenticated, isBootstrapping } = useAdminV2Session()

  useEffect(() => {
    if (!isBootstrapping && !isAuthenticated) {
      router.replace(ADMIN_V2_LOGIN_PATH)
    }
  }, [isAuthenticated, isBootstrapping, router])

  if (isBootstrapping) {
    return <AdminV2LoadingState />
  }

  if (!isAuthenticated) {
    return null
  }

  return <AdminV2ShellChrome>{children}</AdminV2ShellChrome>
}
