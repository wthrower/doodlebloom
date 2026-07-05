import { idbPut, idbGet } from './images'
import { loadJSON, saveJSON } from './localStore'
import type { JigswapConfig } from '../jigswap'

const PUZZLE_IMAGE_KEY_PREFIX = 'puzzle_image_'
const PUZZLE_STATE_PREFIX = 'doodlebloom_'

export type PuzzleMode = 'jigswap' | 'slide'

/** Persisted board state for the jigswap/slide modes. */
export interface PuzzleState {
  board: number[]
  config: JigswapConfig
  moves: number
  won: boolean
}

export function loadPuzzleState(mode: PuzzleMode): PuzzleState | null {
  return loadJSON<PuzzleState | null>(PUZZLE_STATE_PREFIX + mode, null)
}

export function savePuzzleState(mode: PuzzleMode, state: PuzzleState): void {
  saveJSON(PUZZLE_STATE_PREFIX + mode, state)
}

export function hasSavedPuzzle(mode: PuzzleMode): boolean {
  return loadPuzzleState(mode)?.won === false
}

export function clearPuzzleState(mode: PuzzleMode): void {
  localStorage.removeItem(PUZZLE_STATE_PREFIX + mode)
}

export async function savePuzzleImage(mode: PuzzleMode, blob: Blob): Promise<void> {
  await idbPut(PUZZLE_IMAGE_KEY_PREFIX + mode, blob)
}

export async function loadPuzzleImage(mode: PuzzleMode): Promise<Blob | null> {
  return idbGet<Blob>(PUZZLE_IMAGE_KEY_PREFIX + mode)
}
