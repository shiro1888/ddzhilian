import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { Config as DomPurifyConfig } from 'dompurify'
import type {
  DocumentPreviewPayload,
  DocumentPreviewSource,
} from '../../lib/document-preview'
import { openHtmlDocumentFullscreenPreview, renderMarkdownDocumentHtml } from '../utils'
import {
  buildExcelWorkbookPreview,
  excelPreviewMaxColumns,
  excelPreviewMaxRows,
} from '../../lib/excel-preview'
import type { ExcelWorkbookPreview } from '../../lib/excel-preview'

type DocxPreviewLayout = {
  scale: number
  width: number | null
  height: number | null
}

const documentPreviewSanitizeConfig = {
  IN_PLACE: true,
  USE_PROFILES: {
    html: true,
    svg: true,
    svgFilters: true,
  },
  FORBID_TAGS: [
    'script',
    'iframe',
    'object',
    'embed',
    'base',
    'link',
    'meta',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'option',
  ],
  FORBID_ATTR: ['srcdoc'],
} satisfies DomPurifyConfig & { IN_PLACE: true }

function removeUnsafeGeneratedDom(container: HTMLElement | null) {
  if (!container) {
    return
  }

  container
    .querySelectorAll('script, iframe, object, embed, base, link, meta')
    .forEach((node) => node.remove())

  container.querySelectorAll<HTMLElement>('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name) || attribute.name.toLowerCase() === 'srcdoc') {
        element.removeAttribute(attribute.name)
      }
    }
  })
}

async function sanitizeGeneratedDocumentPreview(...containers: Array<HTMLElement | null>) {
  if (typeof window === 'undefined') {
    return
  }

  const { default: DOMPurify } = await import('dompurify')
  for (const container of containers) {
    if (!container) {
      continue
    }

    // Third-party document renderers write HTML directly into these containers.
    // Sanitize in-place before the preview is marked ready so received files cannot inject active DOM.
    DOMPurify.sanitize(container, documentPreviewSanitizeConfig)
  }
}

const mobileDocumentPreviewBreakpointPx = 720

export function resolveDocxPreviewLayout({
  isMobileViewport,
  availableWidth,
  pageWidth,
  contentHeight,
}: {
  isMobileViewport: boolean
  availableWidth: number
  pageWidth: number
  contentHeight: number
}): DocxPreviewLayout {
  if (!isMobileViewport || availableWidth <= 0 || pageWidth <= 0 || pageWidth <= availableWidth) {
    return {
      scale: 1,
      width: null,
      height: null,
    }
  }

  const scale = availableWidth / pageWidth
  return {
    scale,
    width: Math.max(1, Math.floor(availableWidth)),
    height: contentHeight > 0 ? Math.ceil(contentHeight * scale) : null,
  }
}

async function readDocumentSourceAsArrayBuffer(source: DocumentPreviewSource) {
  if (source instanceof ArrayBuffer) {
    return source
  }

  if (source instanceof Blob) {
    return source.arrayBuffer()
  }

  const response = await fetch(source)
  if (!response.ok) {
    throw new Error(`文档读取失败，状态码 ${response.status.toString()}。`)
  }

  return response.arrayBuffer()
}

async function readDocumentSourceAsText(source: DocumentPreviewSource) {
  if (typeof source === 'string') {
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`Markdown 文档读取失败，状态码 ${response.status.toString()}。`)
    }

    return response.text()
  }

  if (source instanceof Blob) {
    return source.text()
  }

  return new TextDecoder().decode(source)
}

function createBlobFromPreviewSource(source: DocumentPreviewSource, mimeType?: string) {
  if (source instanceof Blob) {
    return source
  }

  if (source instanceof ArrayBuffer) {
    return new Blob([source], { type: mimeType || 'application/octet-stream' })
  }

  return null
}

export function usePreviewObjectUrl(
  source: DocumentPreviewSource | undefined,
  mimeType: string | undefined,
  enabled: boolean,
) {
  const objectUrl = useMemo(() => {
    if (!enabled || !source) {
      return null
    }

    const blob = createBlobFromPreviewSource(source, mimeType)
    return blob ? URL.createObjectURL(blob) : null
  }, [enabled, mimeType, source])

  useEffect(() => (
    objectUrl
      ? () => {
          URL.revokeObjectURL(objectUrl)
        }
      : undefined
  ), [objectUrl])

  return objectUrl
}

