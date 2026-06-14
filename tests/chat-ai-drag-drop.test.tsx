import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatAiStage } from '@/app/components/ChatAiStage'

function renderChatAiStage() {
  render(
    <ChatAiStage
      aiModelOptions={[]}
      selectedAiModel=""
      selectedAiModelLabel="默认模型"
      isConversationSyncReady={false}
      onAiModelChange={vi.fn()}
      onAskAi={vi.fn()}
      onListConversations={vi.fn()}
      onSaveConversations={vi.fn()}
      onDeleteConversationRemote={vi.fn()}
      onQuotaStatusChange={vi.fn()}
    />,
  )
}

function createFileDragEvent(files: File[]) {
  return {
    dataTransfer: {
      files,
      types: ['Files'],
    },
  }
}

describe('ChatAiStage file drag and drop', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows a drag overlay and adds dropped files as attachments', async () => {
    renderChatAiStage()

    const chat = screen.getByLabelText('AI 聊天')
    const file = new File(['hello'], 'notes.md', { type: 'text/markdown' })

    fireEvent.dragEnter(chat, createFileDragEvent([file]))

    expect(screen.getByText('松开添加附件')).toBeInTheDocument()
    expect(screen.getByText('支持图片、文本和代码文件')).toBeInTheDocument()

    fireEvent.drop(chat, createFileDragEvent([file]))

    await waitFor(() => {
      expect(screen.getByText('notes.md')).toBeInTheDocument()
    })
    expect(screen.queryByText('松开添加附件')).not.toBeInTheDocument()
  })
})
