import { useCallback, useEffect, useRef, useState } from 'react'
import { saveImage, loadImage, loadSelectedStockUrl, saveSelectedStockUrl } from '../game/storage'
import { stockIdFromUrl, prettyStockLabel } from '../game/stockImages'

/** IDB key for the currently selected preview image blob. */
const PREVIEW_KEY = '__preview__'

export type ImageSource =
  | { kind: 'stock'; url: string }
  | { kind: 'gallery'; id: string; prompt: string }

/**
 * Single owner of "the current image": its blob, object URL, persisted stock
 * selection, completion-tracking id, and display label. All five used to be
 * separate pieces of App state mutated ad hoc across the selection handlers;
 * setCurrentImage is now the one entry point that keeps them consistent.
 *
 * imageId formats: stock file id ("autumn_forest_cel") or "gallery:<uuid>" —
 * exposed as a ref because completion recording reads it at event time.
 */
export function useCurrentImage() {
  const blobRef = useRef<Blob | null>(null)
  const imageIdRef = useRef<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedStockUrl, setSelectedStockUrl] = useState<string | null>(() => loadSelectedStockUrl())
  const [label, setLabel] = useState<string | null>(() => prettyStockLabel(loadSelectedStockUrl()))

  // Restore on mount: image id from the persisted stock URL, blob from IDB.
  useEffect(() => {
    const stockUrl = loadSelectedStockUrl()
    if (stockUrl) imageIdRef.current = stockIdFromUrl(stockUrl) ?? stockUrl
    loadImage(PREVIEW_KEY).then(blob => {
      if (!blob) return
      blobRef.current = blob
      setPreviewUrl(URL.createObjectURL(blob))
    })
  }, [])

  const setCurrentImage = useCallback((blob: Blob, source: ImageSource) => {
    blobRef.current = blob
    setPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(blob)
    })
    saveImage(PREVIEW_KEY, blob).catch(() => undefined)

    if (source.kind === 'stock') {
      setSelectedStockUrl(source.url)
      saveSelectedStockUrl(source.url)
      imageIdRef.current = stockIdFromUrl(source.url) ?? source.url
      setLabel(prettyStockLabel(source.url))
    } else {
      setSelectedStockUrl(null)
      saveSelectedStockUrl(null)
      imageIdRef.current = `gallery:${source.id}`
      setLabel(source.prompt)
    }
  }, [])

  return { previewUrl, blobRef, imageIdRef, label, selectedStockUrl, setCurrentImage }
}
