import { describe, expect, it } from 'vitest'
import { selectComposerAttachmentFiles, selectComposerImagePasteFiles } from '@/app/composer-image-paste'

function createImageFile(name: string, mimeType: string, size: number) {
  return new File([new Uint8Array(size)], name, { type: mimeType })
}

describe('selectComposerImagePasteFiles', () => {
  it('keeps pasted images regardless of image subtype or 4 MiB size', () => {
    const largeTiff = createImageFile('scan.tiff', 'image/tiff', 5 * 1024 * 1024)
    const largeAvif = createImageFile('photo.avif', 'image/avif', 6 * 1024 * 1024)

    const result = selectComposerImagePasteFiles([largeTiff, largeAvif], 0, 4)

    expect(result.selectedFiles).toEqual([largeTiff, largeAvif])
    expect(result.skippedCount).toBe(0)
  })

  it('only skips images when there are not enough draft slots', () => {
    const images = [
      createImageFile('one.tiff', 'image/tiff', 5 * 1024 * 1024),
      createImageFile('two.bmp', 'image/bmp', 5 * 1024 * 1024),
      createImageFile('three.heic', 'image/heic', 5 * 1024 * 1024),
    ]

    const result = selectComposerImagePasteFiles(images, 2, 4)

    expect(result.selectedFiles).toEqual(images.slice(0, 2))
    expect(result.skippedCount).toBe(1)
  })
})

describe('selectComposerAttachmentFiles', () => {
  it('routes image attachments to inline image drafts instead of transferable files', () => {
    const png = createImageFile('photo.png', 'image/png', 1024)
    const jpgWithoutMimeType = createImageFile('camera.JPG', '', 1024)
    const pdf = new File(['pdf'], 'document.pdf', { type: 'application/pdf' })

    const result = selectComposerAttachmentFiles([png, jpgWithoutMimeType, pdf])

    expect(result.inlineImageFiles).toEqual([png, jpgWithoutMimeType])
    expect(result.transferableFiles).toEqual([pdf])
  })

  it('keeps non-image attachments on the normal file transfer path', () => {
    const video = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
    const archive = new File(['zip'], 'archive.zip', { type: 'application/zip' })

    const result = selectComposerAttachmentFiles([video, archive])

    expect(result.inlineImageFiles).toEqual([])
    expect(result.transferableFiles).toEqual([video, archive])
  })
})
