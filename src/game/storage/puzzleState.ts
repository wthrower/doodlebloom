import { openDb } from './images'
import { loadGameState } from './gameState'

const PUZZLE_IMAGE_KEY_PREFIX = 'puzzle_image_'
const PUZZLE_STATE_PREFIX = 'doodlebloom_'
const IDB_STORE = 'images'

export async function savePuzzleImage(mode: 'jigswap' | 'slide', blob: Blob): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const req = store.put(blob, PUZZLE_IMAGE_KEY_PREFIX + mode)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function loadPuzzleImage(mode: 'jigswap' | 'slide'): Promise<Blob | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const store = tx.objectStore(IDB_STORE)
    const req = store.get(PUZZLE_IMAGE_KEY_PREFIX + mode)
    req.onsuccess = () => resolve((req.result as Blob) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export function hasSavedPuzzle(mode: 'jigswap' | 'slide'): boolean {
  const raw = localStorage.getItem(PUZZLE_STATE_PREFIX + mode)
  if (!raw) return false
  try {
    const saved = JSON.parse(raw)
    return saved.won === false
  } catch { return false }
}

export function hasSavedPaint(): boolean {
  const state = loadGameState()
  return state !== null && state.screen === 'playing'
}

export function clearPuzzleState(mode: 'jigswap' | 'slide'): void {
  localStorage.removeItem(PUZZLE_STATE_PREFIX + mode)
}
