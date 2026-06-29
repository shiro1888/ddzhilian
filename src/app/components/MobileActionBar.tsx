import { FileText, ImageIcon, Upload } from 'lucide-react'

type MobileActionBarProps = {
  onPickFile: () => void
  onPickCamera: () => void
  onSendText: () => void
}

export function MobileActionBar({
  onPickFile,
  onPickCamera,
  onSendText,
}: MobileActionBarProps) {
  return (
    <div className="dd-snaplink__mobile-actions dd-snaplink__mobile-actionbar" aria-label="移动端快捷操作">
      <button type="button" onClick={onPickFile}>
        <Upload size={16} strokeWidth={2} aria-hidden="true" />
        选择文件
      </button>
      <button type="button" onClick={onPickCamera}>
        <ImageIcon size={16} strokeWidth={2} aria-hidden="true" />
        拍照
      </button>
      <button type="button" onClick={onSendText}>
        <FileText size={16} strokeWidth={2} aria-hidden="true" />
        发送文本
      </button>
    </div>
  )
}
