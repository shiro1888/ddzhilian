import type { FormEventHandler, ReactNode } from 'react'
import { Bot, Clock3, Command, FileText, Image as ImageIcon, Monitor, MoonStar, Settings, Wifi } from 'lucide-react'
import type { ResolvedThemeMode, ThemeMode } from '../../lib/preferences/theme'

export type SettingsPanelThemeColorTarget = 'self' | 'peer' | 'ai'
export type SettingsPanelThemeColors = Record<SettingsPanelThemeColorTarget, string>

type SettingsPanelThemeOption = {
  label: string
  colors: SettingsPanelThemeColors
}

type SettingsPanelThemeModeOption = {
  label: string
  description: string
  value: ThemeMode
}

type SettingsPanelProps = {
  header?: ReactNode
  deviceName: string
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
  themeMode: ThemeMode
  resolvedThemeMode: ResolvedThemeMode
  themeColors: SettingsPanelThemeColors
  themeOptions: SettingsPanelThemeOption[]
  feedbackMessage: string | null
  onDeviceNameDraftChange: (value: string) => void
  onDeviceNameSubmit: FormEventHandler<HTMLFormElement>
  onDiscoverableChange: (checked: boolean) => void
  onAllowShortCodeChange: (checked: boolean) => void
  onAutoConnectChange: (checked: boolean) => void
  onEnterToSendChange: (checked: boolean) => void
  onThemeModeChange: (mode: ThemeMode) => void
  onThemeColorChange: (target: SettingsPanelThemeColorTarget, value: string) => void
  onThemePresetApply: (colors: SettingsPanelThemeColors) => void
  onThemeReset: () => void
  onShowHistory?: () => void
  onOpenAiChat?: () => void
  onOpenImage?: () => void
  onOpenCommand?: () => void
}

type SettingsSwitchProps = {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}

