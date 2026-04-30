import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { BufferGeometry, Material, Texture, WebGLRenderer } from 'three'
import type {
  AiImageHistoryCursor,
  AiImageHistoryItem,
  AiImageHistoryPage,
  AiImageHistoryRequestOptions,
  AiImageQuotaStatus,
  AiImageRequestInput,
  AiImageResponse,
  AiImageResult,
} from '../../lib/ddzhilian-types'

type ImageAttachmentPreview = {
  id: string
  name: string
  previewUrl: string
}

type ImageUploadDraft = ImageAttachmentPreview & {
  file: File
}

type ImageThreadEntry =
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
      image?: AiImageResult
      model?: string
      panoramaIntent?: boolean
      error?: string
    }

type ImageAssistantEntry = Extract<ImageThreadEntry, { role: 'assistant' }>
type ImagePreviewMode = 'image' | 'panorama'

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

const imageHistorySkeletonRows = ['recent', 'middle', 'older'] as const
const imageHistoryInitialLimit = 1
const imageHistoryPageSize = 8
const imageUploadMaxFiles = 8
const imageUploadMaxFileBytes = 8 * 1024 * 1024
const acceptedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const imageQuotaExhaustedMessage = '总额度已耗尽。'
const panoramaAspectRatio = 2
const panoramaAspectRatioTolerance = 0.02
const panoramaIntentPatterns = [
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

function createEntryId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function resolveImageSource(image: AiImageResult) {
  if (image.url) {
    return image.url
  }

  if (image.b64Json) {
    return `data:${image.mimeType || 'image/png'};base64,${image.b64Json}`
  }

  return ''
}

function isLandscapePanoramaSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return false
  }

  return width > height && Math.abs(width / height - panoramaAspectRatio) <= panoramaAspectRatioTolerance
}

function hasPanoramaIntentText(values: Array<string | undefined>) {
  return values.some((value) => {
    const normalizedValue = value?.trim()
    if (!normalizedValue) {
      return false
    }

    return panoramaIntentPatterns.some((pattern) => pattern.test(normalizedValue))
  })
}

