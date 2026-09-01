import type { AiImageHistoryItem, AiImageQuotaStatus, AiImageResult } from './ddzhilian-types'
import { createBrowserId } from './create-browser-id'

export type ImageAttachmentPreview = {
  id: string
  name: string
  previewUrl: string
}

export type ImageUploadDraft = ImageAttachmentPreview & {
  file: File
}

export type ImageThreadEntry =
  | {
      id: string
      role: 'user'
      prompt: string
      createdAt: string
      attachments?: ImageAttachmentPreview[]
    }
  | {
      id: string
      role: 'assistant'
      prompt: string
      createdAt: string
      status: 'loading' | 'complete' | 'failed'
      generationId?: string
      images?: AiImageResult[]
      model?: string
      durationMs?: number
      panoramaIntent?: boolean
      error?: string
    }

export type ImageAssistantEntry = Extract<ImageThreadEntry, { role: 'assistant' }>
export type ImageUserEntry = Extract<ImageThreadEntry, { role: 'user' }>
export type ImagePreviewMode = 'image' | 'panorama'

export type ImageTaskSummary = {
  id: string
  prompt: string
  createdAt: string
  status: ImageAssistantEntry['status']
  assistantEntry: ImageAssistantEntry
  attachments?: ImageAttachmentPreview[]
  images?: AiImageResult[]
  model?: string
  durationMs?: number
}

export type ImageAspectRatioOption = {
  value: string
  label: string
  caption: string
  width: number
  height: number
}

export type ImageResolutionOption = {
  value: string
  label: string
  caption: string
}

export type ImageQualityOption = {
  value: string
  label: string
  caption: string
}

export const imageHistoryInitialLimit = 1
export const imageHistoryPageSize = 8
export const imageUploadMaxFiles = 8
export const imageUploadMaxFileBytes = 8 * 1024 * 1024
export const imageGenerationMaxDimension = 2000
export const imageGenerationDimensionStep = 16
export const acceptedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
export const imageQuotaExhaustedMessage = '总额度已耗尽。'
export const imageAutoSizeValue = 'auto'
export const panoramaAspectRatio = 2
export const panoramaAspectRatioTolerance = 0.02
export const panoramaIntentPatterns = [
  /360\s*(?:度|°)?/i,
  /全景/,
  /球形全景/,
  /环景/,
  /equirectangular/i,
  /\bpano(?:rama)?\b/i,
  /\bspherical\b/i,
  /\bvr\b/i,
  /虚拟现实/,
]
export const imageAspectRatioOptions = [
  { value: imageAutoSizeValue, label: imageAutoSizeValue, caption: '自动尺寸', width: 1, height: 1 },
  { value: '1:1', label: '1:1', caption: '正方形', width: 1, height: 1 },
  { value: '16:9', label: '16:9', caption: '横版', width: 16, height: 9 },
  { value: '9:16', label: '9:16', caption: '竖版', width: 9, height: 16 },
  { value: '4:3', label: '4:3', caption: '标准横版', width: 4, height: 3 },
  { value: '3:4', label: '3:4', caption: '标准竖版', width: 3, height: 4 },
  { value: '2:1', label: '2:1', caption: '全景横版', width: 2, height: 1 },
] as const satisfies readonly ImageAspectRatioOption[]
export const imageResolutionOptions = [
  { value: imageAutoSizeValue, label: imageAutoSizeValue, caption: '自动' },
  { value: '1080', label: '1K', caption: '1080px' },
  { value: '1440', label: '2K', caption: '1440px' },
  { value: '2000', label: '4K', caption: '2000px' },
] as const satisfies readonly ImageResolutionOption[]
export const imageQualityOptions = [
  { value: 'auto', label: '自动', caption: '跟随服务配置' },
  { value: 'low', label: '低', caption: '快速草稿' },
  { value: 'medium', label: '中', caption: '平衡细节' },
  { value: 'high', label: '高', caption: '优先质量' },
] as const satisfies readonly ImageQualityOption[]

