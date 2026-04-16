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
    <section className="pp-view pp-view--single pp-view--receive">
      <div className="pp-receive-topbar">
        <div className="pp-receive-topbar__actions">
          <span>设置</span>
          <button type="button" className="pp-icon-button" onClick={onRequestSnapshot}>
            ↻
          </button>
        </div>
      </div>

      <div className="pp-section-block">
        <div className="pp-section-block__head">
          <h3>下载共享文件</h3>
        </div>
        {receivedCompletedFiles.length > 0 ? (
          <ul className="pp-record-list">
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
          <div className="pp-empty">当前暂无文件</div>
        )}
      </div>

      <div className="pp-section-block">
        <div className="pp-section-block__head">
          <h3>自动接收的文件</h3>
        </div>
        {receivedPendingFiles.length > 0 ? (
          <ul className="pp-record-list">
            {receivedPendingFiles.map((file) => (
              <li key={file.id}>
                <strong>{file.name}</strong>
                <span>
                  {file.receivedBytes} / {file.size} bytes
                </span>
                <small>{formatRelativeTime(file.createdAt)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <div className="pp-empty">当前暂无文件</div>
        )}
      </div>

      <div className="pp-section-block">
        <div className="pp-section-block__head pp-section-block__head--inline-form">
          <h3>临时缓存文件</h3>
          <div className="pp-join-inline">
            <input
              type="text"
              inputMode="text"
              placeholder="输入互传码"
              value={joinCode}
              onChange={(event) => onJoinCodeChange(event.target.value.toUpperCase())}
            />
            <button type="button" className="pp-button pp-button--dark" onClick={onJoinCode}>
              接收此会话
            </button>
          </div>
        </div>
        <div className="pp-empty">当前暂无文件</div>
      </div>
    </section>
  )
}
