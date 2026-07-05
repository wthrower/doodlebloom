import { describe, it, expect } from 'vitest'
import { cellPos, piecePos, createBoard, isSolved, shuffleArray } from './jigswap'

describe('cellPos / piecePos', () => {
  it('maps a flat index to (col, row) on a cols-wide grid', () => {
    expect(cellPos(0, 4)).toEqual({ col: 0, row: 0 })
    expect(cellPos(3, 4)).toEqual({ col: 3, row: 0 })
    expect(cellPos(4, 4)).toEqual({ col: 0, row: 1 })
    expect(cellPos(11, 4)).toEqual({ col: 3, row: 2 })
  })

  it('piecePos matches cellPos (same math, solved-order id)', () => {
    for (const i of [0, 5, 7, 23]) {
      expect(piecePos(i, 6)).toEqual(cellPos(i, 6))
    }
  })
})

describe('board basics', () => {
  it('isSolved is true only for the identity board', () => {
    expect(isSolved([0, 1, 2, 3])).toBe(true)
    expect(isSolved([1, 0, 2, 3])).toBe(false)
  })

  it('createBoard returns a non-solved permutation of all piece ids', () => {
    for (let i = 0; i < 20; i++) {
      const board = createBoard(2, 3)
      expect(isSolved(board)).toBe(false)
      expect([...board].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
    }
  })

  it('shuffleArray keeps all elements', () => {
    const arr = shuffleArray([1, 2, 3, 4, 5])
    expect([...arr].sort()).toEqual([1, 2, 3, 4, 5])
  })
})
