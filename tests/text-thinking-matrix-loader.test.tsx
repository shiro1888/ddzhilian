import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextThinkingMatrixLoader } from '@/app/components/TextThinkingMatrixLoader'

describe('TextThinkingMatrixLoader', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the first square variant when Math.random returns the lower bound', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const { container } = render(<TextThinkingMatrixLoader />)
    const loader = container.querySelector('.dd-snaplink__matrix-loader')

    expect(loader).toHaveClass('is-square-1')
    expect(loader).toHaveAttribute('data-matrix-variant', '1')
    expect(container.querySelectorAll('.dd-snaplink__matrix-dot')).toHaveLength(25)
  })

  it('renders the twentieth square variant when Math.random returns the upper range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)

    const { container } = render(<TextThinkingMatrixLoader />)
    const loader = container.querySelector('.dd-snaplink__matrix-loader')

    expect(loader).toHaveClass('is-square-20')
    expect(loader).toHaveAttribute('data-matrix-variant', '20')
    expect(container.querySelectorAll('.dd-snaplink__matrix-dot')).toHaveLength(25)
  })
})
