import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SnapLinkStage } from '@/app/components/SnapLinkStage'
import type { SnapLinkStageProps } from '@/app/components/SnapLinkStage'

import { createSnapLinkBaseProps, setInitialWorkbenchMode } from './helpers/snaplink'

// This suite renders inside an already-open public room.
function createBaseProps(overrides: Partial<SnapLinkStageProps> = {}): SnapLinkStageProps {
  return createSnapLinkBaseProps({
    selectedRoomId: 'ROOM123',
    selectedConversationName: '世界对话 1',
    activeTransferLabel: '世界对话 1 · 已连接',
    roomListItems: [
      {
        roomId: 'ROOM123',
        title: '世界对话 1',
        previewText: '[文本] 空消息',
        updatedAt: '2026-06-22T08:00:00.000Z',
        updatedAtLabel: '刚刚',
        isPublic: true,
        publicIndex: 1,
        memberCount: 1,
        onlineCount: 0,
        status: 'history',
        pinned: false,
        unreadCount: 0,
        members: [],
      },
    ],
    ...overrides,
  })
}

function openSelectedConversation() {
  fireEvent.click(screen.getByRole('link', { name: /世界对话 1/ }))
  return screen.getByPlaceholderText(/发送给 世界对话 1/)
}

function createClipboardData(files: File[]) {
  return {
    files,
    items: files.map((file) => ({
      kind: 'file',
      type: file.type,
      getAsFile: () => file,
    })),
    types: ['Files'],
  }
}

describe('SnapLinkStage composer paste', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setInitialWorkbenchMode('rooms')
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('allows pasting regular files into the composer', () => {
    const file = new File(['report'], 'report.pdf', { type: 'application/pdf' })
    const onDirectFileSelection = vi.fn()
    const onPastedImageSelection = vi.fn()

    render(
      <SnapLinkStage
        {...createBaseProps({
          onDirectFileSelection,
          onPastedImageSelection,
        })}
      />,
    )

    fireEvent.paste(openSelectedConversation(), {
      clipboardData: createClipboardData([file]),
    })

    expect(onDirectFileSelection).toHaveBeenCalledWith([file])
    expect(onPastedImageSelection).not.toHaveBeenCalled()
  })

  it('keeps pure image paste on the image draft path', () => {
    const image = new File(['png'], 'photo.png', { type: 'image/png' })
    const onDirectFileSelection = vi.fn()
    const onPastedImageSelection = vi.fn()

    render(
      <SnapLinkStage
        {...createBaseProps({
          onDirectFileSelection,
          onPastedImageSelection,
        })}
      />,
    )

    fireEvent.paste(openSelectedConversation(), {
      clipboardData: createClipboardData([image]),
    })

    expect(onPastedImageSelection).toHaveBeenCalledWith([image])
    expect(onDirectFileSelection).not.toHaveBeenCalled()
  })
})
