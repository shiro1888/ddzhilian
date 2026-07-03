import type { ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'
import { EmptyState } from './EmptyState'
import { SendTargetSelector } from './SendTargetSelector'

type FileSendPageProps = {
  header: ReactNode
  targetSummary: ReactNode
  deviceTargets: ReactNode[]
  roomTargets?: ReactNode[]
  dropZone: ReactNode
  recentFiles: ReactNode[]
}

export function FileSendPage({
  header,
  targetSummary,
  deviceTargets,
  roomTargets,
  dropZone,
  recentFiles,
}: FileSendPageProps) {
  return (
    <section className="dd-snaplink__workbench-page is-files" aria-label="发送">
      {header}
      <SendTargetSelector
        targetSummary={targetSummary}
        deviceTargets={deviceTargets}
        roomTargets={roomTargets}
      />
      {dropZone}
      <div className="dd-snaplink__recent-sends">
        <div className="dd-snaplink__section-head">
          <span>
            <strong>最近发送</strong>
            <small>{recentFiles.length > 0 ? '最近的文件任务会显示在这里' : '还没有发送任务'}</small>
          </span>
        </div>
        {recentFiles.length > 0 ? (
          <div className="dd-snaplink__recent-send-list">
            {recentFiles}
          </div>
        ) : (
          <EmptyState
            className="dd-snaplink__workbench-room-empty"
            icon={<FolderOpen size={23} strokeWidth={1.8} aria-hidden="true" />}
            title="暂无最近发送"
            description={<span>选择文件、拍照或发送文本后，任务会进入传输记录。</span>}
          />
        )}
      </div>
    </section>
  )
}
