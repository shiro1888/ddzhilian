import type { ReactNode, RefObject } from 'react'

type RoomConversationStreamProps = {
  messagesRef: RefObject<HTMLDivElement | null>
  hasContent: boolean
  emptyState: ReactNode
  children: ReactNode
  onScroll: () => void
}

export function RoomConversationStream({
  messagesRef,
  hasContent,
  emptyState,
  children,
  onScroll,
}: RoomConversationStreamProps) {
  return (
    <div ref={messagesRef} className="dd-snaplink__messages" onScroll={onScroll}>
      {hasContent ? children : <div className="dd-snaplink__empty">{emptyState}</div>}
    </div>
  )
}
