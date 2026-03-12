/**
 * Slide puzzle engine.
 *
 * Board: flat array where board[cellIndex] = pieceId.
 * The empty cell has pieceId = cols * rows - 1.
 * A solved board has board[i] === i for all i.
 */

import { SIZE_PRESETS, cellPos, piecePos, type JigswapConfig } from './jigswap'

export { SIZE_PRESETS, cellPos, piecePos, type JigswapConfig as SlideConfig }

/** Create a shuffled board that is solvable and not already solved. */
export function createBoard(cols: number, rows: number): number[] {
  const n = cols * rows
  let board: number[]

  do {
    board = Array.from({ length: n }, (_, i) => i)
    // Fisher-Yates shuffle
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[board[i], board[j]] = [board[j], board[i]]
    }
  } while (!isSolvable(board, cols, rows) || isSolved(board))

  return board
}

/** Check if the board is solved. */
export function isSolved(board: number[]): boolean {
  return board.every((v, i) => v === i)
}

/** Check if a board configuration is solvable. */
export function isSolvable(board: number[], _cols: number, _rows: number): boolean {
  const n = board.length
  const emptyVal = n - 1

  let inversions = 0
  for (let i = 0; i < n - 1; i++) {
    if (board[i] === emptyVal) continue
    for (let j = i + 1; j < n; j++) {
      if (board[j] === emptyVal) continue
      if (board[i] > board[j]) inversions++
    }
  }

  const emptyPos = board.indexOf(emptyVal)
  const emptyRow = Math.floor(emptyPos / _cols) + 1 // 1-based row from top
  return (inversions + emptyRow) % 2 === 0
}

/** Find the index of the empty cell. */
export function findEmpty(board: number[], cols: number, rows: number): number {
  return board.indexOf(cols * rows - 1)
}

/**
 * Get the ordered list of positions to slide when clicking a tile.
 * Returns positions between clicked and empty (inclusive of clicked,
 * exclusive of empty), or null if they don't share a row/column.
 */
export function getSlideTargets(
  clickedPos: number,
  emptyPos: number,
  cols: number
): number[] | null {
  const clickedRow = Math.floor(clickedPos / cols)
  const clickedCol = clickedPos % cols
  const emptyRow = Math.floor(emptyPos / cols)
  const emptyCol = emptyPos % cols

  if (clickedRow !== emptyRow && clickedCol !== emptyCol) return null
  if (clickedPos === emptyPos) return null

  const step = clickedRow === emptyRow ? 1 : cols
  const dir = clickedPos < emptyPos ? step : -step

  const targets: number[] = []
  for (let pos = clickedPos; pos !== emptyPos; pos += dir) {
    targets.push(pos)
  }
  return targets
}

/**
 * Execute a slide: shift tiles in targets toward the empty cell.
 * Returns a new board.
 */
export function executeSlide(
  board: number[],
  clickedPos: number,
  emptyPos: number,
  cols: number
): number[] {
  const newBoard = [...board]
  const clickedRow = Math.floor(clickedPos / cols)
  const emptyRow = Math.floor(emptyPos / cols)
  const step = clickedRow === emptyRow ? 1 : cols

  if (clickedPos > emptyPos) {
    for (let i = emptyPos; i < clickedPos; i += step) {
      newBoard[i] = newBoard[i + step]
    }
  } else {
    for (let i = emptyPos; i > clickedPos; i -= step) {
      newBoard[i] = newBoard[i - step]
    }
  }
  newBoard[clickedPos] = board[emptyPos]

  return newBoard
}

/**
 * Get the group of tiles that should move during a drag.
 * Returns tiles between tilePos and emptyPos along the given axis,
 * or null if they don't share a row/column on that axis.
 */
export function getDragGroup(
  tilePos: number,
  emptyPos: number,
  axis: 'x' | 'y',
  cols: number
): { positions: number[]; dir: number } | null {
  const tileRow = Math.floor(tilePos / cols)
  const tileCol = tilePos % cols
  const emptyRow = Math.floor(emptyPos / cols)
  const emptyCol = emptyPos % cols

  if (axis === 'x' && tileRow !== emptyRow) return null
  if (axis === 'y' && tileCol !== emptyCol) return null

  const step = axis === 'x'
    ? (emptyPos > tilePos ? 1 : -1)
    : (emptyPos > tilePos ? cols : -cols)
  const dir = emptyPos > tilePos ? 1 : -1

  const positions: number[] = []
  for (let pos = tilePos; pos !== emptyPos; pos += step) {
    positions.push(pos)
  }

  return { positions, dir }
}

/**
 * Get the position of the tile adjacent to empty in a given keyboard direction.
 * Direction: -1 (left), 1 (right), -cols (up), cols (down).
 * Returns the tile position to move, or null if at edge.
 */
export function getKeyboardTilePos(
  emptyPos: number,
  direction: number,
  cols: number,
  rows: number
): number | null {
  // The tile to move is opposite the direction (tile slides into empty)
  const tilePos = emptyPos - direction

  if (tilePos < 0 || tilePos >= cols * rows) return null

  // Check wrapping for horizontal moves
  const emptyCol = emptyPos % cols
  if (direction === -1 && emptyCol === cols - 1) return null
  if (direction === 1 && emptyCol === 0) return null

  return tilePos
}

/**
 * Get the edge tile position for shift+arrow (slide whole row/column).
 */
export function getEdgeTilePos(
  emptyPos: number,
  direction: number,
  cols: number,
  rows: number
): number | null {
  const emptyRow = Math.floor(emptyPos / cols)
  const emptyCol = emptyPos % cols
  let edgePos: number

  if (direction === 1) {
    // Right: slide from left edge of empty's row
    edgePos = emptyRow * cols
  } else if (direction === -1) {
    // Left: slide from right edge of empty's row
    edgePos = emptyRow * cols + cols - 1
  } else if (direction > 1) {
    // Down: slide from top of empty's column
    edgePos = emptyCol
  } else {
    // Up: slide from bottom of empty's column
    edgePos = (rows - 1) * cols + emptyCol
  }

  if (edgePos === emptyPos) return null
  return edgePos
}
