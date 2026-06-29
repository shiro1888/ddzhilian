import type { ReactNode } from 'react'

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
    <div className="dd-snaplink__shared-panel" aria-label={activeLabel ?? '历史内容'}>
      <div className="dd-snaplink__shared-head">
        <strong>历史内容</strong>
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="dd-snaplink__shared-tabs" role="tablist" aria-label="历史内容分类">
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
