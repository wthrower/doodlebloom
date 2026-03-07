import { useState } from 'react'
import type { GameActions, GameState } from '../App'
import { PillToggle } from '../components/PillToggle'

const BASE = import.meta.env.BASE_URL

const STOCK_IMAGES = [
  { file: 'parrot',     label: 'Parrot' },
  { file: 'mountain',   label: 'Mountain' },
  { file: 'toucan',     label: 'Toucan' },
  { file: 'balloon',    label: 'Balloon' },
  { file: 'lion',       label: 'Lion' },
  { file: 'barn',       label: 'Barn' },
  { file: 'tiger',      label: 'Tiger' },
  { file: 'sunflowers', label: 'Sunflowers' },
  { file: 'puffin',     label: 'Puffin' },
]

interface Props {
  state: GameState
  actions: GameActions
  isGenerating: boolean
  previewUrl: string | null
  selectedStockUrl: string | null
  onGenerate: () => void
  onCancel: () => void
  onPaint: () => void
  onSelectStock: (imageUrl: string) => void
}

export function SetupScreen({ state, actions, isGenerating, previewUrl, selectedStockUrl, onGenerate, onCancel, onPaint, onSelectStock }: Props) {
  const [showKey, setShowKey] = useState(false)
  const [showKeyInput, setShowKeyInput] = useState(false)

  const canGenerate = !isGenerating && state.prompt.trim().length > 0 && actions.apiKey.trim().length > 0

  return (
    <div className="screen setup-screen">
      <h1 className="app-title">Doodlebloom</h1>

      <div className="setup-columns">
        {/* Left: settings + generate */}
        <div className="setup-left">
          <div className="setup-shared-settings">
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
              <label>Reveal style</label>
              <PillToggle
                options={[{ value: 'flat', label: 'Flat' }, { value: 'photo', label: 'Reveal' }]}
                value={state.revealMode}
                onChange={actions.setRevealMode}
                disabled={isGenerating}
              />
            </div>
          </div>

          <div className="setup-divider">or generate your own</div>

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
                    Play!
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: stock images + preview */}
        <div className="setup-right">
          <div className="stock-section">
            <label className="stock-label">Pick an image</label>
            <div className="stock-strip">
              {STOCK_IMAGES.map(({ file, label }) => {
                const url = `${BASE}images/${file}.png`
                const isSelected = selectedStockUrl === url
                return (
                  <button
                    key={file}
                    className={`stock-thumb-btn${isSelected ? ' selected' : ''}`}
                    onClick={() => onSelectStock(url)}
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
                )
              })}
            </div>
          </div>

          {previewUrl && !isGenerating && (
            <div className="preview-inline" onClick={onPaint} title="Play!">
              <img src={previewUrl} alt="Selected" className="preview-inline-img" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
