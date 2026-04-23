import type { ReceivedFile } from '../../lib/ddzhilian-types'
import { formatFileSize, formatRelativeTime } from '../utils'

type ReceiveStageProps = {
  joinCode: string
  receivedCompletedFiles: ReceivedFile[]
  receivedPendingFiles: ReceivedFile[]
  onJoinCodeChange: (value: string) => void
  onJoinCode: () => void
  onRequestSnapshot: () => void
}

export function ReceiveStage({
  joinCode,
  receivedCompletedFiles,
  receivedPendingFiles,
  onJoinCodeChange,
  onJoinCode,
  onRequestSnapshot,
}: ReceiveStageProps) {
  return (
    <section className="dd-view dd-view--single dd-view--receive">
      <div className="dd-receive-topbar">
        <div className="dd-receive-topbar__actions">
          <span>设置</span>
          <button type="button" className="dd-icon-button" onClick={onRequestSnapshot}>
            ↻
          </button>
        </div>
      </div>

      <div className="dd-section-block">
        <div className="dd-section-block__head">
          <h3>下载共享文件</h3>
        </div>
        {receivedCompletedFiles.length > 0 ? (
          <ul className="dd-record-list">
            {receivedCompletedFiles.map((file) => (
              <li key={file.id}>
                <strong>{file.name}</strong>
                <span>{formatFileSize(file.size)}</span>
                {file.objectUrl ? (
                  <small>
                    <a href={file.objectUrl} download={file.name}>
                      下载文件
                    </a>
                  </small>
                ) : (
                  <small>{formatRelativeTime(file.createdAt)}</small>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="dd-empty">当前暂无文件</div>
        )}
      </div>

      <div className="dd-section-block">
        <div className="dd-section-block__head">
          <h3>自动接收的文件</h3>
        </div>
        {receivedPendingFiles.length > 0 ? (
          <ul className="dd-record-list">
            {receivedPendingFiles.map((file) => {
              const progress = file.size > 0 ? Math.min(file.receivedBytes / file.size, 1) : 0

              return (
                <li key={file.id}>
                  <strong>{file.name}</strong>
                  <span>
                    {formatFileSize(file.receivedBytes)} / {formatFileSize(file.size)}
                  </span>
                  <div
                    className="dd-record-list__progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                  >
                    <div style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                  <small>{formatRelativeTime(file.createdAt)}</small>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="dd-empty">当前暂无文件</div>
        )}
      </div>

      <div className="dd-section-block">
        <div className="dd-section-block__head dd-section-block__head--inline-form">
          <h3>临时缓存文件</h3>
          <div className="dd-join-inline">
            <input
              type="text"
              inputMode="text"
              placeholder="输入互传码"
              value={joinCode}
              onChange={(event) => onJoinCodeChange(event.target.value.toUpperCase())}
            />
            <button type="button" className="dd-button dd-button--dark" onClick={onJoinCode}>
              接收此会话
            </button>
          </div>
        </div>
        <div className="dd-empty">当前暂无文件</div>
      </div>
    </section>
  )
}
