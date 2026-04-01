/**
 * JigSwap puzzle engine.
 *
 * Core data structure: a flat array of piece indices.
 * board[cellIndex] = pieceId, where pieceId is the original grid position.
 * A solved board has board[i] === i for all i.
 *
 * Adjacency groups are derived from board state -- never stored as mutable state.
 */

export interface JigswapConfig {
  cols: number
  rows: number
}

/** Size presets: column count → rows (2:3 aspect ratio) */
export const SIZE_PRESETS: JigswapConfig[] = [
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

/** Create a shuffled board. Guarantees it's not already solved. */
export function createBoard(cols: number, rows: number): number[] {
  const n = cols * rows
  const board = Array.from({ length: n }, (_, i) => i)

  shuffleArray(board)

  // If shuffle produced the solved state, swap first two
  if (board.every((v, i) => v === i)) {
    ;[board[0], board[1]] = [board[1], board[0]]
  }

  return board
}

/** Check if the board is solved. */
export function isSolved(board: number[]): boolean {
  return board.every((v, i) => v === i)
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

/**
 * Two pieces are "correctly adjacent" if their original positions differ by exactly
 * one step in a cardinal direction, AND their current board positions differ by the
 * same step.
 */
function areCorrectlyAdjacent(
  cellA: number, cellB: number,
  board: number[],
  cols: number
): boolean {
  const posA = cellPos(cellA, cols)
  const posB = cellPos(cellB, cols)
  const dcol = posB.col - posA.col
  const drow = posB.row - posA.row

  // Must be cardinal neighbors on the board
  if (Math.abs(dcol) + Math.abs(drow) !== 1) return false

  const origA = piecePos(board[cellA], cols)
  const origB = piecePos(board[cellB], cols)
  const odcol = origB.col - origA.col
  const odrow = origB.row - origA.row

  return dcol === odcol && drow === odrow
}

/**
 * Build adjacency groups using union-find.
 * Returns a Map from group root → Set of cell indices in the group.
 */
export function buildGroups(board: number[], cols: number, rows: number): Map<number, Set<number>> {
  const n = cols * rows
  const parent = Array.from({ length: n }, (_, i) => i)
  const rank = new Array(n).fill(0)

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }

  function union(a: number, b: number) {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    if (rank[ra] < rank[rb]) parent[ra] = rb
    else if (rank[ra] > rank[rb]) parent[rb] = ra
    else { parent[rb] = ra; rank[ra]++ }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      // Check right neighbor
      if (c + 1 < cols) {
        const right = r * cols + c + 1
        if (areCorrectlyAdjacent(idx, right, board, cols)) union(idx, right)
      }
      // Check bottom neighbor
      if (r + 1 < rows) {
        const below = (r + 1) * cols + c
        if (areCorrectlyAdjacent(idx, below, board, cols)) union(idx, below)
      }
    }
  }

  const groups = new Map<number, Set<number>>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, new Set())
    groups.get(root)!.add(i)
  }
  return groups
}

/**
 * Get the group containing a given cell.
 */
export function getGroup(cell: number, groups: Map<number, Set<number>>): Set<number> {
  for (const group of groups.values()) {
    if (group.has(cell)) return group
  }
  return new Set([cell])
}

/**
 * Check if a group can be dropped at a target position.
 * The target is defined by the cell the user drops onto -- we compute the offset
 * from the dragged cell to all cells in its group, then check if the same offsets
 * from the drop target are all valid board cells.
 */
export function canDrop(
  dragCell: number,
  dropCell: number,
  group: Set<number>,
  cols: number,
  rows: number
): number[] | null {
  const dragPos = cellPos(dragCell, cols)
  const dropPos = cellPos(dropCell, cols)

  const targetCells: number[] = []
  for (const cell of group) {
    const pos = cellPos(cell, cols)
    const tc = dropPos.col + (pos.col - dragPos.col)
    const tr = dropPos.row + (pos.row - dragPos.row)
    if (tc < 0 || tc >= cols || tr < 0 || tr >= rows) return null
    targetCells.push(tr * cols + tc)
  }

  return targetCells
}

/**
 * Execute a swap: the source group moves to target positions.
 * Displaced pieces from target fill the vacated source cells.
 * Handles overlapping source/target correctly (e.g. shifting a group by one cell).
 */
export function executeSwap(
  board: number[],
  sourceCells: number[],
  targetCells: number[]
): number[] {
  const newBoard = [...board]
  const sourceSet = new Set(sourceCells)
  const targetSet = new Set(targetCells)

  // Save source pieces, then place them at target positions
  const sourcePieces = sourceCells.map(c => board[c])
  for (let i = 0; i < targetCells.length; i++) {
    newBoard[targetCells[i]] = sourcePieces[i]
  }

  // Displaced pieces from non-overlapping target cells fill non-overlapping source cells
  const vacated = sourceCells.filter(c => !targetSet.has(c))
  const displaced = targetCells.filter(c => !sourceSet.has(c)).map(c => board[c])
  for (let i = 0; i < vacated.length; i++) {
    newBoard[vacated[i]] = displaced[i]
  }

  return newBoard
}

/**
 * Determine which borders should be hidden between cells.
 * Returns a Set of strings like "cellA-cellB" (smaller index first)
 * for each pair of correctly adjacent cells.
 */
export function getHiddenBorders(board: number[], cols: number, rows: number): Set<string> {
  const hidden = new Set<string>()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      if (c + 1 < cols) {
        const right = r * cols + c + 1
        if (areCorrectlyAdjacent(idx, right, board, cols)) {
          hidden.add(`${idx}-${right}`)
        }
      }
      if (r + 1 < rows) {
        const below = (r + 1) * cols + c
        if (areCorrectlyAdjacent(idx, below, board, cols)) {
          hidden.add(`${idx}-${below}`)
        }
      }
    }
  }
  return hidden
}
