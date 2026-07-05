import { idbPut, idbGet } from './images'
import { loadJSON } from './localStore'

const PUZZLE_IMAGE_KEY_PREFIX = 'puzzle_image_'
const PUZZLE_STATE_PREFIX = 'doodlebloom_'

export async function savePuzzleImage(mode: 'jigswap' | 'slide', blob: Blob): Promise<void> {
  await idbPut(PUZZLE_IMAGE_KEY_PREFIX + mode, blob)
}

export async function loadPuzzleImage(mode: 'jigswap' | 'slide'): Promise<Blob | null> {
  return idbGet<Blob>(PUZZLE_IMAGE_KEY_PREFIX + mode)
}

export function hasSavedPuzzle(mode: 'jigswap' | 'slide'): boolean {
  const saved = loadJSON<{ won?: boolean } | null>(PUZZLE_STATE_PREFIX + mode, null)
  return saved?.won === false
}

export function clearPuzzleState(mode: 'jigswap' | 'slide'): void {
  localStorage.removeItem(PUZZLE_STATE_PREFIX + mode)
}
