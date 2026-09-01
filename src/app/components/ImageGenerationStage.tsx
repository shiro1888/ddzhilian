import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CompositionEvent as ReactCompositionEvent, FormEvent, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'lucide-react'
import { navigateBackToText } from '../../lib/navigate-back-to-text'
import type {
  AiImageHistoryCursor,
  AiImageHistoryPage,
  AiImageHistoryRequestOptions,
  AiImageQuotaStatus,
  AiImageRequestInput,
  AiImageResponse,
  AiImageResult,
} from '../../lib/ddzhilian-types'
import {
  acceptedImageTypes,
  buildImageQuotaTitle,
  buildImageSizeOption,
  buildImageTaskSummaries,
  createEntryId,
  createFileFromGeneratedImage,
  formatImageDuration,
  formatImageQuotaLabel,
  formatImageSize,
  formatImageTime,
  hasPanoramaIntentText,
  historyItemToEntries,
  imageAspectRatioOptions,
  imageAutoSizeValue,
  imageHistoryInitialLimit,
  imageHistoryPageSize,
  imageQualityOptions,
  imageQuotaExhaustedMessage,
  imageResolutionOptions,
  imageTaskStatusLabel,
  imageUploadMaxFileBytes,
  imageUploadMaxFiles,
  isLandscapePanoramaSize,
  prependUniqueEntries,
  resolveImageResolutionOption,
  resolveImageSource,
  resolveImageTaskThumbnail,
  showImageQuotaExhaustedDialog,
  syncImageComposerTextAreaHeight,
} from '../../lib/image-generation-utils'
import type {
  ImageAspectRatio,
  ImageAssistantEntry,
  ImageAttachmentPreview,
  ImagePreviewMode,
  ImageQuality,
  ImageResolution,
  ImageThreadEntry,
  ImageUploadDraft,
} from '../../lib/image-generation-utils'
import { PanoramaViewer } from './PanoramaViewer'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

type ImageComposerMenu = 'aspectRatio' | 'resolution'

type ImageGenerationStageProps = {
  isReady: boolean
  userEmail: string
  onGenerateImage: (input: AiImageRequestInput) => Promise<AiImageResponse>
  onGetImageQuota: () => Promise<AiImageQuotaStatus>
  onListImageHistory: (options?: AiImageHistoryRequestOptions) => Promise<AiImageHistoryPage>
  onLogout: () => Promise<void>
}

type ImageExample = {
  label: string
  prompt: string
  variant: 'whale' | 'recipe' | 'portrait' | 'blueprint'
}

type ImagePreviewState = {
  src: string
  alt: string
  mode: ImagePreviewMode
}

const imageExamples: ImageExample[] = [
  {
    label: '动物信息图',
    prompt: '制作一张深海鲸鱼科普信息图，深蓝色背景，包含精细结构线、数据标注和现代杂志排版。',
    variant: 'whale',
  },
  {
    label: '图解食谱',
    prompt: '生成一张手绘风图解食谱，米色纸张背景，清晰展示食材、步骤箭头和温暖厨房质感。',
    variant: 'recipe',
  },
  {
    label: '影棚形象照',
    prompt: '生成一张自然微笑的人像影棚照片，柔和轮廓光，深色背景，商业摄影质感。',
    variant: 'portrait',
  },
  {
    label: '蓝图海报',
    prompt: '制作一张蓝色工程蓝图风格海报，中心是草莓结构线稿，带尺寸标注和网格背景。',
    variant: 'blueprint',
  },
]

