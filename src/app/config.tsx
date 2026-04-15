import type { NavItem, NavView, QuickPanel, StageMeta, ThemeOption } from './types'

export const THEME_STORAGE_KEY = 'ccconnect-theme'

export const navItems: NavItem[] = [
  {
    id: 'connect',
    label: '连接设备',
    hint: '发现并接入其他设备',
    icon: (
      <>
        <rect x="3.5" y="5" width="17" height="14" rx="3" />
        <path d="M8 3.5v3" />
        <path d="M16 3.5v3" />
        <path d="M8 20.5v-3" />
        <path d="M16 20.5v-3" />
      </>
    ),
  },
  {
    id: 'send',
    label: '发送文件',
    hint: '投递文件并生成会话',
    icon: (
      <>
        <path d="M12 20V6" />
        <path d="M6.5 11.5 12 6l5.5 5.5" />
        <path d="M5 20.5h14" />
      </>
    ),
  },
  {
    id: 'receive',
    label: '接收文件',
    hint: '查看待接收与签收记录',
    icon: (
      <>
        <path d="M12 4v14" />
        <path d="m6.5 12.5 5.5 5.5 5.5-5.5" />
        <path d="M5 20.5h14" />
      </>
    ),
  },
  {
    id: 'text',
    label: '长文本',
    hint: '发送验证码、链接与便笺',
    icon: (
      <>
        <path d="M4 6.5a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" />
        <path d="M8 8.5h8" />
        <path d="M8 11.5h5.5" />
      </>
    ),
  },
  {
    id: 'sessions',
    label: '会话记录',
    hint: '搜索当前与历史会话',
    icon: (
      <>
        <path d="M6.5 5h11A1.5 1.5 0 0 1 19 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5v-11A1.5 1.5 0 0 1 6.5 5Z" />
        <path d="M8 9h8" />
        <path d="M8 12h8" />
        <path d="M8 15h5" />
      </>
    ),
  },
]

export const themeOptions: ThemeOption[] = [
  { id: 'classic', label: '经典暖砂', description: '暖色、杂志感、强调卡片层次。' },
  { id: 'chat-desktop', label: '聊天桌面', description: '灰绿桌面聊天风，强调消息工作区。' },
]

export const viewMeta: Record<NavView, StageMeta> = {
  connect: {
    title: '连接设备',
    description: '先建立连接，再决定传文件还是发文本。工具页的第一件事应该是让另一台设备快速加入。',
    primaryAction: '连接其他设备',
    secondaryAction: '刷新列表',
  },
  send: {
    title: '发送文件',
    description: '点对点文件传输助手，可实时共享，也可直接推送。',
    primaryAction: '发送',
    secondaryAction: '刷新列表',
  },
  receive: {
    title: '接收文件',
    description: '从连接的设备实时接收文件。',
    primaryAction: '接收此会话',
    secondaryAction: '刷新列表',
  },
  text: {
    title: '长文本',
    description: '在设备之间互发消息，或传送长图文内容。',
    primaryAction: '发送',
    secondaryAction: '刷新列表',
  },
  sessions: {
    title: '会话记录',
    description: '搜索当前与历史会话。',
    primaryAction: '刷新列表',
    secondaryAction: '查看在线设备',
  },
}

export const quickPanels: QuickPanel[] = [
  {
    title: '私密直连',
    body: '会话短留、不扫盘、不做公开目录，只让参与的设备知道这次交接。',
  },
  {
    title: '免安装接入',
    body: '浏览器、桌面端、平板都能用同一套互传码逻辑加入当前会话。',
  },
  {
    title: '高速传输',
    body: '文件会话和文本会话分开处理，利于接后端继续接局域网或 WebRTC 直连。',
  },
  {
    title: '实时共享',
    body: '发送台、会话列表、详情面板保持同步，不用在多个页面来回跳。',
  },
]
