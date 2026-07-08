import type { ReactNode } from 'react'

import type { FileConversationEntry } from '../types'
import { formatFileSize } from '../utils'

type FileMessageCardProps = {
  file: FileConversationEntry
  actions?: ReactNode
}

function getFileExtension(fileName: string) {
  const extension = fileName.split('.').pop()
  if (!extension || extension === fileName) {
    return 'FILE'
  }

  return extension.slice(0, 5).toUpperCase()
}

function isImageFileEntry(file: FileConversationEntry) {
  return Boolean(
    file.mimeType?.toLowerCase().startsWith('image/') ||
    /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(file.fileName),
  )
}

function clampProgress(progress: number) {
  if (!Number.isFinite(progress)) {
    return 0
  }

  return Math.min(1, Math.max(0, progress))
}

export function FileMessageCard({ file, actions }: FileMessageCardProps) {
  const progress = clampProgress(file.progress)
  const rawProgressPercent = Math.round(progress * 100)
  const progressPercent = file.transferStatus
    ? file.transferStatus === 'completed'
      ? 100
      : file.transferStatus === 'transferring' || file.transferStatus === 'failed'
        ? rawProgressPercent
        : 0
      : rawProgressPercent
  const isCompleted = file.transferStatus === 'completed' || file.tone === 'completed'
  const isActive = file.transferStatus === 'transferring' || file.tone === 'active'
  const completedLabel = file.fromSelf ? '发送成功' : '接收完成'

  return (
    <div className={`dd-snaplink__file-card${isCompleted ? ' is-completed' : isActive ? ' is-active' : ''}`}>
      <div className="dd-snaplink__file-top">
        <span className="dd-snaplink__file-ext">{getFileExtension(file.fileName)}</span>
        <div>
          <strong title={file.fileName}>{file.fileName}</strong>
          <span>
            {formatFileSize(file.fileSize)} · {file.statusLabel}
          </span>
        </div>
      </div>
      {file.previewUrl && isImageFileEntry(file) ? (
        <div className="dd-snaplink__file-preview">
          <img src={file.previewUrl} alt={file.fileName} loading="lazy" />
        </div>
      ) : null}
      {isCompleted ? (
        <div className="dd-snaplink__file-done" aria-label={completedLabel}>
          <span aria-hidden="true">✓</span>
          {completedLabel}
        </div>
      ) : isActive ? (
        <div
          className="dd-snaplink__file-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
        >
          <div style={{ width: `${progressPercent}%` }} />
        </div>
      ) : null}
      {actions}
    </div>
  )
}
