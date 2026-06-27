import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import type { Cell, Worksheet } from 'exceljs'
import type {
  DocumentPreviewKind,
  DocumentPreviewPayload,
  DocumentPreviewSource,
} from '../../lib/document-preview'
import { getDocumentPreviewKindLabel } from '../../lib/document-preview'
import { openHtmlDocumentFullscreenPreview, renderMarkdownDocumentHtml } from '../utils'

export type DocumentPreviewDialogState =
  | {
      status: 'loading'
      kind: DocumentPreviewKind
      fileName: string
      mimeType?: string
    }
  | {
      status: 'ready'
      payload: DocumentPreviewPayload
    }
  | {
      status: 'failed'
      kind: DocumentPreviewKind
      fileName: string
      errorMessage: string
    }

type DocumentPreviewDialogProps = {
  preview: DocumentPreviewDialogState
  onClose: () => void
}

type ExcelWorkbookPreview = {
  sheets: ExcelSheetPreview[]
}

type ExcelSheetPreview = {
  id: string
  name: string
  columns: ExcelColumnPreview[]
  rows: ExcelRowPreview[]
  truncatedRows: boolean
  truncatedColumns: boolean
}

type ExcelColumnPreview = {
  index: number
  width: number
}

type ExcelRowPreview = {
  index: number
  height?: number
  cells: ExcelCellPreview[]
}

type ExcelCellPreview = {
  key: string
  text: string
  title?: string
  colSpan: number
  rowSpan: number
  style: CSSProperties
}

type ExcelMergeRange = {
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
}