function PdfPreview({
  source,
  mimeType,
  fileName,
}: {
  source: DocumentPreviewSource
  mimeType?: string
  fileName: string
}) {
  const directUrl = typeof source === 'string' ? source : null
  const objectUrl = usePreviewObjectUrl(source, mimeType || 'application/pdf', !directUrl)
  const url = directUrl ?? objectUrl

  if (!url) {
    return <div className="dd-document-preview__loading">正在准备 PDF 预览</div>
  }

  return (
    <iframe
      className="dd-document-preview__pdf"
      title={fileName}
      src={url}
    />
  )
}

function DocxPreview({ source }: { source: DocumentPreviewSource }) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const styleRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [layout, setLayout] = useState<DocxPreviewLayout>({
    scale: 1,
    width: null,
    height: null,
  })

  useEffect(() => {
    let cancelled = false
    const body = bodyRef.current
    const style = styleRef.current
    if (!body || !style) {
      return
    }

    body.innerHTML = ''
    style.innerHTML = ''
    setStatus('loading')
    setErrorMessage(null)

    void (async () => {
      try {
        const { renderAsync } = await import('docx-preview')
        const data = source instanceof Blob ? source : await readDocumentSourceAsArrayBuffer(source)
        if (cancelled) {
          return
        }

        await renderAsync(data, body, style, {
          breakPages: true,
          className: 'dd-document-preview__docx-page',
          inWrapper: false,
          renderAltChunks: false,
          renderComments: false,
          renderEndnotes: true,
          renderFooters: true,
          renderFootnotes: true,
          renderHeaders: true,
        })
        await sanitizeGeneratedDocumentPreview(body)
        removeUnsafeGeneratedDom(style)
        if (!cancelled) {
          setStatus('ready')
        }
      } catch (error) {
        if (!cancelled) {
          setStatus('failed')
          setErrorMessage(error instanceof Error ? error.message : 'Word 文档渲染失败。')
        }
      }
    })()

    return () => {
      cancelled = true
      body.innerHTML = ''
      style.innerHTML = ''
    }
  }, [source])

  useEffect(() => {
    if (status !== 'ready') {
      return
    }

    const shell = shellRef.current
    const body = bodyRef.current
    if (!shell || !body) {
      return
    }

    let animationFrame = 0
    const updateLayout = () => {
      const firstPage = body.querySelector<HTMLElement>('.dd-document-preview__docx-page')
      const pageWidth = Math.max(firstPage?.offsetWidth ?? 0, body.scrollWidth)
      const contentHeight = Math.max(firstPage?.offsetHeight ?? 0, body.scrollHeight)
      const nextLayout = resolveDocxPreviewLayout({
        isMobileViewport: window.innerWidth <= mobileDocumentPreviewBreakpointPx,
        availableWidth: shell.clientWidth,
        pageWidth,
        contentHeight,
      })

      setLayout((currentLayout) => (
        currentLayout.scale === nextLayout.scale &&
          currentLayout.width === nextLayout.width &&
          currentLayout.height === nextLayout.height
          ? currentLayout
          : nextLayout
      ))
    }
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(updateLayout)
    }

    scheduleUpdate()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate)
    observer?.observe(shell)
    observer?.observe(body)
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer?.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [status, source])

  const bodyStyle = layout.scale < 1
    ? {
        transform: `scale(${layout.scale.toString()})`,
      }
    : undefined
  const frameStyle = layout.scale < 1 && layout.width !== null && layout.height !== null
    ? {
        width: `${layout.width.toString()}px`,
        height: `${layout.height.toString()}px`,
      }
    : undefined
  const shouldUseScaledFrame = Boolean(frameStyle)

  return (
    <div className="dd-document-preview__docx">
      <div ref={styleRef} className="dd-document-preview__style-host" />
      {status === 'loading' ? <div className="dd-document-preview__loading">正在解析 Word 文档</div> : null}
      {status === 'failed' ? (
        <div className="dd-document-preview__error" role="alert">{errorMessage}</div>
      ) : null}
      <div ref={shellRef} className="dd-document-preview__docx-shell">
        <div
          className={`dd-document-preview__docx-scale-frame${shouldUseScaledFrame ? ' is-scaled' : ''}`}
          style={frameStyle}
        >
          <div ref={bodyRef} className="dd-document-preview__docx-body" style={bodyStyle} />
        </div>
      </div>
    </div>
  )
}

