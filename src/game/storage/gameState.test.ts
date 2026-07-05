import { describe, it, expect, beforeEach } from 'vitest'
import { installLocalStorage } from '../../test/localStorage'
import { loadGameState, saveGameState, saveGameProgress, clearGameState } from './gameState'
import { DEFAULT_STATE } from '../../types'
import type { GameState } from '../../types'

const store = installLocalStorage()

beforeEach(() => store.clear())

function makeState(over: Partial<GameState> = {}): GameState {
  return { ...DEFAULT_STATE, sessionId: 'sess-1', screen: 'playing', ...over }
}

describe('game state persistence', () => {
  it('round-trips a full save', () => {
    const state = makeState({ playerColors: { 3: 1 } })
    saveGameState(state)
    expect(loadGameState()).toEqual(state)
  })

  it('merges a progress overlay for the same session', () => {
    saveGameState(makeState({ playerColors: {} }))
    saveGameProgress(makeState({ playerColors: { 1: 0, 2: 1 }, screen: 'complete' }))

    const loaded = loadGameState()!
    expect(loaded.playerColors).toEqual({ 1: 0, 2: 1 })
    expect(loaded.screen).toBe('complete')
  })

  it('per-fill progress writes are small (no regions payload)', () => {
    const bigRegions = Array.from({ length: 500 }, (_, id) => ({
      id, colorIndex: 0, centroid: { x: 0, y: 0 }, pixelCount: 100, labelRadius: 5, labels: [],
    }))
    saveGameState(makeState({ regions: bigRegions }))
    saveGameProgress(makeState({ regions: bigRegions, playerColors: { 1: 0 } }))

    expect(store.get('doodlebloom_paint_progress')!.length).toBeLessThan(200)
    expect(loadGameState()!.regions).toHaveLength(500)
    expect(loadGameState()!.playerColors).toEqual({ 1: 0 })
  })

  it('ignores a progress overlay from a different session', () => {
    saveGameState(makeState({ sessionId: 'sess-2', playerColors: { 9: 9 } }))
    saveGameProgress(makeState({ sessionId: 'sess-1', playerColors: { 1: 1 } }))

    // Overlay written before this full save is dropped by saveGameState;
    // simulate a stale overlay landing after by writing it directly.
    store.set('doodlebloom_paint_progress', JSON.stringify({ sessionId: 'sess-1', screen: 'playing', playerColors: { 1: 1 } }))
    expect(loadGameState()!.playerColors).toEqual({ 9: 9 })
  })

  it('a full save drops the progress overlay (reset must not resurrect fills)', () => {
    saveGameState(makeState({ playerColors: { 1: 0 } }))
    saveGameProgress(makeState({ playerColors: { 1: 0, 2: 1 } }))
    // resetProgress-style full write
    saveGameState(makeState({ playerColors: {} }))

    expect(loadGameState()!.playerColors).toEqual({})
  })

  it('falls back to a full save when there is no sessionId', () => {
    saveGameProgress(makeState({ sessionId: null, playerColors: { 1: 1 } }))
    expect(loadGameState()!.playerColors).toEqual({ 1: 1 })
  })

  it('clearGameState removes both records', () => {
    saveGameState(makeState())
    saveGameProgress(makeState({ playerColors: { 1: 1 } }))
    clearGameState()
    expect(loadGameState()).toBeNull()
    expect(store.has('doodlebloom_paint_progress')).toBe(false)
  })
})
