import { useRef, useState } from 'react'
import type { GameActions, GameState } from '../App'
import type { GalleryEntry } from '../game/storage'
import { SIZE_PRESETS, type JigswapConfig } from '../game/jigswap'
import { DoodlebloomLogo } from '../components/DoodlebloomLogo'
import { ScrollChevrons } from '../components/ScrollChevrons'

export type GameMode = 'paint' | 'jigswap' | 'slide'

const BASE = import.meta.env.BASE_URL

// Auto-discover stock images from public/images/thumbs/
const thumbModules = import.meta.glob('/public/images/thumbs/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const STOCK_IMAGES = Object.entries(thumbModules)
  .map(([path, thumbUrl]) => {
    const file = path.replace('/public/images/thumbs/', '').replace('.jpg', '')
    const label = file.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return { file, label, thumbUrl }
  })
  .sort(() => Math.random() - 0.5)

interface Props {
  state: GameState
  actions: GameActions
  isGenerating: boolean
  previewUrl: string | null
  selectedStockUrl: string | null
  onGenerate: () => void
  onCancel: () => void
  onPlay: (mode: GameMode, puzzleSize: JigswapConfig) => void
  onSelectStock: (imageUrl: string) => void
  galleryEntries: GalleryEntry[]
  galleryThumbs: Map<string, string>
  onSelectGallery: (entry: GalleryEntry) => void
  onDeleteGallery: (id: string) => void
}

export function StartScreen({ state, actions, isGenerating, previewUrl, selectedStockUrl, onGenerate, onCancel, onPlay, onSelectStock, galleryEntries, galleryThumbs, onSelectGallery, onDeleteGallery }: Props) {
  const [showKey, setShowKey] = useState(false)
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [selectedMode, setSelectedMode] = useState<GameMode>('paint')
  const [puzzleSize, setPuzzleSize] = useState<JigswapConfig>(SIZE_PRESETS[1])
  const stripRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; scrollLeft: number; dragging: boolean } | null>(null)

  const onStripMouseDown = (e: React.MouseEvent) => {
    const el = stripRef.current
    if (!el) return
    dragRef.current = { startX: e.pageX, scrollLeft: el.scrollLeft, dragging: false }
    e.preventDefault()
  }

  const onStripMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current || !stripRef.current) return
    const dx = e.pageX - dragRef.current.startX
    if (!dragRef.current.dragging && Math.abs(dx) > 4) dragRef.current.dragging = true
    if (dragRef.current.dragging) stripRef.current.scrollLeft = dragRef.current.scrollLeft - dx
  }

  const onStripMouseUp = () => { dragRef.current = null }

