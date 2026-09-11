import { describe, expect, it } from 'vitest'

import { resolveSnapLinkPinnedToBottom } from '../src/app/snaplink-message-scroll'

const baseInput = {
  scrollHeight: 1000,
  clientHeight: 400,
  threshold: 96,
}

describe('SnapLink message auto-follow', () => {
  it('unpins immediately when the user scrolls upward near the bottom', () => {
    expect(resolveSnapLinkPinnedToBottom({
      ...baseInput,
      previousScrollTop: 600,
      scrollTop: 590,
      wasPinnedToBottom: true,
    })).toBe(false)
  })

  it('pins again after the user deliberately scrolls down to the bottom', () => {
    expect(resolveSnapLinkPinnedToBottom({
      ...baseInput,
      previousScrollTop: 500,
      scrollTop: 600,
      wasPinnedToBottom: false,
    })).toBe(true)
  })

  it('stays unpinned while the viewport remains away from the bottom', () => {
    expect(resolveSnapLinkPinnedToBottom({
      ...baseInput,
      previousScrollTop: 300,
      scrollTop: 350,
      wasPinnedToBottom: false,
    })).toBe(false)
  })

  it('does not silently repin an idle viewport after the user opted out', () => {
    expect(resolveSnapLinkPinnedToBottom({
      ...baseInput,
      previousScrollTop: 590,
      scrollTop: 590,
      wasPinnedToBottom: false,
    })).toBe(false)
  })
})
