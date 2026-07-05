import type { GameState } from '../../types'
import { loadJSON, saveJSON } from './localStore'

const LS_KEY_STATE = 'doodlebloom_state'
const LS_KEY_PROGRESS = 'doodlebloom_paint_progress'
const LS_KEY_STOCK_URL = 'doodlebloom_stock_url'
const LS_KEY_STASH = 'doodlebloom_paint_stash'

/** Per-fill progress overlay for the session in LS_KEY_STATE. Fills happen on
 *  every tap, and reserializing the full GameState (dominated by the static
 *  regions array) each time is a large synchronous main-thread cost — so taps
 *  write only this tiny record and loads merge it back in. */
interface PaintProgress {
  sessionId: string
  screen: GameState['screen']
  playerColors: GameState['playerColors']
}

export function loadGameState(): GameState | null {
  const state = loadJSON<GameState | null>(LS_KEY_STATE, null)
  if (!state) return null
  const progress = loadJSON<PaintProgress | null>(LS_KEY_PROGRESS, null)
  if (progress && progress.sessionId === state.sessionId) {
    return { ...state, screen: progress.screen, playerColors: progress.playerColors }
  }
  return state
}

/** Full-state write. Also drops the progress overlay: the full record already
 *  contains the in-memory playerColors, so a stale overlay must not shadow a
 *  later reset (e.g. resetProgress writing playerColors: {}). */
export function saveGameState(state: GameState): void {
  saveJSON(LS_KEY_STATE, state)
  localStorage.removeItem(LS_KEY_PROGRESS)
}

/** Cheap per-fill write; see PaintProgress. */
export function saveGameProgress(state: GameState): void {
  if (!state.sessionId) {
    saveGameState(state)
    return
  }
  saveJSON(LS_KEY_PROGRESS, {
    sessionId: state.sessionId,
    screen: state.screen,
    playerColors: state.playerColors,
  } satisfies PaintProgress)
}

export function clearGameState(): void {
  localStorage.removeItem(LS_KEY_STATE)
  localStorage.removeItem(LS_KEY_PROGRESS)
}

/**
 * Persisted stash of an in-progress paint game that was backed out of (via the
 * "New puzzle" header button). Lets the resume offer survive a page reload --
 * the in-memory ref alone is lost on reload. The session's image and region map
 * live in IDB keyed by the stashed state's sessionId.
 */
export function loadStashedPaint(): GameState | null {
  return loadJSON<GameState | null>(LS_KEY_STASH, null)
}

export function saveStashedPaint(state: GameState): void {
  saveJSON(LS_KEY_STASH, state)
}

export function clearStashedPaint(): void {
  localStorage.removeItem(LS_KEY_STASH)
}

/** Remove all persisted data except the API key and IDB images. */
export function clearCorruptedState(): void {
  localStorage.removeItem(LS_KEY_STATE)
  localStorage.removeItem(LS_KEY_PROGRESS)
  localStorage.removeItem(LS_KEY_STOCK_URL)
  localStorage.removeItem(LS_KEY_STASH)
}
