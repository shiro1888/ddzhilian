import type { CSSProperties } from 'react'
import type { Cell, Worksheet } from 'exceljs'

export type ExcelWorkbookPreview = {
  sheets: ExcelSheetPreview[]
}

export type ExcelSheetPreview = {
  id: string
  name: string
  columns: ExcelColumnPreview[]
  rows: ExcelRowPreview[]
  truncatedRows: boolean
  truncatedColumns: boolean
}

export type ExcelColumnPreview = {
  index: number
  width: number
}

export type ExcelRowPreview = {
  index: number
  height?: number
  cells: ExcelCellPreview[]
}

export type ExcelCellPreview = {
  key: string
  text: string
  title?: string
  colSpan: number
  rowSpan: number
  style: CSSProperties
}

export type ExcelMergeRange = {
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
}

export const excelPreviewMaxRows = 200
export const excelPreviewMaxColumns = 60

export function buildExcelWorkbookPreview(worksheets: Worksheet[]): ExcelWorkbookPreview {
  return {
    sheets: worksheets
      .filter((worksheet) => worksheet.state !== 'veryHidden')
      .map((worksheet, index) => buildExcelSheetPreview(worksheet, index)),
  }
}

export function buildExcelSheetPreview(worksheet: Worksheet, index: number): ExcelSheetPreview {
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

export function getExcelColumnWidth(width: number | undefined) {
  if (!width || width <= 0) {
    return 92
  }

  return Math.max(42, Math.min(280, Math.round(width * 7 + 14)))
}

export function getExcelCellText(cell: Cell) {
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

export function getExcelCellStyle(cell: Cell): CSSProperties {
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

export function getExcelHorizontalAlignment(value: string): CSSProperties['textAlign'] {
  if (value === 'center' || value === 'centerContinuous') {
    return 'center'
  }

  if (value === 'right') {
    return 'right'
  }

  return 'left'
}

export function getExcelVerticalAlignment(value: string): CSSProperties['verticalAlign'] {
  if (value === 'middle') {
    return 'middle'
  }

  if (value === 'bottom') {
    return 'bottom'
  }

  return 'top'
}

export function excelColorToCss(color: { argb?: string; rgb?: string; theme?: number } | undefined) {
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

export function excelBorderToCss(border: { style?: string; color?: { argb?: string; rgb?: string } }) {
  const width = border.style && ['medium', 'thick', 'double'].includes(border.style) ? 2 : 1
  const style = border.style?.includes('dash') ? 'dashed' : border.style === 'dotted' ? 'dotted' : 'solid'
  const color = excelColorToCss(border.color) ?? '#d9d9d9'

  return `${width.toString()}px ${style} ${color}`
}

export function getExcelMergeRanges(worksheet: Worksheet) {
  const modelWithMerges = worksheet.model as { merges?: string[] }
  return (modelWithMerges.merges ?? [])
    .map(parseExcelMergeRange)
    .filter((range): range is ExcelMergeRange => Boolean(range))
}

export function parseExcelMergeRange(range: string): ExcelMergeRange | null {
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

export function parseExcelCellReference(reference: string | undefined) {
  const match = /^([A-Z]+)(\d+)$/i.exec(reference ?? '')
  if (!match) {
    return null
  }

  return {
    column: excelColumnLettersToNumber(match[1]),
    row: Number.parseInt(match[2], 10),
  }
}

export function excelColumnLettersToNumber(letters: string) {
  return letters.toUpperCase().split('').reduce((total, letter) => (
    total * 26 + letter.charCodeAt(0) - 64
  ), 0)
}

export function isCoveredByMerge(row: number, column: number, merges: ExcelMergeRange[]) {
  return merges.some((merge) => (
    row >= merge.startRow &&
    row <= merge.endRow &&
    column >= merge.startColumn &&
    column <= merge.endColumn &&
    !(row === merge.startRow && column === merge.startColumn)
  ))
}

export function getMergeStart(row: number, column: number, merges: ExcelMergeRange[]) {
  return merges.find((merge) => merge.startRow === row && merge.startColumn === column)
}
