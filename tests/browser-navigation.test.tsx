import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useBrowserNavigation } from '@/lib/use-browser-navigation'

function NavigationProbe() {
  const { location, navigate } = useBrowserNavigation()

  return (
    <div>
      <output aria-label="当前位置">{`${location.pathname}${location.search}`}</output>
      <button type="button" onClick={() => navigate('/files?room=123')}>打开文件</button>
      <button type="button" onClick={() => navigate('/text', { replace: true })}>替换为文本</button>
    </div>
  )
}

describe('useBrowserNavigation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/start?from=test')
  })

  afterEach(() => {
    cleanup()
  })

  it('updates browser history and the rendered location', () => {
    render(<NavigationProbe />)

    expect(screen.getByLabelText('当前位置')).toHaveTextContent('/start?from=test')
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    expect(screen.getByLabelText('当前位置')).toHaveTextContent('/files?room=123')
    expect(window.location.pathname).toBe('/files')
  })

  it('reacts to browser back and forward navigation events', () => {
    render(<NavigationProbe />)
    window.history.pushState(null, '', '/rooms?joined=1')
    fireEvent.popState(window)

    expect(screen.getByLabelText('当前位置')).toHaveTextContent('/rooms?joined=1')
  })

  it('supports replacing the current history entry', () => {
    render(<NavigationProbe />)
    fireEvent.click(screen.getByRole('button', { name: '替换为文本' }))

    expect(screen.getByLabelText('当前位置')).toHaveTextContent('/text')
    expect(window.location.pathname).toBe('/text')
  })
})
