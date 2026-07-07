import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyImageDataUrlToClipboard } from '../src/app/web-command-clipboard'

describe('web command result copy helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('copies a PlantUML PNG data URL as an image clipboard item', async () => {
    const clipboardPayloads: Array<Record<string, Blob>> = []
    const write = vi.fn().mockResolvedValue(undefined)
    const fetchMock = vi.fn().mockResolvedValue({
      blob: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
    })

    class MockClipboardItem {
      constructor(payload: Record<string, Blob>) {
        clipboardPayloads.push(payload)
      }
    }

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write },
    })
    vi.stubGlobal('ClipboardItem', MockClipboardItem)
    vi.stubGlobal('fetch', fetchMock)

    await copyImageDataUrlToClipboard({
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      mimeType: 'image/png',
    })

    expect(fetchMock).toHaveBeenCalledWith('data:image/png;base64,iVBORw0KGgo=')
    expect(clipboardPayloads[0]?.['image/png']).toBeInstanceOf(Blob)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('falls back to copying the data URL as text when image clipboard writing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    await expect(copyImageDataUrlToClipboard({
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      mimeType: 'image/png',
    })).resolves.toBeUndefined()

    expect(writeText).toHaveBeenCalledWith('data:image/png;base64,iVBORw0KGgo=')
  })

  it('rejects when neither image nor text clipboard paths are available', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {},
    })

    await expect(copyImageDataUrlToClipboard({
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      mimeType: 'image/png',
    })).rejects.toThrow('当前浏览器不支持复制图片。')
  })
})
