import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_STATE } from '../types'
import type { GameState, PaletteColor, Screen } from '../types'
import { useStorage } from './useStorage'
import { assignPixels } from '../game/quantize'
import { buildRegions, fuseSameColorRegions } from '../game/regions'
import type { RegionSnapshot } from '../game/regions'
import type { PipelineMessage } from '../game/pipeline.worker'
import { loadApiKey, saveApiKey, clearCorruptedState } from '../game/storage'
import { spreadPalette } from '../game/paletteColor'

/** Scale image so its shorter side = this many pixels. */
const CANVAS_SHORT = 1024

export interface GameActions {
  setPrompt: (p: string) => void
  setColorCount: (n: number) => void
  setShowOutline: (v: boolean) => void
  setApiKey: (k: string) => void
  apiKey: string
  goTo: (screen: Screen) => void
  /** Call after DALL-E image blob is available. Processes image → puzzle state (always fresh). */
  processImage: (blob: Blob) => Promise<void>
  /** Restore the stashed in-progress session (fast, from IDB -- no pipeline). */
  restoreStashedSession: () => Promise<void>
  /** Discard the stash and wipe its IDB data. */
  clearStash: () => void
  /** True if there's a stashed in-progress session. */
  hasPrevSession: boolean
  /** Blob size of the stashed session, for matching against the current preview. */
  prevSessionBlobSize: number | null
  fillRegion: (regionId: number, colorIndex: number) => void
  toggleSpreadPalette: () => void
  resetPuzzle: () => Promise<void>
  resetProgress: () => void
  indexMapRef: React.MutableRefObject<Uint8Array | null>
  regionMapRef: React.MutableRefObject<Int32Array | null>
  originalImageDataRef: React.MutableRefObject<ImageData | null>
  debugSnapshotsRef: React.MutableRefObject<RegionSnapshot[]>
  processingStage: string | null
  pipelineError: string | null
  clearPipelineError: () => void
}


export function useGame(): [GameState, GameActions] {
  const [state, setState] = useState<GameState>(() => DEFAULT_STATE)
  const [apiKey, setApiKeyState] = useState<string>(() =>
    loadApiKey() || (import.meta.env.VITE_OPENAI_API_KEY as string) || ''
  )
  const [processingStage, setProcessingStage] = useState<string | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [paletteSpread, setPaletteSpread] = useState(false)
  const basePaletteRef = useRef<PaletteColor[] | null>(null)
  const { persistState, restoreState, wipeState, storeImage, retrieveImage, storeRegionMap, retrieveRegionMap } = useStorage()

  const indexMapRef = useRef<Uint8Array | null>(null)
  const regionMapRef = useRef<Int32Array | null>(null)
  const originalImageDataRef = useRef<ImageData | null>(null)
  const debugSnapshotsRef = useRef<RegionSnapshot[]>([])
  const prevSessionRef = useRef<{ state: GameState; blobSize: number } | null>(null)
  const [hasPrevSession, setHasPrevSession] = useState(false)

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

    setState({ ...saved, screen: 'start' })
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

  const restoreStashedSession = useCallback(async () => {
    const prev = prevSessionRef.current
    if (!prev?.state.sessionId) return
    const storedBlob = await retrieveImage(prev.state.sessionId)
    if (!storedBlob) return
    const storedRegionMap = await retrieveRegionMap(prev.state.sessionId)
    if (!storedRegionMap) return
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
  }, [retrieveImage, retrieveRegionMap, update])

  const clearStash = useCallback(() => {
    const prev = prevSessionRef.current
    if (prev?.state.sessionId) wipeState(prev.state.sessionId)
    prevSessionRef.current = null
    setHasPrevSession(false)
  }, [wipeState])

  const processImage = useCallback(async (blob: Blob) => {
    setPipelineError(null)
    const sessionId = crypto.randomUUID()
    try {
      await storeImage(sessionId, blob)

      // Decode on main thread (needs DOM)
      setProcessingStage('decode')
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

      // Pipeline runs in a web worker
      const worker = new Worker(
        new URL('../game/pipeline.worker.ts', import.meta.url),
        { type: 'module' },
      )

      await new Promise<void>((resolve, reject) => {
        worker.onmessage = async (e: MessageEvent<PipelineMessage>) => {
          if (e.data.type === 'progress') {
            setProcessingStage(e.data.stage)
          } else if (e.data.type === 'error') {
            worker.terminate()
            reject(new Error(e.data.message))
          } else if (e.data.type === 'complete') {
            worker.terminate()
            const { palette, basePalette, regions, indexMap, regionMap, rawPalette } = e.data.result

            await storeRegionMap(sessionId, regionMap)

            basePaletteRef.current = basePalette
            indexMapRef.current = indexMap
            regionMapRef.current = regionMap
            originalImageDataRef.current = imageData
            debugSnapshotsRef.current = []

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
            resolve()
          }
        }
        worker.onerror = (e) => {
          worker.terminate()
          reject(new Error(e.message || 'Worker error'))
        }
        worker.postMessage({ imageData, colorCount: colorCountRef.current })
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image processing failed'
      setPipelineError(msg)
      setProcessingStage(null)
      update({ screen: 'start' })
    }
  }, [storeImage, storeRegionMap, update])

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
    // Stash in-progress session for potential restore if the user picks the same image
    // Don't stash completed games -- those shouldn't be resumable
    if (sessionId && state.screen === 'playing') {
      const blob = await retrieveImage(sessionId)
      prevSessionRef.current = blob ? { state: { ...state }, blobSize: blob.size } : null
      setHasPrevSession(!!prevSessionRef.current)
    } else {
      prevSessionRef.current = null
      setHasPrevSession(false)
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
    pipelineError,
    clearPipelineError: useCallback(() => setPipelineError(null), []),
    apiKey,
    goTo,
    processImage,
    restoreStashedSession,
    clearStash,
    hasPrevSession,
    prevSessionBlobSize: prevSessionRef.current?.blobSize ?? null,
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


