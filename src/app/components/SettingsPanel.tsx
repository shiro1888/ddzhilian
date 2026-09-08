import {
  useEffect,
  useState,
  type CSSProperties,
  type FormEventHandler,
  type ReactNode,
} from 'react'
import QRCode from 'qrcode'
import {
  Activity,
  Camera,
  Check,
  ChevronRight,
  Copy,
  Edit2,
  FileText,
  HardDrive,
  Laptop,
  Loader2,
  Monitor,
  Moon,
  Palette,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sun,
  Wifi,
  X,
  Zap,
} from 'lucide-react'
import type { ResolvedThemeMode, ThemeMode } from '../../lib/preferences/theme'
import { AI_CHAT_STORAGE_KEY } from '../../lib/ai-chat-utils'
import { BROWSER_OCR_HISTORY_CACHE_KEY } from '../../lib/browser-ocr'

export type SettingsPanelThemeModeOption = {
  label: string
  description: string
  value: ThemeMode
  icon: typeof Sun
}

export type SettingsPanelSignalingState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export type SettingsPanelProps = {
  header?: ReactNode
  deviceName: string
  avatarDataUrl?: string | null
  deviceNameDraft: string
  deviceNameError: string | null
  devicePlatform: string
  deviceShortCode?: string
  deviceId?: string
  accountId?: string
  signalingState: SettingsPanelSignalingState
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
  onMeasureNetworkLatency: () => Promise<number>
  onOpenCustomTheme?: () => void
  onOpenAdmin?: () => void
}

type SettingsSwitchProps = {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

const themeModeOptions: SettingsPanelThemeModeOption[] = [
  {
    value: 'light',
    label: '浅色模式',
    description: '明亮通透 · 经典办公',
    icon: Sun,
  },
  {
    value: 'dark',
    label: '深色模式',
    description: '极客深邃 · 护眼低耗',
    icon: Moon,
  },
  {
    value: 'system',
    label: '跟随系统',
    description: '随操作系统自动切换',
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
        {description ? <small>{description}</small> : null}
      </span>
      <span className="dd-snaplink__settings-switch-track" aria-hidden="true">
        <span className="dd-snaplink__settings-switch-thumb" />
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

function formatStorageBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0 KB'
  }
  if (bytes < 1024) {
    return '< 1 KB'
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function calculateClientStorageUsage(): number {
  if (typeof window === 'undefined') {
    return 0
  }
  let totalBytes = 0
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key) {
        const val = window.localStorage.getItem(key) || ''
        totalBytes += (key.length + val.length) * 2
      }
    }
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i)
      if (key) {
        const val = window.sessionStorage.getItem(key) || ''
        totalBytes += (key.length + val.length) * 2
      }
    }
  } catch {
    // ignore
  }
  return totalBytes
}