export type ImageAspectRatio = (typeof imageAspectRatioOptions)[number]['value']
export type ImageResolution = (typeof imageResolutionOptions)[number]['value']
export type ImageQuality = (typeof imageQualityOptions)[number]['value']

export function createEntryId() {
  return createBrowserId('image-entry')
}

export function resolveImageSource(image: AiImageResult) {
  if (image.url) {
    return image.url
  }

  if (image.b64Json) {
    return `data:${image.mimeType || 'image/png'};base64,${image.b64Json}`
  }

  return ''
}

export function isLandscapePanoramaSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return false
  }

  return width > height && Math.abs(width / height - panoramaAspectRatio) <= panoramaAspectRatioTolerance
}

export function hasPanoramaIntentText(values: Array<string | undefined>) {
  return values.some((value) => {
    const normalizedValue = value?.trim()
    if (!normalizedValue) {
      return false
    }

    return panoramaIntentPatterns.some((pattern) => pattern.test(normalizedValue))
  })
}

export function syncImageComposerTextAreaHeight(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight.toString()}px`
}

export function resolveImageAspectRatioOption(value: ImageAspectRatio) {
  return imageAspectRatioOptions.find((option) => option.value === value) ?? imageAspectRatioOptions[0]
}

export function resolveImageResolutionOption(value: ImageResolution) {
  return (
    imageResolutionOptions.find((option) => option.value === value) ??
    imageResolutionOptions[imageResolutionOptions.length - 1]
  )
}

export function resolveImageResolutionValue(value: ImageResolution) {
  if (value === imageAutoSizeValue) {
    return imageGenerationMaxDimension
  }

  const option = resolveImageResolutionOption(value)
  return Math.min(Number(option?.value ?? imageGenerationMaxDimension), imageGenerationMaxDimension)
}

export function normalizeImageDimension(value: number) {
  const roundedValue = Math.round(value / imageGenerationDimensionStep) * imageGenerationDimensionStep
  return Math.max(
    imageGenerationDimensionStep,
    Math.min(imageGenerationMaxDimension, roundedValue),
  )
}

export function buildImageSizeOption(aspectRatio: ImageAspectRatio, resolution: ImageResolution) {
  if (aspectRatio === imageAutoSizeValue || resolution === imageAutoSizeValue) {
    return imageAutoSizeValue
  }

  const ratioOption = resolveImageAspectRatioOption(aspectRatio)
  const longestSide = resolveImageResolutionValue(resolution)
  const widthDominant = ratioOption.width >= ratioOption.height
  const width = widthDominant
    ? longestSide
    : normalizeImageDimension(longestSide * ratioOption.width / ratioOption.height)
  const height = widthDominant
    ? normalizeImageDimension(longestSide * ratioOption.height / ratioOption.width)
    : longestSide

  return `${width.toString()}x${height.toString()}`
}

export function resolveImageFileExtension(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/png':
    default:
      return 'png'
  }
}

export async function createFileFromGeneratedImage(
  image: AiImageResult,
  generationId: string | undefined,
) {
  const imageSrc = resolveImageSource(image)
  if (!imageSrc) {
    throw new Error('这张图片没有可编辑的图片地址。')
  }

  const response = await fetch(
    imageSrc,
    imageSrc.startsWith('data:') ? undefined : { credentials: 'include' },
  )
  if (!response.ok) {
    throw new Error('图片读取失败，无法进入编辑。')
  }

  const blob = await response.blob()
  const mimeType = blob.type || image.mimeType || 'image/png'
  const extension = resolveImageFileExtension(mimeType)
  const normalizedGenerationId = generationId?.replace(/[^a-z0-9_-]/gi, '').slice(0, 32)
  const fileName = `generated-${normalizedGenerationId || Date.now().toString(36)}.${extension}`

  return new File([blob], fileName, { type: mimeType })
}

export function formatImageTime(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return ''
  }

  return new Date(parsed).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatImageDuration(durationMs: number | undefined) {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
    return ''
  }

  if (durationMs < 1000) {
    return '小于1秒'
  }

  const totalSeconds = Math.round(durationMs / 1000)
  if (totalSeconds < 60) {
    return `${totalSeconds.toString()}秒`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (seconds === 0) {
    return `${minutes.toString()}分钟`
  }

  return `${minutes.toString()}分${seconds.toString()}秒`
}

export function formatImageSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return `${Math.max(1, Math.round(bytes / 1024)).toString()} KB`
}

export function formatImageQuotaLabel(
  quota: AiImageQuotaStatus | null,
  isLoading: boolean,
  localPendingCount: number,
) {
  if (quota) {
    return `额度 ${Math.max(0, quota.totalRemaining - localPendingCount).toString()}`
  }

  return isLoading ? '额度 ...' : '额度 --'
}

export function buildImageQuotaTitle(
  quota: AiImageQuotaStatus | null,
  reservedCount: number,
) {
  if (!quota) {
    return '生图额度加载中'
  }

  const items = [
    `免费 ${quota.freeRemaining.toString()}/${quota.freeLimit.toString()} 张`,
    `付费 ${quota.paidRemaining.toString()} 张`,
    `免费额度每日 ${quota.resetHour.toString().padStart(2, '0')}:00 刷新`,
  ]

  if (reservedCount > 0) {
    items.unshift(`进行中 ${reservedCount.toString()} 张`)
  }

  return items.join('，')
}

export function showImageQuotaExhaustedDialog() {
  window.alert(imageQuotaExhaustedMessage)
}

export function imageTaskStatusLabel(status: ImageAssistantEntry['status']) {
  switch (status) {
    case 'loading':
      return '生成中'
    case 'complete':
      return '已完成'
    case 'failed':
      return '失败'
  }
}

export function buildImageTaskSummaries(entries: ImageThreadEntry[]) {
  const summaries: ImageTaskSummary[] = []
  let pendingUserEntry: ImageUserEntry | null = null

  for (const entry of entries) {
    if (entry.role === 'user') {
      pendingUserEntry = entry
      continue
    }

    summaries.push({
      id: entry.id,
      prompt: pendingUserEntry?.prompt ?? entry.prompt,
      createdAt: entry.createdAt,
      status: entry.status,
      assistantEntry: entry,
      attachments: pendingUserEntry?.attachments,
      images: entry.images,
      model: entry.model,
      durationMs: entry.durationMs,
    })
    pendingUserEntry = null
  }

  return summaries
}

export function resolveImageTaskThumbnail(task: ImageTaskSummary) {
  for (const image of task.images ?? []) {
    const src = resolveImageSource(image)
    if (src) {
      return src
    }
  }

  return ''
}

export function historyItemToEntries(item: AiImageHistoryItem): ImageThreadEntry[] {
  if (item.images.length === 0) {
    return []
  }

  return [
    {
      id: `${item.generationId}-prompt`,
      role: 'user',
      prompt: item.prompt,
      createdAt: item.createdAt,
    },
    {
      id: `${item.generationId}-image`,
      role: 'assistant',
      prompt: item.prompt,
      createdAt: item.createdAt,
      status: 'complete',
      generationId: item.generationId,
      images: item.images,
      model: item.model,
      panoramaIntent: hasPanoramaIntentText([
        item.prompt,
        item.generationId,
        item.model,
        item.size,
        item.quality,
        ...item.images.map((image) => image.revisedPrompt),
      ]),
    },
  ]
}

export function prependUniqueEntries(
  currentEntries: ImageThreadEntry[],
  previousEntries: ImageThreadEntry[],
) {
  const currentIds = new Set(currentEntries.map((entry) => entry.id))
  return [
    ...previousEntries.filter((entry) => !currentIds.has(entry.id)),
    ...currentEntries,
  ]
}
