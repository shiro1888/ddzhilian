import { useState } from 'react'
import {
  Grid2X2,
  History,
  Send,
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
  onOpenAiChat,
  onOpenImage,
  onOpenCommand,
  onShowSettings,
}: SidebarNavProps) {
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false)
  const isToolActive = activeTool === 'ai-chat' || activeTool === 'image' || activeTool === 'command'

  const openTool = (action: () => void) => {
    setIsToolMenuOpen(false)
    action()
  }

  return (
    <aside className="dd-snaplink__rail" aria-label="主导航">
      <div className="dd-snaplink__rail-logo">
        <img src="/logo-dd-link.svg" alt="" />
      </div>
      <nav className="dd-snaplink__rail-nav" aria-label="DD直连主功能">
        <button
          type="button"
          className={activeMode === 'nearby' ? 'is-active' : ''}
          aria-pressed={activeMode === 'nearby'}
          onClick={onShowNearby}
          title="附近"
        >
          <Wifi size={22} strokeWidth={1.8} aria-hidden="true" />
          <span>附近</span>
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
          title="发送"
        >
          <Send size={21} strokeWidth={1.8} aria-hidden="true" />
          <span>发送</span>
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
      </nav>
      <span className="dd-snaplink__rail-nav-separator" aria-hidden="true" />
      <div className="dd-snaplink__rail-tool-wrap">
        <button
          type="button"
          className={`dd-snaplink__rail-tool${isToolActive || isToolMenuOpen ? ' is-active' : ''}`}
          aria-haspopup="menu"
          aria-expanded={isToolMenuOpen}
          aria-pressed={isToolActive || isToolMenuOpen}
          onClick={() => setIsToolMenuOpen((current) => !current)}
          title="工具中心"
        >
          <Grid2X2 size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>工具</span>
        </button>
        {isToolMenuOpen ? (
          <>
            <button
              type="button"
              className="dd-snaplink__rail-tool-scrim"
              aria-label="关闭工具中心"
              onClick={() => setIsToolMenuOpen(false)}
            />
            <div className="dd-snaplink__rail-tool-menu" role="menu" aria-label="工具中心">
              <span className="dd-snaplink__rail-tool-menu-head">
                <strong>工具中心</strong>
                <small>辅助能力 · 非主流程</small>
              </span>
              <button
                type="button"
                role="menuitem"
                className={activeTool === 'ai-chat' ? 'is-current' : ''}
                onClick={() => openTool(onOpenAiChat)}
              >
                <span className="is-ai">AI</span>
                <em>
                  <strong>AI 助手</strong>
                  <small>生成文件说明 · 总结传输内容</small>
                </em>
              </button>
              <button
                type="button"
                role="menuitem"
                className={activeTool === 'image' ? 'is-current' : ''}
                onClick={() => openTool(onOpenImage)}
              >
                <span className="is-image">图</span>
                <em>
                  <strong>图片工具</strong>
                  <small>图片生成与传输文件联动</small>
                </em>
              </button>
              <button
                type="button"
                role="menuitem"
                className={activeTool === 'command' ? 'is-current' : ''}
                onClick={() => openTool(onOpenCommand)}
              >
                <span className="is-command">&gt;_</span>
                <em>
                  <strong>Web 命令行</strong>
                  <small>运行代码并发送结果</small>
                </em>
              </button>
            </div>
          </>
        ) : null}
      </div>
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
