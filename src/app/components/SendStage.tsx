import type { ChangeEvent, DragEvent } from 'react'
import type { TransferItem } from '../../lib/ddzhilian-types'
import { formatFileSize, transferStatusLabel } from '../utils'

type SendStageProps = {
  isDragging: boolean
  fileInputId: string
  activeTransferLabel: string
  hasRunnableTransfers: boolean
  visibleTransferItems: TransferItem[]
  fileSenderEmptyState: string
  onFileSelection: (event: ChangeEvent<HTMLInputElement>) => void
  onSendFiles: () => void
  onRetryTransfer: (id: string) => void
  onCancelTransfer: (id: string) => void
  onDragEnter: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

export function SendStage({
  isDragging,
  fileInputId,
  activeTransferLabel,
  hasRunnableTransfers,
  visibleTransferItems,
  fileSenderEmptyState,
  onFileSelection,
  onSendFiles,
  onRetryTransfer,
  onCancelTransfer,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: SendStageProps) {
  return (
    <section className="dd-view dd-view--single dd-view--send">
      <div
        className={`dd-bluebox${isDragging ? ' is-dragging' : ''}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <p>选择文件，实时共享，等待已连接设备下载</p>
        <div className="dd-bluebox__actions">
          <label className={`dd-pill-button${isDragging ? ' is-dragging' : ''}`} htmlFor={fileInputId}>
            <input id={fileInputId} className="sr-only" type="file" multiple onChange={onFileSelection} />
            共享文件
          </label>
          <span>粘贴或者拖拽文件/文件夹到此</span>
        </div>
      </div>

      <div className="dd-section-block">
        <div className="dd-section-block__head">
          <div>
            <h3>推送文件到已连接设备</h3>
            <p className="dd-inline-note">当前目标：{activeTransferLabel}</p>
          </div>
          <button
            type="button"
            className="dd-button dd-button--primary"
            onClick={onSendFiles}
            disabled={!hasRunnableTransfers}
          >
            发送
          </button>
        </div>

        {visibleTransferItems.length > 0 ? (
          <ul className="dd-transfer-list">
            {visibleTransferItems.map((item) => (
              <li key={item.id}>
                <div className="dd-transfer-list__head">
                  <div>
                    <strong>{item.fileName}</strong>
                    <span>{formatFileSize(item.fileSize)}</span>
                  </div>
                  <div className="dd-transfer-list__meta">
                    <span>{item.targetDeviceName ?? activeTransferLabel}</span>
                    <strong>{transferStatusLabel(item.status)}</strong>
                  </div>
                </div>

                <div className="dd-transfer-list__progress">
                  <div
                    className={`dd-transfer-list__bar dd-transfer-list__bar--${item.status}`}
                    style={{ width: `${Math.round(item.progress * 100)}%` }}
                  />
                </div>

                <div className="dd-transfer-list__footer">
                  <span>{Math.round(item.progress * 100)}%</span>
                  <span>
                    {formatFileSize(item.sentBytes)} / {formatFileSize(item.fileSize)}
                  </span>
                  {item.status === 'failed' ? (
                    <button type="button" onClick={() => onRetryTransfer(item.id)}>
                      重试
                    </button>
                  ) : item.status !== 'completed' ? (
                    <button type="button" onClick={() => onCancelTransfer(item.id)}>
                      取消
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dd-empty">{fileSenderEmptyState}</div>
        )}
      </div>
    </section>
  )
}
