import type { CSSProperties, FormEventHandler, ReactNode } from 'react'
import {
  Bot,
  Camera,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Monitor,
  MoonStar,
  ScanText,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wifi,
} from 'lucide-react'
import type { ResolvedThemeMode, ThemeMode } from '../../lib/preferences/theme'

type SettingsPanelThemeModeOption = {
  label: string
  description: string
  value: ThemeMode
}

type SettingsPanelProps = {
  header?: ReactNode
  deviceName: string
  avatarDataUrl?: string | null
  deviceNameDraft: string
  deviceNameError: string | null
  devicePlatform: string
  deviceShortCode?: string
  deviceId?: string
  accountId?: string
  discoverable: boolean
  allowShortCode: boolean
  autoConnect: boolean
  enterToSend: boolean
  soundEffects?: boolean
  themeMode: ThemeMode
  resolvedThemeMode: ResolvedThemeMode
  feedbackMessage: string | null
  canOpenAdmin?: boolean
  onAvatarClick?: () => void
  onDeviceNameDraftChange: (value: string) => void
  onDeviceNameSubmit: FormEventHandler<HTMLFormElement>
  onDiscoverableChange: (checked: boolean) => void
  onAllowShortCodeChange: (checked: boolean) => void
  onAutoConnectChange: (checked: boolean) => void
  onEnterToSendChange: (checked: boolean) => void
  onSoundEffectsChange: (checked: boolean) => void
  onThemeModeChange: (mode: ThemeMode) => void
  onOpenAiChat?: () => void
  onOpenImage?: () => void
  onOpenCommand?: () => void
  onOpenOcr?: () => void
  onOpenAdmin?: () => void
}

type SettingsSwitchProps = {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}

const themeModeOptions: SettingsPanelThemeModeOption[] = [
  {
    value: 'light',
    label: '浅色',
    description: '默认白色工作台',
  },
  {
    value: 'dark',
    label: '深色',
    description: '夜间查看更安静',
  },
  {
    value: 'system',
    label: '跟随系统',
    description: '随设备外观切换',
  },
]

