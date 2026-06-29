import { createPortal } from 'react-dom'
import { ShieldCheck } from 'lucide-react'
import type { IncomingFileOffer } from '../../lib/ddzhilian-types'

type ConfirmReceiveDialogProps = {
  offer: IncomingFileOffer
  senderName: string
  fileExtension: string
  fileSizeLabel: string
  pendingExtraCount: number
  isSenderTrusted: boolean
  shouldTrustSender: boolean
  onTrustChange: (checked: boolean) => void
  onReject: () => void
  onAccept: () => void
}

export function ConfirmReceiveDialog({
  offer,
  senderName,
  fileExtension,
  fileSizeLabel,
  pendingExtraCount,
  isSenderTrusted,
  shouldTrustSender,
  onTrustChange,
  onReject,
  onAccept,
}: ConfirmReceiveDialogProps) {
  return createPortal(
    <div className="dd-snaplink__receive-dialog-backdrop" role="presentation">
      <section
        className="dd-snaplink__receive-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dd-snaplink-receive-dialog-title"
      >
        <span className="dd-snaplink__receive-dialog-icon" aria-hidden="true">
          <ShieldCheck size={24} strokeWidth={1.9} />
        </span>
        <div className="dd-snaplink__receive-dialog-copy">
          <span>接收文件确认</span>
          <h2 id="dd-snaplink-receive-dialog-title">{senderName} 想发送文件</h2>
          <p>接受后才会建立传输进度；拒绝后对方会看到发送失败。</p>
        </div>
        <div className="dd-snaplink__receive-dialog-file">
          <span className="dd-snaplink__queue-ext">{fileExtension}</span>
          <span>
            <strong title={offer.name}>{offer.name}</strong>
            <small>{fileSizeLabel} · 仅在设备之间传输 · 文件不经过服务器</small>
          </span>
        </div>
        {pendingExtraCount > 0 ? (
          <p className="dd-snaplink__receive-dialog-extra">
            还有 {pendingExtraCount.toString()} 个文件等待确认，处理当前文件后会继续显示。
          </p>
        ) : null}
        <label className={`dd-snaplink__receive-dialog-trust${isSenderTrusted ? ' is-trusted' : ''}`}>
          <input
            type="checkbox"
            checked={shouldTrustSender}
            disabled={isSenderTrusted}
            onChange={(event) => onTrustChange(event.currentTarget.checked)}
          />
          <span>
            <strong>{isSenderTrusted ? '已信任此设备' : '信任此设备'}</strong>
            <small>
              {isSenderTrusted
                ? '以后来自该设备的卡片会标记为已信任。'
                : '仅保存在本机，用于下次识别该设备，不会上传到服务器。'}
            </small>
          </span>
        </label>
        <div className="dd-snaplink__receive-dialog-actions">
          <button type="button" className="is-secondary" onClick={onReject}>
            拒绝
          </button>
          <button type="button" className="is-primary" onClick={onAccept}>
            接收文件
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
