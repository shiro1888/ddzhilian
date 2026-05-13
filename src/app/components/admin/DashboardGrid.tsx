import { useRef, useState } from 'react'
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import {
  createDefaultDashboardWidgetOrder,
  createDefaultDashboardWidgetSizes,
  createDefaultDashboardWidgetVisibility,
  DASHBOARD_WIDGET_DRAG_MIME,
  DASHBOARD_WIDGET_META_BY_KEY,
  DASHBOARD_WIDGET_SIZE_BY_KEY,
  getDashboardWidgetSupportedSizes,
  getSafeDashboardWidgetSizeKey,
  isDashboardWidgetKey,
  isDashboardWidgetSizeKey,
  moveDashboardWidgetAroundTarget,
} from './constants'
import type { DashboardWidgetDragSource, DashboardWidgetKey, DashboardWidgetSizeKey } from './constants'

export function DashboardGrid({
  isEditing,
  renderWidget,
}: {
  isEditing: boolean
  renderWidget: (key: DashboardWidgetKey) => ReactNode
}) {
  const [dashboardWidgetVisibility, setDashboardWidgetVisibility] = useState<Record<DashboardWidgetKey, boolean>>(createDefaultDashboardWidgetVisibility)
  const [dashboardWidgetOrder, setDashboardWidgetOrder] = useState<DashboardWidgetKey[]>(createDefaultDashboardWidgetOrder)
  const [dashboardWidgetSizes, setDashboardWidgetSizes] = useState<Record<DashboardWidgetKey, DashboardWidgetSizeKey>>(createDefaultDashboardWidgetSizes)
  const [draggingDashboardWidget, setDraggingDashboardWidget] = useState<{
    key: DashboardWidgetKey
    source: DashboardWidgetDragSource
  } | null>(null)
  const draggingDashboardWidgetRef = useRef<{
    key: DashboardWidgetKey
    source: DashboardWidgetDragSource
  } | null>(null)
  const pointerDashboardDragRef = useRef<{
    key: DashboardWidgetKey
    source: DashboardWidgetDragSource
    pointerId: number
    startX: number
    startY: number
    hasMoved: boolean
  } | null>(null)
  const suppressDashboardWidgetClickRef = useRef(false)
  const [dashboardDropTarget, setDashboardDropTarget] = useState<DashboardWidgetKey | null>(null)
  const [isDashboardTrayDropTarget, setIsDashboardTrayDropTarget] = useState(false)
  const visibleDashboardWidgetKeys = dashboardWidgetOrder.filter((key) => dashboardWidgetVisibility[key])
  const hiddenDashboardWidgetKeys = dashboardWidgetOrder.filter((key) => !dashboardWidgetVisibility[key])

  const updateDashboardWidgetVisibility = (key: DashboardWidgetKey, visible: boolean) => {
    setDashboardWidgetVisibility((previous) => ({
      ...previous,
      [key]: visible,
    }))
  }

  const updateDashboardWidgetSize = (key: DashboardWidgetKey, sizeKey: DashboardWidgetSizeKey) => {
    if (!getDashboardWidgetSupportedSizes(key).includes(sizeKey)) {
      return
    }

    setDashboardWidgetSizes((previous) => ({
      ...previous,
      [key]: sizeKey,
    }))
  }

  const resetDashboardWidgets = () => {
    setDashboardWidgetVisibility(createDefaultDashboardWidgetVisibility())
    setDashboardWidgetOrder(createDefaultDashboardWidgetOrder())
    setDashboardWidgetSizes(createDefaultDashboardWidgetSizes())
    setDraggingDashboardWidget(null)
    setDashboardDropTarget(null)
    setIsDashboardTrayDropTarget(false)
  }

  const getDraggedDashboardWidget = (event: DragEvent<HTMLElement>) => {
    const explicitKey = event.dataTransfer.getData(DASHBOARD_WIDGET_DRAG_MIME)
    if (isDashboardWidgetKey(explicitKey)) {
      return explicitKey
    }

    return draggingDashboardWidgetRef.current?.key ?? draggingDashboardWidget?.key ?? null
  }

  const handleDashboardWidgetDragStart = (
    event: DragEvent<HTMLElement>,
    key: DashboardWidgetKey,
    source: DashboardWidgetDragSource,
  ) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(DASHBOARD_WIDGET_DRAG_MIME, key)
    event.dataTransfer.setData('text/plain', DASHBOARD_WIDGET_META_BY_KEY[key].label)
    const dragState = { key, source }
    draggingDashboardWidgetRef.current = dragState
    setDraggingDashboardWidget(dragState)
  }

  const clearDashboardWidgetDrag = () => {
    draggingDashboardWidgetRef.current = null
    pointerDashboardDragRef.current = null
    setDraggingDashboardWidget(null)
    setDashboardDropTarget(null)
    setIsDashboardTrayDropTarget(false)
  }

  const consumeDashboardWidgetClickSuppression = () => {
    if (!suppressDashboardWidgetClickRef.current) {
      return false
    }

    suppressDashboardWidgetClickRef.current = false
    return true
  }

  const readDashboardDropTargetAtPoint = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY)
    if (!element) {
      return { type: 'none' as const }
    }

    if (element.closest('.dd-admin-hidden-widget-tray')) {
      return { type: 'tray' as const }
    }

    const widgetElement = element.closest<HTMLElement>('[data-admin-widget-key]')
    const widgetKey = widgetElement?.dataset.adminWidgetKey
    if (widgetKey && isDashboardWidgetKey(widgetKey)) {
      return { type: 'widget' as const, key: widgetKey }
    }

    if (element.closest('.dd-admin-edit-grid')) {
      return { type: 'grid' as const }
    }

    return { type: 'none' as const }
  }

  const handleDashboardWidgetPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    key: DashboardWidgetKey,
    source: DashboardWidgetDragSource,
  ) => {
    if (event.button !== 0) {
      return
    }

    pointerDashboardDragRef.current = {
      key,
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      hasMoved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleDashboardWidgetPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const pointerDrag = pointerDashboardDragRef.current
    if (!pointerDrag) {
      return
    }

    const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY)
    if (distance < 6 && !pointerDrag.hasMoved) {
      return
    }

    pointerDrag.hasMoved = true
    const dragState = { key: pointerDrag.key, source: pointerDrag.source }
    draggingDashboardWidgetRef.current = dragState
    setDraggingDashboardWidget(dragState)
  }

  const handleDashboardWidgetPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const pointerDrag = pointerDashboardDragRef.current
    if (!pointerDrag) {
      return
    }

    if (event.currentTarget.hasPointerCapture(pointerDrag.pointerId)) {
      event.currentTarget.releasePointerCapture(pointerDrag.pointerId)
    }

    pointerDashboardDragRef.current = null
    if (!pointerDrag.hasMoved) {
      clearDashboardWidgetDrag()
      return
    }

    event.preventDefault()
    suppressDashboardWidgetClickRef.current = true
    window.setTimeout(() => {
      suppressDashboardWidgetClickRef.current = false
    }, 0)

    const dropTarget = readDashboardDropTargetAtPoint(event.clientX, event.clientY)
    if (dropTarget.type === 'tray') {
      updateDashboardWidgetVisibility(pointerDrag.key, false)
      clearDashboardWidgetDrag()
      return
    }

    if (dropTarget.type === 'widget') {
      setDashboardWidgetOrder((previous) => moveDashboardWidgetAroundTarget(previous, pointerDrag.key, dropTarget.key))
      updateDashboardWidgetVisibility(pointerDrag.key, true)
      clearDashboardWidgetDrag()
      return
    }

    if (dropTarget.type === 'grid') {
      setDashboardWidgetOrder((previous) => {
        const nextOrder = previous.filter((key) => key !== pointerDrag.key)
        return [...nextOrder, pointerDrag.key]
      })
      updateDashboardWidgetVisibility(pointerDrag.key, true)
    }

    clearDashboardWidgetDrag()
  }

  const handleDashboardWidgetPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    const pointerDrag = pointerDashboardDragRef.current
    if (pointerDrag && event.currentTarget.hasPointerCapture(pointerDrag.pointerId)) {
      event.currentTarget.releasePointerCapture(pointerDrag.pointerId)
    }
    clearDashboardWidgetDrag()
  }

  const handleDashboardWidgetDragOver = (event: DragEvent<HTMLElement>, targetKey: DashboardWidgetKey) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDashboardDropTarget(targetKey)
    setIsDashboardTrayDropTarget(false)
  }

  const dropDashboardWidgetIntoGrid = (event: DragEvent<HTMLElement>, targetKey?: DashboardWidgetKey) => {
    event.preventDefault()
    const widgetKey = getDraggedDashboardWidget(event)

    if (!widgetKey) {
      clearDashboardWidgetDrag()
      return
    }

    setDashboardWidgetOrder((previous) => moveDashboardWidgetAroundTarget(previous, widgetKey, targetKey))
    updateDashboardWidgetVisibility(widgetKey, true)
    clearDashboardWidgetDrag()
  }

  const handleDashboardTrayDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDashboardDropTarget(null)
    setIsDashboardTrayDropTarget(true)
  }

  const dropDashboardWidgetIntoTray = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    const widgetKey = getDraggedDashboardWidget(event)

    if (widgetKey) {
      updateDashboardWidgetVisibility(widgetKey, false)
    }

    clearDashboardWidgetDrag()
  }

  const grid = (
    <section
      className={'dd-admin-dashboard-grid' + (isEditing ? ' dd-admin-edit-grid' : '')}
      aria-label={isEditing ? '可拖动组件网格' : '仪表盘组件网格'}
      onDragOver={isEditing
        ? (event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }
        : undefined}
      onDrop={isEditing ? (event) => dropDashboardWidgetIntoGrid(event) : undefined}
    >
      {visibleDashboardWidgetKeys.map((key) => {
        const widget = renderWidget(key)

        if (!widget) {
          return null
        }

        return (
          <DashboardGridWidget
            key={key}
            widgetKey={key}
            sizeKey={dashboardWidgetSizes[key]}
            isEditing={isEditing}
            isDragging={draggingDashboardWidget?.key === key}
            isDropTarget={dashboardDropTarget === key}
            onClose={(widgetKey) => updateDashboardWidgetVisibility(widgetKey, false)}
            onSizeChange={updateDashboardWidgetSize}
            onDragStart={handleDashboardWidgetDragStart}
            onDragOver={handleDashboardWidgetDragOver}
            onDrop={dropDashboardWidgetIntoGrid}
            onDragEnd={clearDashboardWidgetDrag}
            onPointerDown={handleDashboardWidgetPointerDown}
            onPointerMove={handleDashboardWidgetPointerMove}
            onPointerUp={handleDashboardWidgetPointerUp}
            onPointerCancel={handleDashboardWidgetPointerCancel}
          >
            {widget}
          </DashboardGridWidget>
        )
      })}
    </section>
  )

  if (!isEditing) {
    return grid
  }

  return (
    <>
      <section className="dd-admin-module-panel" aria-label="首页展示模块自定义">
        <div className="dd-admin-module-panel__head">
          <div>
            <p>组件编辑</p>
            <h3>自定义仪表盘内容</h3>
          </div>
          <button type="button" onClick={resetDashboardWidgets}>恢复默认</button>
        </div>
      </section>
      <section className="dd-admin-edit-workspace" aria-label="仪表盘组件编辑区">
        <section
          className={'dd-admin-hidden-widget-tray' + (isDashboardTrayDropTarget ? ' is-drop-target' : '')}
          aria-label="已关闭组件"
          onDragOver={handleDashboardTrayDragOver}
          onDragLeave={() => setIsDashboardTrayDropTarget(false)}
          onDrop={dropDashboardWidgetIntoTray}
        >
          <div className="dd-admin-hidden-widget-tray__label">
            <span>已关闭组件</span>
            <strong>{hiddenDashboardWidgetKeys.length}</strong>
          </div>
          <div className="dd-admin-hidden-widget-tray__items">
            {hiddenDashboardWidgetKeys.map((key) => (
              <HiddenDashboardWidget
                key={key}
                widgetKey={key}
                sizeKey={dashboardWidgetSizes[key]}
                isDragging={draggingDashboardWidget?.key === key}
                onRestore={(widgetKey) => updateDashboardWidgetVisibility(widgetKey, true)}
                onDragStart={handleDashboardWidgetDragStart}
                onDragEnd={clearDashboardWidgetDrag}
                onPointerDown={handleDashboardWidgetPointerDown}
                onPointerMove={handleDashboardWidgetPointerMove}
                onPointerUp={handleDashboardWidgetPointerUp}
                onPointerCancel={handleDashboardWidgetPointerCancel}
                shouldSuppressClick={consumeDashboardWidgetClickSuppression}
              />
            ))}
          </div>
        </section>
        {grid}
      </section>
    </>
  )
}

