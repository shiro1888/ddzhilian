export type ComposerImagePasteSelection = {
  selectedFiles: File[]
  skippedCount: number
  remainingSlots: number
}

export type ComposerAttachmentFileSelection = {
  inlineImageFiles: File[]
  transferableFiles: File[]
}

function isComposerInlineImageFile(file: File) {
  const normalizedMimeType = file.type.toLowerCase()
  const normalizedName = file.name.toLowerCase()

  return normalizedMimeType.startsWith('image/') || /\.(avif|bmp|gif|heic|jpe?g|png|svg|tiff?|webp)$/i.test(normalizedName)
}

export function selectComposerAttachmentFiles(files: File[]): ComposerAttachmentFileSelection {
  const inlineImageFiles: File[] = []
  const transferableFiles: File[] = []

  for (const file of files) {
    if (isComposerInlineImageFile(file)) {
      inlineImageFiles.push(file)
      continue
    }

    transferableFiles.push(file)
  }

  return {
    inlineImageFiles,
    transferableFiles,
  }
}

export function selectComposerImagePasteFiles(
  files: File[],
  currentDraftCount: number,
  maxDraftCount: number,
): ComposerImagePasteSelection {
  const remainingSlots = Math.max(0, maxDraftCount - currentDraftCount)
  const selectedFiles = files.slice(0, remainingSlots)

  return {
    selectedFiles,
    skippedCount: files.length - selectedFiles.length,
    remainingSlots,
  }
}
