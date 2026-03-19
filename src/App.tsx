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
import { StartScreen } from './screens/StartScreen'
import { PaintScreen } from './screens/PaintScreen'
import { JigswapScreen } from './screens/JigswapScreen'
import { SlideScreen } from './screens/SlideScreen'
import { ProcessingScreen } from './screens/ProcessingScreen'
import { saveImage, loadImage, loadSelectedStockUrl, saveSelectedStockUrl, hasSavedPuzzle, hasSavedPaint, loadPuzzleImage, savePuzzleImage, saveToGallery, loadGalleryImage, loadGalleryIndex, loadGalleryThumbnails, deleteGalleryEntry } from './game/storage'
import type { GalleryEntry } from './game/storage'

const PREVIEW_KEY = '__preview__'

// Re-export types for screens to import from one place
export type { GameState } from './types'
export type { GameActions } from './hooks/useGame'

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
  const [jigswapImageUrl, setJigswapImageUrl] = useState<string | null>(null)
  const [jigswapBlob, setJigswapBlob] = useState<Blob | null>(null)
  const [jigswapHasSaved, setJigswapHasSaved] = useState(false)
  const [slideImageUrl, setSlideImageUrl] = useState<string | null>(null)
  const [slideBlob, setSlideBlob] = useState<Blob | null>(null)
  const [slideHasSaved, setSlideHasSaved] = useState(false)
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

  const handlePaint = useCallback(async () => {
    if (!previewBlobRef.current) return
    await maybeSaveToGallery()
    if (actions.hasPrevSession) {
      await actions.restoreStashedSession()
      setPaintHasSaved(true)
    } else {
      setPaintHasSaved(false)
      await actions.processImage(previewBlobRef.current!)
    }
  }, [actions, maybeSaveToGallery])

  const handleJigswap = useCallback(async () => {
    if (hasSavedPuzzle('jigswap')) {
      const savedBlob = await loadPuzzleImage('jigswap')
      if (savedBlob) {
        if (jigswapImageUrl) URL.revokeObjectURL(jigswapImageUrl)
        const url = URL.createObjectURL(savedBlob)
        setJigswapImageUrl(url)
        setJigswapBlob(savedBlob)
        setJigswapHasSaved(true)
        actions.goTo('jigswap')
        return
      }
    }
    if (!previewUrl || !previewBlobRef.current) return
    await maybeSaveToGallery()
    setJigswapImageUrl(previewUrl)
    setJigswapBlob(previewBlobRef.current)
    setJigswapHasSaved(false)
    actions.goTo('jigswap')
  }, [previewUrl, actions, jigswapImageUrl, maybeSaveToGallery])

  const handleSlide = useCallback(async () => {
    if (hasSavedPuzzle('slide')) {
      const savedBlob = await loadPuzzleImage('slide')
      if (savedBlob) {
        if (slideImageUrl) URL.revokeObjectURL(slideImageUrl)
        const url = URL.createObjectURL(savedBlob)
        setSlideImageUrl(url)
        setSlideBlob(savedBlob)
        setSlideHasSaved(true)
        actions.goTo('slide')
        return
      }
    }
    if (!previewUrl || !previewBlobRef.current) return
    await maybeSaveToGallery()
    setSlideImageUrl(previewUrl)
    setSlideBlob(previewBlobRef.current)
    setSlideHasSaved(false)
    actions.goTo('slide')
  }, [previewUrl, actions, slideImageUrl, maybeSaveToGallery])

  const handleSelectStock = useCallback(async (imageUrl: string) => {
    const response = await fetch(imageUrl)
    const blob = await response.blob()
    previewBlobRef.current = blob
    previewIsGeneratedRef.current = false
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    setSelectedStockUrl(imageUrl)
    saveSelectedStockUrl(imageUrl)
    saveImage(PREVIEW_KEY, blob).catch(() => undefined)
    actions.goTo('start')
  }, [previewUrl, actions])

  const handleSelectGallery = useCallback(async (entry: GalleryEntry) => {
    const blob = await loadGalleryImage(entry.id)
    if (!blob) return
    previewBlobRef.current = blob
    previewIsGeneratedRef.current = false
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    setSelectedStockUrl(null)
    saveSelectedStockUrl(null)
    saveImage(PREVIEW_KEY, blob).catch(() => undefined)
    actions.setPrompt(entry.prompt)
    actions.goTo('start')
  }, [previewUrl, actions])

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
      {genError && (
        <div className="error-banner">
          {genError}
          <button onClick={() => setGenError(null)}>×</button>
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
          onPaint={handlePaint}
          onJigswap={handleJigswap}
          onSlide={handleSlide}
          onSelectStock={handleSelectStock}
          galleryEntries={galleryEntries}
          galleryThumbs={galleryThumbs}
          onSelectGallery={handleSelectGallery}
          onDeleteGallery={handleDeleteGallery}
        />
      )}
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
      {state.screen === 'jigswap' && jigswapImageUrl && jigswapBlob && (
        <JigswapScreen
          imageUrl={jigswapImageUrl}
          imageBlob={jigswapBlob}
          hasSaved={jigswapHasSaved}
          previewUrl={previewUrl ?? jigswapImageUrl}
          previewBlob={previewBlobRef.current ?? jigswapBlob}
          onBack={() => actions.goTo('start')}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
      {state.screen === 'slide' && slideImageUrl && slideBlob && (
        <SlideScreen
          imageUrl={slideImageUrl}
          imageBlob={slideBlob}
          hasSaved={slideHasSaved}
          previewUrl={previewUrl ?? slideImageUrl}
          previewBlob={previewBlobRef.current ?? slideBlob}
          onBack={() => actions.goTo('start')}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
    </div>
  )
}
