import type { ReactNode } from 'react'
import { History, Search } from 'lucide-react'
import { EmptyState } from './EmptyState'

type HistoryPageProps = {
  header?: ReactNode
  embedded?: boolean
  searchQuery: string
  fileCount: number
  textCount: number
  linkCount: number
  totalCount: number
  rawCount: number
  filePanelContent: ReactNode
  textPanelContent: ReactNode
  onSearchChange: (value: string) => void
  onClearSearch: () => void
  onShowFiles: () => void
  onShowText: () => void
  onShowRooms: () => void
}

export function HistoryPage({
  header,
  embedded = false,
  searchQuery,
  fileCount,
  textCount,
  linkCount,
  totalCount,
  rawCount,
  filePanelContent,
  textPanelContent,
  onSearchChange,
  onClearSearch,
  onShowFiles,
  onShowText,
  onShowRooms,
}: HistoryPageProps) {
  return (
    <section className={`dd-snaplink__workbench-page is-history${embedded ? ' is-embedded' : ''}`} aria-label="历史记录">
      {header ? header : null}
      <label className="dd-snaplink__history-search">
        <Search size={15} strokeWidth={2} aria-hidden="true" />
        <span>搜索历史</span>
        <input
          value={searchQuery}
          placeholder="搜索文件名、文本、链接或设备"
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
        {searchQuery ? (
          <button type="button" onClick={onClearSearch}>
            清空
          </button>
        ) : null}
      </label>
      <div className="dd-snaplink__history-stats">
        <span>
          <strong>{fileCount.toString()}</strong>
          <small>文件/媒体</small>
        </span>
        <span>
          <strong>{textCount.toString()}</strong>
          <small>文本</small>
        </span>
        <span>
          <strong>{linkCount.toString()}</strong>
          <small>链接</small>
        </span>
      </div>
      {totalCount > 0 ? (
        <div className="dd-snaplink__history-grid">
          <section className="dd-snaplink__history-panel" aria-label="历史文件">
            <div className="dd-snaplink__section-head">
              <span>
                <strong>文件与媒体</strong>
                <small>可预览、下载或撤回的历史文件</small>
              </span>
            </div>
            {filePanelContent}
          </section>
          <section className="dd-snaplink__history-panel" aria-label="文本与链接">
            <div className="dd-snaplink__section-head">
              <span>
                <strong>文本与链接</strong>
                <small>最近的文字内容和链接</small>
              </span>
            </div>
            {textPanelContent}
          </section>
        </div>
      ) : rawCount > 0 ? (
        <EmptyState
          className="dd-snaplink__workbench-room-empty is-large"
          icon={<History size={25} strokeWidth={1.8} aria-hidden="true" />}
          title="没有匹配的历史"
          description={<span>换一个关键词，或清空搜索后查看全部历史。</span>}
          actions={(
            <div className="dd-snaplink__empty-actions" aria-label="历史搜索快捷操作">
              <button type="button" onClick={onClearSearch}>
                清空搜索
              </button>
            </div>
          )}
        />
      ) : (
        <EmptyState
          className="dd-snaplink__workbench-room-empty is-large"
          icon={<History size={25} strokeWidth={1.8} aria-hidden="true" />}
          title="暂无历史记录"
          description={<span>发送或接收文件、文本后，历史会集中显示在这里。</span>}
          actions={(
            <div className="dd-snaplink__empty-actions" aria-label="历史记录快捷操作">
              <button type="button" onClick={onShowFiles}>
                发送文件
              </button>
              <button type="button" onClick={onShowText}>
                发送文本
              </button>
              <button type="button" onClick={onShowRooms}>
                进入房间
              </button>
            </div>
          )}
        />
      )}
    </section>
  )
}
