import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAdminAiSettingsFixture } from './fixtures/admin-ai-settings'
import { createAdminStateFixture } from './fixtures/admin-state'

const mocks = vi.hoisted(() => ({
  useAdminV2Session: vi.fn(),
  providerProps: undefined as unknown,
}))

vi.mock('@/admin-v2/session', () => ({
  useAdminV2Session: mocks.useAdminV2Session,
}))

vi.mock('@/admin-v2/workspaces/ProvidersWorkspace', async () => {
  const React = await import('react')
  return {
    AdminV2ProvidersWorkspace: (props: unknown) => {
      mocks.providerProps = props
      return React.createElement('div', { 'data-testid': 'providers-workspace' }, '供应商配置 mock')
    },
  }
})

describe('AdminV2WorkspacePage provider entry', () => {
  afterEach(() => {
    cleanup()
    mocks.useAdminV2Session.mockReset()
    mocks.providerProps = undefined
  })

  it('blocks the providers workspace for non-super admins', async () => {
    const { AdminV2WorkspacePage } = await import('@/admin-v2/pages')
    const snapshot = createAdminStateFixture({
      admin: {
        userId: 'admin-user-1',
        email: 'admin@example.com',
        role: 'admin',
        isSuperAdmin: false,
      },
    })
    mocks.useAdminV2Session.mockReturnValue({
      aiDraft: snapshot.ai,
      adminSession: snapshot.admin,
      snapshot,
      isAiSaving: false,
      isOnlineDevicesRefreshing: false,
      isRenamingOnlineDevice: false,
      isUpdatingUser: false,
      hasAiDraftChanges: false,
      error: null,
      clearError: vi.fn(),
      updateAiDraft: vi.fn(),
      resetAiDraft: vi.fn(),
      saveAiDraft: vi.fn(),
      detectAnthropicModels: vi.fn(),
      detectOpenAiCompatibleModels: vi.fn(),
      refreshOnlineDevices: vi.fn(),
      renameOnlineDevice: vi.fn(),
      updateUserQuota: vi.fn(),
    })

    render(<AdminV2WorkspacePage section="providers" />)

    expect(screen.getByText('权限受限')).toBeInTheDocument()
    expect(screen.queryByTestId('providers-workspace')).not.toBeInTheDocument()
  })

  it('passes provider props through for super admins', async () => {
    const { AdminV2WorkspacePage } = await import('@/admin-v2/pages')
    const aiDraft = createAdminAiSettingsFixture({
      openai: [createAdminAiSettingsFixture().openai[0]],
    })
    const snapshot = createAdminStateFixture({ ai: createAdminAiSettingsFixture() })
    const saveAiDraft = vi.fn()
    const detectAnthropicModels = vi.fn()
    const detectOpenAiCompatibleModels = vi.fn()
    const updateAiDraft = vi.fn()
    const clearError = vi.fn()
    mocks.useAdminV2Session.mockReturnValue({
      aiDraft,
      adminSession: snapshot.admin,
      snapshot,
      isAiSaving: true,
      isOnlineDevicesRefreshing: false,
      isRenamingOnlineDevice: false,
      isUpdatingUser: false,
      hasAiDraftChanges: true,
      error: '保存失败',
      clearError,
      updateAiDraft,
      resetAiDraft: vi.fn(),
      saveAiDraft,
      detectAnthropicModels,
      detectOpenAiCompatibleModels,
      refreshOnlineDevices: vi.fn(),
      renameOnlineDevice: vi.fn(),
      updateUserQuota: vi.fn(),
    })

    render(<AdminV2WorkspacePage section="providers" />)

    expect(screen.getByTestId('providers-workspace')).toHaveTextContent('供应商配置 mock')
    expect(mocks.providerProps).toMatchObject({
      aiDraft,
      savedSettings: snapshot.ai,
      canEdit: true,
      isSaving: true,
      hasUnsavedChanges: true,
      error: '保存失败',
      onClearError: clearError,
      onChange: updateAiDraft,
      onDetectAnthropicModels: detectAnthropicModels,
      onDetectOpenAiCompatibleModels: detectOpenAiCompatibleModels,
    })
    expect(typeof (mocks.providerProps as { onAutosave: unknown }).onAutosave).toBe('function')
  })
})
