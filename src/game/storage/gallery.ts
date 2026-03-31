import { openDb } from './images'

const LS_KEY_GALLERY = 'doodlebloom_gallery'
const GALLERY_IDB_PREFIX = 'gallery_'
const IDB_STORE = 'images'

export interface GalleryEntry {
  id: string
  prompt: string
  timestamp: number
}

export function loadGalleryIndex(): GalleryEntry[] {
  const raw = localStorage.getItem(LS_KEY_GALLERY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as GalleryEntry[]
  } catch { return [] }
}

function saveGalleryIndex(entries: GalleryEntry[]): void {
  localStorage.setItem(LS_KEY_GALLERY, JSON.stringify(entries))
}

/** Save a generated image to the gallery. Returns the entry ID. */
export async function saveToGallery(prompt: string, blob: Blob): Promise<string> {
  const id = crypto.randomUUID()
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const req = store.put(blob, GALLERY_IDB_PREFIX + id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  const entries = loadGalleryIndex()
  entries.unshift({ id, prompt, timestamp: Date.now() })
  saveGalleryIndex(entries)
  return id
}

export async function loadGalleryImage(id: string): Promise<Blob | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const store = tx.objectStore(IDB_STORE)
    const req = store.get(GALLERY_IDB_PREFIX + id)
    req.onsuccess = () => resolve((req.result as Blob) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteGalleryEntry(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const req = store.delete(GALLERY_IDB_PREFIX + id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  const entries = loadGalleryIndex().filter(e => e.id !== id)
  saveGalleryIndex(entries)
}

/** Load thumbnail blob URLs for all gallery entries. */
export async function loadGalleryThumbnails(): Promise<Map<string, string>> {
  const entries = loadGalleryIndex()
  const urls = new Map<string, string>()
  if (entries.length === 0) return urls
  const db = await openDb()
  await Promise.all(entries.map(entry =>
    new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const store = tx.objectStore(IDB_STORE)
      const req = store.get(GALLERY_IDB_PREFIX + entry.id)
      req.onsuccess = () => {
        if (req.result) urls.set(entry.id, URL.createObjectURL(req.result as Blob))
        resolve()
      }
      req.onerror = () => resolve()
    })
  ))
  return urls
}
