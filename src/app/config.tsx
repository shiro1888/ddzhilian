import type { NavItem, NavView, QuickPanel, StageMeta } from './types'

export const navItems: NavItem[] = [
  {
    id: 'connect',
    label: '连接设备',
    hint: '发现并接入其他设备',
    icon: (
      <>
        <path d="M8 7V4.5" />
        <path d="M16 7V4.5" />
        <path d="M7 7h10v5.5a5 5 0 0 1-10 0z" />
        <path d="M12 17.5V21" />
        <path d="M9.5 21h5" />
      </>
    ),
  },
  {
    id: 'send',
    label: '发送文件',
    hint: '投递文件并生成会话',
    icon: (
      <>
        <path d="m4 12 15.5-7-4.3 15-3.3-6.4z" />
        <path d="m11.9 13.6 7.6-8.6" />
      </>
    ),
  },
  {
    id: 'receive',
    label: '接收文件',
    hint: '查看待接收与签收记录',
    icon: (
      <>
        <path d="M5 13.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4.5" />
        <path d="M8.5 14h7" />
        <path d="M12 4v9" />
        <path d="m8.5 9.5 3.5 3.5 3.5-3.5" />
      </>
    ),
  },
  {
    id: 'text',
    label: '长文本',
    hint: '发送验证码、链接与便笺',
    icon: (
      <>
        <path d="M7 3.8h7l3 3V20H7z" />
        <path d="M14 3.8V7h3" />
        <path d="M9.5 11h5" />
        <path d="M9.5 14h5" />
        <path d="M9.5 17h3" />
      </>
    ),
  },
  {
    id: 'chat',
    label: 'AI 聊天',
    hint: '独立智能对话页',
    icon: (
      <>
        <path d="M5 8.5A3.5 3.5 0 0 1 8.5 5h6.8A3.7 3.7 0 0 1 19 8.7v3A3.3 3.3 0 0 1 15.7 15H12l-4 4v-4.2A3.1 3.1 0 0 1 5 11.7z" />
        <path d="M12 8.2v3.2" />
        <path d="M10.4 9.8h3.2" />
        <path d="M16.8 4.2v2.4" />
        <path d="M15.6 5.4H18" />
      </>
    ),
  },
  {
    id: 'image',
    label: '生图',
    hint: '用 gpt-image-2 生成图片',
    icon: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="3" />
        <circle cx="9" cy="10" r="1.4" />
        <path d="m7 16 3.2-3.4 2.4 2.5 1.7-1.9L17.5 16" />
        <path d="M17.5 4v2.4" />
        <path d="M16.3 5.2h2.4" />
      </>
    ),
  },
  {
    id: 'sessions',
    label: '会话记录',
    hint: '搜索当前与历史会话',
    icon: (
      <>
        <path d="M6 7h12" />
        <path d="M6 12h12" />
        <path d="M6 17h8" />
        <path d="M4 7h.01" />
        <path d="M4 12h.01" />
        <path d="M4 17h.01" />
        <path d="M18 17l2 2" />
      </>
    ),
  },
  {
    id: 'admin',
    label: '管理员',
    hint: '清理历史与管理模型接入',
    icon: (
      <>
        <path d="M12 3.5 5.5 6.2v5.1c0 4 2.7 7.7 6.5 9.2 3.8-1.5 6.5-5.2 6.5-9.2V6.2Z" />
        <path d="M9.5 11.8 11.2 13.5 14.8 9.8" />
      </>
    ),
  },
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
  chat: {
    title: 'AI 聊天',
    description: '独立的智能对话页，适合输出文字、代码与连续问答。',
    primaryAction: '发送',
    secondaryAction: '新建',
  },
  image: {
    title: '图片生成',
    description: '通过 Codex 反代接入 gpt-image-2，按聊天方式生成图片。',
    primaryAction: '生成',
    secondaryAction: '清空',
  },
  sessions: {
    title: '会话记录',
    description: '搜索当前与历史会话。',
    primaryAction: '刷新列表',
    secondaryAction: '查看在线设备',
  },
  admin: {
    title: '管理员',
    description: '清理历史记录，并管理当前服务器的 AI 模型接入配置。',
    primaryAction: '保存配置',
    secondaryAction: '清空历史',
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
