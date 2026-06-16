export type ComposerImagePasteSelection = {
  selectedFiles: File[]
  skippedCount: number
  remainingSlots: number
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
