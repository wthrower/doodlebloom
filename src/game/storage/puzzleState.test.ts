import { describe, it, expect, beforeEach } from 'vitest'
import { installLocalStorage } from '../../test/localStorage'
import { loadPuzzleState, savePuzzleState, hasSavedPuzzle, clearPuzzleState, type PuzzleState } from './puzzleState'

const store = installLocalStorage()

beforeEach(() => store.clear())

const state: PuzzleState = {
  board: [2, 0, 1, 3],
  config: { cols: 2, rows: 2 },
  moves: 5,
  won: false,
}

describe('puzzle state persistence', () => {
  it('round-trips saved state', () => {
    savePuzzleState('jigswap', state)
    expect(loadPuzzleState('jigswap')).toEqual(state)
  })

  it('keeps the two modes independent', () => {
    savePuzzleState('jigswap', state)
    expect(loadPuzzleState('slide')).toBeNull()
  })

  it('uses the doodlebloom_<mode> key both halves previously duplicated', () => {
    savePuzzleState('slide', state)
    expect(store.has('doodlebloom_slide')).toBe(true)
  })

  it('hasSavedPuzzle is true only for an unfinished save', () => {
    expect(hasSavedPuzzle('jigswap')).toBe(false)
    savePuzzleState('jigswap', state)
    expect(hasSavedPuzzle('jigswap')).toBe(true)
    savePuzzleState('jigswap', { ...state, won: true })
    expect(hasSavedPuzzle('jigswap')).toBe(false)
  })

  it('clearPuzzleState removes the save', () => {
    savePuzzleState('jigswap', state)
    clearPuzzleState('jigswap')
    expect(loadPuzzleState('jigswap')).toBeNull()
    expect(hasSavedPuzzle('jigswap')).toBe(false)
  })
})
