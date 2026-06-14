import { openDb, idbPut, idbGet, idbDelete } from './images'

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
  try { return JSON.parse(raw) as GalleryEntry[] } catch { return [] }
}

function saveGalleryIndex(entries: GalleryEntry[]): void {
  localStorage.setItem(LS_KEY_GALLERY, JSON.stringify(entries))
}

export async function saveToGallery(prompt: string, blob: Blob): Promise<string> {
  const id = crypto.randomUUID()
  await idbPut(GALLERY_IDB_PREFIX + id, blob)
  const entries = loadGalleryIndex()
  entries.unshift({ id, prompt, timestamp: Date.now() })
  saveGalleryIndex(entries)
  return id
}

export async function loadGalleryImage(id: string): Promise<Blob | null> {
  return idbGet<Blob>(GALLERY_IDB_PREFIX + id)
}

export async function deleteGalleryEntry(id: string): Promise<void> {
  await idbDelete(GALLERY_IDB_PREFIX + id)
  const entries = loadGalleryIndex().filter(e => e.id !== id)
  saveGalleryIndex(entries)
}

export async function loadGalleryThumbnails(): Promise<Map<string, string>> {
  const entries = loadGalleryIndex()
  const urls = new Map<string, string>()
  if (entries.length === 0) return urls
  const db = await openDb()
  await Promise.all(entries.map(entry =>
    new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(GALLERY_IDB_PREFIX + entry.id)
      req.onsuccess = () => {
        if (req.result) urls.set(entry.id, URL.createObjectURL(req.result as Blob))
        resolve()
      }
      req.onerror = () => resolve()
    })
  ))
  return urls
}
