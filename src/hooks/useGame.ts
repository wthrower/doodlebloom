import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_STATE } from '../types'
import type { GameState, PaletteColor, Region, Screen } from '../types'
import { useStorage } from './useStorage'
import { colorDist } from '../game/colorDistance'
import { analyzeColors, assignColors, assignPixels } from '../game/quantize'
import { buildRegions, fuseSameColorRegions, traceRegions, mergeRegions, finalizeRegions, mergeGradientSeams, snapshotRegions } from '../game/regions'
import type { RegionSnapshot } from '../game/regions'
import { loadApiKey, saveApiKey, clearCorruptedState } from '../game/storage'
import { recomputePalette, spreadPalette } from '../game/paletteColor'

/** Scale image so its shorter side = this many pixels. */
const CANVAS_SHORT = 1024

export interface GameActions {
  setPrompt: (p: string) => void
  setColorCount: (n: number) => void
  setShowOutline: (v: boolean) => void
  setApiKey: (k: string) => void
  apiKey: string
  goTo: (screen: Screen) => void
  /** Call after DALL-E image blob is available. Processes image → puzzle state. */
  processImage: (blob: Blob) => Promise<void>
  fillRegion: (regionId: number, colorIndex: number) => void
  toggleSpreadPalette: () => void
  resetPuzzle: () => Promise<void>
  resetProgress: () => void
  indexMapRef: React.MutableRefObject<Uint8Array | null>
  regionMapRef: React.MutableRefObject<Int32Array | null>
  originalImageDataRef: React.MutableRefObject<ImageData | null>
  debugSnapshotsRef: React.MutableRefObject<RegionSnapshot[]>
  processingStage: string | null
}


const tick = () => new Promise<void>(r => setTimeout(r, 0))

