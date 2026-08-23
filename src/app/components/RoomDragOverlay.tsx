type RoomDragOverlayProps = {
  targetName?: string
  deliveryNote?: string
}

export function RoomDragOverlay({
  targetName = '当前对话',
  deliveryNote = '松开后发送到当前会话',
}: RoomDragOverlayProps) {
  return (
    <div className="dd-snaplink__drag-overlay" role="status" aria-live="polite">
      <div className="dd-snaplink__drag-panel">
        <span className="dd-snaplink__drag-icon" aria-hidden="true">
          +
        </span>
        <strong>松开，发送到 {targetName}</strong>
        <span>{deliveryNote}</span>
      </div>
    </div>
  )
}
