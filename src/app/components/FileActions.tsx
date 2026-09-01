import type { FileConversationEntry } from '../types'

type FileActionsProps = {
  file: FileConversationEntry
  isLoadingPreview: boolean
  onOpenDocumentPreview: (file: FileConversationEntry) => void
  onRetryTransfer: (id: string) => void
  onCancelTransfer: (id: string) => void
  onRecallFile: (file: FileConversationEntry) => void
  variant?: 'file' | 'shared'
}

export function FileActions({
  file,
  isLoadingPreview,
  onOpenDocumentPreview,
  onRetryTransfer,
  onCancelTransfer,
  onRecallFile,
  variant = 'file',
}: FileActionsProps) {
  const documentPreviewHref = file.documentPreviewKind === 'pdf' ? file.documentPreviewHref : undefined
  const canPreviewDocument = Boolean(file.documentPreviewKind && (documentPreviewHref || file.onOpenDocumentPreview))

  if (!canPreviewDocument && !file.downloadUrl && !file.onDownload && !file.action && !file.canRecall) {
    return null
  }

  return (
    <div className={variant === 'shared' ? 'dd-snaplink__shared-actions' : 'dd-snaplink__file-actions'}>
      {documentPreviewHref ? (
        <a href={documentPreviewHref} aria-label={`预览 ${file.fileName}`}>
          预览
        </a>
      ) : canPreviewDocument ? (
        <button
          type="button"
          aria-label={`预览 ${file.fileName}`}
          onClick={() => onOpenDocumentPreview(file)}
          disabled={file.isDocumentPreviewDisabled || isLoadingPreview}
        >
          {isLoadingPreview ? '载入中' : '预览'}
        </button>
      ) : null}
      {file.onDownload ? (
        <button type="button" onClick={file.onDownload} disabled={file.isDownloadDisabled}>
          {file.isDownloadDisabled ? '下载中' : '下载'}
        </button>
      ) : null}
      {file.downloadUrl ? (
        <a href={file.downloadUrl} download={file.downloadName}>
          下载
        </a>
      ) : null}
      {file.action === 'retry' ? (
        <button type="button" onClick={() => onRetryTransfer(file.id)}>
          重试
        </button>
      ) : null}
      {file.action === 'cancel' ? (
        <button type="button" onClick={() => onCancelTransfer(file.id)}>
          取消
        </button>
      ) : null}
      {file.historyId && file.canRecall ? (
        <button type="button" className="is-danger" onClick={() => onRecallFile(file)}>
          撤回
        </button>
      ) : null}
    </div>
  )
}
