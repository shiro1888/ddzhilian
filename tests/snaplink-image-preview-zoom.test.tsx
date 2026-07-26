import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SnapLinkStage } from '@/app/components/SnapLinkStage'

const gsapMock = vi.hoisted(() => {
  const context = vi.fn((callback: () => void) => {
    callback()
    return { revert: vi.fn() }
  })
  const timelineTo = vi.fn()
  const timeline = vi.fn((options?: { onComplete?: () => void }) => {
    const timelineApi = {
      to: vi.fn((...args: unknown[]) => {
        timelineTo(...args)
        return timelineApi
      }),
    }

    queueMicrotask(() => {
      options?.onComplete?.()
    })

    return timelineApi
  })
  const set = vi.fn()
  const to = vi.fn()
  const fromTo = vi.fn((_target: unknown, _fromVars: unknown, toVars?: { onComplete?: () => void }) => {
    toVars?.onComplete?.()
  })
  const killTweensOf = vi.fn()

  return {
    context,
    timeline,
    timelineTo,
    set,
    to,
    fromTo,
    killTweensOf,
  }
})

vi.mock('gsap', () => ({
  default: gsapMock,
}))

import { createSnapLinkBaseProps as createBaseProps } from './helpers/snaplink'

describe('SnapLinkStage image preview zoom', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('deforms the whole preview card without clipping and keeps zoom as a scale transform', async () => {
    render(
      <SnapLinkStage
        {...createBaseProps({
          selectedRoomId: 'ROOM123',
          selectedConversationName: '世界对话 1',
          activeTransferLabel: '世界对话 1 · 已连接',
          roomListItems: [
            {
              roomId: 'ROOM123',
              title: '世界对话 1',
              previewText: '[图片] sample.png',
              updatedAt: '2026-06-16T10:00:00.000Z',
              updatedAtLabel: '刚刚',
              isPublic: true,
              publicIndex: 1,
              memberCount: 2,
              onlineCount: 1,
              status: 'connected',
              pinned: false,
              unreadCount: 0,
    members: [],
            },
          ],
          unifiedConversationEntries: [
            {
              id: 'text-image-1',
              entryType: 'text',
              sessionId: 'session-1',
              fromSelf: false,
              senderName: 'windows-PEER',
              createdAt: '2026-06-16T10:00:00.000Z',
              text: '<img src="https://example.com/sample.png" alt="preview sample">',
            },
          ],
        })}
      />,
    )

    fireEvent.click(screen.getByRole('link', { name: /世界对话 1/ }))

    const inlineImage = await screen.findByAltText('preview sample')
    const imageBubble = inlineImage.closest('.dd-snaplink__bubble')
    const cometShell = inlineImage.closest('.dd-snaplink__bubble-shell')
    if (!(imageBubble instanceof HTMLElement) || !(cometShell instanceof HTMLElement)) {
      throw new Error('Expected inline image to be inside a SnapLink image bubble')
    }

    expect(imageBubble).toHaveClass('is-image-only')
    expect(cometShell).toHaveClass('is-image-comet')

    vi.spyOn(cometShell, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 200,
      left: 100,
      top: 200,
      right: 300,
      bottom: 300,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.pointerMove(cometShell, {
      clientX: 300,
      clientY: 200,
      pointerType: 'mouse',
    })

    expect(cometShell.style.getPropertyValue('--snaplink-image-comet-rotate-x')).toBe('-7.00deg')
    expect(cometShell.style.getPropertyValue('--snaplink-image-comet-rotate-y')).toBe('-7.00deg')
    expect(cometShell.style.getPropertyValue('--snaplink-image-comet-translate-x')).toBe('5.00px')
    expect(cometShell.style.getPropertyValue('--snaplink-image-comet-glare-x')).toBe('100.00%')

    fireEvent.pointerLeave(cometShell)
    expect(cometShell.style.getPropertyValue('--snaplink-image-comet-rotate-x')).toBe('0deg')

    fireEvent.click(inlineImage)

    const previewZoomButton = await screen.findByRole('button', { name: '放大图片' })
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '图片预览' })).toHaveClass('is-ready')
    })

    const originFeedbackCall = gsapMock.fromTo.mock.calls.find(([target]) => target === inlineImage)
    expect(originFeedbackCall?.[2]).toMatchObject({
      duration: 0.18,
      repeat: 1,
      yoyo: true,
    })

    const timelineCallsAfterOpen = gsapMock.timeline.mock.calls.length
    expect(timelineCallsAfterOpen).toBe(1)

    const dialog = screen.getByRole('dialog', { name: '图片预览' })
    const panel = dialog.querySelector('.dd-image-preview-dialog__panel')
    const previewImage = previewZoomButton.querySelector('img')
    if (!(panel instanceof HTMLElement) || !(previewImage instanceof HTMLImageElement)) {
      throw new Error('Expected image preview panel and image to be mounted')
    }

    const cardPerspectiveTween = gsapMock.timelineTo.mock.calls.some(([target, vars]) => (
      target === panel &&
      typeof vars === 'object' &&
      vars !== null &&
      'rotationY' in vars &&
      'skewY' in vars
    ))
    const cardInitialSet = gsapMock.set.mock.calls.find(([target, vars]) => (
      target === panel &&
      typeof vars === 'object' &&
      vars !== null &&
      'rotationY' in vars &&
      'skewY' in vars
    ))
    const childPerspectiveTween = gsapMock.timelineTo.mock.calls.some(([target, vars]) => (
      (target === previewZoomButton || target === previewImage) &&
      typeof vars === 'object' &&
      vars !== null &&
      ('rotationY' in vars || 'skewY' in vars || 'clipPath' in vars)
    ))
    const previewClipPathTween = gsapMock.timelineTo.mock.calls.some(([, vars]) => (
      typeof vars === 'object' &&
      vars !== null &&
      'clipPath' in vars
    ))
    const previewClipPathSet = gsapMock.set.mock.calls.some(([, vars]) => (
      typeof vars === 'object' &&
      vars !== null &&
      (
        'clipPath' in vars ||
        (typeof Reflect.get(vars, 'clearProps') === 'string' && Reflect.get(vars, 'clearProps').includes('clipPath'))
      )
    ))

    expect(cardPerspectiveTween).toBe(true)
    expect(cardInitialSet?.[1]).toMatchObject({
      rotationY: 14,
      skewY: -3,
      transformOrigin: 'right center',
    })
    expect(gsapMock.timelineTo.mock.calls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          panel,
          expect.objectContaining({
            duration: 1,
          }),
        ]),
      ]),
    )
    expect(childPerspectiveTween).toBe(false)
    expect(previewClipPathTween).toBe(false)
    expect(previewClipPathSet).toBe(false)

    fireEvent.click(previewZoomButton)

    expect(gsapMock.timeline).toHaveBeenCalledTimes(timelineCallsAfterOpen)
    expect(screen.getByRole('button', { name: '缩小图片' })).toBe(previewZoomButton)
    expect(previewZoomButton.querySelector('img')).toHaveStyle({
      transform: 'translate3d(0.0px, 0.0px, 0) scale(1.85)',
    })
  })

  it('starts OCR from the image context menu', async () => {
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const receiptDataUrl = 'data:image/png;base64,aW1hZ2UtYnl0ZXM='
    const createObjectURLMock = vi.fn(() => 'blob:ocr-preview')
    const revokeObjectURLMock = vi.fn()
    const onStartOcrJob = vi.fn(async (file: File) => ({
      jobId: 'ocr-context',
      status: 'complete' as const,
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
      text: '票据文字',
    }))

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURLMock,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURLMock,
    })

    try {
      render(
        <SnapLinkStage
          {...createBaseProps({
            selectedRoomId: 'ROOM123',
            selectedConversationName: '世界对话 1',
            activeTransferLabel: '世界对话 1 · 已连接',
            roomListItems: [
              {
                roomId: 'ROOM123',
                title: '世界对话 1',
                previewText: '[图片] receipt.png',
                updatedAt: '2026-06-16T10:00:00.000Z',
                updatedAtLabel: '刚刚',
                isPublic: true,
                publicIndex: 1,
                memberCount: 2,
                onlineCount: 1,
                status: 'connected',
                pinned: false,
                unreadCount: 0,
    members: [],
              },
            ],
            unifiedConversationEntries: [
              {
                id: 'text-image-ocr',
                entryType: 'text',
                sessionId: 'session-1',
                fromSelf: false,
                senderName: 'windows-PEER',
                createdAt: '2026-06-16T10:00:00.000Z',
                text: `<img src="${receiptDataUrl}" alt="receipt.png">`,
              },
            ],
            onStartOcrJob,
          })}
        />,
      )

      fireEvent.click(screen.getByRole('link', { name: /世界对话 1/ }))

      const inlineImage = await screen.findByAltText('receipt.png')
      fireEvent.contextMenu(inlineImage, { clientX: 160, clientY: 180 })
      fireEvent.click(screen.getByRole('menuitem', { name: 'OCR 识别' }))

      await waitFor(() => {
        expect(onStartOcrJob).toHaveBeenCalledTimes(1)
      })

      const [ocrFile] = onStartOcrJob.mock.calls[0] ?? []
      expect(ocrFile).toBeInstanceOf(File)
      expect(ocrFile.name).toBe('receipt.png')
      expect(ocrFile.type).toBe('image/png')
      expect(createObjectURLMock).toHaveBeenCalledWith(ocrFile)
      expect(screen.getByRole('dialog', { name: '图片文字识别' })).toBeInTheDocument()
      expect(screen.getByLabelText('OCR 识别文本')).toHaveValue('票据文字')
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: originalCreateObjectURL,
      })
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: originalRevokeObjectURL,
      })
    }
  })
})