const onStripClick = (e: React.MouseEvent, cb: () => void) => {
    if (dragRef.current?.dragging) { e.preventDefault(); return }
    cb()
  }

  const canGenerate = !isGenerating && state.prompt.trim().length > 0 && actions.apiKey.trim().length > 0

  return (
    <div className="screen start-screen">
      <h1 className="app-title-wrap" aria-label="Doodlebloom">
        <DoodlebloomLogo />
      </h1>

      <div className="start-columns">
        {/* Left: stock images + preview */}
        <div className="start-left">
          <div className="stock-section">
            <label className="stock-label">Pick an image</label>
            <div className="scroll-chevron-wrap">
              <ScrollChevrons scrollRef={stripRef} />
              <div
                className="stock-strip"
                ref={stripRef}
                onMouseDown={onStripMouseDown}
                onMouseMove={onStripMouseMove}
                onMouseUp={onStripMouseUp}
                onMouseLeave={onStripMouseUp}
              >
                {galleryEntries.map(entry => {
                  const thumbUrl = galleryThumbs.get(entry.id)
                  if (!thumbUrl) return null
                  return (
                    <div
                      key={`gallery-${entry.id}`}
                      className="stock-thumb-btn gallery-thumb-wrap"
                      onClick={e => onStripClick(e, () => onSelectGallery(entry))}
                      title={entry.prompt}
                      role="button"
                      tabIndex={0}
                      aria-label={entry.prompt}
                    >
                      <button
                        className="gallery-delete-btn"
                        onClick={e => { e.stopPropagation(); onDeleteGallery(entry.id) }}
                        aria-label="Delete image"
                      >
                        ×
                      </button>
                      <img
                        src={thumbUrl}
                        alt={entry.prompt}
                        className="stock-thumb-img"
                      />
                      <span className="stock-thumb-label gallery-thumb-label">{entry.prompt}</span>
                    </div>
                  )
                })}
                {STOCK_IMAGES.map(({ file, label, thumbUrl }) => {
                  const url = `${BASE}images/${file}.png`
                  const isSelected = selectedStockUrl === url
                  return (
                    <button
                      key={file}
                      className={`stock-thumb-btn${isSelected ? ' selected' : ''}`}
                      onClick={e => onStripClick(e, () => onSelectStock(url))}
                      aria-label={label}
                      disabled={isGenerating}
                    >
                      <img
                        src={thumbUrl}
                        alt={label}
                        className="stock-thumb-img"
                      />
                      <span className="stock-thumb-label">{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {previewUrl && !isGenerating && (
            <div className="preview-inline">
              <img src={previewUrl} alt="Selected" className="preview-inline-img" />
            </div>
          )}
        </div>

        {/* Right: mode buttons + generate */}
        <div className="start-right">
          {previewUrl && !isGenerating && (
            <>
              <div className="mode-toggle">
                {(['paint', 'jigswap', 'slide'] as const).map(mode => (
                  <button
                    key={mode}
                    className={`mode-toggle-btn${selectedMode === mode ? ' selected' : ''}`}
                    onClick={() => setSelectedMode(mode)}
                  >
                    {mode === 'paint' ? 'Paint' : mode === 'jigswap' ? 'JigSwap' : 'Slide'}
                  </button>
                ))}
              </div>
              <div className="mode-settings">
                {selectedMode === 'paint' && (
                  <div className="form-group color-count-inline">
                    <label htmlFor="colorCount">Colors: <strong>{state.colorCount}</strong></label>
                    <input
                      id="colorCount"
                      type="range"
                      min={4}
                      max={32}
                      value={state.colorCount}
                      onChange={e => actions.setColorCount(Number(e.target.value))}
                    />
                  </div>
                )}
                {(selectedMode === 'jigswap' || selectedMode === 'slide') && (
                  <div className="puzzle-size-picker">
                    {SIZE_PRESETS.map(p => (
                      <button
                        key={p.cols}
                        className={`size-btn${p.cols === puzzleSize.cols ? ' selected' : ''}`}
                        onClick={() => setPuzzleSize(p)}
                      >
                        {p.cols}&times;{p.rows}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn btn-primary btn-large play-btn" onClick={() => onPlay(selectedMode, puzzleSize)}>
                Play!
              </button>
            </>
          )}
          <div className="start-divider">or generate your own</div>

          <div className="form-group">
            <div className="prompt-label-row">
              <label htmlFor="prompt">Prompt</label>
              {state.prompt && <button className="btn-clear-prompt" type="button" onClick={() => actions.setPrompt('')} title="Clear prompt" aria-label="Clear prompt">×</button>}
            </div>
            <textarea
              id="prompt"
              rows={3}
              placeholder={actions.apiKey ? "Enter a prompt like 'an adorable kitten staring at a ladybug'..." : 'Enter an OpenAI API key to enable AI image generation.'}
              value={state.prompt}
              onChange={e => actions.setPrompt(e.target.value)}
              onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300)}
              disabled={isGenerating || !actions.apiKey}
            />
          </div>

          <div className="form-group">
            <button
              className="btn btn-ghost btn-small btn-spacebar api-key-toggle"
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

          <div className="start-generate-row">
            {isGenerating ? (
              <>
                <div className="spinner spinner-sm" />
                <span className="generating-inline-text">Generating...</span>
                <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
              </>
            ) : (
              <button className="btn btn-primary btn-large" onClick={onGenerate} disabled={!canGenerate}>
                Generate
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
