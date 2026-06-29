import {
  Bot,
  Clock3,
  Command,
  FileText,
  FolderOpen,
  History,
  ImageIcon,
  Settings,
  Users,
  Wifi,
} from 'lucide-react'

export type SidebarNavMode = 'nearby' | 'rooms' | 'files' | 'transfers' | 'text' | 'history' | 'settings'
export type SidebarNavTool = 'ai-chat' | 'image' | 'command'

type SidebarNavProps = {
  deviceName: string
  activeMode?: SidebarNavMode | null
  activeTool?: SidebarNavTool | null
  onShowNearby: () => void
  onShowRooms: () => void
  onShowFiles: () => void
  onShowQueue: () => void
  onShowText: () => void
  onShowHistory: () => void
  onOpenAiChat: () => void
  onOpenImage: () => void
  onOpenCommand: () => void
  onShowSettings: () => void
}

function getSidebarInitial(value: string) {
  const normalizedValue = value.trim()
  return (normalizedValue ? Array.from(normalizedValue)[0] : 'D').toUpperCase()
}

export function SidebarNav({
  deviceName,
  activeMode = null,
  activeTool = null,
  onShowNearby,
  onShowRooms,
  onShowFiles,
  onShowQueue,
  onShowText,
  onShowHistory,
  onOpenAiChat,
  onOpenImage,
  onOpenCommand,
  onShowSettings,
}: SidebarNavProps) {
  return (
    <aside className="dd-snaplink__rail" aria-label="主导航">
      <div className="dd-snaplink__rail-logo">
        <img src="/logo-dd-link.svg" alt="" />
      </div>
      <nav className="dd-snaplink__rail-nav" aria-label="DD直连功能">
        <button
          type="button"
          className={activeMode === 'nearby' ? 'is-active' : ''}
          aria-pressed={activeMode === 'nearby'}
          onClick={onShowNearby}
          title="附近设备"
        >
          <Wifi size={22} strokeWidth={1.8} aria-hidden="true" />
          <span>附近设备</span>
        </button>
        <button
          type="button"
          className={activeMode === 'rooms' ? 'is-active' : ''}
          aria-pressed={activeMode === 'rooms'}
          onClick={onShowRooms}
          title="房间"
        >
          <Users size={21} strokeWidth={1.8} aria-hidden="true" />
          <span>房间</span>
        </button>
        <button
          type="button"
          className={activeMode === 'files' ? 'is-active' : ''}
          aria-pressed={activeMode === 'files'}
          onClick={onShowFiles}
          title="文件发送"
        >
          <FolderOpen size={21} strokeWidth={1.8} aria-hidden="true" />
          <span>文件</span>
        </button>
        <button
          type="button"
          className={activeMode === 'transfers' ? 'is-active' : ''}
          aria-pressed={activeMode === 'transfers'}
          onClick={onShowQueue}
          title="传输队列"
        >
          <History size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>传输</span>
        </button>
        <span className="dd-snaplink__rail-nav-separator" aria-hidden="true" />
        <button
          type="button"
          className={activeMode === 'text' ? 'is-active' : ''}
          aria-pressed={activeMode === 'text'}
          onClick={onShowText}
          title="发送文本"
        >
          <FileText size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>文本</span>
        </button>
        <button
          type="button"
          className={activeMode === 'history' ? 'is-active' : ''}
          aria-pressed={activeMode === 'history'}
          onClick={onShowHistory}
          title="历史记录"
        >
          <Clock3 size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>历史</span>
        </button>
        <button
          type="button"
          className={activeTool === 'ai-chat' ? 'is-active' : ''}
          aria-pressed={activeTool === 'ai-chat'}
          onClick={onOpenAiChat}
          title="AI"
        >
          <Bot size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>AI</span>
        </button>
        <button
          type="button"
          className={activeTool === 'image' ? 'is-active' : ''}
          aria-pressed={activeTool === 'image'}
          onClick={onOpenImage}
          title="AI 图片"
        >
          <ImageIcon size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>图片</span>
        </button>
        <button
          type="button"
          className={activeTool === 'command' ? 'is-active' : ''}
          aria-pressed={activeTool === 'command'}
          onClick={onOpenCommand}
          title="命令行"
        >
          <Command size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>命令</span>
        </button>
      </nav>
      <button
        type="button"
        className={`dd-snaplink__rail-settings${activeMode === 'settings' ? ' is-active' : ''}`}
        aria-pressed={activeMode === 'settings'}
        onClick={onShowSettings}
        title="设置"
      >
        <Settings size={20} strokeWidth={1.8} aria-hidden="true" />
        <span>设置</span>
      </button>
      <span className="dd-snaplink__rail-avatar">{getSidebarInitial(deviceName)}</span>
    </aside>
  )
}
