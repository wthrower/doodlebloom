import { useState } from 'react'
import type { GameActions, GameState } from '../App'

const BASE = import.meta.env.BASE_URL

const STOCK_IMAGES = [
  { file: 'fox',      label: 'Fox' },
  { file: 'parrot',   label: 'Parrot' },
  { file: 'mountain', label: 'Mountain' },
  { file: 'turtle',   label: 'Turtle' },
  { file: 'cat',      label: 'Cat' },
]

interface Props {
  state: GameState
  actions: GameActions
  isGenerating: boolean
  previewUrl: string | null
  onGenerate: () => void
  onCancel: () => void
  onPaint: () => void
  onSelectStock: (imageUrl: string) => void
}

export function SetupScreen({ state, actions, isGenerating, previewUrl, onGenerate, onCancel, onPaint, onSelectStock }: Props) {
  const [showKey, setShowKey] = useState(false)
  const [showKeyInput, setShowKeyInput] = useState(false)

  const canGenerate = !isGenerating && state.prompt.trim().length > 0 && actions.apiKey.trim().length > 0

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
          disabled={isGenerating}
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
          max={32}
          value={state.colorCount}
          onChange={e => actions.setColorCount(Number(e.target.value))}
          disabled={isGenerating}
        />
        <div className="range-labels">
          <span>4 (simpler)</span>
          <span>32 (complex)</span>
        </div>
      </div>

      <div className="form-group">
        <button
          className="btn btn-ghost btn-small api-key-toggle"
          type="button"
          onClick={() => setShowKeyInput(v => !v)}
          disabled={isGenerating}
        >
          OpenAI API Key{actions.apiKey ? ' ✓' : ''}
        </button>
        {showKeyInput && (
          <div className="input-row" style={{ marginTop: '0.4rem' }}>
            <input
              id="apiKey"
              type={showKey ? 'text' : 'password'}
              placeholder="sk-..."
              value={actions.apiKey}
              onChange={e => actions.setApiKey(e.target.value)}
              autoComplete="off"
              disabled={isGenerating}
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
        )}
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
              disabled={isGenerating}
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
              disabled={isGenerating}
            />
            Image reveal
          </label>
        </div>
      </div>

      <div className="setup-generate-row">
        {isGenerating ? (
          <>
            <div className="spinner spinner-sm" />
            <span className="generating-inline-text">Generating...</span>
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          </>
        ) : (
          <>
            <button className="btn btn-primary btn-large" onClick={onGenerate} disabled={!canGenerate}>
              Generate
            </button>
            {previewUrl && (
              <button className="btn btn-secondary btn-large" onClick={onPaint}>
                Paint this!
              </button>
            )}
          </>
        )}
      </div>

      {previewUrl && !isGenerating && (
        <div className="preview-inline">
          <img src={previewUrl} alt="Generated" className="preview-inline-img" />
        </div>
      )}

      <div className="stock-section">
        <label className="stock-label">Sample images</label>
        <div className="stock-strip">
          {STOCK_IMAGES.map(({ file, label }) => (
            <button
              key={file}
              className="stock-thumb-btn"
              onClick={() => onSelectStock(`${BASE}images/${file}.png`)}
              aria-label={label}
              disabled={isGenerating}
            >
              <img
                src={`${BASE}images/thumbs/${file}.jpg`}
                alt={label}
                className="stock-thumb-img"
              />
              <span className="stock-thumb-label">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
