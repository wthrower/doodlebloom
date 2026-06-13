import type { GameState } from '../../types'

const LS_KEY_STATE = 'doodlebloom_state'
const LS_KEY_STOCK_URL = 'doodlebloom_stock_url'
const LS_KEY_STASH = 'doodlebloom_paint_stash'

export function loadGameState(): GameState | null {
  const raw = localStorage.getItem(LS_KEY_STATE)
  if (!raw) return null
  try {
    return JSON.parse(raw) as GameState
  } catch {
    return null
  }
}

export function saveGameState(state: GameState): void {
  try {
    localStorage.setItem(LS_KEY_STATE, JSON.stringify(state))
  } catch {
    // QuotaExceededError (or Safari private-mode). In-memory state is
    // authoritative; persisted state becomes stale but the app stays up.
  }
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
  const raw = localStorage.getItem(LS_KEY_STASH)
  if (!raw) return null
  try {
    return JSON.parse(raw) as GameState
  } catch {
    return null
  }
}

export function saveStashedPaint(state: GameState): void {
  try {
    localStorage.setItem(LS_KEY_STASH, JSON.stringify(state))
  } catch {
    // QuotaExceededError — stash is best-effort; resume offer simply
    // won't survive a reload if persisting fails.
  }
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
