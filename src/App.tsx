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
import { saveImage, loadImage, loadSelectedStockUrl, saveSelectedStockUrl, hasSavedPuzzle, hasSavedPaint, loadPuzzleImage, savePuzzleImage } from './game/storage'

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

  // Available puzzle width is capped by the container max-width (540px).
  // Available puzzle height is the viewport minus approximate UI chrome.
  const getImageSize = useCallback((): '1024x1536' | '1536x1024' => {
    const availW = Math.min(window.innerWidth, 540)
    const availH = window.innerHeight - 164
    return availH > availW ? '1024x1536' : '1536x1024'
  }, [])

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

  const handlePaint = useCallback(async () => {
    if (!previewBlobRef.current) return
    setPaintHasSaved(false)
    await actions.processImage(previewBlobRef.current)
  }, [actions])

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
    setJigswapImageUrl(previewUrl)
    setJigswapBlob(previewBlobRef.current)
    setJigswapHasSaved(false)
    actions.goTo('jigswap')
  }, [previewUrl, actions, jigswapImageUrl])

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
    setSlideImageUrl(previewUrl)
    setSlideBlob(previewBlobRef.current)
    setSlideHasSaved(false)
    actions.goTo('slide')
  }, [previewUrl, actions, slideImageUrl])

  const handleSelectStock = useCallback(async (imageUrl: string) => {
    const response = await fetch(imageUrl)
    const blob = await response.blob()
    previewBlobRef.current = blob
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    setSelectedStockUrl(imageUrl)
    saveSelectedStockUrl(imageUrl)
    saveImage(PREVIEW_KEY, blob).catch(() => undefined)
    actions.goTo('start')
  }, [previewUrl, actions])

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
        />
      )}
      {(state.screen === 'playing' || state.screen === 'complete') && (
        <PaintScreen
          state={state}
          actions={actions}
          onNewPuzzle={() => actions.resetPuzzle()}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          hasSaved={paintHasSaved || paintAutoRestored}
          onStartFresh={async () => {
            setPaintAutoRestored(false)
            setPaintHasSaved(false)
            // resetPuzzle goes to start screen; processImage will go to processing then playing
            await actions.resetPuzzle()
            if (previewBlobRef.current) {
              await actions.processImage(previewBlobRef.current)
            }
            // If no preview blob loaded yet, user lands on start screen and can pick an image
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
