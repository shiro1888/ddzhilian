import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminV2AiPolicyWorkspace } from '@/admin-v2/workspaces/AiPolicyWorkspace'

function renderWorkspace() {
  render(
    <AdminV2AiPolicyWorkspace
      systemPromptDraft="You are ddzhilian admin AI."
      savedSystemPrompt="You are ddzhilian admin AI."
      canEdit
      isSaving={false}
      hasUnsavedChanges={false}
      error={null}
      onClearError={vi.fn()}
      onDraftChange={vi.fn()}
      onAutosave={vi.fn()}
    />,
  )
}

afterEach(() => {
  cleanup()
})

describe('AdminV2AiPolicyWorkspace', () => {
  it('renders the system prompt copy requested by the admin UI', () => {
    renderWorkspace()

    expect(screen.getAllByText('System Prompt')).toHaveLength(1)
    expect(screen.getByText('输入你的System Prompt')).toBeInTheDocument()
    expect(screen.getByLabelText('System Prompt')).toBeInTheDocument()
    expect(screen.getByText('自动保存规则：离开输入框后，如果内容有变化且通过基础校验，就会提交完整'))
      .toBeInTheDocument()
    expect(screen.queryByText(/AdminAiSettings/)).not.toBeInTheDocument()
    expect(screen.queryByText(/已从供应商配置页剥离/)).not.toBeInTheDocument()
  })
})