function DashboardGridWidget({
  widgetKey,
  sizeKey,
  isEditing,
  isDragging,
  isDropTarget,
  children,
  onClose,
  onSizeChange,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  widgetKey: DashboardWidgetKey
  sizeKey: DashboardWidgetSizeKey
  isEditing: boolean
  isDragging: boolean
  isDropTarget: boolean
  children: ReactNode
  onClose: (key: DashboardWidgetKey) => void
  onSizeChange: (key: DashboardWidgetKey, sizeKey: DashboardWidgetSizeKey) => void
  onDragStart: (event: DragEvent<HTMLElement>, key: DashboardWidgetKey, source: DashboardWidgetDragSource) => void
  onDragOver: (event: DragEvent<HTMLElement>, key: DashboardWidgetKey) => void
  onDrop: (event: DragEvent<HTMLElement>, key: DashboardWidgetKey) => void
  onDragEnd: () => void
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, key: DashboardWidgetKey, source: DashboardWidgetDragSource) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
}) {
  const meta = DASHBOARD_WIDGET_META_BY_KEY[widgetKey]
  const safeSizeKey = getSafeDashboardWidgetSizeKey(widgetKey, sizeKey)
  const size = DASHBOARD_WIDGET_SIZE_BY_KEY[safeSizeKey]
  const supportedSizes = getDashboardWidgetSupportedSizes(widgetKey)
  const widgetStyle = {
    '--dd-admin-widget-columns': String(size.columns),
    '--dd-admin-widget-rows': String(size.rows),
  } as CSSProperties & Record<string, string>

  return (
    <article
      className={[
        'dd-admin-widget-shell',
        isEditing ? 'is-editing' : 'is-static',
        isDragging ? 'is-dragging' : '',
        isDropTarget ? 'is-drop-target' : '',
      ].filter(Boolean).join(' ')}
      style={widgetStyle}
      data-admin-widget-key={widgetKey}
      data-admin-widget-size={size.key}
      draggable={false}
      onDragStart={isEditing ? (event) => onDragStart(event, widgetKey, 'grid') : undefined}
      onDragOver={isEditing ? (event) => onDragOver(event, widgetKey) : undefined}
      onDrop={isEditing ? (event) => onDrop(event, widgetKey) : undefined}
      onDragEnd={isEditing ? onDragEnd : undefined}
      onPointerDown={isEditing ? (event) => onPointerDown(event, widgetKey, 'grid') : undefined}
      onPointerMove={isEditing ? onPointerMove : undefined}
      onPointerUp={isEditing ? onPointerUp : undefined}
      onPointerCancel={isEditing ? onPointerCancel : undefined}
    >
      {isEditing ? (
        <>
          <button
            type="button"
            className="dd-admin-widget-shell__close"
            aria-label={`关闭${meta.label}`}
            title={`关闭${meta.label}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onClose(widgetKey)
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
          <div
            className="dd-admin-widget-shell__size"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <span>比例</span>
            <select
              aria-label={`调整${meta.label}比例`}
              value={size.key}
              onChange={(event) => {
                const nextSizeKey = event.target.value
                if (isDashboardWidgetSizeKey(nextSizeKey)) {
                  onSizeChange(widgetKey, nextSizeKey)
                }
              }}
            >
              {supportedSizes.map((optionKey) => (
                <option key={optionKey} value={optionKey}>
                  {optionKey}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}
      <div
        className="dd-admin-widget-shell__content"
        aria-label={meta.label}
      >
        {children}
      </div>
    </article>
  )
}

function HiddenDashboardWidget({
  widgetKey,
  sizeKey,
  isDragging,
  onRestore,
  onDragStart,
  onDragEnd,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  shouldSuppressClick,
}: {
  widgetKey: DashboardWidgetKey
  sizeKey: DashboardWidgetSizeKey
  isDragging: boolean
  onRestore: (key: DashboardWidgetKey) => void
  onDragStart: (event: DragEvent<HTMLElement>, key: DashboardWidgetKey, source: DashboardWidgetDragSource) => void
  onDragEnd: () => void
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, key: DashboardWidgetKey, source: DashboardWidgetDragSource) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
  shouldSuppressClick: () => boolean
}) {
  const meta = DASHBOARD_WIDGET_META_BY_KEY[widgetKey]
  const sizeKeyLabel = getSafeDashboardWidgetSizeKey(widgetKey, sizeKey)

  return (
    <div
      role="button"
      tabIndex={0}
      className={`dd-admin-hidden-widget${isDragging ? ' is-dragging' : ''}`}
      data-admin-widget-key={widgetKey}
      draggable={false}
      onClick={() => {
        if (!shouldSuppressClick()) {
          onRestore(widgetKey)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onRestore(widgetKey)
        }
      }}
      onDragStart={(event) => onDragStart(event, widgetKey, 'tray')}
      onDragEnd={onDragEnd}
      onPointerDown={(event) => onPointerDown(event, widgetKey, 'tray')}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <strong>{meta.label}</strong>
      <small>{meta.description} · {sizeKeyLabel}</small>
    </div>
  )
}

