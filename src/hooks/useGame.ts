import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_STATE } from '../types'
import type { GameState, PaletteColor, Screen } from '../types'
import { useStorage } from './useStorage'
import { quantizeImage } from '../game/quantize'
import { buildRegions } from '../game/regions'
import type { PromotedRegion } from '../game/regions'
import { loadApiKey, saveApiKey } from '../game/storage'

/** Scale image so its shorter side = this many pixels. */
const CANVAS_SHORT = 1024

export interface GameActions {
  setPrompt: (p: string) => void
  setColorCount: (n: number) => void
  setRevealMode: (m: 'flat' | 'photo') => void
  setApiKey: (k: string) => void
  apiKey: string
  goTo: (screen: Screen) => void
  /** Call after DALL-E image blob is available. Processes image → puzzle state. */
  processImage: (blob: Blob) => Promise<void>
  fillRegion: (regionId: number, colorIndex: number) => void
  resetPuzzle: () => Promise<void>
  indexMapRef: React.MutableRefObject<Uint8Array | null>
  regionMapRef: React.MutableRefObject<Int32Array | null>
  originalImageDataRef: React.MutableRefObject<ImageData | null>
}

export function useGame(): [GameState, GameActions] {
  const [state, setState] = useState<GameState>(() => DEFAULT_STATE)
  const [apiKey, setApiKeyState] = useState<string>(() => loadApiKey())
  const { persistState, restoreState, wipeState, storeImage, retrieveImage, storeIndexMap, retrieveIndexMap } = useStorage()

  const indexMapRef = useRef<Uint8Array | null>(null)
  const regionMapRef = useRef<Int32Array | null>(null)
  const originalImageDataRef = useRef<ImageData | null>(null)

  // Restore state on mount
  useEffect(() => {
    const saved = restoreState()
    if (!saved || !saved.sessionId) return

    if (saved.screen === 'playing' || saved.screen === 'complete') {
      Promise.all([
        retrieveImage(saved.sessionId),
        retrieveIndexMap(saved.sessionId),
      ]).then(async ([blob, storedIndexMap]) => {
        if (!blob) { setState(DEFAULT_STATE); return }

        const img = await loadBlobAsImage(blob)
        const canvas = document.createElement('canvas')
        canvas.width = saved.canvasWidth
        canvas.height = saved.canvasHeight
        const ctx = canvas.getContext('2d')!

        ctx.drawImage(img, 0, 0, saved.canvasWidth, saved.canvasHeight)
        const imageData = ctx.getImageData(0, 0, saved.canvasWidth, saved.canvasHeight)
        const originalImageData = imageData

        // Use stored indexMap if available (exact), otherwise rebuild from pixels
        const indexMap = storedIndexMap ?? rebuildIndexMap(imageData, saved.palette)
        const { regionMap } = buildRegions(indexMap, saved.canvasWidth, saved.canvasHeight)

        indexMapRef.current = indexMap
        regionMapRef.current = regionMap
        originalImageDataRef.current = originalImageData
        setState(saved)
      }).catch(() => setState(DEFAULT_STATE))
      return
    }

    setState({ ...saved, screen: 'setup' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((patch: Partial<GameState>) => {
    setState(prev => {
      const next = { ...prev, ...patch }
      persistState(next)
      return next
    })
  }, [persistState])

  const setPrompt = useCallback((prompt: string) => update({ prompt }), [update])
  const setColorCount = useCallback((colorCount: number) => update({ colorCount }), [update])
  const setRevealMode = useCallback((revealMode: 'flat' | 'photo') => update({ revealMode }), [update])
  const goTo = useCallback((screen: Screen) => update({ screen }), [update])

  const setApiKey = useCallback((k: string) => {
    setApiKeyState(k)
    saveApiKey(k)
  }, [])

  // Use a ref to avoid stale closure on colorCount
  const colorCountRef = useRef(state.colorCount)
  useEffect(() => { colorCountRef.current = state.colorCount }, [state.colorCount])

  const processImage = useCallback(async (blob: Blob) => {
    const sessionId = crypto.randomUUID()
    await storeImage(sessionId, blob)


    const img = await loadBlobAsImage(blob)

    // Derive canvas size from image aspect ratio, shorter side = CANVAS_SHORT
    const scale = CANVAS_SHORT / Math.min(img.naturalWidth, img.naturalHeight)
    const cw = Math.round(img.naturalWidth * scale)
    const ch = Math.round(img.naturalHeight * scale)

    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')!

    ctx.drawImage(img, 0, 0, cw, ch)
    const imageData = ctx.getImageData(0, 0, cw, ch)
    const originalImageData = imageData

    const { palette: rawPalette, indexMap: rawIndexMap } = quantizeImage(imageData, colorCountRef.current)
    const { regions: rawRegions, regionMap, promotedRegions } = buildRegions(rawIndexMap, cw, ch, rawPalette)

    // Extend palette with new colors from promoted gray splotches, up to the target color count.
    // Largest splotches get priority. Once the target is reached, promoted regions keep their
    // nearest-existing-color assignment from buildRegions.
    const extPalette = [...rawPalette]
    const sortedPromoted = [...promotedRegions].sort((a, b) => b.pixelCount - a.pixelCount)
    for (const p of sortedPromoted) {
      if (extPalette.length >= colorCountRef.current) break
      const newColorIdx = extPalette.length
      extPalette.push({ r: p.meanR, g: p.meanG, b: p.meanB })
      const region = rawRegions.find(r => r.id === p.regionId)
      if (region) region.colorIndex = newColorIdx
    }

    // Compact palette: remove unused color indices so numbers shown to the player are gapless
    const usedIndices = [...new Set(rawRegions.map(r => r.colorIndex))].sort((a, b) => a - b)
    const remap = new Map(usedIndices.map((old, i) => [old, i]))
    const palette = usedIndices.map(i => extPalette[i])
    const regions = rawRegions.map(r => ({ ...r, colorIndex: remap.get(r.colorIndex)! }))
    // Store rawIndexMap (pre-compaction) so restore calls buildRegions with the same
    // index values, producing identical region IDs and a consistent regionMap.
    await storeIndexMap(sessionId, rawIndexMap)

    indexMapRef.current = rawIndexMap
    regionMapRef.current = regionMap
    originalImageDataRef.current = originalImageData

    update({
      screen: 'playing',
      sessionId,
      palette,
      regions,
      playerColors: {},
      canvasWidth: cw,
      canvasHeight: ch,
    })
  }, [storeImage, update])

  const fillRegion = useCallback((regionId: number, colorIndex: number) => {
    setState(prev => {
      const next: GameState = {
        ...prev,
        playerColors: { ...prev.playerColors, [regionId]: colorIndex },
      }
      const allCorrect = next.regions.every(r => next.playerColors[r.id] === r.colorIndex)
      if (allCorrect) next.screen = 'complete'
      persistState(next)
      return next
    })
  }, [persistState])

  const resetPuzzle = useCallback(async () => {
    const { sessionId } = state
    indexMapRef.current = null
    regionMapRef.current = null
    originalImageDataRef.current = null
    await wipeState(sessionId)
    setState(DEFAULT_STATE)
  }, [state, wipeState])

  const actions: GameActions = {
    setPrompt,
    setColorCount,
    setRevealMode,
    setApiKey,
    apiKey,
    goTo,
    processImage,
    fillRegion,
    resetPuzzle,
    indexMapRef,
    regionMapRef,
    originalImageDataRef,
  }

  return [state, actions]
}

function loadBlobAsImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}

function rebuildIndexMap(imageData: ImageData, palette: PaletteColor[]): Uint8Array {
  const { data, width, height } = imageData
  const pixels = width * height
  const indexMap = new Uint8Array(pixels)
  for (let i = 0; i < pixels; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    let best = 0
    let bestDist = Infinity
    for (let j = 0; j < palette.length; j++) {
      const dr = r - palette[j].r
      const dg = g - palette[j].g
      const db = b - palette[j].b
      const d = dr * dr + dg * dg + db * db
      if (d < bestDist) { bestDist = d; best = j }
    }
    indexMap[i] = best
  }
  return indexMap
}

async function rebuildMapsFromBlob(
  blob: Blob,
  width: number,
  height: number,
  palette: PaletteColor[]
): Promise<{ indexMap: Uint8Array; regionMap: Int32Array; imageData: ImageData }> {
  const img = await loadBlobAsImage(blob)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  const indexMap = rebuildIndexMap(imageData, palette)
  const { regionMap } = buildRegions(indexMap, width, height)
  return { indexMap, regionMap, imageData }
}
