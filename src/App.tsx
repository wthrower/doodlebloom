import { useCallback, useEffect, useRef, useState } from 'react'

function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])
  const toggle = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen()
  }, [])
  return { isFullscreen, toggle }
}
import { useGame } from './hooks/useGame'
import { useOpenAI } from './hooks/useOpenAI'
import { usePuzzleModeState } from './hooks/usePuzzleModeState'
import { StartScreen, type GameMode } from './screens/StartScreen'
import type { JigswapConfig } from './game/jigswap'
import { PaintScreen } from './screens/PaintScreen'
import { JigswapScreen } from './screens/JigswapScreen'
import { SlideScreen } from './screens/SlideScreen'
import { ProcessingScreen } from './screens/ProcessingScreen'
import { ErrorBoundary } from './components/ErrorBoundary'
import { saveImage, loadImage, loadSelectedStockUrl, saveSelectedStockUrl, hasSavedPuzzle, hasSavedPaint, loadPuzzleImage, saveToGallery, loadGalleryImage, loadGalleryIndex, loadGalleryThumbnails, deleteGalleryEntry } from './game/storage'
import type { GalleryEntry } from './game/storage'

const PREVIEW_KEY = '__preview__'


export default function App() {
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const [state, actions] = useGame()
  const { generate, cancel: cancelGenerate } = useOpenAI()

  const previewBlobRef = useRef<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedStockUrl, setSelectedStockUrl] = useState<string | null>(() => loadSelectedStockUrl())
  const [genError, setGenError] = useState<string | null>(null)

  // Generated image gallery
  const [galleryEntries, setGalleryEntries] = useState<GalleryEntry[]>(() => loadGalleryIndex())
  const [galleryThumbs, setGalleryThumbs] = useState<Map<string, string>>(new Map())
  const previewIsGeneratedRef = useRef(false)
  const previewPromptRef = useRef('')

  useEffect(() => {
    loadGalleryThumbnails().then(setGalleryThumbs)
  }, [])

  // Per-mode resume state
  const jigswap = usePuzzleModeState()
  const slide = usePuzzleModeState()
  const [paintHasSaved, setPaintHasSaved] = useState(false)

  // Restore preview image from IDB on mount
  useEffect(() => {
    loadImage(PREVIEW_KEY).then(blob => {
      if (!blob) return
      previewBlobRef.current = blob
      setPreviewUrl(URL.createObjectURL(blob))
    })
  }, [])

  // Detect if paint was auto-restored on mount (hasSavedPaint reads localStorage synchronously)
  const [paintAutoRestored, setPaintAutoRestored] = useState(() => hasSavedPaint())

  const getImageSize = useCallback((): '1024x1536' => '1024x1536', [])

  /** Set a blob as the current preview image, handling URL lifecycle. */
  const setPreviewImage = useCallback((blob: Blob, prompt?: string) => {
    previewBlobRef.current = blob
    previewIsGeneratedRef.current = false
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(blob))
    saveImage(PREVIEW_KEY, blob).catch(() => undefined)
    if (prompt !== undefined) actions.setPrompt(prompt)
  }, [previewUrl, actions])

  const handleGenerate = useCallback(async () => {
    setGenError(null)
    setSelectedStockUrl(null)
    saveSelectedStockUrl(null)
    actions.goTo('generating')
    const blob = await generate(state.prompt, actions.apiKey, getImageSize())
    if (!blob) {
      actions.goTo('start')
      return
    }
    previewBlobRef.current = blob
    previewIsGeneratedRef.current = true
    previewPromptRef.current = state.prompt
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    saveImage(PREVIEW_KEY, blob).catch(() => undefined)
    actions.goTo('preview')
  }, [state.prompt, actions, generate, getImageSize, previewUrl])

  const handleCancel = useCallback(() => {
    cancelGenerate()
    actions.goTo('start')
  }, [cancelGenerate, actions])

  /** If current preview is a fresh generation, save it to the gallery. */
  const maybeSaveToGallery = useCallback(async () => {
    if (!previewIsGeneratedRef.current || !previewBlobRef.current) return
    previewIsGeneratedRef.current = false
    const id = await saveToGallery(previewPromptRef.current, previewBlobRef.current)
    const url = URL.createObjectURL(previewBlobRef.current)
    setGalleryEntries(loadGalleryIndex())
    setGalleryThumbs(prev => new Map(prev).set(id, url))
  }, [])

  const handlePlay = useCallback(async (mode: GameMode, _puzzleSize: JigswapConfig) => {
    if (mode === 'paint') {
      if (!previewBlobRef.current) return
      await maybeSaveToGallery()
      if (actions.hasPrevSession) {
        await actions.restoreStashedSession()
        setPaintHasSaved(true)
      } else {
        setPaintHasSaved(false)
        await actions.processImage(previewBlobRef.current!)
      }
      return
    }

    // Jigswap and slide share the same resume/start pattern
    const modeState = mode === 'jigswap' ? jigswap : slide
    if (hasSavedPuzzle(mode)) {
      const savedBlob = await loadPuzzleImage(mode)
      if (savedBlob) {
        modeState.setImage(savedBlob, true)
        actions.goTo(mode)
        return
      }
    }
    if (!previewUrl || !previewBlobRef.current) return
    await maybeSaveToGallery()
    modeState.setImage(previewBlobRef.current, false)
    actions.goTo(mode)
  }, [previewUrl, actions, jigswap, slide, maybeSaveToGallery])

  const handleSelectStock = useCallback(async (imageUrl: string) => {
    try {
      const blob = await (await fetch(imageUrl)).blob()
      setPreviewImage(blob)
      setSelectedStockUrl(imageUrl)
      saveSelectedStockUrl(imageUrl)
      actions.goTo('start')
    } catch {
      setGenError('Failed to load image')
    }
  }, [setPreviewImage, actions])

  const handleSelectGallery = useCallback(async (entry: GalleryEntry) => {
    const blob = await loadGalleryImage(entry.id)
    if (!blob) return
    setPreviewImage(blob, entry.prompt)
    setSelectedStockUrl(null)
    saveSelectedStockUrl(null)
    actions.goTo('start')
  }, [setPreviewImage, actions])

  const handleDeleteGallery = useCallback(async (id: string) => {
    await deleteGalleryEntry(id)
    setGalleryEntries(loadGalleryIndex())
    const thumb = galleryThumbs.get(id)
    if (thumb) URL.revokeObjectURL(thumb)
    setGalleryThumbs(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [galleryThumbs])

  const isStartPhase = state.screen === 'start' || state.screen === 'generating' || state.screen === 'preview'

  return (
    <div className="app">
      {(genError || actions.pipelineError) && (
        <div className="error-banner">
          {genError || actions.pipelineError}
          <button onClick={() => { setGenError(null); actions.clearPipelineError() }}>×</button>
        </div>
      )}

      {actions.processingStage !== null && (
        <ProcessingScreen stage={actions.processingStage} />
      )}
      {isStartPhase && actions.processingStage === null && (
        <StartScreen
          state={state}
          actions={actions}
          isGenerating={state.screen === 'generating'}
          previewUrl={previewUrl}
          selectedStockUrl={selectedStockUrl}
          onGenerate={handleGenerate}
          onCancel={handleCancel}
          onPlay={handlePlay}
          onSelectStock={handleSelectStock}
          galleryEntries={galleryEntries}
          galleryThumbs={galleryThumbs}
          onSelectGallery={handleSelectGallery}
          onDeleteGallery={handleDeleteGallery}
        />
      )}
      <ErrorBoundary onReset={() => actions.goTo('start')}>
      {(state.screen === 'playing' || state.screen === 'complete') && actions.processingStage === null && (
        <PaintScreen
          state={state}
          actions={actions}
          onNewPuzzle={() => actions.resetPuzzle()}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          hasSaved={paintHasSaved || paintAutoRestored}
          onStartFresh={async () => {
            const sameImage = previewBlobRef.current?.size === actions.prevSessionBlobSize
            actions.clearStash()
            setPaintHasSaved(false)
            setPaintAutoRestored(false)
            if (sameImage) {
              actions.resetProgress()
            } else if (previewBlobRef.current) {
              await actions.processImage(previewBlobRef.current)
            }
          }}
        />
      )}
      {state.screen === 'jigswap' && jigswap.imageUrl && jigswap.blob && (
        <JigswapScreen
          imageUrl={jigswap.imageUrl}
          imageBlob={jigswap.blob}
          hasSaved={jigswap.hasSaved}
          previewUrl={previewUrl ?? jigswap.imageUrl}
          previewBlob={previewBlobRef.current ?? jigswap.blob}
          onBack={() => actions.goTo('start')}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
      {state.screen === 'slide' && slide.imageUrl && slide.blob && (
        <SlideScreen
          imageUrl={slide.imageUrl}
          imageBlob={slide.blob}
          hasSaved={slide.hasSaved}
          previewUrl={previewUrl ?? slide.imageUrl}
          previewBlob={previewBlobRef.current ?? slide.blob}
          onBack={() => actions.goTo('start')}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
      </ErrorBoundary>
    </div>
  )
}