export function SettingsPanel({
  header,
  deviceName,
  avatarDataUrl = null,
  deviceNameDraft,
  deviceNameError,
  deviceShortCode,
  deviceId,
  signalingState,
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
  onMeasureNetworkLatency,
  onOpenCustomTheme,
  onOpenAdmin,
}: SettingsPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [cacheStatus, setCacheStatus] = useState<'idle' | 'clearing' | 'done'>('idle')
  const [storageSizeLabel, setStorageSizeLabel] = useState('< 1 KB')
  const [pingSpeed, setPingSpeed] = useState<number | null>(null)
  const [isTestingPing, setIsTestingPing] = useState(true)
  const [showQrModal, setShowQrModal] = useState<boolean>(false)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setStorageSizeLabel(formatStorageBytes(calculateClientStorageUsage()))
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [])

  useEffect(() => {
    let isActive = true

    void onMeasureNetworkLatency()
      .then((latencyMs) => {
        if (isActive) {
          setPingSpeed(latencyMs)
        }
      })
      .catch(() => {
        if (isActive) {
          setPingSpeed(null)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsTestingPing(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [onMeasureNetworkLatency])

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 2000)
    } catch {
      // ignore
    }
  }

  // Generate QR Code when QR Modal is triggered
  useEffect(() => {
    if (!showQrModal || !deviceShortCode) {
      return
    }

    const shareUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/?room=${encodeURIComponent(deviceShortCode)}`
      : deviceShortCode

    let isSubscribed = true
    QRCode.toDataURL(shareUrl, {
      width: 220,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (isSubscribed) {
          setQrCodeDataUrl(url)
        }
      })
      .catch(() => {
        // ignore
      })

    return () => {
      isSubscribed = false
    }
  }, [showQrModal, deviceShortCode])

  const handleClearLocalCache = () => {
    if (typeof window === 'undefined') {
      return
    }
    setCacheStatus('clearing')
    setTimeout(async () => {
      const preservedKeys = new Set([
        'ddzhilian.identity.v1',
        'snaplink_trusted_devices',
        'snaplink_theme_colors',
        'snaplink_theme_mode',
        'ddzhilian.theme.v1',
        'ddzhilian.theme_mode.v1',
        'snaplink_avatar',
        'dd_avatar',
        'ddzhilian.last_room_id.v1',
        'ddzhilian.last_room_title.v1',
      ])

      try {
        const keysToRemove: string[] = []
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i)
          if (key && !preservedKeys.has(key)) {
            keysToRemove.push(key)
          }
        }
        for (const key of keysToRemove) {
          window.localStorage.removeItem(key)
        }
      } catch {
        for (const key of [AI_CHAT_STORAGE_KEY, BROWSER_OCR_HISTORY_CACHE_KEY, 'dd_tool_return_mode']) {
          try {
            window.localStorage.removeItem(key)
          } catch {
            // ignore
          }
        }
      }

      try {
        window.sessionStorage.clear()
      } catch {
        // ignore
      }

      if ('caches' in window) {
        try {
          const cacheKeys = await window.caches.keys()
          await Promise.all(cacheKeys.map((k) => window.caches.delete(k)))
        } catch {
          // ignore
        }
      }

      const remainingBytes = calculateClientStorageUsage()
      setStorageSizeLabel(formatStorageBytes(remainingBytes))
      setCacheStatus('done')
      setTimeout(() => setCacheStatus('idle'), 3000)
    }, 450)
  }

  const handleTestPing = async () => {
    if (isTestingPing) return
    setIsTestingPing(true)
    try {
      setPingSpeed(await onMeasureNetworkLatency())
    } catch {
      setPingSpeed(null)
    } finally {
      setIsTestingPing(false)
    }
  }

  const signalingStatusLabel = signalingState === 'open'
    ? '正常运行'
    : signalingState === 'connecting' || signalingState === 'idle'
      ? '正在连接'
      : '连接异常'

  return (
    <section className="dd-snaplink__workbench-page is-settings" aria-label="我的">
      {/* 1. 紧凑集成式顶部设置导航栏 */}
      {header ? (
        header
      ) : (
        <header className="dd-snaplink__settings-top-bar">
          <div className="dd-snaplink__settings-top-title">
            <div className="dd-snaplink__settings-top-icon" aria-hidden="true">
              <Sliders size={15} strokeWidth={2.2} />
            </div>
            <strong>设置</strong>
          </div>
        </header>
      )}

      {/* 2. 状态通知反馈条 */}
      {feedbackMessage ? (
        <div className="dd-snaplink__settings-feedback" role="status" aria-live="polite">
          <Check size={14} strokeWidth={2.4} aria-hidden="true" />
          <span>{feedbackMessage}</span>
        </div>
      ) : null}

      <div className="dd-snaplink__settings-layout">
        {/* 4. 尊享级设备个人中心卡片（Profile Hero Card） */}
        <div className="dd-snaplink__settings-profile-card">
            <div className="dd-snaplink__settings-profile-top">
              <div className="dd-snaplink__settings-avatar-wrap">
                <button
                  type="button"
                  className={`dd-snaplink__settings-avatar is-large${avatarDataUrl ? ' has-image' : ''}`}
                  style={avatarDataUrl ? { '--dd-avatar': `url("${avatarDataUrl}")` } as CSSProperties : undefined}
                  aria-label="更换头像"
                  title="点击更换头像"
                  onClick={onAvatarClick}
                >
                  {avatarDataUrl ? null : <Monitor size={22} strokeWidth={1.8} aria-hidden="true" />}
                  <span className="dd-snaplink__settings-avatar-overlay" aria-hidden="true">
                    <Camera size={11} strokeWidth={2.2} />
                    <small>更换</small>
                  </span>
                </button>
                <span className="dd-snaplink__settings-avatar-status" title="本机在线" />
              </div>

              <div className="dd-snaplink__settings-profile-body">
                <div className="dd-snaplink__settings-profile-name-row">
                  {isEditingName ? (
                    <form
                      className="dd-snaplink__settings-inline-rename-form"
                      onSubmit={(e) => {
                        onDeviceNameSubmit(e)
                        setIsEditingName(false)
                      }}
                    >
                      <input
                        autoFocus
                        value={deviceNameDraft}
                        maxLength={80}
                        placeholder={deviceName}
                        onChange={(event) => onDeviceNameDraftChange(event.target.value)}
                        onBlur={() => {
                          if (deviceNameDraft.trim() && deviceNameDraft !== deviceName) {
                            const fakeEvent = { preventDefault: () => {} } as unknown as React.FormEvent<HTMLFormElement>
                            onDeviceNameSubmit(fakeEvent)
                          }
                          setIsEditingName(false)
                        }}
                      />
                      <button type="submit" className="dd-snaplink__settings-inline-save-btn" title="保存设备名称">
                        <Check size={14} strokeWidth={2.4} />
                      </button>
                      <button
                        type="button"
                        className="dd-snaplink__settings-inline-cancel-btn"
                        title="取消"
                        onClick={() => {
                          onDeviceNameDraftChange(deviceName)
                          setIsEditingName(false)
                        }}
                      >
                        <X size={14} strokeWidth={2.4} />
                      </button>
                    </form>
                  ) : (
                    <div className="dd-snaplink__settings-name-display">
                      <h2 title={deviceName}>{deviceName}</h2>
                      <button
                        type="button"
                        className="dd-snaplink__settings-edit-name-trigger"
                        title="点击修改设备名称"
                        onClick={() => {
                          onDeviceNameDraftChange(deviceName)
                          setIsEditingName(true)
                        }}
                      >
                        <Edit2 size={13} strokeWidth={2.2} />
                        <span>重命名</span>
                      </button>
                    </div>
                  )}
                  {deviceNameError ? <p className="dd-snaplink__settings-error">{deviceNameError}</p> : null}
                </div>
              </div>
            </div>

            {/* 设备凭证与快速互联条 */}
            <div className="dd-snaplink__settings-profile-facts">
              <button
                type="button"
                className={`dd-snaplink__settings-fact-pill${copiedKey === 'shortCode' ? ' is-copied' : ''}`}
                title={deviceShortCode ? '点击复制 6 位直连短码' : undefined}
                onClick={() => deviceShortCode && copyText('shortCode', deviceShortCode)}
                disabled={!deviceShortCode}
              >
                <span className="dd-snaplink__settings-fact-tag">6位短码</span>
                <strong>{deviceShortCode || '等待同步'}</strong>
                {copiedKey === 'shortCode' ? (
                  <Check size={12} className="is-success-icon" />
                ) : (
                  <Copy size={12} aria-hidden="true" />
                )}
              </button>

              {deviceShortCode ? (
                <button
                  type="button"
                  className="dd-snaplink__settings-fact-pill is-qr"
                  title="生成手机扫码互联二维码"
                  onClick={() => setShowQrModal(true)}
                >
                  <QrCode size={13} strokeWidth={2.2} />
                  <span>手机扫码直连</span>
                </button>
              ) : null}

              <button
                type="button"
                className={`dd-snaplink__settings-fact-pill${copiedKey === 'deviceId' ? ' is-copied' : ''}`}
                title={deviceId ? '点击复制设备指纹 ID' : undefined}
                onClick={() => deviceId && copyText('deviceId', deviceId)}
                disabled={!deviceId}
              >
                <span className="dd-snaplink__settings-fact-tag">设备 ID</span>
                <strong>{deviceId ? deviceId.slice(0, 8) : '本地生成中'}</strong>
                {copiedKey === 'deviceId' ? (
                  <Check size={12} className="is-success-icon" />
                ) : (
                  <Copy size={12} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

        <div className="dd-snaplink__settings-grid">
          {/* 1. 外观与主题 */}
          <div className="dd-snaplink__settings-card is-appearance-card">
              <div className="dd-snaplink__settings-card-head">
                <div className="dd-snaplink__settings-head-icon is-appearance">
                  <Sun size={15} strokeWidth={2.2} aria-hidden="true" />
                </div>
                <strong>外观模式</strong>
              </div>

              <div
                className="dd-snaplink__settings-theme-pills"
                role="group"
                aria-label="外观主题选择"
                title={getThemeModeSummary(themeMode, resolvedThemeMode)}
              >
                {themeModeOptions.map((option) => {
                  const isActive = themeMode === option.value
                  const IconComp = option.icon
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`dd-snaplink__settings-theme-pill${isActive ? ' is-active' : ''}`}
                      aria-pressed={isActive}
                      onClick={() => onThemeModeChange(option.value)}
                    >
                      <IconComp size={13} strokeWidth={2.2} />
                      <span>{option.label}</span>
                      {isActive ? <Check size={11} className="is-check" /> : null}
                    </button>
                  )
                })}
              </div>

              {onOpenCustomTheme ? (
                <div className="dd-snaplink__settings-theme-quick-bar">
                  <span className="dd-snaplink__settings-theme-quick-label">
                    <Palette size={13} strokeWidth={2} />
                    <span>消息气泡定制</span>
                  </span>
                  <button
                    type="button"
                    className="dd-snaplink__settings-custom-theme-btn"
                    onClick={onOpenCustomTheme}
                  >
                    <span>自定义气泡颜色</span>
                    <ChevronRight size={12} />
                  </button>
                </div>
              ) : null}
            </div>

          {/* 2. 发送与偏好 */}
          <div className="dd-snaplink__settings-card is-preference-card">
              <div className="dd-snaplink__settings-card-head">
                <div className="dd-snaplink__settings-head-icon is-preference">
                  <FileText size={15} strokeWidth={2.2} aria-hidden="true" />
                </div>
                <strong>发送与偏好</strong>
              </div>
              <div className="dd-snaplink__settings-switch-group">
                <SettingsSwitch
                  label="回车发送"
                  checked={enterToSend}
                  onChange={onEnterToSendChange}
                />
                <SettingsSwitch
                  label="操作提示音"
                  checked={soundEffects}
                  onChange={onSoundEffectsChange}
                />
              </div>
              {canOpenAdmin && onOpenAdmin ? (
                <div className="dd-snaplink__settings-admin-link">
                  <button type="button" onClick={onOpenAdmin}>
                    <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />
                    <span>进入系统管理控制台</span>
                    <ChevronRight size={12} />
                  </button>
                </div>
              ) : null}
            </div>

          {/* 3. 连接与发现 */}
          <div className="dd-snaplink__settings-card is-network-card">
              <div className="dd-snaplink__settings-card-head">
                <div className="dd-snaplink__settings-head-icon is-network">
                  <Wifi size={15} strokeWidth={2.2} aria-hidden="true" />
                </div>
                <strong>连接与发现</strong>
              </div>
              <div className="dd-snaplink__settings-switch-group">
                <SettingsSwitch
                  label="允许被发现"
                  checked={discoverable}
                  onChange={onDiscoverableChange}
                />
                <SettingsSwitch
                  label="允许短码连接"
                  checked={allowShortCode}
                  onChange={onAllowShortCodeChange}
                />
                <SettingsSwitch
                  label="自动连接同一账号设备"
                  checked={autoConnect}
                  onChange={onAutoConnectChange}
                />
              </div>
            </div>

          {/* 4. 系统与网络诊断 */}
          <div className="dd-snaplink__settings-card is-diagnostics-card">
              <div className="dd-snaplink__settings-card-head">
                <div className="dd-snaplink__settings-head-icon is-diagnostics">
                  <Activity size={15} strokeWidth={2.2} aria-hidden="true" />
                </div>
                <strong>系统与网络诊断</strong>
              </div>

              <div className="dd-snaplink__settings-diagnostics-list">
                <div className="dd-snaplink__settings-diag-item">
                  <span>
                    <strong>局域网信令与网关</strong>
                  </span>
                  <em className={signalingState === 'open' ? 'is-ok' : undefined}>{signalingStatusLabel}</em>
                </div>

                <div className="dd-snaplink__settings-diag-item">
                  <span>
                    <strong>信令服务延迟</strong>
                  </span>
                  <button
                    type="button"
                    className="dd-snaplink__settings-diag-ping-btn"
                    onClick={handleTestPing}
                    disabled={isTestingPing}
                    title="点击重新测速"
                  >
                    {isTestingPing ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <RefreshCw size={11} />
                    )}
                    <span>{isTestingPing ? '测速中' : pingSpeed === null ? '不可用' : `${pingSpeed}ms`}</span>
                  </button>
                </div>

                <div className="dd-snaplink__settings-diag-item">
                  <span>
                    <strong>传输通道加密</strong>
                  </span>
                  <em className="is-safe">WebRTC DTLS</em>
                </div>

                <div className="dd-snaplink__settings-diag-item">
                  <span>
                    <strong>本地存储空间</strong>
                  </span>
                  <div className="dd-snaplink__settings-diag-cache-wrap">
                    <small>{storageSizeLabel}</small>
                    <button
                      type="button"
                      className={`dd-snaplink__settings-diag-cache-btn${cacheStatus === 'done' ? ' is-cleared' : ''}`}
                      onClick={handleClearLocalCache}
                      disabled={cacheStatus === 'clearing'}
                      title="清理本地临时缓存"
                    >
                      {cacheStatus === 'clearing' ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : cacheStatus === 'done' ? (
                        <Check size={11} strokeWidth={2.4} />
                      ) : (
                        <HardDrive size={11} strokeWidth={2} />
                      )}
                      <span>{cacheStatus === 'clearing' ? '清理中' : cacheStatus === 'done' ? '已清理' : '清理缓存'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
        </div>

      </div>

      {/* 10. 底部品牌标志 */}
      <footer className="dd-snaplink__settings-about-footer">
        <div className="dd-snaplink__settings-about-main">
          <span className="dd-snaplink__settings-about-logo">
            <Zap size={14} strokeWidth={2.4} />
            <strong>DD直连</strong>
          </span>
        </div>
      </footer>

      {/* 11. 手机扫码直连模态框 */}
      {showQrModal && (
        <div className="dd-snaplink__settings-modal-backdrop" onClick={() => setShowQrModal(false)}>
          <div
            className="dd-snaplink__settings-modal-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="手机扫码面对面直连"
          >
            <div className="dd-snaplink__settings-modal-head">
              <strong>手机扫码直连</strong>
              <button
                type="button"
                className="dd-snaplink__settings-modal-close"
                onClick={() => setShowQrModal(false)}
                aria-label="关闭"
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            </div>
            <div className="dd-snaplink__settings-modal-body">
              <div className="dd-snaplink__settings-qr-frame">
                {qrCodeDataUrl ? (
                  <img src={qrCodeDataUrl} alt="扫码直连二维码" className="dd-snaplink__settings-qr-img" />
                ) : (
                  <div className="dd-snaplink__settings-qr-placeholder">
                    <Loader2 size={24} className="animate-spin" />
                    <small>二维码生成中...</small>
                  </div>
                )}
              </div>
              <p>使用手机自带相机或浏览器扫一扫，立即与本设备建立局域网直连传输通道。</p>
              <div className="dd-snaplink__settings-modal-code">
                <span>房间短码</span>
                <strong>{deviceShortCode}</strong>
                <button
                  type="button"
                  onClick={() => deviceShortCode && copyText('modalCode', deviceShortCode)}
                >
                  {copiedKey === 'modalCode' ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedKey === 'modalCode' ? '已复制' : '复制短码'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

