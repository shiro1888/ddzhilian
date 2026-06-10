'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'

type MatrixCell = {
  index: number
  row: number
  col: number
}

type MatrixDotStyle = CSSProperties & {
  '--matrix-delay': string
  '--matrix-duration': string
  '--matrix-idle-opacity': string
  '--matrix-peak-scale': string
}

const MATRIX_SIZE = 5
const MATRIX_VARIANT_COUNT = 20
const MATRIX_CENTER = Math.floor(MATRIX_SIZE / 2)

const matrixCells = Array.from({ length: MATRIX_SIZE * MATRIX_SIZE }, (_, index) => ({
  index,
  row: Math.floor(index / MATRIX_SIZE),
  col: index % MATRIX_SIZE,
}))

const perimeterPath = [
  cellIndex(0, 0),
  cellIndex(0, 1),
  cellIndex(0, 2),
  cellIndex(0, 3),
  cellIndex(0, 4),
  cellIndex(1, 4),
  cellIndex(2, 4),
  cellIndex(3, 4),
  cellIndex(4, 4),
  cellIndex(4, 3),
  cellIndex(4, 2),
  cellIndex(4, 1),
  cellIndex(4, 0),
  cellIndex(3, 0),
  cellIndex(2, 0),
  cellIndex(1, 0),
]

const middleRingPath = [
  cellIndex(1, 1),
  cellIndex(1, 2),
  cellIndex(1, 3),
  cellIndex(2, 3),
  cellIndex(3, 3),
  cellIndex(3, 2),
  cellIndex(3, 1),
  cellIndex(2, 1),
]

const rowSnakePath = buildRowSnakePath()
const columnSnakePath = buildColumnSnakePath()
const diagonalSnakePath = buildDiagonalSnakePath()
const spiralPath = [
  ...perimeterPath,
  ...middleRingPath,
  cellIndex(MATRIX_CENTER, MATRIX_CENTER),
]

export function TextThinkingMatrixLoader() {
  const [variant] = useState(() => Math.floor(Math.random() * MATRIX_VARIANT_COUNT) + 1)

  return (
    <span
      className={`dd-snaplink__matrix-loader is-square-${variant.toString()}`}
      aria-hidden="true"
      data-matrix-variant={variant}
    >
      {matrixCells.map((cell) => (
        <span
          key={cell.index.toString()}
          className="dd-snaplink__matrix-dot"
          style={resolveMatrixDotStyle(variant, cell)}
        />
      ))}
    </span>
  )
}

