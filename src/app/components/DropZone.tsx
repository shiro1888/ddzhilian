import { FileText, ImageIcon, Upload } from 'lucide-react'

type DropZoneProps = {
  variant?: 'compact' | 'full'
  isActive: boolean
  subtitle: string
  canSendText: boolean
  onPickFile: () => void
  onSendText: () => void
  onPickCamera: () => void
}

export function DropZone({
  variant = 'compact',
  isActive,
  subtitle,
  canSendText,
  onPickFile,
  onSendText,
  onPickCamera,
}: DropZoneProps) {
  return (
    <section
      className={[
        'dd-snaplink__drop-zone',
        isActive ? 'is-active' : '',
        variant === 'full' ? 'is-full' : '',
      ].filter(Boolean).join(' ')}
      aria-label="拖拽文件发送"
    >
      <span className="dd-snaplink__drop-icon" aria-hidden="true">
        <Upload size={26} strokeWidth={1.8} />
      </span>
      <strong>拖拽文件到这里</strong>
      <p>{subtitle}</p>
      <div className="dd-snaplink__drop-actions">
        <button type="button" onClick={onPickFile}>
          <Upload size={15} strokeWidth={2} aria-hidden="true" />
          选择文件
        </button>
        <button type="button" disabled={!canSendText} onClick={onSendText}>
          <FileText size={15} strokeWidth={2} aria-hidden="true" />
          发送文本
        </button>
        <button type="button" onClick={onPickCamera}>
          <ImageIcon size={15} strokeWidth={2} aria-hidden="true" />
          发送图片
        </button>
      </div>
      <small>仅在设备之间传输 · 端到端</small>
    </section>
  )
}
