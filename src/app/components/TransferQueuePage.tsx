import type { ReactNode } from 'react'
import { CheckCircle2, Clock3, FolderOpen, Send, XCircle } from 'lucide-react'
import type { FileConversationEntry } from '../types'
import { EmptyState } from './EmptyState'

export type TransferQueuePageSection = {
  id: string
  label: string
  entries: FileConversationEntry[]
}

export type TransferQueuePageTab = {
  id: 'active' | 'completed' | 'failed' | 'history'
  label: string
  count?: number
}

type TransferQueuePageProps = {
  sections: TransferQueuePageSection[]
  tabs: TransferQueuePageTab[]
  activeTab: TransferQueuePageTab['id']
  totalCount: number
  activeCount: number
  completedCount: number
  failedCount: number
  historyCount?: number
  historyContent?: ReactNode
  incomingNotice?: ReactNode
  renderTaskCard: (file: FileConversationEntry) => ReactNode
  onTabChange: (tab: TransferQueuePageTab['id']) => void
  onShowNearby: () => void
  onShowFiles: () => void
}

export function TransferQueuePage({
  sections,
  tabs,
  activeTab,
  totalCount,
  activeCount,
  completedCount,
  failedCount,
  historyCount = 0,
  historyContent,
  incomingNotice,
  renderTaskCard,
  onTabChange,
  onShowNearby,
  onShowFiles,
}: TransferQueuePageProps) {
  const isHistoryTab = activeTab === 'history'
  const hasHistoryTab = tabs.some((tab) => tab.id === 'history')

  return (
    <section className="dd-snaplink__workbench-transfer-board dd-snaplink__workbench-page is-transfers" aria-label="传输记录">
      <div className="dd-snaplink__section-head">
        <span>
          <strong>传输</strong>
          <small>
            {activeCount.toString()} 进行中 · {completedCount.toString()} 已完成 · {failedCount.toString()} 失败
            {hasHistoryTab ? ` · ${historyCount.toString()} 历史` : ''}
          </small>
        </span>
      </div>
      <div className="dd-snaplink__transfer-tabs" role="tablist" aria-label="传输筛选">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={isActive ? 'is-active' : ''}
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' ? <em>{tab.count.toString()}</em> : null}
            </button>
          )
        })}
      </div>
      {!isHistoryTab ? (
        <div className="dd-snaplink__transfer-status-guide" aria-label="传输状态说明">
          <span>
            <Clock3 size={15} strokeWidth={1.9} aria-hidden="true" />
            <strong>连接/确认</strong>
            <small>连接和确认阶段保持 0%</small>
          </span>
          <span>
            <Send size={15} strokeWidth={1.9} aria-hidden="true" />
            <strong>正在发送/接收</strong>
            <small>按对方确认字节显示</small>
          </span>
          <span>
            <CheckCircle2 size={15} strokeWidth={1.9} aria-hidden="true" />
            <strong>发送/接收完成</strong>
            <small>完成确认后为 100%</small>
          </span>
          <span>
            <XCircle size={15} strokeWidth={1.9} aria-hidden="true" />
            <strong>失败可重试</strong>
            <small>保留失败前进度</small>
          </span>
        </div>
      ) : null}
      {incomingNotice}
      {isHistoryTab ? (
        <div className="dd-snaplink__transfer-history-tab">
          {historyContent ?? (
            <EmptyState
              className="dd-snaplink__workbench-room-empty is-transfer-empty"
              icon={<FolderOpen size={24} strokeWidth={1.8} aria-hidden="true" />}
              title="暂无传输记录"
              description={<span>完成的文件、文本和链接会出现在这里。</span>}
              actions={(
                <div className="dd-snaplink__transfer-empty-actions">
                  <button type="button" onClick={onShowFiles}>
                    去发送
                  </button>
                </div>
              )}
            />
          )}
        </div>
      ) : totalCount > 0 ? (
        <div className="dd-snaplink__transfer-groups">
          {sections.map((section) => (
            <section key={section.id} className="dd-snaplink__transfer-group" aria-label={section.label}>
              <div className="dd-snaplink__transfer-group-head">
                <strong>{section.label}</strong>
                <span>{section.entries.length.toString()}</span>
              </div>
              {section.entries.length > 0 ? (
                <div className="dd-snaplink__workbench-transfer-list">
                  {section.entries.map(renderTaskCard)}
                </div>
              ) : (
                <div className="dd-snaplink__transfer-group-empty">暂无{section.label}任务</div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          className="dd-snaplink__workbench-room-empty is-transfer-empty"
          icon={<FolderOpen size={24} strokeWidth={1.8} aria-hidden="true" />}
          title="还没有传输任务"
          description={<span>选择一个设备并发送文件，任务会出现在这里。</span>}
          actions={(
            <div className="dd-snaplink__transfer-empty-actions">
              <button type="button" onClick={onShowNearby}>
                选择附近设备
              </button>
              <button type="button" onClick={onShowFiles}>
                去发送
              </button>
            </div>
          )}
        />
      )}
    </section>
  )
}
