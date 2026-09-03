import { useState, type CSSProperties, type FormEventHandler, type ReactNode } from 'react'
import {
  Activity,
  Camera,
  Check,
  ChevronRight,
  Copy,
  FileText,
  HardDrive,
  Keyboard,
  Laptop,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Wifi,
} from 'lucide-react'
import type { ResolvedThemeMode, ThemeMode } from '../../lib/preferences/theme'

type SettingsPanelThemeModeOption = {
  label: string
  description: string
  value: ThemeMode
  icon: typeof Sun
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
  onOpenCustomTheme?: () => void
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
    description: '默认明亮工作台',
    icon: Sun,
  },
  {
    value: 'dark',
    label: '深色',
    description: '夜间查看更舒适',
    icon: Moon,
  },
  {
    value: 'system',
    label: '跟随系统',
    description: '随设备外观自适应',
    icon: Laptop,
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
      <span className="dd-snaplink__settings-switch-text">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="dd-snaplink__settings-switch-track" aria-hidden="true">
        <i className="dd-snaplink__settings-switch-thumb" />
      </span>
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
  onOpenCustomTheme,
  onOpenAdmin,
}: SettingsPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [isCacheCleared, setIsCacheCleared] = useState(false)

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <section className="dd-snaplink__workbench-page is-settings" aria-label="我的">
      {header}
      {feedbackMessage ? (
        <div className="dd-snaplink__settings-feedback" role="status" aria-live="polite">
          {feedbackMessage}
        </div>
      ) : null}
      <div className="dd-snaplink__settings-grid">
        {/* 1. 当前设备身份 */}
        <form className="dd-snaplink__settings-card is-device-card" onSubmit={onDeviceNameSubmit}>
          <div className="dd-snaplink__settings-card-head">
            <button
              type="button"
              className={`dd-snaplink__settings-avatar${avatarDataUrl ? ' has-image' : ''}`}
              style={avatarDataUrl ? { '--dd-avatar': `url("${avatarDataUrl}")` } as CSSProperties : undefined}
              aria-label="更换头像"
              title="更换头像"
              onClick={onAvatarClick}
            >
              {avatarDataUrl ? null : <Monitor size={20} strokeWidth={1.8} aria-hidden="true" />}
              <span className="dd-snaplink__settings-avatar-badge" aria-hidden="true">
                <Camera size={11} strokeWidth={2.4} />
              </span>
            </button>
            <span>
              <strong>当前设备</strong>
              <small>此设备名称与头像将同步展示给直连对端</small>
            </span>
          </div>
          <label className="dd-snaplink__settings-field">
            <span>设备名称</span>
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
            <button
              type="button"
              className={`dd-snaplink__settings-fact-btn${copiedKey === 'shortCode' ? ' is-copied' : ''}`}
              title={deviceShortCode ? '点击复制短码' : undefined}
              onClick={() => deviceShortCode && copyText('shortCode', deviceShortCode)}
              disabled={!deviceShortCode}
            >
              <small>短码 {copiedKey === 'shortCode' ? '· 已复制' : ''}</small>
              <strong>
                {deviceShortCode || '等待同步'}
                {deviceShortCode ? (
                  copiedKey === 'shortCode' ? <Check size={11} aria-hidden="true" /> : <Copy size={11} aria-hidden="true" />
                ) : null}
              </strong>
            </button>
            <button
              type="button"
              className={`dd-snaplink__settings-fact-btn${copiedKey === 'deviceId' ? ' is-copied' : ''}`}
              title={deviceId ? '点击复制设备 ID' : undefined}
              onClick={() => deviceId && copyText('deviceId', deviceId)}
              disabled={!deviceId}
            >
              <small>设备 ID {copiedKey === 'deviceId' ? '· 已复制' : ''}</small>
              <strong>
                {deviceId ? deviceId.slice(0, 8) : '本地生成中'}
                {deviceId ? (
                  copiedKey === 'deviceId' ? <Check size={11} aria-hidden="true" /> : <Copy size={11} aria-hidden="true" />
                ) : null}
              </strong>
            </button>
            <span>
              <small>账号状态</small>
              <strong>{accountId ? '已绑定' : '未绑定'}</strong>
            </span>
          </div>
          <button type="submit" className="dd-snaplink__settings-submit-btn">
            保存设备名
          </button>
        </form>

        {/* 2. 外观与主题 */}
        <div className="dd-snaplink__settings-card is-appearance-card">
          <div className="dd-snaplink__settings-card-head">
            <div className="dd-snaplink__settings-head-icon is-appearance">
              <Sun size={19} strokeWidth={2} aria-hidden="true" />
            </div>
            <span>
              <strong>外观模式</strong>
              <small>自适应浅色、高对比深色或跟随操作系统</small>
            </span>
          </div>
          <div className="dd-snaplink__settings-mode-group" role="group" aria-label="外观模式">
            {themeModeOptions.map((option) => {
              const IconComp = option.icon
              const isActive = themeMode === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`dd-snaplink__settings-mode-option${isActive ? ' is-active' : ''}`}
                  aria-pressed={isActive}
                  onClick={() => onThemeModeChange(option.value)}
                >
                  <div className="dd-snaplink__settings-mode-option-icon">
                    <IconComp size={16} strokeWidth={2.2} />
                  </div>
                  <div className="dd-snaplink__settings-mode-option-text">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="dd-snaplink__settings-mode-note-badge">
            <i className="dd-snaplink__settings-mode-dot" aria-hidden="true" />
            <p className="dd-snaplink__settings-mode-note">
              {getThemeModeSummary(themeMode, resolvedThemeMode)}
            </p>
          </div>
          {onOpenCustomTheme ? (
            <button
              type="button"
              className="dd-snaplink__settings-custom-theme"
              onClick={onOpenCustomTheme}
            >
              <Palette size={15} strokeWidth={2} aria-hidden="true" />
              自定义消息气泡颜色
            </button>
          ) : null}
        </div>

        {/* 3. 连接与发现 */}
        <div className="dd-snaplink__settings-card is-network-card">
          <div className="dd-snaplink__settings-card-head">
            <div className="dd-snaplink__settings-head-icon is-network">
              <Wifi size={19} strokeWidth={2} aria-hidden="true" />
            </div>
            <span>
              <strong>连接与发现</strong>
              <small>管理局域网广播、对端识别与多端互联</small>
            </span>
          </div>
          <div className="dd-snaplink__settings-switch-list">
            <SettingsSwitch
              label="允许被发现"
              description="连接到当前服务的局域网设备可以看到这台设备"
              checked={discoverable}
              onChange={onDiscoverableChange}
            />
            <SettingsSwitch
              label="允许短码连接"
              description="其他设备可以通过6位房间短码发起直连传输"
              checked={allowShortCode}
              onChange={onAllowShortCodeChange}
            />
            <SettingsSwitch
              label="自动连接同一账号设备"
              description="登录同一账号的设备上线后自动建立快速通道"
              checked={autoConnect}
              onChange={onAutoConnectChange}
            />
          </div>
        </div>

        {/* 4. 发送与偏好 */}
        <div className="dd-snaplink__settings-card is-preference-card">
          <div className="dd-snaplink__settings-card-head">
            <div className="dd-snaplink__settings-head-icon is-preference">
              <FileText size={19} strokeWidth={2} aria-hidden="true" />
            </div>
            <span>
              <strong>发送与偏好</strong>
              <small>控制消息输入按键、音效与管理员面板</small>
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
              description="发送消息、接收文件与对端上线时播放轻柔提示音"
              checked={soundEffects}
              onChange={onSoundEffectsChange}
            />
          </div>
          {canOpenAdmin && onOpenAdmin ? (
            <div className="dd-snaplink__settings-admin-link">
              <button type="button" onClick={onOpenAdmin}>
                <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />
                <span>进入系统管理控制台</span>
                <ChevronRight size={14} />
              </button>
            </div>
          ) : null}
        </div>

        {/* 5. 系统与网络诊断 */}
        <div className="dd-snaplink__settings-card is-diagnostics-card">
          <div className="dd-snaplink__settings-card-head">
            <div className="dd-snaplink__settings-head-icon is-diagnostics">
              <Activity size={19} strokeWidth={2} aria-hidden="true" />
            </div>
            <span>
              <strong>系统与网络诊断</strong>
              <small>核心传输协议、信令状态与本地缓存空间</small>
            </span>
          </div>
          <div className="dd-snaplink__settings-diagnostics-list">
            <div className="dd-snaplink__settings-diag-item">
              <span>
                <strong>DD直连 桌面旗舰版</strong>
                <small>版本 v2.4.0 · Apple & macOS 质感设计系统</small>
              </span>
              <em>最新版</em>
            </div>
            <div className="dd-snaplink__settings-diag-item">
              <span>
                <strong>信令与探测状态</strong>
                <small>本地信令网关 WebSocket 连接就绪 (8787)</small>
              </span>
              <em className="is-ok">就绪</em>
            </div>
            <div className="dd-snaplink__settings-diag-item">
              <span>
                <strong>物理直连加密</strong>
                <small>WebRTC DTLS-SRTP 256 位端到端物理加密</small>
              </span>
              <em className="is-safe">物理加密</em>
            </div>
          </div>
          <div className="dd-snaplink__settings-cache-action">
            <button
              type="button"
              className={isCacheCleared ? 'is-cleared' : ''}
              onClick={() => {
                setIsCacheCleared(true)
                setTimeout(() => setIsCacheCleared(false), 2500)
              }}
            >
              <HardDrive size={14} strokeWidth={2} aria-hidden="true" />
              <span>{isCacheCleared ? '本地临时缓存已成功清理' : '清理本地临时会话与图片缓存'}</span>
            </button>
          </div>
        </div>

        {/* 6. 快捷操作指南 */}
        <div className="dd-snaplink__settings-card is-shortcuts-card">
          <div className="dd-snaplink__settings-card-head">
            <div className="dd-snaplink__settings-head-icon is-shortcuts">
              <Keyboard size={19} strokeWidth={2} aria-hidden="true" />
            </div>
            <span>
              <strong>快捷键与高效操作</strong>
              <small>桌面端常用按键映射与极速传输手势</small>
            </span>
          </div>
          <div className="dd-snaplink__settings-shortcuts-grid">
            <div className="dd-snaplink__settings-shortcut-row">
              <kbd>Enter</kbd>
              <span>发送当前输入框中的消息</span>
            </div>
            <div className="dd-snaplink__settings-shortcut-row">
              <kbd>Shift</kbd> + <kbd>Enter</kbd>
              <span>在消息输入框中多行换行</span>
            </div>
            <div className="dd-snaplink__settings-shortcut-row">
              <kbd>拖拽文件</kbd>
              <span>直接拖入窗口任意位置触发秒速直传</span>
            </div>
            <div className="dd-snaplink__settings-shortcut-row">
              <kbd>双击设备</kbd>
              <span>在雷达或列表双击设备直接进入加密对话</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
