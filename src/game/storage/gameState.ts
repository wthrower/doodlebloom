import type { GameState } from '../../types'
import { loadJSON, saveJSON } from './localStore'

const LS_KEY_STATE = 'doodlebloom_state'
const LS_KEY_STOCK_URL = 'doodlebloom_stock_url'
const LS_KEY_STASH = 'doodlebloom_paint_stash'

export function loadGameState(): GameState | null {
  return loadJSON<GameState | null>(LS_KEY_STATE, null)
}

export function saveGameState(state: GameState): void {
  saveJSON(LS_KEY_STATE, state)
}

export function clearGameState(): void {
  localStorage.removeItem(LS_KEY_STATE)
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
  localStorage.removeItem(LS_KEY_STOCK_URL)
  localStorage.removeItem(LS_KEY_STASH)
}
