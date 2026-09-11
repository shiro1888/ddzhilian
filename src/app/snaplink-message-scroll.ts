type ResolveSnapLinkPinnedToBottomInput = {
  previousScrollTop: number | null
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  wasPinnedToBottom: boolean
  threshold: number
}

const scrollDirectionEpsilon = 0.5

export function resolveSnapLinkPinnedToBottom({
  previousScrollTop,
  scrollTop,
  scrollHeight,
  clientHeight,
  wasPinnedToBottom,
  threshold,
}: ResolveSnapLinkPinnedToBottomInput) {
  const distanceToBottom = Math.max(0, scrollHeight - scrollTop - clientHeight)
  const isNearBottom = distanceToBottom <= threshold

  if (previousScrollTop === null) {
    return isNearBottom
  }

  if (scrollTop < previousScrollTop - scrollDirectionEpsilon) {
    return false
  }

  if (scrollTop > previousScrollTop + scrollDirectionEpsilon) {
    return isNearBottom
  }

  return wasPinnedToBottom && isNearBottom
}
