import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SnapLinkStage } from '@/app/components/SnapLinkStage'

import { createSnapLinkBaseProps as createBaseProps } from './helpers/snaplink'

describe('SnapLinkStage lobby workbench', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the default messages workbench with an accessible region and title', () => {
    render(<SnapLinkStage {...createBaseProps()} />)

    expect(screen.getByRole('region', { name: 'DD直连文件互传工作台' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '消息工作台' })).toBeInTheDocument()
    expect(screen.getByText('选择一个会话')).toBeInTheDocument()
  })
})
