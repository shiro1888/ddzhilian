import type { ReactNode } from 'react'
import { FileUp, Layers, Radio, ShieldCheck, UploadCloud, Zap } from 'lucide-react'
import type { FileConversationEntry } from '../types'

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
      {incomingNotice}
      {isHistoryTab ? (
        <div className="dd-snaplink__transfer-history-tab">
          {historyContent ?? (
            <div className="dd-snaplink__transfer-empty-stage">
              <div className="dd-snaplink__transfer-dropzone-card">
                <span className="dd-snaplink__transfer-dropzone-icon" aria-hidden="true">
                  <UploadCloud size={32} strokeWidth={1.8} />
                </span>
                <strong>暂无传输历史记录</strong>
                <p>完成的文件、文本和链接会出现在这里，可随时二次复用或下载。</p>
                <div className="dd-snaplink__transfer-dropzone-actions">
                  <button type="button" className="is-primary" onClick={onShowFiles}>
                    <FileUp size={15} strokeWidth={2.2} />
                    选择本地文件发送
                  </button>
                  <button type="button" onClick={onShowNearby}>
                    <Radio size={15} strokeWidth={2.2} />
                    查找附近接收设备
                  </button>
                </div>
              </div>
            </div>
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
        <div className="dd-snaplink__transfer-empty-stage">
          <div className="dd-snaplink__transfer-dropzone-card">
            <span className="dd-snaplink__transfer-dropzone-icon" aria-hidden="true">
              <UploadCloud size={32} strokeWidth={1.8} />
            </span>
            <strong>将文件拖拽至此处直接投递</strong>
            <p>支持多选拖拽大文件、超高清视频、压缩包，免压缩直接端到端秒速送达</p>
            <div className="dd-snaplink__transfer-dropzone-actions">
              <button type="button" className="is-primary" onClick={onShowFiles}>
                <FileUp size={15} strokeWidth={2.2} />
                选择本地文件发送
              </button>
              <button type="button" onClick={onShowNearby}>
                <Radio size={15} strokeWidth={2.2} />
                查找附近接收设备
              </button>
            </div>
          </div>

          <div className="dd-snaplink__transfer-specs-grid">
            <div className="dd-snaplink__transfer-spec-card">
              <div className="dd-snaplink__transfer-spec-icon is-speed">
                <Zap size={18} strokeWidth={2.2} />
              </div>
              <div className="dd-snaplink__transfer-spec-body">
                <strong>千兆局域网跑满</strong>
                <p>WebRTC DataChannel 点对点直连，跳过任何云盘限速与排队</p>
              </div>
            </div>

            <div className="dd-snaplink__transfer-spec-card">
              <div className="dd-snaplink__transfer-spec-icon is-security">
                <ShieldCheck size={18} strokeWidth={2.2} />
              </div>
              <div className="dd-snaplink__transfer-spec-body">
                <strong>端到端 DTLS 物理加密</strong>
                <p>硬件级点对点加密流转，零服务器留存，商业与隐私更放心</p>
              </div>
            </div>

            <div className="dd-snaplink__transfer-spec-card">
              <div className="dd-snaplink__transfer-spec-icon is-stream">
                <Layers size={18} strokeWidth={2.2} />
              </div>
              <div className="dd-snaplink__transfer-spec-body">
                <strong>超大文件流式切片</strong>
                <p>支持数十 GB 级视频与工程归档包，内存低占用，断网自动续传</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
