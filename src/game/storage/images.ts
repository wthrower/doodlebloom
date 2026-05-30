const IDB_NAME = 'doodlebloom'
const IDB_STORE = 'images'
const IDB_VERSION = 1

export function openDb(): Promise<IDBDatabase> {
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

/**
 * Delete orphaned paint-session artifacts -- session image + region map blobs
 * whose session is neither the current game nor the stashed game. Preview
 * (`__preview__`), gallery (`gallery_*`), and puzzle-mode (`puzzle_image_*`)
 * entries are managed elsewhere and always preserved. Run on startup to reclaim
 * sessions stranded when a game is backed out of and then the page is reloaded.
 */
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
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    for (const k of orphans) store.delete(k)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteImage(sessionId: string): Promise<void> {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    store.delete(sessionId)
    store.delete(sessionId + '_index') // migration cleanup from previous format
    store.delete(sessionId + '_regions')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
