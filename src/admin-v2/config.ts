import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  Database,
  LayoutDashboard,
  Monitor,
  Palette,
  Settings2,
  Shield,
  Users,
} from 'lucide-react'

export const ADMIN_V2_BASE_PATH = '/admin'
export const ADMIN_V2_LOGIN_PATH = `${ADMIN_V2_BASE_PATH}/login`
export const ADMIN_V2_DASHBOARD_PATH = `${ADMIN_V2_BASE_PATH}/dashboard`

export type AdminV2Section =
  | 'dashboard'
  | 'models'
  | 'providers'
  | 'ai-policy'
  | 'online'
  | 'users'
  | 'themes'
  | 'roles'

export type AdminV2NavItem = {
  key: AdminV2Section
  label: string
  href: string
  icon: LucideIcon
  requiresSuperAdmin?: boolean
}

export const ADMIN_V2_NAV_ITEMS: AdminV2NavItem[] = [
  {
    key: 'dashboard',
    label: '仪表盘',
    href: ADMIN_V2_DASHBOARD_PATH,
    icon: LayoutDashboard,
  },
  {
    key: 'models',
    label: '模型目录',
    href: `${ADMIN_V2_BASE_PATH}/models`,
    icon: Database,
  },
  {
    key: 'providers',
    label: '供应商',
    href: `${ADMIN_V2_BASE_PATH}/providers`,
    icon: Settings2,
    requiresSuperAdmin: true,
  },
  {
    key: 'ai-policy',
    label: 'AI 策略',
    href: `${ADMIN_V2_BASE_PATH}/ai-policy`,
    icon: Bot,
    requiresSuperAdmin: true,
  },
  {
    key: 'online',
    label: '在线设备',
    href: `${ADMIN_V2_BASE_PATH}/online`,
    icon: Monitor,
  },
  {
    key: 'users',
    label: '用户额度',
    href: `${ADMIN_V2_BASE_PATH}/users`,
    icon: Users,
  },
  {
    key: 'themes',
    label: '主题反馈',
    href: `${ADMIN_V2_BASE_PATH}/themes`,
    icon: Palette,
  },
  {
    key: 'roles',
    label: '角色管理',
    href: `${ADMIN_V2_BASE_PATH}/roles`,
    icon: Shield,
    requiresSuperAdmin: true,
  },
]

export const ADMIN_V2_SECTION_META: Record<
  AdminV2Section,
  {
    title: string
    description: string
    phaseSummary: string
    requiresSuperAdmin?: boolean
  }
> = {
  dashboard: {
    title: '仪表盘',
    description: '首帧总览、管理员身份和核心快照摘要。',
    phaseSummary: '',
  },
  models: {
    title: '模型目录',
    description: '展示当前模型目录和默认模型的只读摘要。',
    phaseSummary: '',
  },
  providers: {
    title: '供应商配置',
    description: '按主运行供应商链路重组连接配置、检测与刷新动作。',
    phaseSummary: '',
    requiresSuperAdmin: true,
  },
  'ai-policy': {
    title: 'AI 策略',
    description: '管理全局 system prompt 与非 provider 级 AI 策略。',
    phaseSummary: '',
    requiresSuperAdmin: true,
  },
  online: {
    title: '在线设备',
    description: '展示在线设备快照与后台当前加载时间。',
    phaseSummary: '',
  },
  users: {
    title: '用户额度',
    description: '展示用户额度快照和 Supabase 配置状态。',
    phaseSummary: '',
  },
  themes: {
    title: '主题反馈',
    description: '展示 SnapLink 主题反馈聚合状态。',
    phaseSummary: '',
  },
  roles: {
    title: '角色管理',
    description: '展示管理员角色快照和权限边界。',
    phaseSummary: '',
    requiresSuperAdmin: true,
  },
}

export function resolveAdminV2SectionFromPathname(pathname: string): AdminV2Section {
  const matched = ADMIN_V2_NAV_ITEMS.find((item) => pathname.startsWith(item.href))
  return matched?.key ?? 'dashboard'
}