export function useGame(): [GameState, GameActions] {
  const [state, setState] = useState<GameState>(() => DEFAULT_STATE)
  const [apiKey, setApiKeyState] = useState<string>(() =>
    loadApiKey() || (import.meta.env.VITE_OPENAI_API_KEY as string) || ''
  )
  const [processingStage, setProcessingStage] = useState<string | null>(null)
  const [paletteSpread, setPaletteSpread] = useState(false)
  const basePaletteRef = useRef<PaletteColor[] | null>(null)
  const { persistState, restoreState, wipeState, storeImage, retrieveImage, storeRegionMap, retrieveRegionMap } = useStorage()

  const indexMapRef = useRef<Uint8Array | null>(null)
  const regionMapRef = useRef<Int32Array | null>(null)
  const originalImageDataRef = useRef<ImageData | null>(null)
  const debugSnapshotsRef = useRef<RegionSnapshot[]>([])
  const prevSessionRef = useRef<{ state: GameState; blobSize: number } | null>(null)

  // Restore state on mount
  useEffect(() => {
    const resetCorrupted = () => {
      clearCorruptedState()
      setState(DEFAULT_STATE)
    }

    let saved: GameState | null
    try {
      saved = restoreState()
    } catch {
      resetCorrupted()
      return
    }
    if (!saved) return
    if (!saved.sessionId) {
      setState(prev => ({ ...prev, prompt: saved!.prompt, colorCount: saved!.colorCount, showOutline: saved!.showOutline ?? false }))
      return
    }

    if (saved.screen === 'playing' || saved.screen === 'complete') {
      Promise.all([
        retrieveImage(saved.sessionId),
        retrieveRegionMap(saved.sessionId),
      ]).then(async ([blob, storedRegionMap]) => {
        if (!blob) { resetCorrupted(); return }

        const img = await loadBlobAsImage(blob)
        const canvas = document.createElement('canvas')
        canvas.width = saved!.canvasWidth
        canvas.height = saved!.canvasHeight
        const ctx = canvas.getContext('2d')!

        ctx.drawImage(img, 0, 0, saved!.canvasWidth, saved!.canvasHeight)
        const imageData = ctx.getImageData(0, 0, saved!.canvasWidth, saved!.canvasHeight)

        const indexMap = assignPixels(imageData.data, saved!.canvasWidth * saved!.canvasHeight, saved!.palette)
        let regionMap = storedRegionMap
        if (!regionMap) {
          const built = buildRegions(indexMap, saved!.canvasWidth, saved!.canvasHeight, saved!.rawPalette ?? [])
          regionMap = built.regionMap
          fuseSameColorRegions(saved!.regions, regionMap, saved!.canvasWidth)
        }

        indexMapRef.current = indexMap
        regionMapRef.current = regionMap
        originalImageDataRef.current = imageData
        basePaletteRef.current = saved!.palette
        setState(saved!)
      }).catch(resetCorrupted)
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
  const setShowOutline = useCallback((showOutline: boolean) => update({ showOutline }), [update])
  const goTo = useCallback((screen: Screen) => update({ screen }), [update])

  const setApiKey = useCallback((k: string) => {
    setApiKeyState(k)
    saveApiKey(k)
  }, [])

  // Use a ref to avoid stale closure on colorCount
  const colorCountRef = useRef(state.colorCount)
  useEffect(() => { colorCountRef.current = state.colorCount }, [state.colorCount])

  const processImage = useCallback(async (blob: Blob) => {
    // If same image as previous session, restore progress instead of reprocessing
    const prev = prevSessionRef.current
    prevSessionRef.current = null
    if (prev && prev.state.sessionId && blob.size === prev.blobSize) {
      const storedBlob = await retrieveImage(prev.state.sessionId)
      if (storedBlob && storedBlob.size === blob.size) {
        const storedRegionMap = await retrieveRegionMap(prev.state.sessionId)
        if (storedRegionMap) {
          const img = await loadBlobAsImage(storedBlob)
          const { canvasWidth: cw, canvasHeight: ch } = prev.state
          const canvas = document.createElement('canvas')
          canvas.width = cw; canvas.height = ch
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, cw, ch)
          const imageData = ctx.getImageData(0, 0, cw, ch)
          const idxMap = assignPixels(imageData.data, cw * ch, prev.state.palette)
          indexMapRef.current = idxMap
          regionMapRef.current = storedRegionMap
          originalImageDataRef.current = imageData
          basePaletteRef.current = prev.state.palette
          fuseSameColorRegions(prev.state.regions, storedRegionMap, cw)
          update(prev.state)
          return
        }
      }
    }
    // Clean up stale previous session from IDB
    if (prev?.state.sessionId) wipeState(prev.state.sessionId)

    const sessionId = crypto.randomUUID()
    await storeImage(sessionId, blob)

    setProcessingStage('decode')
    await tick()
    const img = await loadBlobAsImage(blob)
    const scale = CANVAS_SHORT / Math.min(img.naturalWidth, img.naturalHeight)
    const cw = Math.round(img.naturalWidth * scale)
    const ch = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, cw, ch)
    const imageData = ctx.getImageData(0, 0, cw, ch)

    setProcessingStage('palette')
    await tick()
    const rawPalette = analyzeColors(imageData, colorCountRef.current)

    setProcessingStage('assign')
    await tick()
    const indexMap = assignColors(rawPalette, imageData)

    setProcessingStage('trace')
    await tick()
    const regionState = traceRegions(indexMap, cw, ch)
    const snapshots: RegionSnapshot[] = []
    snapshots.push(snapshotRegions('after trace', regionState))

    setProcessingStage('merge')
    await tick()
    mergeRegions(regionState, rawPalette)
    snapshots.push(snapshotRegions('after merge', regionState))

    setProcessingStage('measure')
    await tick()
    const { regions: rawRegions, regionMap } = finalizeRegions(regionState, rawPalette)
    snapshots.push(snapshotRegions('after finalize', regionState))

    setProcessingStage('seams')
    await tick()
    const { regions: seamedRegions } = { regions: mergeGradientSeams(rawRegions, regionMap, imageData, cw, 0.01, rawPalette) }

    const snapFromRegions = (label: string, rs: Region[], rm: Int32Array): RegionSnapshot => {
      const colorOf = new Map<number, number>()
      for (const r of rs) colorOf.set(r.id, r.colorIndex)
      return { label, regionMap: rm.slice(), colorOf }
    }
    snapshots.push(snapFromRegions('after seams', seamedRegions, regionMap))

    setProcessingStage('finish')
    await tick()

    // Compact: remove palette colors with no surviving regions
    const usedIndices = [...new Set(seamedRegions.map(r => r.colorIndex))].sort((a, b) => a - b)
    const compactRemap = new Map(usedIndices.map((old, i) => [old, i]))
    let palette = usedIndices.map(i => rawPalette[i])
    let regions = seamedRegions.map(r => ({ ...r, colorIndex: compactRemap.get(r.colorIndex)! }))

    if (palette.length > colorCountRef.current) {
      mergeToTarget(palette, regions, colorCountRef.current)
    }
    regions = fuseSameColorRegions(regions, regionMap, cw)

    // Recompute palette: most saturated pixel near the average, then spread apart
    palette = recomputePalette('saturated', regions, regionMap, imageData, palette.length)
    basePaletteRef.current = palette
    palette = spreadPalette(palette)

    debugSnapshotsRef.current = snapshots

    await storeRegionMap(sessionId, regionMap)

    indexMapRef.current = indexMap
    regionMapRef.current = regionMap
    originalImageDataRef.current = imageData

    setProcessingStage(null)
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
  }, [storeImage, retrieveImage, retrieveRegionMap, wipeState, update])

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

  const toggleSpreadPalette = useCallback(() => {
    const base = basePaletteRef.current
    if (!base) return
    setPaletteSpread(prev => {
      const next = !prev
      const palette = next ? spreadPalette(base) : base
      setState(s => {
        const updated = { ...s, palette }
        persistState(updated)
        return updated
      })
      return next
    })
  }, [persistState])

  const resetPuzzle = useCallback(async () => {
    const { sessionId, prompt, colorCount, showOutline } = state
    // Stash session for potential restore if the user picks the same image
    if (sessionId) {
      const blob = await retrieveImage(sessionId)
      prevSessionRef.current = blob ? { state: { ...state }, blobSize: blob.size } : null
    } else {
      prevSessionRef.current = null
    }
    indexMapRef.current = null
    regionMapRef.current = null
    originalImageDataRef.current = null
    // Don't wipe IDB — processImage will restore or clean up
    const next = { ...DEFAULT_STATE, prompt, colorCount, showOutline }
    persistState(next)
    setState(next)
  }, [state, retrieveImage, persistState])

  const resetProgress = useCallback(() => {
    setState(prev => {
      const next = { ...prev, playerColors: {}, screen: 'playing' as const }
      persistState(next)
      return next
    })
  }, [persistState])

  const actions: GameActions = {
    setPrompt,
    setColorCount,
    setShowOutline,
    setApiKey,
    processingStage,
    apiKey,
    goTo,
    processImage,
    fillRegion,
    toggleSpreadPalette,
    resetPuzzle,
    resetProgress,
    indexMapRef,
    regionMapRef,
    originalImageDataRef,
    debugSnapshotsRef,
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

