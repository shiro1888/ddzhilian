import type { DragEvent } from 'react'
import type { OcrJobResponse } from './ddzhilian-types'

export type SnapLinkOcrImageTarget = {
  src: string
  name: string
  mimeType?: string
}

export type SnapLinkOcrStatus = 'idle' | 'running' | 'complete' | 'failed'

export const snapLinkOcrSupportedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
export const snapLinkOcrFileExtensionByMimeType: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function formatSnapLinkOcrTime(value: string | undefined) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getSnapLinkOcrStatusLabel(status: SnapLinkOcrStatus) {
  switch (status) {
    case 'running':
      return '识别中'
    case 'complete':
      return '识别完成'
    case 'failed':
      return '识别失败'
    case 'idle':
      return '待识别'
  }
}

export function getSnapLinkOcrText(job: OcrJobResponse | null) {
  return job?.text?.trim() ?? ''
}

export function normalizeSnapLinkImageMimeType(value: string | null | undefined) {
  const normalizedType = value?.split(';', 1)[0]?.trim().toLowerCase()
  if (!normalizedType) {
    return null
  }

  return normalizedType === 'image/jpg' ? 'image/jpeg' : normalizedType
}

export function getSupportedSnapLinkOcrMimeType(value: string | null | undefined) {
  const normalizedType = normalizeSnapLinkImageMimeType(value)
  return normalizedType && snapLinkOcrSupportedMimeTypes.has(normalizedType) ? normalizedType : null
}

export function isSupportedSnapLinkOcrFile(file: Pick<File, 'name' | 'type'>) {
  const normalizedType = normalizeSnapLinkImageMimeType(file.type)
  if (normalizedType?.startsWith('image/') && !snapLinkOcrSupportedMimeTypes.has(normalizedType)) {
    return false
  }

  return (
    Boolean(normalizedType && snapLinkOcrSupportedMimeTypes.has(normalizedType)) ||
    /\.(png|jpe?g|webp)$/i.test(file.name)
  )
}

export function getSnapLinkDataImageMimeType(src: string) {
  const match = /^data:(image\/[^;,]+)/i.exec(src)
  return match ? normalizeSnapLinkImageMimeType(match[1]) : null
}

