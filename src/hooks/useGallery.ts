import { useCallback, useEffect, useState } from 'react'
import { loadGalleryIndex, saveToGallery, deleteGalleryEntry, loadGalleryThumbnails } from '../game/storage'

/** Owns the generated-image gallery: index entries plus thumbnail object URLs. */
export function useGallery() {
  const [entries, setEntries] = useState(() => loadGalleryIndex())
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    loadGalleryThumbnails().then(setThumbs)
  }, [])

  /** Persist a freshly generated image and return its gallery id. */
  const addGenerated = useCallback(async (prompt: string, blob: Blob): Promise<string> => {
    const id = await saveToGallery(prompt, blob)
    setEntries(loadGalleryIndex())
    setThumbs(prev => new Map(prev).set(id, URL.createObjectURL(blob)))
    return id
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteGalleryEntry(id)
    setEntries(loadGalleryIndex())
    setThumbs(prev => {
      const url = prev.get(id)
      if (url) URL.revokeObjectURL(url)
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  return { entries, thumbs, addGenerated, remove }
}
