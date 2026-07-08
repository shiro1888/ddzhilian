import type { ReactNode } from 'react'
import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import type { TransferStatus } from '../../lib/ddzhilian-types'
import type { FileConversationEntry } from '../types'

type TransferTaskCardProps = {
  file: FileConversationEntry
  status: TransferStatus
  progress: number
  extension: string
  sizeLabel: string
  actions?: ReactNode
}

export function TransferTaskCard({
  file,
  status,
  progress,
  extension,
  sizeLabel,
  actions,
}: TransferTaskCardProps) {
  const rawProgressPercent = Math.round(Math.min(Math.max(progress, 0), 1) * 100)
  const isProgressing = status === 'transferring'
  const visibleProgressPercent =
    status === 'completed'
      ? 100
      : isProgressing || status === 'failed'
        ? rawProgressPercent
        : 0
  const progressLabel = status === 'completed'
    ? '100%'
    : isProgressing || status === 'failed'
      ? `${visibleProgressPercent.toString()}%`
      : file.statusLabel
  const telemetryLabels = [file.transferSpeedLabel, file.transferEtaLabel].filter(
    (label): label is string => Boolean(label),
  )
  const directionLabel = file.fromSelf ? '发送' : '接收'
  const peerLabel = file.fromSelf ? `发送到 ${file.subtitle}` : `来自 ${file.subtitle}`

  return (
    <article
      className={[
        'dd-snaplink__queue-card',
        `is-${status}`,
        file.fromSelf ? 'is-outgoing' : 'is-incoming',
      ].join(' ')}
      data-transfer-status={status}
      data-transfer-direction={file.fromSelf ? 'outgoing' : 'incoming'}
      aria-label={`${directionLabel}任务：${file.fileName}，${peerLabel}，${file.statusLabel}，${progressLabel}`}
    >
      <div className="dd-snaplink__queue-card-head">
        <span className="dd-snaplink__queue-ext">{extension}</span>
        <span className="dd-snaplink__queue-main">
          <strong title={file.fileName}>{file.fileName}</strong>
          <small>{file.fromSelf ? '发送到' : '来自'} {file.subtitle}</small>
        </span>
        <span className="dd-snaplink__queue-percent">{progressLabel}</span>
      </div>
      <div className="dd-snaplink__queue-status">
        {status === 'completed' ? (
          <CheckCircle2 size={13} strokeWidth={2.2} aria-hidden="true" />
        ) : status === 'failed' ? (
          <XCircle size={13} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <Clock3 size={13} strokeWidth={2.2} aria-hidden="true" />
        )}
        <span>{file.statusLabel}</span>
        <em>{directionLabel}</em>
      </div>
      {isProgressing ? (
        <div
          className="dd-snaplink__queue-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={visibleProgressPercent}
        >
          <span style={{ width: `${visibleProgressPercent.toString()}%` }} />
        </div>
      ) : null}
      <div className="dd-snaplink__queue-meta">
        <span>{sizeLabel}</span>
        <span>{file.detail}</span>
      </div>
      {telemetryLabels.length > 0 ? (
        <div className="dd-snaplink__queue-telemetry" aria-label="传输速度与剩余时间">
          {telemetryLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      ) : null}
      {actions}
    </article>
  )
}