function resolveMatrixDotStyle(variant: number, cell: MatrixCell): MatrixDotStyle {
  const { index, row, col } = cell
  const manhattan = Math.abs(row - MATRIX_CENTER) + Math.abs(col - MATRIX_CENTER)
  const chebyshev = Math.max(Math.abs(row - MATRIX_CENTER), Math.abs(col - MATRIX_CENTER))
  const diagonal = row + col
  const antiDiagonal = row + (MATRIX_SIZE - 1 - col)
  const outerOrder = pathOrder(perimeterPath, index)
  const middleOrder = pathOrder(middleRingPath, index)
  const spiralOrder = pathOrder(spiralPath, index)
  const rowSnakeOrder = pathOrder(rowSnakePath, index)
  const columnSnakeOrder = pathOrder(columnSnakePath, index)
  const diagonalSnakeOrder = pathOrder(diagonalSnakePath, index)
  const angle = Math.atan2(row - MATRIX_CENTER, col - MATRIX_CENTER)

  let delay = index * 36
  let duration = 1320
  let idleOpacity = 0.1
  let peakScale = 1.08

  switch (variant) {
    case 1:
      delay = antiDiagonal * 92 + (diagonal % 2) * 170
      duration = 1320
      idleOpacity = 0.14
      break
    case 2:
      delay = rowSnakeOrder * 42
      duration = 1540
      peakScale = 1.1
      break
    case 3:
      delay = spiralOrder * 46
      duration = 1560
      peakScale = 1.12
      break
    case 4:
      delay = outerOrder < perimeterPath.length
        ? outerOrder * 62
        : 520 + (middleRingPath.length - middleOrder) * 64
      duration = 1640
      idleOpacity = index === cellIndex(MATRIX_CENTER, MATRIX_CENTER) ? 0.06 : 0.12
      peakScale = 1.14
      break
    case 5:
      delay = diagonalSnakeOrder * 48
      duration = 1480
      break
    case 6:
      delay = columnSnakeOrder * 44
      duration = 1420
      peakScale = 1.16
      break
    case 7:
      delay = Math.abs(row - MATRIX_CENTER) * 150 + Math.abs(col - MATRIX_CENTER) * 52
      duration = 1260
      idleOpacity = chebyshev === 2 ? 0.14 : 0.08
      break
    case 8:
      delay = col * 74 + (MATRIX_SIZE - 1 - row) * 58
      duration = 1360
      peakScale = 1.18
      break
    case 9:
      delay = ((row + col) % 2) * 240 + row * 44 + col * 18
      duration = 1120
      idleOpacity = (row + col) % 2 === 0 ? 0.16 : 0.08
      break
    case 10:
      delay = row * 128 + Math.round(Math.sin(col * 1.72) * 26)
      duration = 1180
      peakScale = 1.1
      break
    case 11:
      delay = manhattan * 96 + (row === MATRIX_CENTER && col === MATRIX_CENTER ? 0 : 40)
      duration = 1320
      idleOpacity = 0.09
      peakScale = 1.2
      break
    case 12:
      delay = (Math.abs(row - 1) + Math.abs(col - 1)) * 88 + (row + col) * 12
      duration = 1360
      peakScale = 1.14
      break
    case 13:
      delay = ((index * 7) % (MATRIX_SIZE * MATRIX_SIZE)) * 38
      duration = 1180
      idleOpacity = (row + col) % 2 === 0 ? 0.16 : 0.08
      peakScale = 1.06
      break
    case 14:
      delay = chebyshev * 136 + (index === cellIndex(MATRIX_CENTER, MATRIX_CENTER) ? 0 : 84)
      duration = 1460
      idleOpacity = chebyshev === 0 ? 0.18 : 0.08
      peakScale = 1.18
      break
    case 15:
      delay = row * 106 + Math.abs(col - (row % 2 === 0 ? 1 : 3)) * 68
      duration = 1500
      peakScale = 1.12
      break
    case 16:
      delay = row * 96 + Math.abs(col - MATRIX_CENTER) * 66 + ((row + col) % 2) * 82
      duration = 1460
      peakScale = 1.1
      break
    case 17:
      delay = row * 108 + Math.round((Math.sin(row * 1.24) + 1) * 78) + col * 26
      duration = 1360
      peakScale = 1.14
      break
    case 18:
      delay = col * 122 + (MATRIX_SIZE - 1 - row) * 34
      duration = 980
      idleOpacity = 0.08
      peakScale = 1.2
      break
    case 19:
      delay = ((angle + Math.PI) / (Math.PI * 2)) * 1280 + manhattan * 24
      duration = 1680
      idleOpacity = manhattan <= 1 ? 0.14 : 0.08
      peakScale = 1.16
      break
    case 20:
      delay = outerOrder < perimeterPath.length
        ? outerOrder * 78
        : 460 + manhattan * 96
      duration = 1580
      idleOpacity = outerOrder < perimeterPath.length ? 0.14 : 0.06
      peakScale = 1.16
      break
    default:
      break
  }

  return {
    '--matrix-delay': `${Math.round(delay).toString()}ms`,
    '--matrix-duration': `${duration.toString()}ms`,
    '--matrix-idle-opacity': idleOpacity.toString(),
    '--matrix-peak-scale': peakScale.toString(),
  }
}

function cellIndex(row: number, col: number): number {
  return row * MATRIX_SIZE + col
}

function pathOrder(path: readonly number[], index: number): number {
  const order = path.indexOf(index)
  return order >= 0 ? order : path.length
}

function buildRowSnakePath(): readonly number[] {
  const path: number[] = []
  for (let row = 0; row < MATRIX_SIZE; row += 1) {
    const cols = Array.from({ length: MATRIX_SIZE }, (_, col) => col)
    if (row % 2 === 1) {
      cols.reverse()
    }
    for (const col of cols) {
      path.push(cellIndex(row, col))
    }
  }
  return path
}

function buildColumnSnakePath(): readonly number[] {
  const path: number[] = []
  for (let col = 0; col < MATRIX_SIZE; col += 1) {
    const rows = Array.from({ length: MATRIX_SIZE }, (_, row) => row)
    if (col % 2 === 0) {
      rows.reverse()
    }
    for (const row of rows) {
      path.push(cellIndex(row, col))
    }
  }
  return path
}

function buildDiagonalSnakePath(): readonly number[] {
  const path: number[] = []
  for (let sum = 0; sum <= (MATRIX_SIZE - 1) * 2; sum += 1) {
    const cells: number[] = []
    for (let row = 0; row < MATRIX_SIZE; row += 1) {
      const col = sum - row
      if (col >= 0 && col < MATRIX_SIZE) {
        cells.push(cellIndex(row, col))
      }
    }
    if (sum % 2 === 1) {
      cells.reverse()
    }
    path.push(...cells)
  }
  return path
}
