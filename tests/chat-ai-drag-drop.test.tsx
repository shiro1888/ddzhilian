import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatAiStage } from '@/app/components/ChatAiStage'
import type { AiModelOption } from '@/lib/ddzhilian-types'

type ChatAiStageRenderOptions = {
  aiModelOptions?: AiModelOption[]
  selectedAiModel?: string
  selectedAiModelLabel?: string
  onAiModelChange?: (model: string) => void
}

function renderChatAiStage(options: ChatAiStageRenderOptions = {}) {
  render(
    <ChatAiStage
      aiModelOptions={options.aiModelOptions ?? []}
      selectedAiModel={options.selectedAiModel ?? ''}
      selectedAiModelLabel={options.selectedAiModelLabel ?? '默认模型'}
      isConversationSyncReady={false}
      onAiModelChange={options.onAiModelChange ?? vi.fn()}
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
      expect(screen.getAllByText('notes.md').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('松开添加附件')).not.toBeInTheDocument()
  })

  it('keeps up to 99 uploaded text attachments', async () => {
    renderChatAiStage()

    const chat = screen.getByLabelText('AI 聊天')
    const files = Array.from({ length: 100 }, (_, index) => (
      new File([`note ${index.toString()}`], `notes-${index.toString()}.md`, { type: 'text/markdown' })
    ))

    fireEvent.drop(chat, createFileDragEvent(files))

    await waitFor(() => {
      expect(screen.getAllByText('notes-98.md').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('notes-99.md')).not.toBeInTheDocument()
  })

  it('renders Cloudflare model options returned by the backend', () => {
    const onAiModelChange = vi.fn()
    renderChatAiStage({
      aiModelOptions: [
        {
          id: 'openai/gpt-4.1-mini',
          label: 'OpenRouter · GPT 4.1 Mini',
          provider: 'openrouter',
          value: 'openrouter::openai/gpt-4.1-mini',
        },
        {
          id: '@cf/zai-org/glm-5.2',
          label: 'Cloudflare AI · GLM 5.2',
          provider: 'cloudflare',
          value: 'cloudflare::@cf/zai-org/glm-5.2',
        },
      ],
      selectedAiModel: 'cloudflare::@cf/zai-org/glm-5.2',
      selectedAiModelLabel: 'Cloudflare AI · GLM 5.2',
      onAiModelChange,
    })

    const select = screen.getAllByLabelText('选择 AI 模型')[0] as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      'OpenRouter · GPT 4.1 Mini',
      'Cloudflare AI · GLM 5.2',
    ])
    expect(select).toHaveValue('cloudflare::@cf/zai-org/glm-5.2')

    fireEvent.change(select, { target: { value: 'openrouter::openai/gpt-4.1-mini' } })

    expect(onAiModelChange).toHaveBeenCalledWith('openrouter::openai/gpt-4.1-mini')
  })
})
