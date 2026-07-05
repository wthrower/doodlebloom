/**
 * Shared grid-board vocabulary for the piece-based puzzle modes (jigswap,
 * slide): board sizing, cell/piece coordinate math, and shuffling.
 * Mode-specific rules live in jigswap.ts / slide.ts.
 */

export interface GridConfig {
  cols: number
  rows: number
}

/** Size presets: column count → rows (2:3 aspect ratio) */
export const SIZE_PRESETS: GridConfig[] = [
  { cols: 2, rows: 3 },
  { cols: 4, rows: 6 },
  { cols: 6, rows: 9 },
  { cols: 8, rows: 12 },
]

/** Fisher-Yates shuffle (in-place, returns the array). */
export function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Get the (col, row) of a piece's ORIGINAL position.
 */
export function piecePos(pieceId: number, cols: number): { col: number; row: number } {
  return { col: pieceId % cols, row: Math.floor(pieceId / cols) }
}

/**
 * Get the (col, row) of a cell index on the board.
 */
export function cellPos(cellIndex: number, cols: number): { col: number; row: number } {
  return { col: cellIndex % cols, row: Math.floor(cellIndex / cols) }
}
