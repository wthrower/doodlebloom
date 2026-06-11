import { useCallback, useState } from 'react'
import { SIZE_PRESETS, type JigswapConfig } from '../game/jigswap'

export function usePuzzleModeState() {
  const [imageUrl, setImageUrlRaw] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [hasSaved, setHasSaved] = useState(false)
  const [config, setConfig] = useState<JigswapConfig>(SIZE_PRESETS[1])

  const setImage = useCallback((newBlob: Blob, saved: boolean, newConfig: JigswapConfig) => {
    setBlob(newBlob)
    setHasSaved(saved)
    setConfig(newConfig)
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

  return { imageUrl, blob, hasSaved, config, setImage, clear }
}