function ExcelPreview({ source }: { source: DocumentPreviewSource }) {
  const [workbookPreview, setWorkbookPreview] = useState<ExcelWorkbookPreview | null>(null)
  const [activeSheetIndex, setActiveSheetIndex] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setWorkbookPreview(null)
    setActiveSheetIndex(0)
    setStatus('loading')
    setErrorMessage(null)

    void (async () => {
      try {
        const ExcelJS = await import('exceljs')
        const workbook = new ExcelJS.Workbook()
        const buffer = await readDocumentSourceAsArrayBuffer(source)
        await workbook.xlsx.load(buffer)
        if (cancelled) {
          return
        }

        setWorkbookPreview(buildExcelWorkbookPreview(workbook.worksheets))
        setStatus('ready')
      } catch (error) {
        if (!cancelled) {
          setStatus('failed')
          setErrorMessage(error instanceof Error ? error.message : 'Excel 工作簿渲染失败。')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [source])

  const activeSheet = workbookPreview?.sheets[activeSheetIndex] ?? null

  if (status === 'loading') {
    return <div className="dd-document-preview__loading">正在解析 Excel 工作簿</div>
  }

  if (status === 'failed') {
    return <div className="dd-document-preview__error" role="alert">{errorMessage}</div>
  }

  if (!activeSheet || !workbookPreview || workbookPreview.sheets.length === 0) {
    return <div className="dd-document-preview__empty">没有可预览的工作表</div>
  }

  return (
    <div className="dd-document-preview__excel">
      <div className="dd-document-preview__sheet-tabs" role="tablist" aria-label="工作表">
        {workbookPreview.sheets.map((sheet, index) => (
          <button
            key={sheet.id}
            type="button"
            role="tab"
            aria-selected={index === activeSheetIndex}
            className={index === activeSheetIndex ? 'is-active' : ''}
            onClick={() => setActiveSheetIndex(index)}
          >
            {sheet.name}
          </button>
        ))}
      </div>
      {activeSheet.truncatedRows || activeSheet.truncatedColumns ? (
        <div className="dd-document-preview__notice">
          当前预览显示前 {excelPreviewMaxRows.toString()} 行、前 {excelPreviewMaxColumns.toString()} 列。
        </div>
      ) : null}
      <div className="dd-document-preview__excel-grid">
        <table>
          <colgroup>
            {activeSheet.columns.map((column) => (
              <col key={column.index} style={{ width: `${column.width.toString()}px` }} />
            ))}
          </colgroup>
          <tbody>
            {activeSheet.rows.map((row) => (
              <tr key={row.index} style={row.height ? { height: `${row.height.toString()}px` } : undefined}>
                {row.cells.map((cell) => (
                  <td
                    key={cell.key}
                    colSpan={cell.colSpan}
                    rowSpan={cell.rowSpan}
                    title={cell.title}
                    style={cell.style}
                  >
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PptxPreview({ source }: { source: DocumentPreviewSource }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let viewer: { destroy: () => void } | null = null
    const container = containerRef.current
    if (!container) {
      return
    }

    container.innerHTML = ''
    setStatus('loading')
    setErrorMessage(null)

    void (async () => {
      try {
        const buffer = await readDocumentSourceAsArrayBuffer(source)
        const { PptxViewer, RECOMMENDED_ZIP_LIMITS } = await import('@aiden0z/pptx-renderer')
        if (cancelled) {
          return
        }

        viewer = await PptxViewer.open(buffer, container, {
          fitMode: 'contain',
          lazyMedia: true,
          lazySlides: true,
          pdfjs: false,
          zipLimits: RECOMMENDED_ZIP_LIMITS,
          listOptions: {
            windowed: true,
            initialSlides: 4,
            batchSize: 4,
          },
        })
        await sanitizeGeneratedDocumentPreview(container)
        if (!cancelled) {
          setStatus('ready')
        }
      } catch (error) {
        if (!cancelled) {
          setStatus('failed')
          setErrorMessage(error instanceof Error ? error.message : 'PPT 文档渲染失败。')
        }
      }
    })()

    return () => {
      cancelled = true
      viewer?.destroy()
      container.innerHTML = ''
    }
  }, [source])

  return (
    <div className="dd-document-preview__pptx">
      {status === 'loading' ? <div className="dd-document-preview__loading">正在解析 PPT 文档</div> : null}
      {status === 'failed' ? (
        <div className="dd-document-preview__error" role="alert">{errorMessage}</div>
      ) : null}
      <div
        ref={containerRef}
        className={`dd-document-preview__pptx-stage${status === 'ready' ? ' is-ready' : ''}`}
      />
    </div>
  )
}

async function copyDocumentTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall back to the legacy textarea path below for older browsers or denied permissions.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.setAttribute('readonly', '')
  let copied = false
  try {
    document.body.appendChild(textarea)
    textarea.select()
    copied = document.execCommand('copy')
  } finally {
    textarea.remove()
  }

  if (!copied) {
    throw new Error('当前浏览器不支持剪贴板写入。')
  }
}

function markDocumentCodeCopyButton(button: HTMLButtonElement, label: string, className?: string) {
  button.textContent = label
  if (className) {
    button.classList.add(className)
  }

  window.setTimeout(() => {
    button.classList.remove('is-copied')
    button.textContent = '复制'
  }, 1600)
}

function handleRenderedMarkdownClick(event: ReactMouseEvent<HTMLDivElement>) {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }

  const fullscreenButton = target.closest<HTMLElement>('.dd-html-document__fullscreen')
  if (fullscreenButton && event.currentTarget.contains(fullscreenButton)) {
    event.preventDefault()
    event.stopPropagation()
    openHtmlDocumentFullscreenPreview(fullscreenButton)
    return
  }

  const copyButton = target.closest<HTMLButtonElement>('.dd-code-copy')
  if (!copyButton || !event.currentTarget.contains(copyButton)) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  const codeText = copyButton.closest('pre')?.querySelector('code')?.textContent ?? ''
  if (!codeText) {
    return
  }

  void copyDocumentTextToClipboard(codeText).then(
    () => markDocumentCodeCopyButton(copyButton, '已复制', 'is-copied'),
    () => markDocumentCodeCopyButton(copyButton, '复制失败'),
  )
}

type MarkdownPreviewState = {
  source: DocumentPreviewSource
  status: 'loading' | 'ready' | 'failed'
  html: string
  errorMessage: string | null
}

function MarkdownPreview({ source }: { source: DocumentPreviewSource }) {
  const [previewState, setPreviewState] = useState<MarkdownPreviewState>(() => ({
    source,
    status: 'loading',
    html: '',
    errorMessage: null,
  }))

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const text = await readDocumentSourceAsText(source)
        if (cancelled) {
          return
        }

        setPreviewState({
          source,
          status: 'ready',
          html: renderMarkdownDocumentHtml(text),
          errorMessage: null,
        })
      } catch (error) {
        if (!cancelled) {
          setPreviewState({
            source,
            status: 'failed',
            html: '',
            errorMessage: error instanceof Error ? error.message : 'Markdown 文档渲染失败。',
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [source])

  const currentState = previewState.source === source
    ? previewState
    : {
        source,
        status: 'loading' as const,
        html: '',
        errorMessage: null,
      }

  if (currentState.status === 'loading') {
    return <div className="dd-document-preview__loading">正在解析 Markdown 文档</div>
  }

  if (currentState.status === 'failed') {
    return <div className="dd-document-preview__error" role="alert">{currentState.errorMessage}</div>
  }

  if (!currentState.html) {
    return <div className="dd-document-preview__empty">Markdown 文档没有可预览的内容</div>
  }

  return (
    <div
      className="dd-document-preview__markdown"
      onClick={handleRenderedMarkdownClick}
      dangerouslySetInnerHTML={{ __html: currentState.html }}
    />
  )
}

export function DocumentPreviewBody({ payload }: { payload: DocumentPreviewPayload }) {
  if (payload.kind === 'pdf') {
    return (
      <PdfPreview
        source={payload.source}
        mimeType={payload.mimeType}
        fileName={payload.fileName}
      />
    )
  }

  if (payload.kind === 'docx') {
    return <DocxPreview source={payload.source} />
  }

  if (payload.kind === 'excel') {
    return <ExcelPreview source={payload.source} />
  }

  if (payload.kind === 'markdown') {
    return <MarkdownPreview source={payload.source} />
  }

  return <PptxPreview source={payload.source} />
}
