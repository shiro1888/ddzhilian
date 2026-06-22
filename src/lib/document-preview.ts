export type DocumentPreviewKind = 'pdf' | 'docx' | 'excel' | 'pptx'

export type DocumentPreviewSource = string | Blob | ArrayBuffer

export type DocumentPreviewPayload = {
  kind: DocumentPreviewKind
  fileName: string
  mimeType?: string
  source: DocumentPreviewSource
  downloadUrl?: string
  downloadName?: string
}

const documentPreviewMimeTypes: Record<DocumentPreviewKind, readonly string[]> = {
  pdf: ['application/pdf'],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  ],
  excel: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroenabled.12',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
    'application/vnd.ms-excel.template.macroenabled.12',
  ],
  pptx: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    'application/vnd.openxmlformats-officedocument.presentationml.template',
  ],
}

const documentPreviewExtensions: Record<DocumentPreviewKind, readonly string[]> = {
  pdf: ['.pdf'],
  docx: ['.docx', '.dotx'],
  excel: ['.xlsx', '.xlsm', '.xltx', '.xltm'],
  pptx: ['.pptx', '.ppsx', '.potx'],
}

export function resolveDocumentPreviewKind(mimeType: string | undefined, fileName: string) {
  const normalizedMimeType = mimeType?.trim().toLowerCase() ?? ''
  const normalizedFileName = fileName.trim().toLowerCase()

  for (const kind of Object.keys(documentPreviewMimeTypes) as DocumentPreviewKind[]) {
    if (normalizedMimeType && documentPreviewMimeTypes[kind].includes(normalizedMimeType)) {
      return kind
    }
  }

  for (const kind of Object.keys(documentPreviewExtensions) as DocumentPreviewKind[]) {
    if (documentPreviewExtensions[kind].some((extension) => normalizedFileName.endsWith(extension))) {
      return kind
    }
  }

  return null
}

export function getDocumentPreviewKindLabel(kind: DocumentPreviewKind) {
  if (kind === 'pdf') {
    return 'PDF'
  }

  if (kind === 'docx') {
    return 'Word'
  }

  if (kind === 'excel') {
    return 'Excel'
  }

  return 'PPT'
}
