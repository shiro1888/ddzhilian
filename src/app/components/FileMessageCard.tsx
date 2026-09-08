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

function getFileKindClass(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (/^(pdf|doc|docx|pages|epub)$/.test(ext)) return 'is-doc'
  if (/^(jpg|jpeg|png|gif|webp|svg|heic|raw)$/.test(ext)) return 'is-image'
  if (/^(zip|rar|7z|tar|gz|pkg|dmg|iso)$/.test(ext)) return 'is-archive'
  if (/^(ts|tsx|js|jsx|json|py|rs|go|java|c|cpp|html|css|sql|sh)$/.test(ext)) return 'is-code'
  if (/^(mp3|wav|flac|aac|m4a|ogg)$/.test(ext)) return 'is-audio'
  if (/^(mp4|mov|mkv|avi|webm)$/.test(ext)) return 'is-video'
  return 'is-generic'
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
  const isFailed = file.transferStatus === 'failed' || file.tone === 'failed'
  const completedLabel = file.fromSelf ? '发送成功' : '接收完成'

  return (
    <div className={`dd-snaplink__file-card${isCompleted ? ' is-completed' : isActive ? ' is-active' : isFailed ? ' is-failed' : ''}`}>
      <div className="dd-snaplink__file-top">
        <span className={`dd-snaplink__file-ext ${getFileKindClass(file.fileName)}`}>
          {getFileExtension(file.fileName)}
        </span>
        <div className="dd-snaplink__file-meta">
          <strong title={file.fileName}>{file.fileName}</strong>
          <span className="dd-snaplink__file-size-info">
            {formatFileSize(file.fileSize)}
            {isActive && file.statusLabel ? ` · ${file.statusLabel}` : ''}
          </span>
        </div>
      </div>
      {file.previewUrl && isImageFileEntry(file) ? (
        <div className="dd-snaplink__file-preview">
          <img src={file.previewUrl} alt={file.fileName} loading="lazy" />
        </div>
      ) : null}
      {isActive ? (
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
      <div className="dd-snaplink__file-footer">
        <div className="dd-snaplink__file-status-wrap">
          {isCompleted ? (
            <div className="dd-snaplink__file-done" aria-label={completedLabel}>
              <span className="dd-snaplink__file-done-check" aria-hidden="true">✓</span>
              <span>{completedLabel}</span>
            </div>
          ) : isActive ? (
            <div className="dd-snaplink__file-transferring">
              <span className="dd-snaplink__file-spin-dot" aria-hidden="true" />
              <span>传输中 {progressPercent}%</span>
            </div>
          ) : isFailed ? (
            <div className="dd-snaplink__file-failed-badge">
              <span aria-hidden="true">!</span>
              <span>发送失败</span>
            </div>
          ) : null}
        </div>
        {actions}
      </div>
    </div>
  )
}
