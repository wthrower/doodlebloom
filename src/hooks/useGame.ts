import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_STATE } from '../types'
import type { GameState, PaletteColor, Region, Screen } from '../types'
import { useStorage } from './useStorage'
import { colorDist } from '../game/colorDistance'
import { quantizeImage } from '../game/quantize'
import { buildRegions, fuseSameColorRegions } from '../game/regions'
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
  const { persistState, restoreState, wipeState, storeImage, retrieveImage, storeIndexMap, retrieveIndexMap, storeRegionMap, retrieveRegionMap } = useStorage()

  const indexMapRef = useRef<Uint8Array | null>(null)
  const regionMapRef = useRef<Int32Array | null>(null)
  const originalImageDataRef = useRef<ImageData | null>(null)

  // Restore state on mount
  useEffect(() => {
    const saved = restoreState()
    if (!saved) return
    if (!saved.sessionId) {
      setState(prev => ({ ...prev, prompt: saved.prompt, colorCount: saved.colorCount, revealMode: saved.revealMode }))
      return
    }

    if (saved.screen === 'playing' || saved.screen === 'complete') {
      Promise.all([
        retrieveImage(saved.sessionId),
        retrieveIndexMap(saved.sessionId),
        retrieveRegionMap(saved.sessionId),
      ]).then(async ([blob, storedIndexMap, storedRegionMap]) => {
        if (!blob) { setState(DEFAULT_STATE); return }

        const img = await loadBlobAsImage(blob)
        const canvas = document.createElement('canvas')
        canvas.width = saved.canvasWidth
        canvas.height = saved.canvasHeight
        const ctx = canvas.getContext('2d')!

        ctx.drawImage(img, 0, 0, saved.canvasWidth, saved.canvasHeight)
        const imageData = ctx.getImageData(0, 0, saved.canvasWidth, saved.canvasHeight)

        const indexMap = storedIndexMap ?? rebuildIndexMap(imageData, saved.palette)
        let regionMap = storedRegionMap
        if (!regionMap) {
          const built = buildRegions(indexMap, saved.canvasWidth, saved.canvasHeight, saved.rawPalette ?? [])
          regionMap = built.regionMap
          fuseSameColorRegions(saved.regions, regionMap, saved.canvasWidth)
        }

        indexMapRef.current = indexMap
        regionMapRef.current = regionMap
        originalImageDataRef.current = imageData
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

    const { palette: rawPalette, indexMap } = quantizeImage(imageData, colorCountRef.current)
    const { regions: rawRegions, regionMap } = buildRegions(indexMap, cw, ch, rawPalette)

    // Compact: remove palette colors with no surviving regions
    const usedIndices = [...new Set(rawRegions.map(r => r.colorIndex))].sort((a, b) => a - b)
    const compactRemap = new Map(usedIndices.map((old, i) => [old, i]))
    let palette = usedIndices.map(i => rawPalette[i])
    let regions = rawRegions.map(r => ({ ...r, colorIndex: compactRemap.get(r.colorIndex)! }))

    // If compaction still leaves more colors than the target, merge the closest
    // Lab pairs among the survivors -- now we know which colors own real regions.
    if (palette.length > colorCountRef.current) {
      mergeToTarget(palette, regions, colorCountRef.current)
    }
    // Fuse adjacent same-color regions -- handles adjacencies from both the
    // size merge (in buildRegions) and the color merge (mergeToTarget) above.
    regions = fuseSameColorRegions(regions, regionMap, cw)

    await Promise.all([
      storeIndexMap(sessionId, indexMap),
      storeRegionMap(sessionId, regionMap),
    ])

    indexMapRef.current = indexMap
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
      rawPalette,
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
    const { sessionId, prompt, colorCount, revealMode } = state
    indexMapRef.current = null
    regionMapRef.current = null
    originalImageDataRef.current = null
    await wipeState(sessionId)
    const next = { ...DEFAULT_STATE, prompt, colorCount, revealMode }
    persistState(next)
    setState(next)
  }, [state, wipeState, persistState])

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

/** Merge the closest Lab pairs in palette until palette.length === targetCount.
 *  Mutates palette and regions in place. The larger (by pixel count) color survives. */
function mergeToTarget(palette: PaletteColor[], regions: Region[], targetCount: number): void {
  // Sum pixel counts per colorIndex
  const counts = new Array(palette.length).fill(0)
  for (const r of regions) counts[r.colorIndex] += r.pixelCount

  while (palette.length > targetCount) {
    // Find closest Lab pair
    let minDist = Infinity, minI = 0, minJ = 1
    for (let a = 0; a < palette.length; a++) {
      for (let b = a + 1; b < palette.length; b++) {
        const d = colorDist(palette[a].r, palette[a].g, palette[a].b,
                            palette[b].r, palette[b].g, palette[b].b)
        if (d < minDist) { minDist = d; minI = a; minJ = b }
      }
    }
    const [keep, drop] = counts[minI] >= counts[minJ] ? [minI, minJ] : [minJ, minI]
    counts[keep] += counts[drop]
    palette.splice(drop, 1)
    counts.splice(drop, 1)
    // Remap regions: dropped index → keep (adjusted for the splice shift)
    const keepAdj = keep > drop ? keep - 1 : keep
    for (const r of regions) {
      if (r.colorIndex === drop) r.colorIndex = keepAdj
      else if (r.colorIndex > drop) r.colorIndex--
    }
  }
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
