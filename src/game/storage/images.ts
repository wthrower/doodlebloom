const IDB_NAME = 'doodlebloom'
const IDB_STORE = 'images'
const IDB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  return dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { dbPromise = null; reject(req.error) }
  })
}

export async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const req = tx.objectStore(IDB_STORE).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function idbGet<T = unknown>(key: string): Promise<T | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(key)
    req.onsuccess = () => resolve((req.result as T) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function idbDelete(...keys: string[]): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    for (const k of keys) store.delete(k)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
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
  await idbPut(sessionId + '_regions', new Blob([encodeRLE(regionMap)]))
}

export async function loadRegionMap(sessionId: string): Promise<Int32Array | null> {
  const blob = await idbGet<Blob>(sessionId + '_regions')
  if (!blob) return null
  const buf = await blob.arrayBuffer()
  return decodeRLE(new Int32Array(buf))
}

export async function saveImage(sessionId: string, blob: Blob): Promise<void> {
  await idbPut(sessionId, blob)
}

export async function loadImage(sessionId: string): Promise<Blob | null> {
  return idbGet<Blob>(sessionId)
}

export async function deleteImage(sessionId: string): Promise<void> {
  await idbDelete(sessionId, sessionId + '_index', sessionId + '_regions')
}

export async function collectOrphanedSessions(liveSessionIds: string[]): Promise<void> {
  const live = new Set(liveSessionIds.filter(Boolean))
  const db = await openDb()
  const keys: string[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).getAllKeys()
    req.onsuccess = () => resolve(req.result as string[])
    req.onerror = () => reject(req.error)
  })
  const isManaged = (k: string) =>
    k === '__preview__' || k.startsWith('gallery_') || k.startsWith('puzzle_image_')
  const sessionOf = (k: string) => k.replace(/_(regions|index)$/, '')
  const orphans = keys.filter(k => !isManaged(k) && !live.has(sessionOf(k)))
  if (orphans.length === 0) return
  await idbDelete(...orphans)
}
