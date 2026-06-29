import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ShieldCheck } from 'lucide-react'
import { PinInput } from './PinInput'

type TrustDeviceDialogProps = {
  deviceName: string
  actionLabel: string
  deviceKind: string
  deviceIcon: ReactNode
  platformLabel: string
  modeLabel: string
  lastSeenLabel: string
  shortCode?: string
  fingerprint: string
  pinDraft: string
  pinError: string | null
  rememberDevice: boolean
  onPinChange: (value: string) => void
  onRememberChange: (checked: boolean) => void
  onCancel: () => void
  onContinueOnce: () => void
  onConfirm: () => void
}

export function TrustDeviceDialog({
  deviceName,
  actionLabel,
  deviceKind,
  deviceIcon,
  platformLabel,
  modeLabel,
  lastSeenLabel,
  shortCode,
  fingerprint,
  pinDraft,
  pinError,
  rememberDevice,
  onPinChange,
  onRememberChange,
  onCancel,
  onContinueOnce,
  onConfirm,
}: TrustDeviceDialogProps) {
  return createPortal(
    <div className="dd-snaplink__trust-dialog-backdrop" role="presentation">
      <section
        className="dd-snaplink__trust-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dd-snaplink-trust-dialog-title"
      >
        <span className="dd-snaplink__trust-dialog-icon" aria-hidden="true">
          <ShieldCheck size={24} strokeWidth={1.9} />
        </span>
        <div className="dd-snaplink__trust-dialog-copy">
          <span>设备确认</span>
          <h2 id="dd-snaplink-trust-dialog-title">确认要向 {deviceName} {actionLabel}？</h2>
          <p>这是尚未手动信任的设备。确认后才会继续当前操作，文件仍只在设备之间传输。</p>
        </div>
        <div className="dd-snaplink__trust-dialog-device">
          <span className={`dd-snaplink__workbench-device-icon is-${deviceKind}`}>
            {deviceIcon}
          </span>
          <span>
            <strong>{deviceName}</strong>
            <small>{platformLabel} · {modeLabel} · {lastSeenLabel}</small>
          </span>
        </div>
        <div className="dd-snaplink__trust-dialog-codes" aria-label="设备校验信息">
          <span>
            <small>短码</small>
            <strong>{shortCode || '未提供'}</strong>
          </span>
          <span>
            <small>指纹</small>
            <strong>{fingerprint}</strong>
          </span>
        </div>
        <PinInput
          value={pinDraft}
          placeholder={shortCode ? `例如 ${shortCode}` : '输入对方短码'}
          onChange={onPinChange}
        />
        {pinError ? <p className="dd-snaplink__trust-dialog-error">{pinError}</p> : null}
        <label className="dd-snaplink__trust-dialog-remember">
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(event) => onRememberChange(event.currentTarget.checked)}
          />
          <span>
            <strong>信任此设备</strong>
            <small>保存在本机，下次设备卡会标记为已信任。</small>
          </span>
        </label>
        <div className="dd-snaplink__trust-dialog-actions">
          <button type="button" className="is-secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" onClick={onContinueOnce}>
            仅本次继续
          </button>
          <button type="button" className="is-primary" onClick={onConfirm}>
            {rememberDevice ? '信任并继续' : '继续'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
