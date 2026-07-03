type RoomDragOverlayProps = {
  targetName?: string
}

export function RoomDragOverlay({ targetName = '当前对话' }: RoomDragOverlayProps) {
  return (
    <div className="dd-snaplink__drag-overlay" role="status" aria-live="polite">
      <div className="dd-snaplink__drag-panel">
        <span className="dd-snaplink__drag-icon" aria-hidden="true">
          +
        </span>
        <strong>松开，发送到 {targetName}</strong>
        <span>松开后直接发送 · 文件不经过服务器</span>
      </div>
    </div>
  )
}
