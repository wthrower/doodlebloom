import { useCallback, useEffect, useRef, useState } from 'react'
import { useFullscreen } from './hooks/useFullscreen'
import { useGame } from './hooks/useGame'
import { useOpenAI } from './hooks/useOpenAI'
import { useCurrentImage } from './hooks/useCurrentImage'
import { useGallery } from './hooks/useGallery'
import { usePuzzleModeState } from './hooks/usePuzzleModeState'
import { StartScreen, type GameMode } from './screens/StartScreen'
import type { GridConfig } from './game/grid'
import { PaintScreen } from './screens/PaintScreen'
import { JigswapScreen } from './screens/JigswapScreen'
import { SlideScreen } from './screens/SlideScreen'
import { ProcessingScreen } from './screens/ProcessingScreen'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ResumeDialog } from './components/PuzzleChrome'
import { hasSavedPuzzle, loadPuzzleImage, loadGalleryImage, loadCompletedImages, markImageCompleted } from './game/storage'
import type { GalleryEntry, CompletedMap } from './game/storage'

export default function App() {
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const [state, actions] = useGame()
  const { generate, cancel: cancelGenerate } = useOpenAI()

  const image = useCurrentImage()
  const gallery = useGallery()
  const [genError, setGenError] = useState<string | null>(null)

  // Tab title tracks the current image. Stock images restore via the
  // persisted stock URL; gallery/generated images fall back to the prompt,
  // which persists in game state across reloads.
  useEffect(() => {
    const label = image.label ?? (state.prompt.trim() || null)
    const short = label && label.length > 60 ? label.slice(0, 57) + '…' : label
    document.title = short ? `${short} · Doodlebloom` : 'Doodlebloom'
  }, [image.label, state.prompt])

  // Completion tracking
  const [completedImages, setCompletedImages] = useState<CompletedMap>(() => loadCompletedImages())

  const recordCompletion = useCallback((mode: string) => {
    if (!image.imageIdRef.current) return
    markImageCompleted(image.imageIdRef.current, mode)
    setCompletedImages(loadCompletedImages())
  }, [image.imageIdRef])

  // Record paint mode completion
  const prevScreenRef = useRef(state.screen)
  useEffect(() => {
    if (state.screen === 'complete' && prevScreenRef.current !== 'complete') {
      recordCompletion('paint')
    }
    prevScreenRef.current = state.screen
  }, [state.screen, recordCompletion])

  // Per-mode resume state
  const jigswap = usePuzzleModeState()
  const slide = usePuzzleModeState()
  const [showResumeChoice, setShowResumeChoice] = useState(false)

  const handleGenerate = useCallback(async () => {
    setGenError(null)
    actions.goTo('generating')
    let blob: Blob | null
    try {
      blob = await generate(state.prompt, actions.apiKey)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const detail = /connection|network|failed to fetch/i.test(msg)
        ? 'check that your OpenAI API key is valid'
        : msg
      setGenError(`Image generation failed: ${detail}`)
      actions.goTo('start')
      return
    }
    if (!blob) {
      actions.goTo('start')
      return
    }

    const id = await gallery.addGenerated(state.prompt, blob)
    image.setCurrentImage(blob, { kind: 'gallery', id, prompt: state.prompt })

    actions.goTo('start')
  }, [state.prompt, actions, generate, gallery.addGenerated, image.setCurrentImage])

  const handleCancel = useCallback(() => {
    cancelGenerate()
    actions.goTo('start')
  }, [cancelGenerate, actions])

  const startFreshPaint = useCallback(async () => {
    if (!image.blobRef.current) return
    actions.clearStash()
    await actions.processImage(image.blobRef.current)
  }, [actions, image.blobRef])

  const resumePaint = useCallback(async () => {
    await actions.restoreStashedSession()
  }, [actions])

  const handlePlay = useCallback(async (mode: GameMode, puzzleSize: GridConfig) => {
    if (mode === 'paint') {
      if (!image.blobRef.current) return
      if (actions.hasPrevSession) {
        setShowResumeChoice(true)
        return
      }
      await startFreshPaint()
      return
    }

    // Jigswap and slide share the same resume/start pattern
    const modeState = mode === 'jigswap' ? jigswap : slide
    if (hasSavedPuzzle(mode)) {
      const savedBlob = await loadPuzzleImage(mode)
      if (savedBlob) {
        modeState.setImage(savedBlob, true, puzzleSize)
        actions.goTo(mode)
        return
      }
    }
    if (!image.previewUrl || !image.blobRef.current) return
    modeState.setImage(image.blobRef.current, false, puzzleSize)
    actions.goTo(mode)
  }, [image.previewUrl, image.blobRef, actions, jigswap, slide, startFreshPaint])

  const handleSelectStock = useCallback(async (imageUrl: string) => {
    try {
      const blob = await (await fetch(imageUrl)).blob()
      image.setCurrentImage(blob, { kind: 'stock', url: imageUrl })
      actions.goTo('start')
    } catch {
      setGenError('Failed to load image')
    }
  }, [image.setCurrentImage, actions])

  const handleSelectGallery = useCallback(async (entry: GalleryEntry) => {
    const blob = await loadGalleryImage(entry.id)
    if (!blob) return
    image.setCurrentImage(blob, { kind: 'gallery', id: entry.id, prompt: entry.prompt })
    actions.setPrompt(entry.prompt)
    actions.goTo('start')
  }, [image.setCurrentImage, actions])

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
          previewUrl={image.previewUrl}
          selectedStockUrl={image.selectedStockUrl}
          onGenerate={handleGenerate}
          onCancel={handleCancel}
          onPlay={handlePlay}
          onSelectStock={handleSelectStock}
          galleryEntries={gallery.entries}
          galleryThumbs={gallery.thumbs}
          onSelectGallery={handleSelectGallery}
          onDeleteGallery={gallery.remove}
          completedImages={completedImages}
        />
      )}
      {showResumeChoice && (
        <ResumeDialog
          onStartFresh={() => { setShowResumeChoice(false); startFreshPaint() }}
          onResume={() => { setShowResumeChoice(false); resumePaint() }}
          onClose={() => setShowResumeChoice(false)}
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
        />
      )}
      {state.screen === 'jigswap' && jigswap.imageUrl && jigswap.blob && (
        <JigswapScreen
          imageUrl={jigswap.imageUrl}
          imageBlob={jigswap.blob}
          hasSaved={jigswap.hasSaved}
          freshConfig={jigswap.config}
          previewUrl={image.previewUrl ?? jigswap.imageUrl}
          previewBlob={image.blobRef.current ?? jigswap.blob}
          onBack={() => actions.goTo('start')}
          onComplete={() => recordCompletion('jigswap')}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
      {state.screen === 'slide' && slide.imageUrl && slide.blob && (
        <SlideScreen
          imageUrl={slide.imageUrl}
          imageBlob={slide.blob}
          hasSaved={slide.hasSaved}
          freshConfig={slide.config}
          previewUrl={image.previewUrl ?? slide.imageUrl}
          previewBlob={image.blobRef.current ?? slide.blob}
          onBack={() => actions.goTo('start')}
          onComplete={() => recordCompletion('slide')}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
      </ErrorBoundary>
    </div>
  )
}