export function getSnapLinkOcrMimeTypeFromSource(src: string) {
  const dataMimeType = getSnapLinkDataImageMimeType(src)
  if (dataMimeType) {
    return dataMimeType
  }

  const normalizedSource = src.split(/[?#]/, 1)[0]?.toLowerCase() ?? ''
  if (/\.(?:jpe?g)$/i.test(normalizedSource)) {
    return 'image/jpeg'
  }

  if (/\.png$/i.test(normalizedSource)) {
    return 'image/png'
  }

  if (/\.webp$/i.test(normalizedSource)) {
    return 'image/webp'
  }

  return null
}

export function isKnownUnsupportedSnapLinkOcrSource(src: string) {
  const dataMimeType = getSnapLinkDataImageMimeType(src)
  if (dataMimeType?.startsWith('image/')) {
    return !snapLinkOcrSupportedMimeTypes.has(dataMimeType)
  }

  const normalizedSource = src.split(/[?#]/, 1)[0]?.toLowerCase() ?? ''
  return /\.(?:avif|bmp|gif|heic|svg|tiff?)$/i.test(normalizedSource)
}

export function isFetchableSnapLinkOcrImageSource(src: string) {
  const normalizedSource = src.trim()
  if (!normalizedSource) {
    return false
  }

  if (/^(?:data:image\/|blob:)/i.test(normalizedSource)) {
    return true
  }

  if (typeof window === 'undefined') {
    return false
  }

  try {
    const url = new URL(normalizedSource, window.location.href)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function getSnapLinkImageFileNameFromSource(src: string) {
  if (typeof window === 'undefined') {
    return ''
  }

  try {
    const url = new URL(src, window.location.href)
    const fileName = url.pathname.split('/').filter(Boolean).pop()
    return fileName ? decodeURIComponent(fileName) : ''
  } catch {
    return ''
  }
}

export function normalizeSnapLinkOcrFileName(name: string, src: string, mimeType: string) {
  const extension = snapLinkOcrFileExtensionByMimeType[mimeType] ?? 'png'
  const rawName = name.trim() || getSnapLinkImageFileNameFromSource(src) || '待识别图片'
  const normalizedName = rawName
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || '待识别图片'

  if (/\.(?:png|jpe?g|webp)$/i.test(normalizedName)) {
    return normalizedName
  }

  const baseName = normalizedName.replace(/\.[^.]+$/, '').trim() || '待识别图片'
  return `${baseName}.${extension}`
}

export function createSnapLinkOcrImageTarget(
  src: string | null | undefined,
  name: string | null | undefined,
): SnapLinkOcrImageTarget | null {
  const normalizedSrc = src?.trim()
  if (
    !normalizedSrc ||
    !isFetchableSnapLinkOcrImageSource(normalizedSrc) ||
    isKnownUnsupportedSnapLinkOcrSource(normalizedSrc)
  ) {
    return null
  }

  return {
    src: normalizedSrc,
    name: name?.trim() || getSnapLinkImageFileNameFromSource(normalizedSrc) || '待识别图片',
    mimeType: getSupportedSnapLinkOcrMimeType(getSnapLinkOcrMimeTypeFromSource(normalizedSrc)) ?? undefined,
  }
}

export function resolveSnapLinkOcrTargetFromImageElement(image: HTMLImageElement) {
  return createSnapLinkOcrImageTarget(
    image.currentSrc || image.src || image.getAttribute('src'),
    image.alt,
  )
}

export function resolveSnapLinkOcrTargetFromRichText(value: string) {
  if (!value || typeof DOMParser === 'undefined') {
    return null
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const images = Array.from(documentFragment.body.querySelectorAll<HTMLImageElement>('img[src]'))
  if (images.length !== 1) {
    return null
  }

  const image = images[0]
  return createSnapLinkOcrImageTarget(image.getAttribute('src'), image.getAttribute('alt'))
}

export function resolveSnapLinkContextOcrTarget(
  value: string,
  target: EventTarget | null,
  container: HTMLElement,
) {
  if (target instanceof Element) {
    const image = target.closest<HTMLImageElement>('img[src]')
    if (image && container.contains(image)) {
      return resolveSnapLinkOcrTargetFromImageElement(image)
    }
  }

  return resolveSnapLinkOcrTargetFromRichText(value)
}

export async function createSnapLinkOcrFileFromImageTarget(target: SnapLinkOcrImageTarget) {
  let response: Response
  try {
    const fetchImage = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : fetch
    response = await fetchImage(target.src)
  } catch {
    throw new Error('无法读取这张图片，请确认图片仍可访问。')
  }

  if (!response.ok) {
    throw new Error('无法读取这张图片，请确认图片仍可访问。')
  }

  const blob = await response.blob()
  const responseMimeType = normalizeSnapLinkImageMimeType(blob.type)
  if (responseMimeType?.startsWith('image/') && !snapLinkOcrSupportedMimeTypes.has(responseMimeType)) {
    throw new Error('只支持 PNG、JPEG 或 WebP 图片。')
  }

  const mimeType =
    getSupportedSnapLinkOcrMimeType(blob.type) ??
    getSupportedSnapLinkOcrMimeType(target.mimeType) ??
    getSupportedSnapLinkOcrMimeType(getSnapLinkOcrMimeTypeFromSource(target.src))
  if (!mimeType) {
    throw new Error('只支持 PNG、JPEG 或 WebP 图片。')
  }

  return new File(
    [blob],
    normalizeSnapLinkOcrFileName(target.name, target.src, mimeType),
    { type: mimeType, lastModified: Date.now() },
  )
}

export function hasSnapLinkDraggedFiles(event: DragEvent<HTMLElement>) {
  return event.dataTransfer.files.length > 0 || Array.from(event.dataTransfer.types).includes('Files')
}

export function getSnapLinkOcrHistorySummary(job: OcrJobResponse) {
  const text = getSnapLinkOcrText(job) || job.error || '无文字结果'
  return text.replace(/\s+/g, ' ').slice(0, 80)
}
