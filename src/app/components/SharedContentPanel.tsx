import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export type SharedContentPanelTabId = 'files' | 'media' | 'links'

type SharedContentPanelTab = {
  id: SharedContentPanelTabId
  label: string
  count: number
}

type SharedContentPanelProps = {
  activeTab: SharedContentPanelTabId
  activeLabel?: string
  tabs: SharedContentPanelTab[]
  children: ReactNode
  onTabChange: (tabId: SharedContentPanelTabId) => void
  onClose: () => void
}

export function SharedContentPanel({
  activeTab,
  activeLabel,
  tabs,
  children,
  onTabChange,
  onClose,
}: SharedContentPanelProps) {
  return (
    <div className="dd-snaplink__shared-panel" aria-label={activeLabel ?? '共享内容'}>
      <div className="dd-snaplink__shared-head">
        <strong>共享内容</strong>
        <button
          type="button"
          className="dd-snaplink__shared-close"
          onClick={onClose}
          aria-label="关闭共享内容"
          title="关闭"
        >
          <X size={14} strokeWidth={2.2} aria-hidden="true" />
          <span>关闭</span>
        </button>
      </div>
      <div className="dd-snaplink__shared-tabs" role="tablist" aria-label="共享内容分类">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeTab === item.id}
            className={activeTab === item.id ? 'is-active' : ''}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
            {item.count > 0 ? ` ${item.count.toString()}` : ''}
          </button>
        ))}
      </div>
      <div className="dd-snaplink__shared-list">{children}</div>
    </div>
  )
}