function SettingsSwitch({ label, description, checked, onChange }: SettingsSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`dd-snaplink__settings-switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <i aria-hidden="true" />
    </button>
  )
}

function getThemeModeSummary(mode: ThemeMode, resolvedMode: ResolvedThemeMode) {
  if (mode === 'system') {
    return `当前跟随系统，正在显示${resolvedMode === 'dark' ? '深色' : '浅色'}界面`
  }

  return `当前固定为${mode === 'dark' ? '深色' : '浅色'}界面`
}

export function SettingsPanel({
  header,
  deviceName,
  avatarDataUrl = null,
  deviceNameDraft,
  deviceNameError,
  devicePlatform,
  deviceShortCode,
  deviceId,
  accountId,
  discoverable,
  allowShortCode,
  autoConnect,
  enterToSend,
  soundEffects = true,
  themeMode,
  resolvedThemeMode,
  feedbackMessage,
  canOpenAdmin = false,
  onAvatarClick,
  onDeviceNameDraftChange,
  onDeviceNameSubmit,
  onDiscoverableChange,
  onAllowShortCodeChange,
  onAutoConnectChange,
  onEnterToSendChange,
  onSoundEffectsChange,
  onThemeModeChange,
  onOpenAiChat,
  onOpenImage,
  onOpenCommand,
  onOpenOcr,
  onOpenAdmin,
}: SettingsPanelProps) {
  return (
    <section className="dd-snaplink__workbench-page is-settings" aria-label="我的">
      {header}
      {feedbackMessage ? (
        <div className="dd-snaplink__settings-feedback" role="status" aria-live="polite">
          {feedbackMessage}
        </div>
      ) : null}
      <div className="dd-snaplink__settings-grid">
        <form className="dd-snaplink__settings-card" onSubmit={onDeviceNameSubmit}>
          <div className="dd-snaplink__settings-card-head">
            <button
              type="button"
              className={`dd-snaplink__settings-avatar${avatarDataUrl ? ' has-image' : ''}`}
              style={avatarDataUrl ? { '--dd-avatar': `url("${avatarDataUrl}")` } as CSSProperties : undefined}
              aria-label="更换头像"
              title="更换头像"
              onClick={onAvatarClick}
            >
              {avatarDataUrl ? null : <Monitor size={18} strokeWidth={1.8} aria-hidden="true" />}
              <span className="dd-snaplink__settings-avatar-badge" aria-hidden="true">
                <Camera size={10} strokeWidth={2.4} />
              </span>
            </button>
            <span>
              <strong>当前设备</strong>
              <small>这个名字会显示给附近设备</small>
            </span>
          </div>
          <label className="dd-snaplink__settings-field">
            <span>设备名</span>
            <input
              value={deviceNameDraft}
              maxLength={80}
              placeholder={deviceName}
              onChange={(event) => onDeviceNameDraftChange(event.target.value)}
            />
          </label>
          {deviceNameError ? <p className="dd-snaplink__settings-error">{deviceNameError}</p> : null}
          <div className="dd-snaplink__settings-device-facts" aria-label="当前设备身份">
            <span>
              <small>平台</small>
              <strong>{devicePlatform || '未知设备'}</strong>
            </span>
            <span>
              <small>短码</small>
              <strong>{deviceShortCode || '等待同步'}</strong>
            </span>
            <span>
              <small>设备 ID</small>
              <strong>{deviceId ? deviceId.slice(0, 8) : '本地生成中'}</strong>
            </span>
            <span>
              <small>账号</small>
              <strong>{accountId ? '已绑定' : '未绑定'}</strong>
            </span>
          </div>
          <button type="submit">
            保存设备名
          </button>
        </form>

        <div className="dd-snaplink__settings-card">
          <div className="dd-snaplink__settings-card-head">
            <MoonStar size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>
              <strong>外观模式</strong>
              <small>默认浅色，也可以切换深色或跟随系统</small>
            </span>
          </div>
          <div className="dd-snaplink__settings-mode-group" role="group" aria-label="外观模式">
            {themeModeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`dd-snaplink__settings-mode-option${themeMode === option.value ? ' is-active' : ''}`}
                aria-pressed={themeMode === option.value}
                onClick={() => onThemeModeChange(option.value)}
              >
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
          <p className="dd-snaplink__settings-mode-note">
            {getThemeModeSummary(themeMode, resolvedThemeMode)}
          </p>
        </div>

        <div className="dd-snaplink__settings-card">
          <div className="dd-snaplink__settings-card-head">
            <Wifi size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>
              <strong>连接与发现</strong>
              <small>管理别人能不能看到这台设备</small>
            </span>
          </div>
          <div className="dd-snaplink__settings-switch-list">
            <SettingsSwitch
              label="允许被发现"
              description="连接到当前服务的设备可以看到这台设备"
              checked={discoverable}
              onChange={onDiscoverableChange}
            />
            <SettingsSwitch
              label="允许短码连接"
              description="其他设备可以通过短码发起连接"
              checked={allowShortCode}
              onChange={onAllowShortCodeChange}
            />
            <SettingsSwitch
              label="自动连接同一账号设备"
              description="同一账号设备上线后自动尝试连接"
              checked={autoConnect}
              onChange={onAutoConnectChange}
            />
          </div>
        </div>

        <div className="dd-snaplink__settings-card">
          <div className="dd-snaplink__settings-card-head">
            <FileText size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>
              <strong>发送与偏好</strong>
              <small>控制文本输入与交互快捷键</small>
            </span>
          </div>
          <div className="dd-snaplink__settings-switch-list">
            <SettingsSwitch
              label="回车发送"
              description="开启后 Enter 发送，Shift + Enter 换行"
              checked={enterToSend}
              onChange={onEnterToSendChange}
            />
            <SettingsSwitch
              label="操作提示音"
              description="发送消息、接收文件与新设备发现时播放轻柔提示音"
              checked={soundEffects}
              onChange={onSoundEffectsChange}
            />
          </div>
          {canOpenAdmin && onOpenAdmin ? (
            <div className="dd-snaplink__settings-admin-link">
              <button type="button" onClick={onOpenAdmin}>
                <ShieldCheck size={16} strokeWidth={1.9} aria-hidden="true" />
                <span>进入管理员控制面板</span>
              </button>
            </div>
          ) : null}
        </div>

        <div className="dd-snaplink__settings-card is-tools-card">
          <div className="dd-snaplink__settings-card-head">
            <Sparkles size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>
              <strong>工具与扩展工坊</strong>
              <small>直达命令行沙箱、AI 智能助手、图片工坊与文字提取</small>
            </span>
          </div>
          <div className="dd-snaplink__settings-tool-grid">
            {onOpenCommand ? (
              <button
                type="button"
                className="dd-snaplink__settings-tool-btn"
                onClick={onOpenCommand}
              >
                <div className="dd-snaplink__settings-tool-icon is-command">
                  <Terminal size={18} strokeWidth={2} />
                </div>
                <div className="dd-snaplink__settings-tool-info">
                  <strong>命令行沙箱</strong>
                  <small>Python / Java / PlantUML 终端运行</small>
                </div>
                <ChevronRight size={15} className="dd-snaplink__settings-tool-arrow" />
              </button>
            ) : null}

            {onOpenAiChat ? (
              <button
                type="button"
                className="dd-snaplink__settings-tool-btn"
                onClick={onOpenAiChat}
              >
                <div className="dd-snaplink__settings-tool-icon is-ai">
                  <Bot size={18} strokeWidth={2} />
                </div>
                <div className="dd-snaplink__settings-tool-info">
                  <strong>AI 智能助手</strong>
                  <small>多模型会话与智能问答</small>
                </div>
                <ChevronRight size={15} className="dd-snaplink__settings-tool-arrow" />
              </button>
            ) : null}

            {onOpenImage ? (
              <button
                type="button"
                className="dd-snaplink__settings-tool-btn"
                onClick={onOpenImage}
              >
                <div className="dd-snaplink__settings-tool-icon is-image">
                  <ImageIcon size={18} strokeWidth={2} />
                </div>
                <div className="dd-snaplink__settings-tool-info">
                  <strong>图片工坊</strong>
                  <small>AI 绘图、参考图与画廊</small>
                </div>
                <ChevronRight size={15} className="dd-snaplink__settings-tool-arrow" />
              </button>
            ) : null}

            {onOpenOcr ? (
              <button
                type="button"
                className="dd-snaplink__settings-tool-btn"
                onClick={onOpenOcr}
              >
                <div className="dd-snaplink__settings-tool-icon is-ocr">
                  <ScanText size={18} strokeWidth={2} />
                </div>
                <div className="dd-snaplink__settings-tool-info">
                  <strong>图片文字识别 (OCR)</strong>
                  <small>拖拽/相册图片提取文字</small>
                </div>
                <ChevronRight size={15} className="dd-snaplink__settings-tool-arrow" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
