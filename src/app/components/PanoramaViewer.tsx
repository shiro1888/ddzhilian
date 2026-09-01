import { useEffect, useRef, useState } from 'react'
import type { BufferGeometry, Material, Texture, WebGLRenderer } from 'three'

type PanoramaViewerProps = {
  src: string
  alt: string
}

export function PanoramaViewer({ src, alt }: PanoramaViewerProps) {
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
    let removeResizeListener: (() => void) | null = null
    let removeInteractionListeners: (() => void) | null = null

    const disposeViewer = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = 0
      }

      removeInteractionListeners?.()
      removeInteractionListeners = null
      removeResizeListener?.()
      removeResizeListener = null
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

        resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resizeViewer) : null
        resizeObserver?.observe(container)
        window.addEventListener('resize', resizeViewer)
        removeResizeListener = () => window.removeEventListener('resize', resizeViewer)

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
