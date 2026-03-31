import { useCallback, useState } from 'react'

export function usePuzzleModeState() {
  const [imageUrl, setImageUrlRaw] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [hasSaved, setHasSaved] = useState(false)

  const setImage = useCallback((newBlob: Blob, saved: boolean) => {
    setBlob(newBlob)
    setHasSaved(saved)
    setImageUrlRaw(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(newBlob)
    })
  }, [])

  const clear = useCallback(() => {
    setImageUrlRaw(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setBlob(null)
    setHasSaved(false)
  }, [])

  return { imageUrl, blob, hasSaved, setImage, clear }
}
