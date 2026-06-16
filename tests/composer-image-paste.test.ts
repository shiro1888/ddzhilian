import { describe, expect, it } from 'vitest'
import { selectComposerImagePasteFiles } from '@/app/composer-image-paste'

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
