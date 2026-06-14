import { idbPut, idbGet } from './images'

const PUZZLE_IMAGE_KEY_PREFIX = 'puzzle_image_'
const PUZZLE_STATE_PREFIX = 'doodlebloom_'

export async function savePuzzleImage(mode: 'jigswap' | 'slide', blob: Blob): Promise<void> {
  await idbPut(PUZZLE_IMAGE_KEY_PREFIX + mode, blob)
}

export async function loadPuzzleImage(mode: 'jigswap' | 'slide'): Promise<Blob | null> {
  return idbGet<Blob>(PUZZLE_IMAGE_KEY_PREFIX + mode)
}

export function hasSavedPuzzle(mode: 'jigswap' | 'slide'): boolean {
  const raw = localStorage.getItem(PUZZLE_STATE_PREFIX + mode)
  if (!raw) return false
  try {
    const saved = JSON.parse(raw)
    return saved.won === false
  } catch { return false }
}

export function clearPuzzleState(mode: 'jigswap' | 'slide'): void {
  localStorage.removeItem(PUZZLE_STATE_PREFIX + mode)
}
