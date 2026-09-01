import { getDocumentPreviewKindLabel } from '../../lib/document-preview'
import type {
  DocumentPreviewKind,
  DocumentPreviewPayload,
} from '../../lib/document-preview'
import { DocumentPreviewBody, usePreviewObjectUrl } from './DocumentPreviewRenderers'

export { resolveDocxPreviewLayout } from './DocumentPreviewRenderers'

export type DocumentPreviewDialogState =
  | {
      status: 'loading'
      kind: DocumentPreviewKind
      fileName: string
      mimeType?: string
    }
  | {
      status: 'ready'
      payload: DocumentPreviewPayload
    }
  | {
      status: 'failed'
      kind: DocumentPreviewKind
      fileName: string
      errorMessage: string
    }

type DocumentPreviewDialogProps = {
  preview: DocumentPreviewDialogState
  onClose: () => void
}

function useDocumentDownloadUrl(preview: DocumentPreviewDialogState) {
  const directUrl =
    preview.status === 'ready'
      ? preview.payload.downloadUrl ?? (
          typeof preview.payload.source === 'string' ? preview.payload.source : null
        )
      : null
  const objectUrl = usePreviewObjectUrl(
    preview.status === 'ready' ? preview.payload.source : undefined,
    preview.status === 'ready' ? preview.payload.mimeType : undefined,
    preview.status === 'ready' && !directUrl,
  )

  return directUrl ?? objectUrl
}

export function DocumentPreviewDialog({ preview, onClose }: DocumentPreviewDialogProps) {
  const readyPayload = preview.status === 'ready' ? preview.payload : null
  const downloadUrl = useDocumentDownloadUrl(preview)
  const kind = preview.status === 'ready' ? preview.payload.kind : preview.kind
  const fileName = preview.status === 'ready' ? preview.payload.fileName : preview.fileName
  const downloadName = readyPayload?.downloadName ?? fileName
  const kindLabel = getDocumentPreviewKindLabel(kind)
  const dialogTitle = `${kindLabel} 预览`

  return (
    <div className="dd-document-preview-dialog" role="dialog" aria-modal="true" aria-label={dialogTitle}>
      <button
        type="button"
        className="dd-document-preview-dialog__backdrop"
        aria-label="关闭文档预览"
        onClick={onClose}
      />
      <div className="dd-document-preview-dialog__panel">
        <div className="dd-document-preview-dialog__titlebar">
          <span title={fileName}>{fileName}</span>
          <div className="dd-document-preview-dialog__actions">
            {downloadUrl ? (
              <a href={downloadUrl} download={downloadName}>
                下载
              </a>
            ) : null}
            <button
              type="button"
              className="dd-document-preview-dialog__close"
              aria-label="关闭文档预览"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>
        <div className="dd-document-preview-dialog__body">
          {preview.status === 'loading' ? (
            <div className="dd-document-preview__loading">正在载入 {kindLabel} 文档</div>
          ) : null}
          {preview.status === 'failed' ? (
            <div className="dd-document-preview__error" role="alert">{preview.errorMessage}</div>
          ) : null}
          {readyPayload ? <DocumentPreviewBody payload={readyPayload} /> : null}
        </div>
      </div>
    </div>
  )
}
