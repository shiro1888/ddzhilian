import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminV2ModelsWorkspace } from '@/admin-v2/workspaces/ModelsWorkspace'
import {
  createAdminAiSettingsFixture,
  createOpenAiConfigFixture,
} from './fixtures/admin-ai-settings'

function renderWorkspace() {
  render(
    <AdminV2ModelsWorkspace
      aiDraft={createAdminAiSettingsFixture({
        openai: [
          createOpenAiConfigFixture({
            displayName: 'xiaomi',
            baseUrl: 'https://token-plan-sgp.xiaomimimo.com/v1',
            model: 'mimo-v2.5-pro',
            models: [
              { id: 'mimo-v2-pro', label: 'mimo-v2-pro', alias: '', enabled: true },
              { id: 'mimo-v2.5', label: 'mimo-v2.5', alias: '', enabled: true },
              { id: 'mimo-v2.5-pro', label: 'mimo-v2.5-pro', alias: '', enabled: true },
              { id: 'mimo-v2-omni', label: 'mimo-v2-omni', alias: '', enabled: false },
            ],
          }),
        ],
        anthropic: [],
      })}
      canEdit
      hasChanges={false}
      isSaving={false}
      onReset={vi.fn()}
      onSave={vi.fn()}
      onChange={vi.fn()}
    />,
  )
}

afterEach(() => {
  cleanup()
})

describe('AdminV2ModelsWorkspace', () => {
  it('renders annotated model status badges with stable dimensions', () => {
    renderWorkspace()

    expect(screen.getAllByText('Cloudflare AI').length).toBeGreaterThan(0)
    expect(screen.getByText('已启用 1 / 2')).toHaveClass('h-[30px]')
    expect(screen.getByText('已启用 3 / 4')).toHaveClass('h-[30px]')
    expect(screen.getAllByText('启用').filter((element) =>
      element.classList.contains('h-[28px]'),
    )).toHaveLength(4)
    expect(screen.getAllByText('关闭').filter((element) =>
      element.classList.contains('h-[28px]'),
    )).toHaveLength(2)
    expect(screen.getAllByText('默认').some((element) =>
      element.classList.contains('h-[28px]') && element.classList.contains('w-[50px]'),
    )).toBe(true)
  })
})