const excelPreviewMaxRows = 200
const excelPreviewMaxColumns = 60
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
}) {
  if (!isMobileViewport || availableWidth <= 0 || pageWidth <= 0 || pageWidth <= availableWidth) {
    return {
      scale: 1,
      height: null,
    }
  }

  const scale = availableWidth / pageWidth
  return {
    scale,
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

function usePreviewObjectUrl(
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

function useDocumentDownloadUrl(preview: DocumentPreviewDialogState) {
  const directUrl =
    preview.status === 'ready'
      ? preview.payload.downloadUrl ?? (
          typeof preview.payload.source === 'string' ? preview.payload.source : null
        )
      : null
  const objectUrl = usePreviewObjectUrl(
    preview.status === 'ready' ? preview.payload.source : undefined,
    preview.status === 'ready' ? preview.payload.mimeType : undefined,
    preview.status === 'ready' && !directUrl,
  )

  return directUrl ?? objectUrl
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
  const [layout, setLayout] = useState<{ scale: number; height: number | null }>({
    scale: 1,
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
      const pageWidth = firstPage?.offsetWidth ?? body.scrollWidth
      const nextLayout = resolveDocxPreviewLayout({
        isMobileViewport: window.innerWidth <= mobileDocumentPreviewBreakpointPx,
        availableWidth: shell.clientWidth,
        pageWidth,
        contentHeight: body.scrollHeight,
      })

      setLayout((currentLayout) => (
        currentLayout.scale === nextLayout.scale && currentLayout.height === nextLayout.height
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
  const shellStyle = layout.height
    ? {
        minHeight: `${layout.height.toString()}px`,
      }
    : undefined

  return (
    <div className="dd-document-preview__docx">
      <div ref={styleRef} className="dd-document-preview__style-host" />
      {status === 'loading' ? <div className="dd-document-preview__loading">正在解析 Word 文档</div> : null}
      {status === 'failed' ? (
        <div className="dd-document-preview__error" role="alert">{errorMessage}</div>
      ) : null}
      <div ref={shellRef} className="dd-document-preview__docx-shell" style={shellStyle}>
        <div ref={bodyRef} className="dd-document-preview__docx-body" style={bodyStyle} />
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
  if (!navigator.clipboard) {
    throw new Error('当前浏览器不支持剪贴板写入。')
  }

  await navigator.clipboard.writeText(value)
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

function DocumentPreviewBody({ payload }: { payload: DocumentPreviewPayload }) {
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

export function DocumentPreviewDialog({ preview, onClose }: DocumentPreviewDialogProps) {
  const readyPayload = preview.status === 'ready' ? preview.payload : null
  const downloadUrl = useDocumentDownloadUrl(preview)
  const kind = preview.status === 'ready' ? preview.payload.kind : preview.kind
  const fileName = preview.status === 'ready' ? preview.payload.fileName : preview.fileName
  const downloadName = readyPayload?.downloadName ?? fileName
  const kindLabel = getDocumentPreviewKindLabel(kind)
  const dialogTitle = `${kindLabel} 预览`

  return (
    <div className="dd-document-preview-dialog" role="dialog" aria-modal="true" aria-label={dialogTitle}>
      <button
        type="button"
        className="dd-document-preview-dialog__backdrop"
        aria-label="关闭文档预览"
        onClick={onClose}
      />
      <div className="dd-document-preview-dialog__panel">
        <div className="dd-document-preview-dialog__titlebar">
          <span title={fileName}>{fileName}</span>
          <div className="dd-document-preview-dialog__actions">
            {downloadUrl ? (
              <a href={downloadUrl} download={downloadName}>
                下载
              </a>
            ) : null}
            <button
              type="button"
              className="dd-document-preview-dialog__close"
              aria-label="关闭文档预览"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>
        <div className="dd-document-preview-dialog__body">
          {preview.status === 'loading' ? (
            <div className="dd-document-preview__loading">正在载入 {kindLabel} 文档</div>
          ) : null}
          {preview.status === 'failed' ? (
            <div className="dd-document-preview__error" role="alert">{preview.errorMessage}</div>
          ) : null}
          {readyPayload ? <DocumentPreviewBody payload={readyPayload} /> : null}
        </div>
      </div>
    </div>
  )
}

function buildExcelWorkbookPreview(worksheets: Worksheet[]): ExcelWorkbookPreview {
  return {
    sheets: worksheets
      .filter((worksheet) => worksheet.state !== 'veryHidden')
      .map((worksheet, index) => buildExcelSheetPreview(worksheet, index)),
  }
}

function buildExcelSheetPreview(worksheet: Worksheet, index: number): ExcelSheetPreview {
  const rowCount = Math.min(Math.max(worksheet.actualRowCount || worksheet.rowCount || 1, 1), excelPreviewMaxRows)
  const columnCount = Math.min(
    Math.max(worksheet.actualColumnCount || worksheet.columnCount || 1, 1),
    excelPreviewMaxColumns,
  )
  const merges = getExcelMergeRanges(worksheet)
  const columns = Array.from({ length: columnCount }, (_, columnIndex) => {
    const column = worksheet.getColumn(columnIndex + 1)
    return {
      index: columnIndex + 1,
      width: getExcelColumnWidth(column.width),
    }
  })
  const rows: ExcelRowPreview[] = []

  for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex)
    const cells: ExcelCellPreview[] = []

    for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
      if (isCoveredByMerge(rowIndex, columnIndex, merges)) {
        continue
      }

      const cell = row.getCell(columnIndex)
      const merge = getMergeStart(rowIndex, columnIndex, merges)
      const text = getExcelCellText(cell)
      cells.push({
        key: `${rowIndex.toString()}-${columnIndex.toString()}`,
        text,
        title: text || undefined,
        colSpan: merge ? Math.min(merge.endColumn, columnCount) - columnIndex + 1 : 1,
        rowSpan: merge ? Math.min(merge.endRow, rowCount) - rowIndex + 1 : 1,
        style: getExcelCellStyle(cell),
      })
    }

    rows.push({
      index: rowIndex,
      height: row.height ? Math.max(18, Math.round(row.height * 1.35)) : undefined,
      cells,
    })
  }

  return {
    id: `${worksheet.id.toString()}-${index.toString()}`,
    name: worksheet.name || `Sheet ${String(index + 1)}`,
    columns,
    rows,
    truncatedRows: worksheet.rowCount > excelPreviewMaxRows,
    truncatedColumns: worksheet.columnCount > excelPreviewMaxColumns,
  }
}

function getExcelColumnWidth(width: number | undefined) {
  if (!width || width <= 0) {
    return 92
  }

  return Math.max(42, Math.min(280, Math.round(width * 7 + 14)))
}

function getExcelCellText(cell: Cell) {
  const text = cell.text
  if (text) {
    return text
  }

  const value = cell.value
  if (value === null || value === undefined) {
    return ''
  }

  if (value instanceof Date) {
    return value.toLocaleString()
  }

  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined && value.result !== null) {
      return String(value.result)
    }

    if ('text' in value && typeof value.text === 'string') {
      return value.text
    }

    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((item: { text?: unknown }) => typeof item.text === 'string' ? item.text : '')
        .join('')
    }
  }

  return String(value)
}

function getExcelCellStyle(cell: Cell): CSSProperties {
  const style: CSSProperties = {}
  const font = cell.font
  const alignment = cell.alignment
  const fill = cell.fill
  const border = cell.border

  if (font?.bold) {
    style.fontWeight = 700
  }
  if (font?.italic) {
    style.fontStyle = 'italic'
  }
  if (font?.underline) {
    style.textDecoration = 'underline'
  }
  if (font?.size) {
    style.fontSize = `${Math.max(10, Math.min(24, font.size)).toString()}px`
  }
  if (font?.color) {
    style.color = excelColorToCss(font.color) ?? undefined
  }

  if (alignment?.horizontal) {
    style.textAlign = getExcelHorizontalAlignment(alignment.horizontal)
  }
  if (alignment?.vertical) {
    style.verticalAlign = getExcelVerticalAlignment(alignment.vertical)
  }
  if (alignment?.wrapText) {
    style.whiteSpace = 'pre-wrap'
  }

  if (fill?.type === 'pattern' && 'fgColor' in fill) {
    const backgroundColor = excelColorToCss(fill.fgColor)
    if (backgroundColor) {
      style.backgroundColor = backgroundColor
    }
  }

  if (border?.top) {
    style.borderTop = excelBorderToCss(border.top)
  }
  if (border?.right) {
    style.borderRight = excelBorderToCss(border.right)
  }
  if (border?.bottom) {
    style.borderBottom = excelBorderToCss(border.bottom)
  }
  if (border?.left) {
    style.borderLeft = excelBorderToCss(border.left)
  }

  return style
}

function getExcelHorizontalAlignment(value: string): CSSProperties['textAlign'] {
  if (value === 'center' || value === 'centerContinuous') {
    return 'center'
  }

  if (value === 'right') {
    return 'right'
  }

  return 'left'
}

function getExcelVerticalAlignment(value: string): CSSProperties['verticalAlign'] {
  if (value === 'middle') {
    return 'middle'
  }

  if (value === 'bottom') {
    return 'bottom'
  }

  return 'top'
}

function excelColorToCss(color: { argb?: string; rgb?: string; theme?: number } | undefined) {
  const rawColor = color?.argb ?? color?.rgb
  if (!rawColor) {
    return null
  }

  const normalizedColor = rawColor.replace(/^#/, '').trim()
  if (!/^[0-9a-f]{6,8}$/i.test(normalizedColor)) {
    return null
  }

  return `#${normalizedColor.slice(-6)}`
}

function excelBorderToCss(border: { style?: string; color?: { argb?: string; rgb?: string } }) {
  const width = border.style && ['medium', 'thick', 'double'].includes(border.style) ? 2 : 1
  const style = border.style?.includes('dash') ? 'dashed' : border.style === 'dotted' ? 'dotted' : 'solid'
  const color = excelColorToCss(border.color) ?? '#d9d9d9'

  return `${width.toString()}px ${style} ${color}`
}

function getExcelMergeRanges(worksheet: Worksheet) {
  const modelWithMerges = worksheet.model as { merges?: string[] }
  return (modelWithMerges.merges ?? [])
    .map(parseExcelMergeRange)
    .filter((range): range is ExcelMergeRange => Boolean(range))
}

function parseExcelMergeRange(range: string): ExcelMergeRange | null {
  const [start, end] = range.split(':')
  const startCell = parseExcelCellReference(start)
  const endCell = parseExcelCellReference(end)
  if (!startCell || !endCell) {
    return null
  }

  return {
    startRow: Math.min(startCell.row, endCell.row),
    startColumn: Math.min(startCell.column, endCell.column),
    endRow: Math.max(startCell.row, endCell.row),
    endColumn: Math.max(startCell.column, endCell.column),
  }
}

function parseExcelCellReference(reference: string | undefined) {
  const match = /^([A-Z]+)(\d+)$/i.exec(reference ?? '')
  if (!match) {
    return null
  }

  return {
    column: excelColumnLettersToNumber(match[1]),
    row: Number.parseInt(match[2], 10),
  }
}

function excelColumnLettersToNumber(letters: string) {
  return letters.toUpperCase().split('').reduce((total, letter) => (
    total * 26 + letter.charCodeAt(0) - 64
  ), 0)
}

function isCoveredByMerge(row: number, column: number, merges: ExcelMergeRange[]) {
  return merges.some((merge) => (
    row >= merge.startRow &&
    row <= merge.endRow &&
    column >= merge.startColumn &&
    column <= merge.endColumn &&
    !(row === merge.startRow && column === merge.startColumn)
  ))
}

function getMergeStart(row: number, column: number, merges: ExcelMergeRange[]) {
  return merges.find((merge) => merge.startRow === row && merge.startColumn === column)
}
