const LS_KEY_APIKEY = 'doodlebloom_apikey'
const LS_KEY_STOCK_URL = 'doodlebloom_stock_url'
const LS_KEY_COMPLETED = 'doodlebloom_completed'

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
  const raw = localStorage.getItem(LS_KEY_COMPLETED)
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

export function markImageCompleted(imageId: string, mode: string): void {
  const map = loadCompletedImages()
  const modes = map[imageId] ?? []
  if (!modes.includes(mode)) modes.push(mode)
  map[imageId] = modes
  localStorage.setItem(LS_KEY_COMPLETED, JSON.stringify(map))
}
