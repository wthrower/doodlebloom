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
import { ProcessingScreen } from './screens/ProcessingScreen'
import { saveImage, loadImage, loadSelectedStockUrl, saveSelectedStockUrl } from './game/storage'

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

  // Restore preview image from IDB on mount
  useEffect(() => {
    loadImage(PREVIEW_KEY).then(blob => {
      if (!blob) return
      previewBlobRef.current = blob
      setPreviewUrl(URL.createObjectURL(blob))
    })
  }, [])

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
    await actions.processImage(previewBlobRef.current)
  }, [actions])

  const handleJigswap = useCallback(() => {
    if (!previewUrl) return
    actions.goTo('jigswap')
  }, [previewUrl, actions])

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
        />
      )}
      {state.screen === 'jigswap' && previewUrl && (
        <JigswapScreen
          imageUrl={previewUrl}
          onBack={() => actions.goTo('start')}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
    </div>
  )
}
