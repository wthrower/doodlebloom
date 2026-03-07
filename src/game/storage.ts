import type { GameState } from '../types'

const LS_KEY_APIKEY = 'doodlebloom_apikey'
const LS_KEY_STATE = 'doodlebloom_state'
const LS_KEY_STOCK_URL = 'doodlebloom_stock_url'
const IDB_NAME = 'doodlebloom'
const IDB_STORE = 'images'
const IDB_VERSION = 1

// --- localStorage helpers ---

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

// --- IndexedDB image store ---

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function encodeRLE(data: Int32Array): Int32Array {
  const pairs: number[] = [data.length]
  let i = 0
  while (i < data.length) {
    const val = data[i]
    let count = 1
    while (i + count < data.length && data[i + count] === val) count++
    pairs.push(val, count)
    i += count
  }
  return new Int32Array(pairs)
}

function decodeRLE(encoded: Int32Array): Int32Array {
  const length = encoded[0]
  const result = new Int32Array(length)
  let pos = 0
  for (let i = 1; i < encoded.length; i += 2) {
    result.fill(encoded[i], pos, pos + encoded[i + 1])
    pos += encoded[i + 1]
  }
  return result
}

export async function saveRegionMap(sessionId: string, regionMap: Int32Array): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const req = store.put(new Blob([encodeRLE(regionMap)]), sessionId + '_regions')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function loadRegionMap(sessionId: string): Promise<Int32Array | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const store = tx.objectStore(IDB_STORE)
    const req = store.get(sessionId + '_regions')
    req.onsuccess = async () => {
      if (!req.result) { resolve(null); return }
      const buf = await (req.result as Blob).arrayBuffer()
      resolve(decodeRLE(new Int32Array(buf)))
    }
    req.onerror = () => reject(req.error)
  })
}

export async function saveImage(sessionId: string, blob: Blob): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const req = store.put(blob, sessionId)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function loadImage(sessionId: string): Promise<Blob | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const store = tx.objectStore(IDB_STORE)
    const req = store.get(sessionId)
    req.onsuccess = () => resolve((req.result as Blob) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteImage(sessionId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const req = store.delete(sessionId)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  await new Promise<void>((resolve) => {
    openDb().then(db2 => {
      const tx = db2.transaction(IDB_STORE, 'readwrite')
      const store = tx.objectStore(IDB_STORE)
      store.delete(sessionId + '_index')
      store.delete(sessionId + '_regions')
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve() // best effort
    })
  })
}