function resolveImageFileExtension(mimeType: string) {
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

async function createFileFromGeneratedImage(
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

function formatImageTime(value: string) {
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

function formatImageSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return `${Math.max(1, Math.round(bytes / 1024)).toString()} KB`
}

function formatImageQuotaLabel(quota: AiImageQuotaStatus | null, isLoading: boolean) {
  if (quota) {
    return `额度 ${quota.totalRemaining.toString()}`
  }

  return isLoading ? '额度 ...' : '额度 --'
}

function buildImageQuotaTitle(quota: AiImageQuotaStatus | null) {
  if (!quota) {
    return '生图额度加载中'
  }

  return [
    `免费 ${quota.freeRemaining.toString()}/${quota.freeLimit.toString()} 张`,
    `付费 ${quota.paidRemaining.toString()} 张`,
    `免费额度每日 ${quota.resetHour.toString().padStart(2, '0')}:00 刷新`,
  ].join('，')
}

function showImageQuotaExhaustedDialog() {
  window.alert(imageQuotaExhaustedMessage)
}

function historyItemToEntries(item: AiImageHistoryItem): ImageThreadEntry[] {
  const image = item.images[0]
  if (!image) {
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
      image,
      model: item.model,
      panoramaIntent: hasPanoramaIntentText([
        item.prompt,
        item.generationId,
        item.model,
        item.size,
        item.quality,
        image.revisedPrompt,
      ]),
    },
  ]
}

function prependUniqueEntries(
  currentEntries: ImageThreadEntry[],
  previousEntries: ImageThreadEntry[],
) {
  const currentIds = new Set(currentEntries.map((entry) => entry.id))
  return [
    ...previousEntries.filter((entry) => !currentIds.has(entry.id)),
    ...currentEntries,
  ]
}

function ImageHistorySkeleton() {
  return (
    <div className="dd-image-history-skeleton" aria-label="正在加载生图历史" role="status">
      {imageHistorySkeletonRows.map((rowId) => (
        <article key={rowId} className="dd-image-history-skeleton__item">
          <div className="dd-image-history-skeleton__image" />
          <div className="dd-image-history-skeleton__info">
            <span className="is-title" />
            <span />
            <span />
            <span className="is-short" />
          </div>
        </article>
      ))}
    </div>
  )
}

type PanoramaViewerProps = Pick<ImagePreviewState, 'src' | 'alt'>

function PanoramaViewer({ src, alt }: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isDisposed = false
    let renderer: WebGLRenderer | null = null
    let geometry: BufferGeometry | null = null
    let material: Material | null = null
    let texture: Texture | null = null
    let animationFrame = 0
    let canvas: HTMLCanvasElement | null = null
    let resizeObserver: ResizeObserver | null = null
    let removeInteractionListeners: (() => void) | null = null

    const disposeViewer = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = 0
      }

      removeInteractionListeners?.()
      removeInteractionListeners = null
      resizeObserver?.disconnect()
      resizeObserver = null
      texture?.dispose()
      texture = null
      material?.dispose()
      material = null
      geometry?.dispose()
      geometry = null
      renderer?.dispose()
      renderer?.forceContextLoss()
      renderer = null

      if (canvas?.parentElement) {
        canvas.parentElement.removeChild(canvas)
      }
      canvas = null
    }

    setStatus('loading')
    setError(null)

    void (async () => {
      try {
        const container = containerRef.current
        if (!container) {
          return
        }

        const THREE = await import('three')
        if (isDisposed) {
          return
        }

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000)
        const target = new THREE.Vector3()
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.setClearColor(0x111827, 1)
        const viewerCanvas = renderer.domElement
        canvas = viewerCanvas
        viewerCanvas.className = 'dd-panorama-viewer__canvas'
        container.appendChild(viewerCanvas)

        geometry = new THREE.SphereGeometry(500, 64, 40)
        geometry.scale(-1, 1, 1)
        texture = await new Promise<Texture>((resolve, reject) => {
          const loader = new THREE.TextureLoader()
          loader.setCrossOrigin('anonymous')
          loader.load(src, resolve, undefined, reject)
        })

        if (isDisposed) {
          disposeViewer()
          return
        }

        texture.colorSpace = THREE.SRGBColorSpace
        material = new THREE.MeshBasicMaterial({ map: texture })
        scene.add(new THREE.Mesh(geometry, material))

        let longitude = 0
        let latitude = 0
        let targetLongitude = 0
        let targetLatitude = 0
        let isDragging = false
        let dragStartX = 0
        let dragStartY = 0
        let dragStartLongitude = 0
        let dragStartLatitude = 0

        const resizeViewer = () => {
          if (!renderer || !container) {
            return
          }

          const width = Math.max(320, container.clientWidth)
          const height = Math.max(220, container.clientHeight)
          renderer.setSize(width, height, false)
          camera.aspect = width / height
          camera.updateProjectionMatrix()
        }

        const handlePointerDown = (event: PointerEvent) => {
          isDragging = true
          dragStartX = event.clientX
          dragStartY = event.clientY
          dragStartLongitude = targetLongitude
          dragStartLatitude = targetLatitude
          viewerCanvas.setPointerCapture(event.pointerId)
        }

        const handlePointerMove = (event: PointerEvent) => {
          if (!isDragging) {
            return
          }

          targetLongitude = dragStartLongitude - (event.clientX - dragStartX) * 0.12
          targetLatitude = THREE.MathUtils.clamp(
            dragStartLatitude + (event.clientY - dragStartY) * 0.12,
            -85,
            85,
          )
        }

        const handlePointerEnd = (event: PointerEvent) => {
          isDragging = false
          if (viewerCanvas.hasPointerCapture(event.pointerId)) {
            viewerCanvas.releasePointerCapture(event.pointerId)
          }
        }

        const handleWheel = (event: WheelEvent) => {
          event.preventDefault()
          camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * 0.035, 35, 95)
          camera.updateProjectionMatrix()
        }

        viewerCanvas.addEventListener('pointerdown', handlePointerDown)
        viewerCanvas.addEventListener('pointermove', handlePointerMove)
        viewerCanvas.addEventListener('pointerup', handlePointerEnd)
        viewerCanvas.addEventListener('pointercancel', handlePointerEnd)
        viewerCanvas.addEventListener('wheel', handleWheel, { passive: false })
        removeInteractionListeners = () => {
          viewerCanvas.removeEventListener('pointerdown', handlePointerDown)
          viewerCanvas.removeEventListener('pointermove', handlePointerMove)
          viewerCanvas.removeEventListener('pointerup', handlePointerEnd)
          viewerCanvas.removeEventListener('pointercancel', handlePointerEnd)
          viewerCanvas.removeEventListener('wheel', handleWheel)
        }

        resizeObserver = new ResizeObserver(resizeViewer)
        resizeObserver.observe(container)

        const renderFrame = () => {
          if (!renderer || isDisposed) {
            return
          }

          if (!isDragging) {
            targetLongitude += 0.018
          }

          longitude += (targetLongitude - longitude) * 0.12
          latitude += (targetLatitude - latitude) * 0.12
          latitude = THREE.MathUtils.clamp(latitude, -85, 85)

          const phi = THREE.MathUtils.degToRad(90 - latitude)
          const theta = THREE.MathUtils.degToRad(longitude)
          target.set(
            500 * Math.sin(phi) * Math.cos(theta),
            500 * Math.cos(phi),
            500 * Math.sin(phi) * Math.sin(theta),
          )
          camera.lookAt(target)
          renderer.render(scene, camera)
          animationFrame = window.requestAnimationFrame(renderFrame)
        }

        resizeViewer()
        setStatus('ready')
        renderFrame()
      } catch (viewerError) {
        if (!isDisposed) {
          setStatus('failed')
          setError(viewerError instanceof Error ? viewerError.message : '360 图片加载失败。')
        }
        disposeViewer()
      }
    })()

    return () => {
      isDisposed = true
      disposeViewer()
    }
  }, [src])

  return (
    <div
      ref={containerRef}
      className={`dd-panorama-viewer is-${status}`}
      role="img"
      aria-label={`360 全景查看：${alt}`}
    >
      {status === 'loading' ? (
        <div className="dd-panorama-viewer__status" role="status" aria-live="polite">
          <span aria-hidden="true" />
          <p>加载 360 图片...</p>
        </div>
      ) : null}
      {status === 'failed' ? (
        <div className="dd-panorama-viewer__status is-error">
          <strong>360 图片加载失败</strong>
          <p>{error}</p>
        </div>
      ) : null}
    </div>
  )
}

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
  const [entries, setEntries] = useState<ImageThreadEntry[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
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
  const previewUrlsRef = useRef<Set<string>>(new Set())
  const olderHistoryLoadingRef = useRef(false)
  const pendingScrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)
  const hasEntries = entries.length > 0
  const isLoadingHistory = isLoadingInitialHistory || isLoadingOlderHistory
  const canSubmit = isReady && !isGenerating && draft.trim().length > 0
  const isImageQuotaExhausted = imageQuota ? imageQuota.remaining <= 0 : false
  const latestImageEntryId = entries
    .slice()
    .reverse()
    .find((entry) => entry.role === 'assistant' && entry.status === 'complete' && entry.image)
    ?.id

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
    setIsImageQuotaLoading(true)

    void onGetImageQuota()
      .then((quota) => {
        if (!isCancelled) {
          setImageQuota(quota)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!isCancelled) {
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

  const refreshImageQuota = async () => {
    setIsImageQuotaLoading(true)

    try {
      const quota = await onGetImageQuota()
      setImageQuota(quota)
      setIsImageQuotaLoading(false)
      return quota
    } catch {
      setIsImageQuotaLoading(false)
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

  const prepareGeneratedImageEdit = async (entry: ImageAssistantEntry) => {
    if (entry.status !== 'complete' || !entry.image || editingImageEntryId) {
      return
    }

    setComposerError(null)
    if (selectedImages.length >= imageUploadMaxFiles) {
      setComposerError(`最多一次上传 ${imageUploadMaxFiles.toString()} 张图片。`)
      return
    }

    setEditingImageEntryId(entry.id)
    try {
      const file = await createFileFromGeneratedImage(entry.image, entry.generationId)
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
    const prompt = draft.trim()

    if (!prompt || !isReady || isGenerating) {
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
    setIsGenerating(true)

    try {
      const result = await onGenerateImage({
        prompt,
        images: imageFiles.length > 0 ? imageFiles : undefined,
      })
      const image = result.images[0]

      if (result.quota) {
        setImageQuota(result.quota)
        setIsImageQuotaLoading(false)
      } else {
        void refreshImageQuota()
      }

      setEntries((current) =>
        current.map((entry) =>
          entry.id === assistantEntryId && entry.role === 'assistant'
            ? {
                ...entry,
                status: 'complete',
                generationId: result.historyItem?.generationId,
                image,
                model: result.model,
                createdAt: result.createdAt,
                panoramaIntent: hasPanoramaIntentText([
                  prompt,
                  result.historyItem?.generationId,
                  result.model,
                  result.historyItem?.size,
                  result.historyItem?.quality,
                  image?.revisedPrompt,
                ]),
              }
            : entry,
        ),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片生成失败。'
      if (message === imageQuotaExhaustedMessage) {
        showImageQuotaExhaustedDialog()
        void refreshImageQuota()
      }

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
      setIsGenerating(false)
    }
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      void submitPrompt()
    }
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

  const renderComposer = (placement: 'empty' | 'thread') => (
    <form className={`dd-image-composer is-${placement}`} onSubmit={submitPrompt}>
      {selectedImages.length > 0
        ? renderAttachmentStrip(selectedImages, { removable: !isGenerating })
        : null}
      <div className="dd-image-composer__box">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          disabled={!isReady || isGenerating || Boolean(editingImageEntryId)}
          onChange={handleImageInputChange}
        />
        <button
          type="button"
          className="dd-image-composer__attach"
          disabled={
            !isReady ||
            isGenerating ||
            Boolean(editingImageEntryId) ||
            selectedImages.length >= imageUploadMaxFiles
          }
          aria-label="上传图片"
          title="上传图片"
          onClick={() => fileInputRef.current?.click()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z" />
            <path d="m8 15 2.4-2.4a1.4 1.4 0 0 1 2 0L16 16" />
            <path d="m14 14 1-1a1.4 1.4 0 0 1 2 0L20 16" />
            <path d="M8.5 8.5h.01" />
          </svg>
        </button>
        <textarea
          ref={composerTextAreaRef}
          value={draft}
          rows={1}
          placeholder={isReady ? '描述或编辑图片' : '正在连接服务'}
          disabled={!isReady || isGenerating}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
        />
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
        </button>
      </div>
      {composerError ? <p className="dd-image-composer__error">{composerError}</p> : null}
    </form>
  )

  const renderGeneratedImageCard = (entry: ImageAssistantEntry) => {
    if (entry.status !== 'complete' || !entry.image) {
      return null
    }

    const generatedImage = entry.image
    const imageSrc = resolveImageSource(generatedImage)
    if (!imageSrc) {
      return null
    }

    const isLatestImage = entry.id === latestImageEntryId
    const isPreparingThisImageEdit = editingImageEntryId === entry.id
    const hasPanoramaIntent =
      entry.panoramaIntent === true ||
      hasPanoramaIntentText([
        entry.prompt,
        entry.generationId,
        entry.model,
        generatedImage.revisedPrompt,
      ])
    const canViewAsPanorama =
      hasPanoramaIntent && panoramaEligibleEntryIds[entry.id] === true

    return (
      <figure className="dd-image-card">
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
                updatePanoramaEligibility(entry.id, event.currentTarget)
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
              disabled={isGenerating || Boolean(editingImageEntryId)}
              onClick={() => {
                void prepareGeneratedImageEdit(entry)
              }}
            >
              <span>{isPreparingThisImageEdit ? '准备中' : '编辑'}</span>
            </button>
          </div>
        </div>
        <figcaption>
          <span>{entry.model || 'gpt-image-2'} · {formatImageTime(entry.createdAt)}</span>
          <a href={imageSrc} download="gpt-image-2.png">
            下载
          </a>
        </figcaption>
      </figure>
    )
  }

  return (
    <>
      <section className="dd-image-stage" aria-label="AI 图片生成">
        <header className="dd-image-stage__topbar">
          <strong>ddzhilian</strong>
          <div className="dd-image-stage__account">
            <span className="dd-image-stage__email">{userEmail}</span>
            <span
              className={`dd-image-stage__quota${isImageQuotaExhausted ? ' is-empty' : ''}`}
              title={buildImageQuotaTitle(imageQuota)}
            >
              {formatImageQuotaLabel(imageQuota, isImageQuotaLoading)}
            </span>
            <button type="button" onClick={() => { void onLogout() }}>
              退出
            </button>
          </div>
        </header>

        <div
          ref={threadRef}
          className={`dd-image-stage__thread${hasEntries || isLoadingHistory ? '' : ' is-empty'}`}
          onScroll={handleThreadScroll}
        >
          {isLoadingHistory && !hasEntries ? (
            <ImageHistorySkeleton />
          ) : !hasEntries ? (
            <div className="dd-image-stage__empty">
              <div className="dd-image-stage__mark" aria-hidden="true" />
              <h2>想生成什么图片？</h2>
              {historyError ? <p className="dd-error-note">{historyError}</p> : null}
              {renderComposer('empty')}
              <section className="dd-image-examples" aria-label="示例图">
                <div className="dd-image-examples__head">
                  <h3>浏览灵感</h3>
                </div>
                <div className="dd-image-examples__grid">
                  {imageExamples.map((example) => (
                    <button
                      key={example.label}
                      type="button"
                      className="dd-image-example-card"
                      onClick={() => setDraft(example.prompt)}
                    >
                      <span className={`dd-image-example-card__visual is-${example.variant}`} aria-hidden="true">
                        <span className="dd-image-example-card__badge">示例</span>
                        <span className="dd-image-example-card__shape" />
                        <span className="dd-image-example-card__lines" />
                      </span>
                      <span className="dd-image-example-card__label">{example.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="dd-image-stage__messages">
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
              {entries.map((entry) =>
                entry.role === 'user' ? (
                  <article key={entry.id} className="dd-image-message is-user">
                    <div className="dd-image-message__bubble">
                      {entry.attachments ? renderAttachmentStrip(entry.attachments) : null}
                      <p>{entry.prompt}</p>
                    </div>
                  </article>
                ) : (
                  <article key={entry.id} className="dd-image-message is-assistant">
                    <div className="dd-image-message__avatar" aria-hidden="true">
                      AI
                    </div>
                    <div className="dd-image-message__body">
                      {entry.status === 'loading' ? (
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
                      ) : null}

                      {entry.status === 'failed' ? (
                        <div className="dd-image-card is-error">
                          <strong>生成失败</strong>
                          <p>{entry.error}</p>
                        </div>
                      ) : null}

                      {renderGeneratedImageCard(entry)}
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
        </div>

        {hasEntries ? renderComposer('thread') : null}
      </section>

      {imagePreview
        ? createPortal(
            <div
              className={`dd-image-preview-dialog${isImagePreviewZoomed ? ' is-zoomed' : ''}${imagePreview.mode === 'panorama' ? ' is-panorama' : ''}`}
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
