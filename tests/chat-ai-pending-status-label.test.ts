import { describe, expect, it } from 'vitest'
import { resolveAiChatPendingStatusLabel } from '@/app/components/ChatAiStage'

describe('resolveAiChatPendingStatusLabel', () => {
  it('shows thinking for regular assistant generation', () => {
    expect(resolveAiChatPendingStatusLabel({})).toBe('thinking')
  })

  it('shows searching while web search is requested', () => {
    expect(resolveAiChatPendingStatusLabel({
      webSearch: {
        query: 'ddzhilian',
        sources: [],
      },
    })).toBe('searching')
  })
})