export function ImageGenerationStage({
  isReady,
  userEmail,
  onGenerateImage,
  onGetImageQuota,
  onListImageHistory,
  onLogout,
}: ImageGenerationStageProps) {
  const [draft, setDraft] = useState('')
  const [selectedImages, setSelectedImages] = useState<ImageUploadDraft[]>([])
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<ImageAspectRatio>(imageAutoSizeValue)
  const [selectedResolution, setSelectedResolution] = useState<ImageResolution>(imageAutoSizeValue)
  const [selectedQuality, setSelectedQuality] = useState<ImageQuality>('auto')
  const [openComposerMenu, setOpenComposerMenu] = useState<ImageComposerMenu | null>(null)
  const [entries, setEntries] = useState<ImageThreadEntry[]>([])
  const [selectedImageTaskId, setSelectedImageTaskId] = useState<string | null>(null)
  const [activeGenerationCount, setActiveGenerationCount] = useState(0)
  const [isLoadingInitialHistory, setIsLoadingInitialHistory] = useState(true)
  const [isLoadingOlderHistory, setIsLoadingOlderHistory] = useState(false)
  const [historyCursor, setHistoryCursor] = useState<AiImageHistoryCursor | undefined>()
  const [hasOlderHistory, setHasOlderHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [imageQuota, setImageQuota] = useState<AiImageQuotaStatus | null>(null)
  const [isImageQuotaLoading, setIsImageQuotaLoading] = useState(true)
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null)
  const [isImagePreviewZoomed, setIsImagePreviewZoomed] = useState(false)
  const [editingImageEntryId, setEditingImageEntryId] = useState<string | null>(null)
  const [panoramaEligibleEntryIds, setPanoramaEligibleEntryIds] = useState<Record<string, boolean>>({})
  const threadRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const composerTextAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const composerControlsRef = useRef<HTMLDivElement | null>(null)
  const isComposerComposingRef = useRef(false)
  const previewUrlsRef = useRef<Set<string>>(new Set())
  const olderHistoryLoadingRef = useRef(false)
  const pendingScrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)
  const quotaRefreshRequestIdRef = useRef(0)
  const imageTasks = useMemo(() => buildImageTaskSummaries(entries), [entries])
  const selectedImageTask = imageTasks.find((task) => task.id === selectedImageTaskId) ?? imageTasks[imageTasks.length - 1]
  const completedImageTaskCount = imageTasks.filter((task) => task.status === 'complete').length
  const hasEntries = entries.length > 0
  const serverReservedImageQuota = imageQuota?.totalReserved ?? 0
  const localPendingImageQuota = Math.max(0, activeGenerationCount - serverReservedImageQuota)
  const reservedImageQuota = serverReservedImageQuota + localPendingImageQuota
  const availableImageQuota = imageQuota
    ? Math.max(0, imageQuota.totalRemaining - localPendingImageQuota)
    : undefined
  const isImageQuotaExhausted = availableImageQuota !== undefined && availableImageQuota <= 0
  const canSubmit = isReady && draft.trim().length > 0 && !editingImageEntryId && !isImageQuotaExhausted
  const latestImageEntryId = entries
    .slice()
    .reverse()
    .find((entry) => entry.role === 'assistant' && entry.status === 'complete' && entry.images?.length)
    ?.id
  const selectedImageSize = buildImageSizeOption(selectedAspectRatio, selectedResolution)
  const selectedResolutionOption = resolveImageResolutionOption(selectedResolution)
  const selectedResolutionLabel = selectedResolutionOption.label
  const selectedResolutionCaption = selectedResolutionOption.caption
  const selectedImageSizeLabel = selectedImageSize === imageAutoSizeValue ? '自动尺寸' : `${selectedImageSize} px`
  const composerPlaceholder = !isReady
    ? '正在连接服务'
    : activeGenerationCount > 0
      ? '可继续描述下一张图片'
      : '描述或编辑图片'

  useEffect(() => {
    const previewUrls = previewUrlsRef.current

    return () => {
      for (const previewUrl of previewUrls) {
        URL.revokeObjectURL(previewUrl)
      }

      previewUrls.clear()
    }
  }, [])

  useEffect(() => {
    let isCancelled = false
    const requestId = quotaRefreshRequestIdRef.current + 1
    quotaRefreshRequestIdRef.current = requestId
    setIsImageQuotaLoading(true)

    void onGetImageQuota()
      .then((quota) => {
        if (!isCancelled && quotaRefreshRequestIdRef.current === requestId) {
          setImageQuota(quota)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!isCancelled && quotaRefreshRequestIdRef.current === requestId) {
          setIsImageQuotaLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [onGetImageQuota])

  useEffect(() => {
    let isCancelled = false
    olderHistoryLoadingRef.current = false
    pendingScrollAnchorRef.current = null
    setIsLoadingInitialHistory(true)
    setIsLoadingOlderHistory(false)
    setHistoryCursor(undefined)
    setHasOlderHistory(false)
    setHistoryError(null)
    setEntries([])
    setSelectedImageTaskId(null)
    setPanoramaEligibleEntryIds({})

    void onListImageHistory({ limit: imageHistoryInitialLimit })
      .then((page) => {
        if (isCancelled) {
          return
        }

        setEntries(page.items.slice().reverse().flatMap(historyItemToEntries))
        if (page.quota) {
          setImageQuota(page.quota)
          setIsImageQuotaLoading(false)
        }
        setHistoryCursor(page.nextCursor)
        setHasOlderHistory(page.hasMore && Boolean(page.nextCursor))
      })
      .catch((error) => {
        if (!isCancelled) {
          setHistoryError(error instanceof Error ? error.message : '生图历史加载失败。')
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingInitialHistory(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [onListImageHistory])

  useEffect(() => {
    if (imageTasks.length === 0) {
      if (selectedImageTaskId !== null) {
        setSelectedImageTaskId(null)
      }
      return
    }

    if (!selectedImageTaskId || !imageTasks.some((task) => task.id === selectedImageTaskId)) {
      setSelectedImageTaskId(imageTasks[imageTasks.length - 1].id)
    }
  }, [imageTasks, selectedImageTaskId])

  useEffect(() => {
    if (!openComposerMenu) {
      return undefined
    }

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (target instanceof Node && composerControlsRef.current?.contains(target)) {
        return
      }

      setOpenComposerMenu(null)
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenComposerMenu(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openComposerMenu])

  useEffect(() => {
    if (!isReady) {
      setOpenComposerMenu(null)
    }
  }, [isReady])

  useIsomorphicLayoutEffect(() => {
    const textarea = composerTextAreaRef.current
    if (!textarea) {
      return
    }

    syncImageComposerTextAreaHeight(textarea)
  }, [draft, hasEntries])

  useEffect(() => {
    const handleResize = () => {
      const textarea = composerTextAreaRef.current
      if (!textarea) {
        return
      }

      syncImageComposerTextAreaHeight(textarea)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const refreshImageQuota = async () => {
    const requestId = quotaRefreshRequestIdRef.current + 1
    quotaRefreshRequestIdRef.current = requestId
    setIsImageQuotaLoading(true)

    try {
      const quota = await onGetImageQuota()
      if (quotaRefreshRequestIdRef.current === requestId) {
        setImageQuota(quota)
        setIsImageQuotaLoading(false)
      }
      return quota
    } catch {
      if (quotaRefreshRequestIdRef.current === requestId) {
        setIsImageQuotaLoading(false)
      }
      return null
    }
  }

  useEffect(() => {
    const thread = threadRef.current
    if (!thread) {
      return
    }

    const scrollAnchor = pendingScrollAnchorRef.current
    if (scrollAnchor) {
      pendingScrollAnchorRef.current = null
      window.requestAnimationFrame(() => {
        thread.scrollTop = thread.scrollHeight - scrollAnchor.scrollHeight + scrollAnchor.scrollTop
      })
      return
    }

    window.requestAnimationFrame(() => {
      thread.scrollTo({
        top: thread.scrollHeight,
        behavior: 'smooth',
      })
    })
  }, [entries])

  useEffect(() => {
    if (!imagePreview) {
      return
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImagePreview(null)
        setIsImagePreviewZoomed(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [imagePreview])

  const openImagePreview = (
    image: AiImageResult,
    alt: string,
    mode: ImagePreviewMode = 'image',
  ) => {
    const src = resolveImageSource(image)
    if (!src) {
      return
    }

    setIsImagePreviewZoomed(false)
    setImagePreview({ src, alt, mode })
  }

  const closeImagePreview = () => {
    setImagePreview(null)
    setIsImagePreviewZoomed(false)
  }

  const keepThreadPinnedAfterImageLoad = () => {
    const thread = threadRef.current
    if (!thread) {
      return
    }

    const distanceToBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight
    if (distanceToBottom > 160) {
      return
    }

    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: 'smooth',
    })
  }

  const updatePanoramaEligibility = (entryId: string, imageElement: HTMLImageElement) => {
    const isEligible = isLandscapePanoramaSize(
      imageElement.naturalWidth,
      imageElement.naturalHeight,
    )

    setPanoramaEligibleEntryIds((current) =>
      current[entryId] === isEligible
        ? current
        : {
            ...current,
            [entryId]: isEligible,
          },
    )
  }

  const revokeSelectedPreview = (previewUrl: string) => {
    URL.revokeObjectURL(previewUrl)
    previewUrlsRef.current.delete(previewUrl)
  }

  const handleImageInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''

    if (files.length === 0) {
      return
    }

    setComposerError(null)
    const availableSlots = imageUploadMaxFiles - selectedImages.length
    if (availableSlots <= 0) {
      setComposerError(`最多一次上传 ${imageUploadMaxFiles.toString()} 张图片。`)
      return
    }

    let nextError: string | null = files.length > availableSlots
      ? `最多一次上传 ${imageUploadMaxFiles.toString()} 张图片。`
      : null
    const nextImages: ImageUploadDraft[] = []

    for (const file of files.slice(0, availableSlots)) {
      if (!acceptedImageTypes.has(file.type)) {
        nextError = '只支持 PNG、JPEG 或 WebP 图片。'
        continue
      }

      if (file.size > imageUploadMaxFileBytes) {
        nextError = `单张图片不能超过 ${formatImageSize(imageUploadMaxFileBytes)}。`
        continue
      }

      const previewUrl = URL.createObjectURL(file)
      previewUrlsRef.current.add(previewUrl)
      nextImages.push({
        id: createEntryId(),
        name: file.name || 'image',
        previewUrl,
        file,
      })
    }

    if (nextImages.length > 0) {
      setSelectedImages((current) => [...current, ...nextImages])
    }

    setComposerError(nextError)
  }

  const removeSelectedImage = (imageId: string) => {
    setComposerError(null)
    setSelectedImages((current) => {
      const removedImage = current.find((image) => image.id === imageId)
      if (removedImage) {
        revokeSelectedPreview(removedImage.previewUrl)
      }

      return current.filter((image) => image.id !== imageId)
    })
  }

  const clearSelectedImages = () => {
    setComposerError(null)
    setSelectedImages((current) => {
      for (const image of current) {
        revokeSelectedPreview(image.previewUrl)
      }

      return []
    })
  }

  const loadOlderHistory = async () => {
    if (
      !historyCursor ||
      !hasOlderHistory ||
      isLoadingInitialHistory ||
      olderHistoryLoadingRef.current
    ) {
      return
    }

    const thread = threadRef.current
    pendingScrollAnchorRef.current = thread
      ? {
          scrollHeight: thread.scrollHeight,
          scrollTop: thread.scrollTop,
        }
      : null

    olderHistoryLoadingRef.current = true
    setIsLoadingOlderHistory(true)
    setHistoryError(null)

    try {
      const page = await onListImageHistory({
        limit: imageHistoryPageSize,
        before: historyCursor,
      })
      const previousEntries = page.items.slice().reverse().flatMap(historyItemToEntries)

      setEntries((current) => prependUniqueEntries(current, previousEntries))
      setHistoryCursor(page.nextCursor)
      setHasOlderHistory(page.hasMore && Boolean(page.nextCursor))
    } catch (error) {
      pendingScrollAnchorRef.current = null
      setHistoryError(error instanceof Error ? error.message : '更早生图历史加载失败。')
    } finally {
      olderHistoryLoadingRef.current = false
      setIsLoadingOlderHistory(false)
    }
  }

  const handleThreadScroll = () => {
    const thread = threadRef.current
    if (!thread || thread.scrollTop > 96) {
      return
    }

    void loadOlderHistory()
  }

  const submitPrompt = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (isComposerComposingRef.current) {
      return
    }

    const prompt = draft.trim()

    if (!prompt || !isReady || editingImageEntryId) {
      return
    }

    if (isImageQuotaExhausted) {
      showImageQuotaExhaustedDialog()
      void refreshImageQuota()
      return
    }

    const createdAt = new Date().toISOString()
    const attachments = selectedImages.map((image) => ({
      id: image.id,
      name: image.name,
      previewUrl: image.previewUrl,
    }))
    const userEntry: ImageThreadEntry = {
      id: createEntryId(),
      role: 'user',
      prompt,
      createdAt,
      attachments: attachments.length > 0 ? attachments : undefined,
    }
    const assistantEntryId = createEntryId()
    const pendingEntry: ImageThreadEntry = {
      id: assistantEntryId,
      role: 'assistant',
      prompt,
      createdAt,
      status: 'loading',
    }
    const imageFiles = selectedImages.map((image) => image.file)

    setEntries((current) => [...current, userEntry, pendingEntry])
    setDraft('')
    setSelectedImages([])
    setComposerError(null)
    setOpenComposerMenu(null)
    setSelectedImageTaskId(assistantEntryId)
    setActiveGenerationCount((count) => count + 1)

    const generationStartedAtMs = Date.now()
    try {
      const result = await onGenerateImage({
        prompt,
        images: imageFiles.length > 0 ? imageFiles : undefined,
        size: selectedImageSize,
        quality: selectedQuality,
      })
      const generationDurationMs = Math.max(0, Date.now() - generationStartedAtMs)

      void refreshImageQuota()

      setEntries((current) =>
        current.map((entry) =>
          entry.id === assistantEntryId && entry.role === 'assistant'
            ? {
                ...entry,
                status: 'complete',
                generationId: result.historyItem?.generationId,
                images: result.images,
                model: result.model,
                durationMs: generationDurationMs,
                createdAt: result.createdAt,
                panoramaIntent: hasPanoramaIntentText([
                  prompt,
                  result.historyItem?.generationId,
                  result.model,
                  result.historyItem?.size,
                  result.historyItem?.quality,
                  ...result.images.map((image) => image.revisedPrompt),
                ]),
              }
            : entry,
        ),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片生成失败。'
      if (message === imageQuotaExhaustedMessage) {
        showImageQuotaExhaustedDialog()
      }

      void refreshImageQuota()

      setEntries((current) =>
        current.map((entry) =>
          entry.id === assistantEntryId && entry.role === 'assistant'
            ? {
                ...entry,
                status: 'failed',
                error: message,
              }
            : entry,
        ),
      )
    } finally {
      setActiveGenerationCount((count) => Math.max(0, count - 1))
    }
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.nativeEvent.isComposing &&
      !isComposerComposingRef.current
    ) {
      event.preventDefault()
      void submitPrompt()
    }
  }

  const handleComposerDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value)

    if (!isComposerComposingRef.current) {
      syncImageComposerTextAreaHeight(event.target)
    }
  }

  const handleComposerCompositionStart = () => {
    isComposerComposingRef.current = true
  }

  const handleComposerCompositionEnd = (event: ReactCompositionEvent<HTMLTextAreaElement>) => {
    isComposerComposingRef.current = false
    setDraft(event.currentTarget.value)
    syncImageComposerTextAreaHeight(event.currentTarget)
  }

  const renderAttachmentStrip = (
    attachments: ImageAttachmentPreview[],
    options?: { removable?: boolean },
  ) => (
    <div className="dd-image-attachments" aria-label="已选择图片">
      {attachments.map((image) => (
        <figure key={image.id} className="dd-image-attachment">
          <img src={image.previewUrl} alt={image.name} />
          <figcaption>{image.name}</figcaption>
          {options?.removable ? (
            <button
              type="button"
              aria-label={`移除 ${image.name}`}
              title="移除"
              onClick={() => removeSelectedImage(image.id)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 6 12 12" />
                <path d="M18 6 6 18" />
              </svg>
            </button>
          ) : null}
        </figure>
      ))}
    </div>
  )

  const renderComposer = (
    placement: 'empty' | 'thread',
    options: { showAttachments?: boolean } = {},
  ) => (
    <form className={`dd-image-composer is-${placement}`} onSubmit={submitPrompt}>
      {(options.showAttachments ?? true) && selectedImages.length > 0
        ? renderAttachmentStrip(selectedImages, { removable: !editingImageEntryId })
        : null}
      <div className="dd-image-composer__box">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          disabled={!isReady || Boolean(editingImageEntryId)}
          onChange={handleImageInputChange}
        />
        <textarea
          ref={composerTextAreaRef}
          value={draft}
          rows={1}
          placeholder={composerPlaceholder}
          disabled={!isReady || Boolean(editingImageEntryId)}
          onChange={handleComposerDraftChange}
          onCompositionStart={handleComposerCompositionStart}
          onCompositionEnd={handleComposerCompositionEnd}
          onKeyDown={handleComposerKeyDown}
        />
        <div ref={composerControlsRef} className="dd-image-composer__tools" aria-label="图片生成选项">
          <button
            type="button"
            className="dd-image-composer__attach"
            disabled={
              !isReady ||
              Boolean(editingImageEntryId) ||
              selectedImages.length >= imageUploadMaxFiles
            }
            aria-label="添加参考图"
            title="添加参考图"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z" />
              <path d="m8 15 2.4-2.4a1.4 1.4 0 0 1 2 0L16 16" />
              <path d="m14 14 1-1a1.4 1.4 0 0 1 2 0L20 16" />
              <path d="M8.5 8.5h.01" />
            </svg>
            <span>{selectedImages.length > 0 ? `参考图 ${selectedImages.length.toString()}` : '参考图'}</span>
          </button>
          <div className={`dd-image-composer__dropdown${openComposerMenu === 'aspectRatio' ? ' is-open' : ''}`}>
            <button
              type="button"
              className="dd-image-composer__select"
              disabled={!isReady || Boolean(editingImageEntryId)}
              aria-label={`比例 ${selectedAspectRatio}`}
              aria-haspopup="listbox"
              aria-expanded={openComposerMenu === 'aspectRatio'}
              title={`当前比例：${selectedAspectRatio}`}
              onClick={() => setOpenComposerMenu((menu) => (menu === 'aspectRatio' ? null : 'aspectRatio'))}
            >
              <span>比例</span>
              <strong>{selectedAspectRatio}</strong>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {openComposerMenu === 'aspectRatio' ? (
              <div className="dd-image-composer__dropdown-menu" role="listbox" aria-label="选择图片比例">
                {imageAspectRatioOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selectedAspectRatio === option.value}
                    className={`dd-image-composer__option${selectedAspectRatio === option.value ? ' is-selected' : ''}`}
                    onClick={() => {
                      setSelectedAspectRatio(option.value)
                      setOpenComposerMenu(null)
                    }}
                  >
                    <span className="dd-image-composer__option-icon" aria-hidden="true">{option.label}</span>
                    <span>
                      <strong>{option.caption}</strong>
                      <small>{option.label}</small>
                    </span>
                    {selectedAspectRatio === option.value ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className={`dd-image-composer__dropdown is-resolution${openComposerMenu === 'resolution' ? ' is-open' : ''}`}>
            <button
              type="button"
              className="dd-image-composer__select"
              disabled={!isReady || Boolean(editingImageEntryId)}
              aria-label={`分辨率 ${selectedResolutionLabel}，最长边 ${selectedResolutionCaption}`}
              aria-haspopup="listbox"
              aria-expanded={openComposerMenu === 'resolution'}
              title={`最长边：${selectedResolutionCaption}`}
              onClick={() => setOpenComposerMenu((menu) => (menu === 'resolution' ? null : 'resolution'))}
            >
              <span>分辨率</span>
              <strong>{selectedResolutionLabel}</strong>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {openComposerMenu === 'resolution' ? (
              <div className="dd-image-composer__dropdown-menu" role="listbox" aria-label="选择图片分辨率">
                {imageResolutionOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selectedResolution === option.value}
                    className={`dd-image-composer__option${selectedResolution === option.value ? ' is-selected' : ''}`}
                    onClick={() => {
                      setSelectedResolution(option.value)
                      setOpenComposerMenu(null)
                    }}
                  >
                    <span className="dd-image-composer__option-icon" aria-hidden="true">{option.label}</span>
                    <span>
                      <strong>{option.caption}</strong>
                    </span>
                    {selectedResolution === option.value ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <button
          type="submit"
          className="dd-image-composer__submit"
          disabled={!canSubmit}
          aria-label="生成图片"
          title="生成图片"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V5" />
            <path d="M6.5 10.5 12 5l5.5 5.5" />
          </svg>
          <span>开始生成</span>
        </button>
      </div>
      {composerError ? <p className="dd-image-composer__error">{composerError}</p> : null}
    </form>
  )

  const renderGeneratedImageCards = (entry: ImageAssistantEntry) => {
    if (entry.status !== 'complete' || !entry.images?.length) {
      return null
    }

    const isLatestImage = entry.id === latestImageEntryId
    const totalImages = entry.images.length
    return (
      <>
        {entry.images.map((generatedImage, index) => {
          const imageSrc = resolveImageSource(generatedImage)
          if (!imageSrc) {
            return null
          }

          const imageEntryId = `${entry.id}-${index.toString()}`
          const isPreparingThisImageEdit = editingImageEntryId === imageEntryId
          const durationLabel = formatImageDuration(entry.durationMs)
          const hasPanoramaIntent =
            entry.panoramaIntent === true ||
            hasPanoramaIntentText([
              entry.prompt,
              entry.generationId,
              entry.model,
              generatedImage.revisedPrompt,
            ])
          const canViewAsPanorama =
            hasPanoramaIntent && panoramaEligibleEntryIds[imageEntryId] === true

          return (
            <figure key={imageEntryId} className="dd-image-card">
              <div className="dd-image-card__media">
                <button
                  type="button"
                  className="dd-image-card__image-button"
                  aria-label="放大查看图片"
                  onClick={() => openImagePreview(generatedImage, entry.prompt)}
                >
                  <img
                    src={imageSrc}
                    alt={entry.prompt}
                    loading={isLatestImage ? 'eager' : 'lazy'}
                    fetchPriority={isLatestImage ? 'high' : 'auto'}
                    decoding="async"
                    onLoad={(event) => {
                      updatePanoramaEligibility(imageEntryId, event.currentTarget)
                      if (isLatestImage) {
                        keepThreadPinnedAfterImageLoad()
                      }
                    }}
                  />
                </button>
                <div className="dd-image-card__actions" aria-label="图片操作">
                  {canViewAsPanorama ? (
                    <button
                      type="button"
                      onClick={() => openImagePreview(generatedImage, entry.prompt, 'panorama')}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M3 12h18" />
                        <path d="M12 3a13.5 13.5 0 0 1 0 18" />
                        <path d="M12 3a13.5 13.5 0 0 0 0 18" />
                      </svg>
                      <span>360</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={Boolean(editingImageEntryId)}
                    onClick={() => {
                      void prepareGeneratedImageEdit({
                        ...entry,
                        id: imageEntryId,
                        images: [generatedImage],
                      })
                    }}
                  >
                    <span>{isPreparingThisImageEdit ? '准备中' : '编辑'}</span>
                  </button>
                </div>
              </div>
              <figcaption>
                <span>
                  {entry.model || 'gpt-image-2'}
                  {totalImages > 1 ? ` · ${index + 1}/${totalImages}` : ''}
                  {' · '}
                  {formatImageTime(entry.createdAt)}
                  {durationLabel ? ` · 耗时 ${durationLabel}` : ''}
                </span>
                <a href={imageSrc} download={`generated-image-${index + 1}.png`}>
                  下载
                </a>
              </figcaption>
            </figure>
          )
        })}
      </>
    )
  }

  const prepareGeneratedImageEdit = async (entry: ImageAssistantEntry) => {
    if (entry.status !== 'complete' || !entry.images?.[0] || editingImageEntryId) {
      return
    }

    setComposerError(null)
    if (selectedImages.length >= imageUploadMaxFiles) {
      setComposerError(`最多一次上传 ${imageUploadMaxFiles.toString()} 张图片。`)
      return
    }

    setEditingImageEntryId(entry.id)
    try {
      const file = await createFileFromGeneratedImage(entry.images[0], entry.generationId)
      const previewUrl = URL.createObjectURL(file)
      previewUrlsRef.current.add(previewUrl)
      const editDraft: ImageUploadDraft = {
        id: createEntryId(),
        name: file.name,
        previewUrl,
        file,
      }
      setSelectedImages((current) => [...current, editDraft])

      window.requestAnimationFrame(() => {
        composerTextAreaRef.current?.focus()
        threadRef.current?.scrollTo({
          top: threadRef.current.scrollHeight,
          behavior: 'smooth',
        })
      })
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : '图片读取失败，无法进入编辑。')
    } finally {
      setEditingImageEntryId(null)
    }
  }

  const renderTaskSidebar = () => (
    <aside className="dd-image-workbench__sidebar" aria-label="生图任务历史">
      <div className="dd-image-brand">
        <div className="dd-image-stage__mark" aria-hidden="true" />
        <div>
          <strong>ddzhilian</strong>
          <span>Image Studio</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft('')
            setComposerError(null)
            setOpenComposerMenu(null)
            window.requestAnimationFrame(() => composerTextAreaRef.current?.focus())
          }}
        >
          新建
        </button>
      </div>

      <div className="dd-image-sidebar__stats" aria-label="生图概览">
        <span>{imageTasks.length.toString()} 个任务</span>
        <span>{completedImageTaskCount.toString()} 个完成</span>
      </div>

      <div
        ref={threadRef}
        className="dd-image-history-scroll"
        onScroll={handleThreadScroll}
      >
        {hasOlderHistory || isLoadingOlderHistory || historyError ? (
          <div className="dd-image-history-more">
            {hasOlderHistory ? (
              <button
                type="button"
                disabled={isLoadingOlderHistory}
                onClick={() => {
                  void loadOlderHistory()
                }}
              >
                {isLoadingOlderHistory ? '加载中' : '更早记录'}
              </button>
            ) : null}
            {historyError ? <p className="dd-error-note">{historyError}</p> : null}
          </div>
        ) : null}

        {isLoadingInitialHistory && imageTasks.length === 0 ? (
          <div className="dd-image-sidebar-empty" role="status">
            正在加载历史...
          </div>
        ) : imageTasks.length === 0 ? (
          <div className="dd-image-sidebar-empty">
            <strong>暂无生图记录</strong>
            <span>提交第一条提示词后会出现在这里。</span>
          </div>
        ) : (
          <div className="dd-image-task-list">
            {imageTasks.map((task) => {
              const thumbnailSrc = resolveImageTaskThumbnail(task) || task.attachments?.[0]?.previewUrl || ''
              const isSelected = selectedImageTask?.id === task.id
              const durationLabel = formatImageDuration(task.durationMs)

              return (
                <button
                  key={task.id}
                  type="button"
                  className={`dd-image-task-item is-${task.status}${isSelected ? ' is-selected' : ''}`}
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => setSelectedImageTaskId(task.id)}
                >
                  <span className="dd-image-task-item__thumb" aria-hidden="true">
                    {thumbnailSrc ? <img src={thumbnailSrc} alt="" /> : <span>文</span>}
                  </span>
                  <span className="dd-image-task-item__body">
                    <strong>{task.prompt}</strong>
                    <span>
                      {imageTaskStatusLabel(task.status)}
                      {' · '}
                      {formatImageTime(task.createdAt)}
                      {durationLabel ? ` · ${durationLabel}` : ''}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="dd-image-sidebar__footer">
        <span>{activeGenerationCount > 0 ? '任务运行中' : '等待任务'}</span>
        <span
          className={`dd-image-stage__quota${isImageQuotaExhausted ? ' is-empty' : ''}`}
          title={buildImageQuotaTitle(imageQuota, reservedImageQuota)}
        >
          {formatImageQuotaLabel(imageQuota, isImageQuotaLoading, localPendingImageQuota)}
        </span>
      </div>
    </aside>
  )

  const renderImageInputPanel = () => (
    <section className="dd-image-panel dd-image-input-panel" aria-label="图像输入">
      <div className="dd-image-panel__heading">
        <h2>图像输入</h2>
        <span>{selectedImages.length.toString()} / {imageUploadMaxFiles.toString()}</span>
      </div>
      <div className={`dd-image-upload-zone${selectedImages.length > 0 ? ' has-images' : ''}`}>
        <button
          type="button"
          className="dd-image-upload-tile"
          disabled={!isReady || Boolean(editingImageEntryId) || selectedImages.length >= imageUploadMaxFiles}
          onClick={() => fileInputRef.current?.click()}
        >
          <span aria-hidden="true">+</span>
          <strong>点击添加参考图</strong>
          <small>支持 PNG、JPEG、WebP，单张不超过 {formatImageSize(imageUploadMaxFileBytes)}</small>
        </button>
        {selectedImages.length > 0 ? renderAttachmentStrip(selectedImages, { removable: !editingImageEntryId }) : null}
      </div>
      <div className="dd-image-input-actions">
        <button
          type="button"
          disabled={selectedImages.length === 0 || Boolean(editingImageEntryId)}
          onClick={clearSelectedImages}
        >
          清空
        </button>
        <button
          type="button"
          disabled={!isReady || Boolean(editingImageEntryId) || selectedImages.length >= imageUploadMaxFiles}
          onClick={() => fileInputRef.current?.click()}
        >
          添加图片
        </button>
      </div>
    </section>
  )

  const renderPromptPanel = () => (
    <section className="dd-image-panel dd-image-prompt-panel" aria-label="提示词">
      <div className="dd-image-panel__heading">
        <h2>提示词</h2>
        <span>{draft.length.toString()} 字</span>
      </div>
      {renderComposer('thread', { showAttachments: false })}
      <div className="dd-image-example-chips" aria-label="提示词示例">
        {imageExamples.map((example) => (
          <button
            key={example.label}
            type="button"
            onClick={() => {
              setDraft(example.prompt)
              window.requestAnimationFrame(() => composerTextAreaRef.current?.focus())
            }}
          >
            {example.label}
          </button>
        ))}
      </div>
    </section>
  )

  const renderOutputSettingsPanel = () => (
    <section className="dd-image-panel dd-image-settings-panel" aria-label="输出设置">
      <div className="dd-image-panel__heading">
        <h2>输出设置</h2>
        <span>{selectedImageSizeLabel}</span>
      </div>

      <div className="dd-image-setting-row">
        <span>主模型</span>
        <strong>gpt-image-2</strong>
      </div>

      <div className="dd-image-setting-group">
        <span>比例</span>
        <div className="dd-image-setting-grid is-ratio">
          {imageAspectRatioOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={selectedAspectRatio === option.value ? 'is-selected' : ''}
              title={option.caption}
              onClick={() => setSelectedAspectRatio(option.value)}
            >
              {option.value === imageAutoSizeValue ? '自动' : option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dd-image-setting-group">
        <span>分辨率</span>
        <div className="dd-image-setting-grid">
          {imageResolutionOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={selectedResolution === option.value ? 'is-selected' : ''}
              title={option.caption}
              onClick={() => setSelectedResolution(option.value)}
            >
              {option.value === imageAutoSizeValue ? '自动' : option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dd-image-setting-group">
        <span>质量</span>
        <div className="dd-image-setting-grid">
          {imageQualityOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={selectedQuality === option.value ? 'is-selected' : ''}
              title={option.caption}
              onClick={() => setSelectedQuality(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dd-image-output-note">
        输出像素：{selectedImageSizeLabel}
      </div>
    </section>
  )

  const renderPreviewPanel = () => (
    <section className="dd-image-panel dd-image-preview-panel" aria-label="预览结果">
      <div className="dd-image-panel__heading">
        <h2>预览结果</h2>
        {selectedImageTask ? <span>{imageTaskStatusLabel(selectedImageTask.status)}</span> : null}
      </div>

      <div className="dd-image-preview-result">
        {!selectedImageTask ? (
          <div className="dd-image-preview-empty">
            <div className="dd-image-stage__mark" aria-hidden="true" />
            <strong>生成结果会显示在这里</strong>
            <span>添加参考图、填写提示词并点击开始生成。</span>
          </div>
        ) : selectedImageTask.status === 'loading' ? (
          <div className="dd-image-card is-loading" role="status" aria-live="polite">
            <div className="dd-image-generation-loader" aria-hidden="true">
              <span className="dd-image-generation-loader__frame" />
              <span className="dd-image-generation-loader__beam" />
              <span className="dd-image-generation-loader__spark is-one" />
              <span className="dd-image-generation-loader__spark is-two" />
              <span className="dd-image-generation-loader__spark is-three" />
            </div>
            <p>正在生成...</p>
          </div>
        ) : selectedImageTask.status === 'failed' ? (
          <div className="dd-image-card is-error">
            <strong>生成失败</strong>
            <p>{selectedImageTask.assistantEntry.error}</p>
          </div>
        ) : selectedImageTask.images?.length ? (
          <div className="dd-image-preview-gallery">
            {renderGeneratedImageCards(selectedImageTask.assistantEntry)}
          </div>
        ) : (
          <div className="dd-image-preview-empty">
            <strong>没有可预览的图片</strong>
            <span>该任务未返回图片资源。</span>
          </div>
        )}
      </div>

      {selectedImageTask ? (
        <div className="dd-image-preview-prompt">
          <span>提示词</span>
          <p>{selectedImageTask.prompt}</p>
        </div>
      ) : null}
    </section>
  )

  return (
    <>
      <section className="dd-image-stage" aria-label="AI 图片生成">
        {renderTaskSidebar()}
        <div className="dd-image-workbench__main">
          <header className="dd-image-stage__topbar">
            <div className="dd-image-stage__heading-wrap">
              <button
                type="button"
                className="dd-image-stage__back-btn"
                aria-label="返回"
                onClick={navigateBackToText}
              >
                <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
              </button>
              <div>
                <strong>AI 图片生成</strong>
                <span>参考图、提示词和输出设置集中在一个工作台中。</span>
              </div>
            </div>
            <div className="dd-image-stage__account">
              <span className="dd-image-stage__email">{userEmail}</span>
              <button type="button" onClick={() => { void onLogout() }}>
                退出
              </button>
            </div>
          </header>
          <main className="dd-image-workbench__dashboard">
            <div className="dd-image-workbench__controls">
              {renderImageInputPanel()}
              {renderPromptPanel()}
              {renderOutputSettingsPanel()}
            </div>
            {renderPreviewPanel()}
          </main>
        </div>
      </section>

      {imagePreview
        ? createPortal(
            <div
              className={`dd-image-preview-dialog dd-image-preview-dialog--css-animated${isImagePreviewZoomed ? ' is-zoomed' : ''}${imagePreview.mode === 'panorama' ? ' is-panorama' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-label={imagePreview.mode === 'panorama' ? '360 图片预览' : '图片预览'}
            >
              <button
                type="button"
                className="dd-image-preview-dialog__backdrop"
                aria-label="关闭图片预览"
                onClick={closeImagePreview}
              />
              <div className="dd-image-preview-dialog__panel">
                <div className="dd-image-preview-dialog__titlebar">
                  <span>{imagePreview.alt}</span>
                  <button
                    type="button"
                    className="dd-image-preview-dialog__close"
                    aria-label="关闭图片预览"
                    onClick={closeImagePreview}
                  >
                    ×
                  </button>
                </div>
                <div className="dd-image-preview-dialog__body">
                  {imagePreview.mode === 'panorama' ? (
                    <PanoramaViewer src={imagePreview.src} alt={imagePreview.alt} />
                  ) : (
                    <button
                      type="button"
                      className="dd-image-preview-dialog__image-button"
                      aria-label={isImagePreviewZoomed ? '缩小图片' : '放大图片'}
                      onClick={() => setIsImagePreviewZoomed((current) => !current)}
                    >
                      <img src={imagePreview.src} alt={imagePreview.alt} />
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
