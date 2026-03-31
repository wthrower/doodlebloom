import type { GameState } from '../../types'

const LS_KEY_STATE = 'doodlebloom_state'
const LS_KEY_STOCK_URL = 'doodlebloom_stock_url'

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
  localStorage.setItem(LS_KEY_STATE, JSON.stringify(state))
}

export function clearGameState(): void {
  localStorage.removeItem(LS_KEY_STATE)
}

/** Remove all persisted data except the API key and IDB images. */
export function clearCorruptedState(): void {
  localStorage.removeItem(LS_KEY_STATE)
  localStorage.removeItem(LS_KEY_STOCK_URL)
}
