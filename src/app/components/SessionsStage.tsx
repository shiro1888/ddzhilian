import type { StageMeta, UiSession } from '../types'

type SessionsStageProps = {
  joinCode: string
  currentMeta: StageMeta
  uiSessions: UiSession[]
  selectedUiSession?: UiSession
  onJoinCodeChange: (value: string) => void
  onRequestSnapshot: () => void
  onShowConnect: () => void
}

export function SessionsStage({
  joinCode,
  currentMeta,
  uiSessions,
  selectedUiSession,
  onJoinCodeChange,
  onRequestSnapshot,
  onShowConnect,
}: SessionsStageProps) {
  const waitingCount = uiSessions.filter((session) => session.status === 'waiting').length
  const activeCount = uiSessions.filter((session) => session.status === 'active').length
  const completedCount = uiSessions.filter((session) => session.status === 'completed').length

  return (
    <>
      <div className="pp-stage__toolbar">
        <div className="pp-joinbox">
          <input
            type="text"
            inputMode="text"
            placeholder="输入互传码"
            value={joinCode}
            onChange={(event) => onJoinCodeChange(event.target.value.toUpperCase())}
          />
          <button type="button" className="pp-button pp-button--primary" onClick={onRequestSnapshot}>
            {currentMeta.primaryAction}
          </button>
          <button type="button" className="pp-button pp-button--dark" onClick={onShowConnect}>
            {currentMeta.secondaryAction}
          </button>
        </div>
      </div>

      <div className="pp-stage__grid">
        <section className="pp-composer">
          <div className="pp-connectbox">
            <div className="pp-receivebox__head">
              <span>会话概览</span>
              <small>{uiSessions.length} 个会话</small>
            </div>

            <div className="pp-overview">
              <div>
                <span>全部会话</span>
                <strong>{uiSessions.length}</strong>
              </div>
              <div>
                <span>待接收</span>
                <strong>{waitingCount}</strong>
              </div>
              <div>
                <span>传输中</span>
                <strong>{activeCount}</strong>
              </div>
              <div>
                <span>已关闭</span>
                <strong>{completedCount}</strong>
              </div>
            </div>
          </div>
        </section>

        <aside className="pp-stage__side">
          <div className="pp-detailcard">
            <p>记录提示</p>
            <ul>
              <li>
                <span>搜索范围</span>
                <strong>会话码 / 设备 / 载荷摘要</strong>
              </li>
              <li>
                <span>当前选中</span>
                <strong>{selectedUiSession ? `${selectedUiSession.id} · ${selectedUiSession.summary}` : '暂无会话'}</strong>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  )
}
