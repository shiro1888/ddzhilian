import { useEffect, useRef, useState } from 'react'
import { Check, Download, Eye, RotateCcw, RotateCw, X } from 'lucide-react'

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

export function FileActions(props: FileActionsProps) {
  const recallIdentity = [props.file.id, props.file.historyId ?? ''].join(':')

  return <FileActionsContent key={recallIdentity} {...props} />
}

function FileActionsContent({
  file,
  isLoadingPreview,
  onOpenDocumentPreview,
  onRetryTransfer,
  onCancelTransfer,
  onRecallFile,
  variant = 'file',
}: FileActionsProps) {
  const [isConfirmingRecall, setIsConfirmingRecall] = useState(false)
  const confirmGroupRef = useRef<HTMLDivElement | null>(null)
  const confirmTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current !== null) {
        window.clearTimeout(confirmTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isConfirmingRecall) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (confirmGroupRef.current && !confirmGroupRef.current.contains(event.target as Node)) {
        setIsConfirmingRecall(false)
        if (confirmTimeoutRef.current !== null) {
          window.clearTimeout(confirmTimeoutRef.current)
          confirmTimeoutRef.current = null
        }
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsConfirmingRecall(false)
        if (confirmTimeoutRef.current !== null) {
          window.clearTimeout(confirmTimeoutRef.current)
          confirmTimeoutRef.current = null
        }
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isConfirmingRecall])

  const handleStartRecallConfirm = () => {
    setIsConfirmingRecall(true)
    if (confirmTimeoutRef.current !== null) {
      window.clearTimeout(confirmTimeoutRef.current)
    }
    confirmTimeoutRef.current = window.setTimeout(() => {
      setIsConfirmingRecall(false)
      confirmTimeoutRef.current = null
    }, 6000)
  }

  const handleCancelRecall = () => {
    if (confirmTimeoutRef.current !== null) {
      window.clearTimeout(confirmTimeoutRef.current)
      confirmTimeoutRef.current = null
    }
    setIsConfirmingRecall(false)
  }

  const handleConfirmRecall = () => {
    if (confirmTimeoutRef.current !== null) {
      window.clearTimeout(confirmTimeoutRef.current)
      confirmTimeoutRef.current = null
    }
    setIsConfirmingRecall(false)
    onRecallFile(file)
  }

  const handleCancelTransfer = () => {
    const groupedTransferIds = file.cancelTransferIds
    const transferIds = groupedTransferIds && groupedTransferIds.length > 0
      ? groupedTransferIds
      : [file.id]

    for (const transferId of new Set(transferIds)) {
      onCancelTransfer(transferId)
    }
  }

  const documentPreviewHref = file.documentPreviewKind === 'pdf' ? file.documentPreviewHref : undefined
  const canPreviewDocument = Boolean(file.documentPreviewKind && (documentPreviewHref || file.onOpenDocumentPreview))

  if (!canPreviewDocument && !file.downloadUrl && !file.onDownload && !file.action && !file.canRecall) {
    return null
  }

  return (
    <div className={variant === 'shared' ? 'dd-snaplink__shared-actions' : 'dd-snaplink__file-actions'}>
      {documentPreviewHref ? (
        <a href={documentPreviewHref} aria-label={`预览 ${file.fileName}`}>
          <Eye size={12} className="dd-snaplink__file-action-icon" aria-hidden="true" />
          <span>预览</span>
        </a>
      ) : canPreviewDocument ? (
        <button
          type="button"
          aria-label={`预览 ${file.fileName}`}
          onClick={() => onOpenDocumentPreview(file)}
          disabled={file.isDocumentPreviewDisabled || isLoadingPreview}
        >
          <Eye size={12} className="dd-snaplink__file-action-icon" aria-hidden="true" />
          <span>{isLoadingPreview ? '载入中' : '预览'}</span>
        </button>
      ) : null}
      {file.onDownload ? (
        <button type="button" onClick={file.onDownload} disabled={file.isDownloadDisabled}>
          <Download size={12} className="dd-snaplink__file-action-icon" aria-hidden="true" />
          <span>{file.isDownloadDisabled ? '下载中' : '下载'}</span>
        </button>
      ) : null}
      {file.downloadUrl ? (
        <a href={file.downloadUrl} download={file.downloadName}>
          <Download size={12} className="dd-snaplink__file-action-icon" aria-hidden="true" />
          <span>下载</span>
        </a>
      ) : null}
      {file.action === 'retry' ? (
        <button type="button" onClick={() => onRetryTransfer(file.id)}>
          <RotateCw size={12} className="dd-snaplink__file-action-icon" aria-hidden="true" />
          <span>重试</span>
        </button>
      ) : null}
      {file.action === 'cancel' ? (
        <button type="button" onClick={handleCancelTransfer}>
          <X size={12} className="dd-snaplink__file-action-icon" aria-hidden="true" />
          <span>取消</span>
        </button>
      ) : null}
      {file.historyId && file.canRecall ? (
        isConfirmingRecall ? (
          <div
            ref={confirmGroupRef}
            className="dd-snaplink__file-recall-confirm-group"
            role="group"
            aria-label={`确认撤回 ${file.fileName}`}
          >
            <span className="dd-snaplink__file-recall-confirm-text">确定撤回？</span>
            <button
              type="button"
              className="is-danger is-confirm"
              onClick={handleConfirmRecall}
              aria-label="确认撤回"
            >
              <Check size={11} className="dd-snaplink__file-action-icon" aria-hidden="true" />
              <span>确认</span>
            </button>
            <button
              type="button"
              className="is-cancel"
              onClick={handleCancelRecall}
              aria-label="取消撤回"
            >
              <span>取消</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="is-danger"
            onClick={handleStartRecallConfirm}
            aria-label={`撤回 ${file.fileName}`}
          >
            <RotateCcw size={11} className="dd-snaplink__file-action-icon" aria-hidden="true" />
            <span>撤回</span>
          </button>
        )
      ) : null}
    </div>
  )
}

