import { useEffect, useRef, useState } from 'react'
import type { GameActions, GameState } from '../App'

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

function svgSunflower(cx: number, cy: number, r: number) {
  const n = 13
  return (
    <g>
      {/* Outer petals — golden amber */}
      {Array.from({ length: n }, (_, i) => (
        <ellipse key={`o${i}`}
          cx={cx} cy={cy - r * 0.52} rx={r * 0.24} ry={r * 0.5}
          fill="#f59e0b" stroke="#b45309" strokeWidth="0.5"
          transform={`rotate(${i * 360 / n}, ${cx}, ${cy})`}
        />
      ))}
      {/* Inner petals — lighter, offset rotation */}
      {Array.from({ length: n }, (_, i) => (
        <ellipse key={`i${i}`}
          cx={cx} cy={cy - r * 0.38} rx={r * 0.18} ry={r * 0.36}
          fill="#fbbf24"
          transform={`rotate(${i * 360 / n + 360 / n / 2}, ${cx}, ${cy})`}
        />
      ))}
      {/* Center disc */}
      <circle cx={cx} cy={cy} r={r * 0.32} fill="#78350f" stroke="#451a03" strokeWidth="0.5" />
      {/* Seed dots */}
      <circle cx={cx - 1.5} cy={cy - 1} r={0.7} fill="#a16207" opacity="0.5" />
      <circle cx={cx + 1.2} cy={cy + 0.8} r={0.7} fill="#a16207" opacity="0.5" />
      <circle cx={cx + 0.3} cy={cy - 1.8} r={0.6} fill="#a16207" opacity="0.4" />
      <circle cx={cx - 0.8} cy={cy + 1.5} r={0.6} fill="#a16207" opacity="0.4" />
    </g>
  )
}

function svgDaisy(cx: number, cy: number, r: number) {
  const n = 12
  return (
    <g>
      {/* Petals — white with faint pink stroke */}
      {Array.from({ length: n }, (_, i) => (
        <ellipse key={i}
          cx={cx} cy={cy - r * 0.55} rx={r * 0.22} ry={r * 0.5}
          fill="white" stroke="#e8b4b8" strokeWidth="0.4"
          transform={`rotate(${i * 360 / n}, ${cx}, ${cy})`}
        />
      ))}
      {/* Center */}
      <circle cx={cx} cy={cy} r={r * 0.28} fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.5" />
    </g>
  )
}

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

  // Scroll indicator chevrons
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const update = () => {
      el.classList.toggle('can-scroll-left', el.scrollLeft > 1)
      el.classList.toggle('can-scroll-right', el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [])

  const onStripClick = (e: React.MouseEvent, cb: () => void) => {
    if (dragRef.current?.dragging) { e.preventDefault(); return }
    cb()
  }

  const canGenerate = !isGenerating && state.prompt.trim().length > 0 && actions.apiKey.trim().length > 0

  return (
    <div className="screen setup-screen">
      <h1 className="app-title-wrap" aria-label="Doodlebloom">
        <svg className="app-title" overflow="visible" height="3rem" viewBox="0 0 242 50" aria-hidden="true">
          <defs>
            <linearGradient id="title-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffc49a" />
              <stop offset="50%" stopColor="#f9a8d4" />
              <stop offset="100%" stopColor="#86efac" />
            </linearGradient>
          </defs>
          <g filter="drop-shadow(0 2px 6px rgba(40,100,50,0.4))">
            {/* "D" */}
            <text x="0" y="38" fontFamily="Acme, sans-serif" fontSize="40"
              fill="url(#title-gradient)" stroke="black" strokeWidth="2" paintOrder="stroke fill"
            >D</text>
            {/* sunflower "o" */}
            {svgSunflower(37, 27, 11)}
            {/* sunflower "o" */}
            {svgSunflower(59, 27, 11)}
            {/* "dlebl" */}
            <text x="70" y="38" fontFamily="Acme, sans-serif" fontSize="40"
              fill="url(#title-gradient)" stroke="black" strokeWidth="2" paintOrder="stroke fill"
            >dlebl</text>
            {/* daisy "o" */}
            {svgDaisy(163, 27, 11)}
            {/* daisy "o" */}
            {svgDaisy(185, 27, 11)}
            {/* "m" */}
            <text x="196" y="38" fontFamily="Acme, sans-serif" fontSize="40"
              fill="url(#title-gradient)" stroke="black" strokeWidth="2" paintOrder="stroke fill"
            >m</text>
          </g>
        </svg>
      </h1>

      <div className="setup-columns">
        {/* Left: stock images + preview */}
        <div className="setup-left">
          <div className="stock-section">
            <label className="stock-label">Pick an image</label>
            <div
              className="stock-strip"
              ref={stripRef}
              onMouseDown={onStripMouseDown}
              onMouseMove={onStripMouseMove}
              onMouseUp={onStripMouseUp}
              onMouseLeave={onStripMouseUp}
            >
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

          {previewUrl && !isGenerating && (
            <div className="preview-inline" onClick={onPaint} title="Paint!">
              <img src={previewUrl} alt="Selected" className="preview-inline-img" />
            </div>
          )}
        </div>

        {/* Right: settings + generate */}
        <div className="setup-right">
          <div className="setup-divider">or generate your own</div>

          <div className="form-group">
            <label htmlFor="prompt">Prompt</label>
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

          {!isGenerating && (
            <div className="form-group color-count-inline">
              <label htmlFor="colorCount">Colors: <strong>{state.colorCount}</strong></label>
              <input
                id="colorCount"
                type="range"
                min={4}
                max={32}
                value={state.colorCount}
                onChange={e => actions.setColorCount(Number(e.target.value))}
                disabled={isGenerating}
              />
            </div>
          )}

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
                    Paint!
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
