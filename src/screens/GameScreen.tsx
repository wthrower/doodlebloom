import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameActions, GameState } from '../App'
import { renderPuzzle, flashRegion } from '../game/canvas'
import { getRegionAt } from '../game/regions'

interface Props {
  state: GameState
  actions: GameActions
}

export function GameScreen({ state, actions }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [activeColorIndex, setActiveColorIndex] = useState<number | null>(null)
  const { palette, regions, playerColors, canvasWidth, canvasHeight, revealMode } = state
  const { indexMapRef, regionMapRef, originalImageDataRef, fillRegion } = actions

  // Render whenever puzzle state changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !indexMapRef.current || !regionMapRef.current) return
    const ctx = canvas.getContext('2d')!
    renderPuzzle(ctx, canvasWidth, canvasHeight, indexMapRef.current, regionMapRef.current, regions, palette, {
      playerColors,
      activeColorIndex,
      revealMode,
      originalImageData: originalImageDataRef.current,
    })
  }, [playerColors, activeColorIndex, regions, palette, revealMode, canvasWidth, canvasHeight, indexMapRef, regionMapRef, originalImageDataRef])

  const handleCanvasTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas || activeColorIndex === null || !regionMapRef.current) return

    const rect = canvas.getBoundingClientRect()
    let clientX: number, clientY: number
    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    const scaleX = canvasWidth / rect.width
    const scaleY = canvasHeight / rect.height
    const x = (clientX - rect.left) * scaleX
    const y = (clientY - rect.top) * scaleY

    const regionId = getRegionAt(x, y, regionMapRef.current, canvasWidth, canvasHeight)
    if (regionId < 0) return

    const region = regions.find(r => r.id === regionId)
    if (!region) return
    if (playerColors[regionId] !== undefined) return // already filled

    if (activeColorIndex === region.colorIndex) {
      fillRegion(regionId, activeColorIndex)
    } else {
      // Wrong color -- flash
      const ctx = canvas.getContext('2d')!
      flashRegion(ctx, regionId, regionMapRef.current, canvasWidth, canvasHeight)
    }
  }, [activeColorIndex, canvasWidth, canvasHeight, regions, playerColors, fillRegion, regionMapRef])

  const filledCount = regions.filter(r => playerColors[r.id] !== undefined).length
  const totalCount = regions.length
  const progress = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0

  return (
    <div className="screen game-screen">
      <div className="game-header">
        <button className="btn btn-ghost btn-small" onClick={actions.resetPuzzle}>
          New
        </button>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="progress-text">{progress}%</span>
      </div>

      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="puzzle-canvas"
          onClick={handleCanvasTap}
          onTouchStart={e => { e.preventDefault(); handleCanvasTap(e) }}
        />
      </div>

      <div className="palette">
        {palette.map((color, idx) => {
          const { r, g, b } = color
          const isActive = activeColorIndex === idx
          const isComplete = regions
            .filter(region => region.colorIndex === idx)
            .every(region => playerColors[region.id] === idx)
          return (
            <button
              key={idx}
              className={`palette-swatch ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`}
              style={{ backgroundColor: `rgb(${r},${g},${b})` }}
              onClick={() => setActiveColorIndex(isActive ? null : idx)}
              aria-label={`Color ${idx + 1}`}
              aria-pressed={isActive}
            >
              <span className="swatch-number">{idx + 1}</span>
              {isComplete && <span className="swatch-check">✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
