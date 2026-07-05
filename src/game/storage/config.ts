import { loadJSON, saveJSON } from './localStore'

const LS_KEY_APIKEY = 'doodlebloom_apikey'
const LS_KEY_STOCK_URL = 'doodlebloom_stock_url'
const LS_KEY_COMPLETED = 'doodlebloom_completed'
const LS_KEY_HIDE_COMPLETED = 'doodlebloom_hide_completed'
const LS_KEY_PUZZLE_SIZE = 'doodlebloom_puzzle_size'

export function loadApiKey(): string {
  return localStorage.getItem(LS_KEY_APIKEY) ?? ''
}

export function saveApiKey(key: string): void {
  localStorage.setItem(LS_KEY_APIKEY, key)
}

export function loadSelectedStockUrl(): string | null {
  return localStorage.getItem(LS_KEY_STOCK_URL)
}

export function saveSelectedStockUrl(url: string | null): void {
  if (url) localStorage.setItem(LS_KEY_STOCK_URL, url)
  else localStorage.removeItem(LS_KEY_STOCK_URL)
}

export type CompletedMap = Record<string, string[]>

export function loadCompletedImages(): CompletedMap {
  return loadJSON<CompletedMap>(LS_KEY_COMPLETED, {})
}

export function markImageCompleted(imageId: string, mode: string): void {
  const map = loadCompletedImages()
  const modes = map[imageId] ?? []
  if (!modes.includes(mode)) modes.push(mode)
  map[imageId] = modes
  saveJSON(LS_KEY_COMPLETED, map)
}

/** Last-played puzzle board size, so the start screen picker remembers it. */
export function loadPuzzleSize(): { cols: number; rows: number } | null {
  return loadJSON<{ cols: number; rows: number } | null>(LS_KEY_PUZZLE_SIZE, null)
}

export function savePuzzleSize(size: { cols: number; rows: number }): void {
  saveJSON(LS_KEY_PUZZLE_SIZE, size)
}

export function loadHideCompleted(): boolean {
  return localStorage.getItem(LS_KEY_HIDE_COMPLETED) === 'true'
}

export function saveHideCompleted(hide: boolean): void {
  localStorage.setItem(LS_KEY_HIDE_COMPLETED, String(hide))
}
