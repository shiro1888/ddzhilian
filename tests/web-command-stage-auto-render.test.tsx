import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebCommandStage } from '../src/app/components/WebCommandStage'

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class FitAddon {
    fit = vi.fn()
  },
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class Terminal {
    clear = vi.fn()
    dispose = vi.fn()
    loadAddon = vi.fn()
    open = vi.fn()
    reset = vi.fn()
    write = vi.fn()
  },
}))

function mockPlantUmlFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      ok: true,
      language: 'plantuml',
      sandbox: 'docker-plantuml',
      exitCode: 0,
      durationMs: 100,
      startedAt: new Date(0).toISOString(),
      finishedAt: new Date(100).toISOString(),
      stdout: '',
      stderr: '',
      blocked: [],
      violations: [],
      timedOut: false,
      outputTruncated: false,
      image: {
        format: 'png',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        sizeBytes: 8,
      },
      result: {
        lines: [],
        text: '',
        parsedJson: null,
      },
    }),
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function switchToPlantUml() {
  fireEvent.click(screen.getByRole('button', { name: /切换运行语言/ }))
  fireEvent.click(screen.getByRole('option', { name: /PlantUML/ }))
}

function editSource(source: string) {
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: source },
  })
}

describe('WebCommandStage PlantUML auto render', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders PlantUML automatically after five idle seconds', async () => {
    const fetchMock = mockPlantUmlFetch()
    render(<WebCommandStage historyAuthToken="test-history-token" />)

    switchToPlantUml()
    editSource('@startuml\nAlice -> Bob: hi\n@enduml')

    await act(async () => {
      vi.advanceTimersByTime(4999)
    })
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/api/web-command/plantuml',
      expect.objectContaining({
        body: JSON.stringify({ source: '@startuml\nAlice -> Bob: hi\n@enduml' }),
        headers: expect.objectContaining({
          authorization: 'Bearer test-history-token',
        }),
      }),
    )
  })

  it('does not auto-render the same PlantUML source again after manual run', async () => {
    const fetchMock = mockPlantUmlFetch()
    render(<WebCommandStage historyAuthToken="test-history-token" />)

    switchToPlantUml()
    editSource('@startuml\nAlice -> Bob: manual\n@enduml')
    fireEvent.click(screen.getByRole('button', { name: '运行' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