type ThemeColorFieldProps = {
  target: SettingsPanelThemeColorTarget
  label: string
  description: string
  value: string
  onChange: (target: SettingsPanelThemeColorTarget, value: string) => void
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

function ThemeColorField({
  target,
  label,
  description,
  value,
  onChange,
}: ThemeColorFieldProps) {
  return (
    <label className="dd-snaplink__theme-field">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="color"
        value={value}
        aria-label={`${label}颜色`}
        onChange={(event) => onChange(target, event.target.value)}
      />
    </label>
  )
}

export function SettingsPanel({
  header,
  deviceName,
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
  themeMode,
  resolvedThemeMode,
  themeColors,
  themeOptions,
  feedbackMessage,
  onDeviceNameDraftChange,
  onDeviceNameSubmit,
  onDiscoverableChange,
  onAllowShortCodeChange,
  onAutoConnectChange,
  onEnterToSendChange,
  onThemeModeChange,
  onThemeColorChange,
  onThemePresetApply,
  onThemeReset,
  onShowHistory,
  onOpenAiChat,
  onOpenImage,
  onOpenCommand,
}: SettingsPanelProps) {
  const hasMyShortcuts = Boolean(onShowHistory || onOpenAiChat || onOpenImage || onOpenCommand)

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
            <Monitor size={18} strokeWidth={1.8} aria-hidden="true" />
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

        {hasMyShortcuts ? (
          <div className="dd-snaplink__settings-card is-my-shortcuts">
            <div className="dd-snaplink__settings-card-head">
              <Settings size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>
                <strong>工具中心</strong>
                <small>AI、图片、命令行和历史记录收在这里，主界面保持简洁</small>
              </span>
            </div>
            <div className="dd-snaplink__settings-menu-list">
              {onOpenAiChat ? (
                <button type="button" onClick={onOpenAiChat}>
                  <Bot size={17} strokeWidth={1.9} aria-hidden="true" />
                  <span>
                    <strong>DD助手</strong>
                    <small>总结传输内容，辅助生成文本</small>
                  </span>
                </button>
              ) : null}
              {onOpenImage ? (
                <button type="button" onClick={onOpenImage}>
                  <ImageIcon size={17} strokeWidth={1.9} aria-hidden="true" />
                  <span>
                    <strong>图片工具</strong>
                    <small>图片生成与传输文件联动</small>
                  </span>
                </button>
              ) : null}
              {onOpenCommand ? (
                <button type="button" onClick={onOpenCommand}>
                  <Command size={17} strokeWidth={1.9} aria-hidden="true" />
                  <span>
                    <strong>Web 命令行</strong>
                    <small>运行命令并发送结果文本</small>
                  </span>
                </button>
              ) : null}
              {onShowHistory ? (
                <button type="button" onClick={onShowHistory}>
                  <Clock3 size={17} strokeWidth={1.9} aria-hidden="true" />
                  <span>
                    <strong>历史记录</strong>
                    <small>查看文件、文本和链接记录</small>
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <details className="dd-snaplink__settings-advanced">
          <summary>
            <span>
              <strong>高级设置</strong>
              <small>连接、发送、外观和消息主题</small>
            </span>
          </summary>
          <div className="dd-snaplink__settings-advanced-grid">
            <div className="dd-snaplink__settings-card">
              <div className="dd-snaplink__settings-card-head">
                <Wifi size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>
                  <strong>连接与发现</strong>
                  <small>这些设置会同步到后端发现服务</small>
                </span>
              </div>
              <div className="dd-snaplink__settings-switch-list">
                <SettingsSwitch
                  label="允许被发现"
                  description="同一局域网内的设备可以看到这台设备"
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
                  label="自动连接同账号设备"
                  description="同账号设备上线后自动尝试直连"
                  checked={autoConnect}
                  onChange={onAutoConnectChange}
                />
              </div>
              <div className="dd-snaplink__settings-status-list">
                <span>WebRTC 直连</span>
                <span>文件不经过服务器</span>
              </div>
            </div>

            <div className="dd-snaplink__settings-card">
              <div className="dd-snaplink__settings-card-head">
                <FileText size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>
                  <strong>发送偏好</strong>
                  <small>控制文本输入的发送方式</small>
                </span>
              </div>
              <div className="dd-snaplink__settings-switch-list">
                <SettingsSwitch
                  label="回车发送"
                  description="开启后 Enter 发送，Shift + Enter 换行"
                  checked={enterToSend}
                  onChange={onEnterToSendChange}
                />
              </div>
            </div>

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
                <Settings size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>
                  <strong>消息主题</strong>
                  <small>只调整前端显示，不影响传输逻辑</small>
                </span>
              </div>
              <div className="dd-snaplink__settings-theme-fields">
                <ThemeColorField
                  target="self"
                  label="发送的信息框"
                  description="自己发送的消息气泡"
                  value={themeColors.self}
                  onChange={onThemeColorChange}
                />
                <ThemeColorField
                  target="peer"
                  label="接收的信息框"
                  description="其他成员发送的消息气泡"
                  value={themeColors.peer}
                  onChange={onThemeColorChange}
                />
                <ThemeColorField
                  target="ai"
                  label="AI 的信息框"
                  description="DD直连小助手回复气泡"
                  value={themeColors.ai}
                  onChange={onThemeColorChange}
                />
              </div>
              <div className="dd-snaplink__settings-theme-presets" aria-label="主题预设">
                {themeOptions.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => onThemePresetApply(option.colors)}
                  >
                    <span className="dd-snaplink__theme-preset-swatches" aria-hidden="true">
                      <i style={{ background: option.colors.self }} />
                      <i style={{ background: option.colors.peer }} />
                      <i style={{ background: option.colors.ai }} />
                    </span>
                    {option.label}
                  </button>
                ))}
              </div>
              <button type="button" className="dd-snaplink__settings-reset" onClick={onThemeReset}>
                恢复默认
              </button>
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}
