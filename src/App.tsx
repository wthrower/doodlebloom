import { useCallback, useRef, useState } from 'react'
import { useGame } from './hooks/useGame'
import { useOpenAI } from './hooks/useOpenAI'
import { SetupScreen } from './screens/SetupScreen'
import { GeneratingScreen } from './screens/GeneratingScreen'
import { PreviewScreen } from './screens/PreviewScreen'
import { GameScreen } from './screens/GameScreen'
import { WinScreen } from './screens/WinScreen'

// Re-export types for screens to import from one place
export type { GameState } from './types'
export type { GameActions } from './hooks/useGame'

export default function App() {
  const [state, actions] = useGame()
  const { generate, cancel: cancelGenerate } = useOpenAI()

  const previewBlobRef = useRef<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  const handleGenerate = useCallback(async () => {
    setGenError(null)
    actions.goTo('generating')
    const blob = await generate(state.prompt, actions.apiKey)
    if (!blob) {
      actions.goTo('setup')
      return
    }
    previewBlobRef.current = blob
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    actions.goTo('preview')
  }, [state.prompt, actions, generate])

  const handleCancelGenerate = useCallback(() => {
    cancelGenerate()
    actions.goTo('setup')
  }, [cancelGenerate, actions])

  const handlePaint = useCallback(async () => {
    if (!previewBlobRef.current) return
    await actions.processImage(previewBlobRef.current)
  }, [actions])

  const handleTryAgain = useCallback(async () => {
    actions.goTo('generating')
    const blob = await generate(state.prompt, actions.apiKey)
    if (!blob) {
      actions.goTo('setup')
      return
    }
    previewBlobRef.current = blob
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    actions.goTo('preview')
  }, [state.prompt, actions, generate, previewUrl])

  const handleNewPuzzle = useCallback(async () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    previewBlobRef.current = null
    await actions.resetPuzzle()
  }, [actions, previewUrl])

  return (
    <div className="app">
      {genError && (
        <div className="error-banner">
          {genError}
          <button onClick={() => setGenError(null)}>×</button>
        </div>
      )}

      {state.screen === 'setup' && (
        <SetupScreen state={state} actions={actions} onGenerate={handleGenerate} />
      )}
      {state.screen === 'generating' && (
        <GeneratingScreen onCancel={handleCancelGenerate} />
      )}
      {state.screen === 'preview' && previewUrl && (
        <PreviewScreen imageUrl={previewUrl} onPaint={handlePaint} onTryAgain={handleTryAgain} />
      )}
      {state.screen === 'playing' && (
        <GameScreen state={state} actions={actions} />
      )}
      {state.screen === 'complete' && (
        <WinScreen imageUrl={previewUrl} onNewPuzzle={handleNewPuzzle} />
      )}
    </div>
  )
}
