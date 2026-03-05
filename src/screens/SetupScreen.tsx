import { useState } from 'react'
import type { GameActions, GameState } from '../App'

interface Props {
  state: GameState
  actions: GameActions
  onGenerate: () => void
}

export function SetupScreen({ state, actions, onGenerate }: Props) {
  const [showKey, setShowKey] = useState(false)

  const canGenerate = state.prompt.trim().length > 0 && actions.apiKey.trim().length > 0

  return (
    <div className="screen setup-screen">
      <h1 className="app-title">Doodlebloom</h1>
      <p className="app-subtitle">Generate an image, paint it by number.</p>

      <div className="form-group">
        <label htmlFor="prompt">Prompt</label>
        <textarea
          id="prompt"
          rows={3}
          placeholder="A fox sitting on a mushroom in an enchanted forest..."
          value={state.prompt}
          onChange={e => actions.setPrompt(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="colorCount">
          Colors: <strong>{state.colorCount}</strong>
        </label>
        <input
          id="colorCount"
          type="range"
          min={4}
          max={16}
          value={state.colorCount}
          onChange={e => actions.setColorCount(Number(e.target.value))}
        />
        <div className="range-labels">
          <span>4 (simpler)</span>
          <span>16 (complex)</span>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="apiKey">OpenAI API Key</label>
        <div className="input-row">
          <input
            id="apiKey"
            type={showKey ? 'text' : 'password'}
            placeholder="sk-..."
            value={actions.apiKey}
            onChange={e => actions.setApiKey(e.target.value)}
            autoComplete="off"
          />
          <button
            className="btn-icon"
            type="button"
            onClick={() => setShowKey(v => !v)}
            aria-label={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? '🙈' : '👁'}
          </button>
        </div>
        <p className="hint">Stored locally in your browser. Never sent anywhere except OpenAI.</p>
      </div>

      <div className="form-group">
        <label>Reveal style</label>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              name="revealMode"
              value="flat"
              checked={state.revealMode === 'flat'}
              onChange={() => actions.setRevealMode('flat')}
            />
            Flat color
          </label>
          <label>
            <input
              type="radio"
              name="revealMode"
              value="photo"
              checked={state.revealMode === 'photo'}
              onChange={() => actions.setRevealMode('photo')}
            />
            Photo reveal
          </label>
        </div>
      </div>

      <button
        className="btn btn-primary btn-large"
        onClick={onGenerate}
        disabled={!canGenerate}
      >
        Generate
      </button>
    </div>
  )
}
