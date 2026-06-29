export function RoomDragOverlay() {
  return (
    <div className="dd-snaplink__drag-overlay" role="status" aria-live="polite">
      <div className="dd-snaplink__drag-panel">
        <span className="dd-snaplink__drag-icon" aria-hidden="true">
          +
        </span>
        <strong>松开发送文件</strong>
        <span>拖到此处即可发送到当前对话</span>
      </div>
    </div>
  )
}
