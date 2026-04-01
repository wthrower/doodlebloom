import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Lightbulb, Maximize2, Minimize2, RotateCcw, ScanSearch } from 'lucide-react'
import type { GameState } from '../types'
import type { GameActions } from '../hooks/useGame'
import { DoodlebloomLogo, DoodlebloomMini } from '../components/DoodlebloomLogo'
import { ScrollChevrons } from '../components/ScrollChevrons'
import { useConfetti } from '../hooks/useConfetti'
import { usePanZoom } from '../hooks/usePanZoom'
import { useOutlineSvg } from '../hooks/useOutlineSvg'
import { renderPuzzle, flashRegion } from '../game/canvas'
import { colorDist } from '../game/colorDistance'
import { getRegionAt } from '../game/regions'
import { CURSOR_CAN_FILL, CURSOR_CANT_FILL } from '../game/cursors'

const IS_STANDALONE = typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as any).standalone)

interface Props {
  state: GameState
  actions: GameActions
  onNewPuzzle: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  hasSaved: boolean
  onStartFresh: () => void
}

export function PaintScreen({ state, actions, onNewPuzzle, isFullscreen, onToggleFullscreen, hasSaved, onStartFresh }: Props) {
  const [showResumePrompt, setShowResumePrompt] = useState(hasSaved)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const confetti = useConfetti()
  const paletteRef = useRef<HTMLDivElement>(null)
  const outlineSvgRef = useRef<SVGSVGElement>(null)
  const numbersSvgRef = useRef<SVGSVGElement>(null)
  const numbersRafRef = useRef(0)
  const [activeColorIndex, setActiveColorIndex] = useState<number | null>(() => {
    const rs = state.regions
    if (rs.length === 0) return null
    const totals = new Map<number, number>()
    for (const r of rs) totals.set(r.colorIndex, (totals.get(r.colorIndex) ?? 0) + r.pixelCount)
    let dominant = 0, max = 0
    for (const [ci, total] of totals) { if (total > max) { max = total; dominant = ci } }
    return dominant
  })
  const [showHint, setShowHint] = useState(false)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintHeldRef = useRef(false)

  const cancelFlash = useCallback(() => {
    if (hintTimerRef.current) { clearTimeout(hintTimerRef.current); hintTimerRef.current = null }
  }, [])

  const flashHint = useCallback(() => {
    cancelFlash()
    let count = 0
    const flash = () => {
      if (count >= 10) { setShowHint(false); hintTimerRef.current = null; return }
      setShowHint(true)
      count++
      hintTimerRef.current = setTimeout(() => {
        setShowHint(false)
        hintTimerRef.current = setTimeout(flash, 100)
      }, 200)
    }
    flash()
  }, [cancelFlash])

  const hintDown = useCallback(() => {
    cancelFlash()
    hintHeldRef.current = true
    hintTimerRef.current = setTimeout(() => {
      if (hintHeldRef.current) setShowHint(true)
    }, 200)
  }, [cancelFlash])

  const showHintRef = useRef(false)
  useEffect(() => { showHintRef.current = showHint }, [showHint])

  const hintUp = useCallback(() => {
    if (!hintHeldRef.current) return
    hintHeldRef.current = false
    cancelFlash()
    if (showHintRef.current) {
      setShowHint(false)
    } else {
      flashHint()
    }
  }, [cancelFlash, flashHint])

  useEffect(() => {
    return () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current) }
  }, [])

  const [outlineMagenta, setOutlineMagenta] = useState(false)
  const { palette, regions, playerColors, canvasWidth, canvasHeight, showOutline, screen } = state
  const { getIndexMap, getRegionMap, getOriginalImageData, fillRegion } = actions
  const prevScreenRef = useRef(screen)
  useEffect(() => {
    if (screen === 'complete' && prevScreenRef.current !== 'complete') confetti.fire()
    prevScreenRef.current = screen
  }, [screen, confetti.fire])

  // --- Refs for event handlers (avoid stale closures, avoid re-adding listeners) ---
  const activeColorRef = useRef<number | null>(null)
  const regionsRef = useRef(regions)
  const playerColorsRef = useRef(playerColors)
  const fillRegionRef = useRef(fillRegion)
  const sortedPaletteRef = useRef<number[]>([])

  useEffect(() => { activeColorRef.current = activeColorIndex }, [activeColorIndex])
  useEffect(() => { regionsRef.current = regions }, [regions])
  useEffect(() => { playerColorsRef.current = playerColors }, [playerColors])
  useEffect(() => { fillRegionRef.current = fillRegion }, [fillRegion])

  // Scroll the active swatch to center of the palette
  useEffect(() => {
    if (activeColorIndex === null) return
    const container = paletteRef.current
    if (!container) return
    const swatch = container.querySelector('.palette-swatch.active') as HTMLElement | null
    if (swatch) swatch.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeColorIndex])

  // --- Callback refs (filled after hooks are called, read at event time) ---
  const onTransformChangeRef = useRef<(() => void) | null>(null)
  const onTapRef = useRef<(clientX: number, clientY: number) => void>(() => {})
  const onPointerMoveRef = useRef<((clientX: number, clientY: number) => void) | null>(null)

  // --- Pan/zoom hook (called first -- refs are wired after) ---
  const panZoom = usePanZoom({
    canvasRef, wrapRef, canvasWidth, canvasHeight,
    onTapRef, onPointerMoveRef, onTransformChangeRef,
  })

  // --- Outline SVG hook (uses panZoom refs) ---
  const { updateOutlineSvg } = useOutlineSvg({
    outlineSvgRef, canvasRef, wrapRef,
    transformRef: panZoom.transformRef,
    displaySizeRef: panZoom.displaySizeRef,
    getRegionMap, getOriginalImageData,
    regions, canvasWidth, canvasHeight,
  })

  // --- SVG number overlay ---
  const updateNumbersSvg = useCallback(() => {
    cancelAnimationFrame(numbersRafRef.current)
    numbersRafRef.current = requestAnimationFrame(() => {
      const svg = numbersSvgRef.current
      const canvas = canvasRef.current
      if (!svg || !canvas) return

      const { tx, ty, scale } = panZoom.transformRef.current
      const displayW = panZoom.displaySizeRef.current || canvasWidth
      const pixelScale = (displayW / canvasWidth) * scale
      const ox = canvas.offsetLeft + tx
      const oy = canvas.offsetTop + ty

      const currentRegions = regionsRef.current
      const currentPlayerColors = playerColorsRef.current
      const currentActive = activeColorRef.current
      const displayNums = sortedPaletteRef.current.length > 0
        ? Object.fromEntries(sortedPaletteRef.current.map((ci, pos) => [ci, pos + 1]))
        : {} as Record<number, number>

      const parts: string[] = []
      for (const region of currentRegions) {
        if (currentPlayerColors[region.id] !== undefined) continue
        const label = displayNums[region.colorIndex] ?? region.colorIndex + 1
        const fill = region.colorIndex === currentActive ? '#2e7d32' : 'rgba(0,0,0,0.25)'
        const labelPoints = region.labels?.length ? region.labels : [{ x: region.centroid.x, y: region.centroid.y, radius: region.labelRadius }]
        for (const lp of labelPoints) {
          const sx = ox + lp.x * pixelScale
          const sy = oy + lp.y * pixelScale
          const canvasFontSize = Math.max(9, Math.min(Math.round(lp.radius * 0.8), 72))
          const fontSize = Math.max(6, canvasFontSize * pixelScale)
          parts.push(`<text x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" font-size="${fontSize.toFixed(1)}" fill="${fill}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">${label}</text>`)
        }
      }
      svg.innerHTML = parts.join('')
    })
  }, [canvasWidth])

  // --- Wire callback refs (read at event time, not setup time) ---
  onTransformChangeRef.current = () => { updateOutlineSvg(); updateNumbersSvg() }

  onTapRef.current = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    const rm = getRegionMap()
    if (!canvas || !rm || activeColorRef.current === null) return
    const pos = panZoom.screenToCanvas(clientX, clientY)
    if (!pos) return
    const colorIndex = activeColorRef.current
    const regionId = getRegionAt(pos.x, pos.y, rm, canvasWidth, canvasHeight)
    if (regionId < 0) return
    const region = regionsRef.current.find(r => r.id === regionId)
    if (!region || playerColorsRef.current[regionId] !== undefined) return
    if (colorIndex === region.colorIndex) {
      fillRegionRef.current(regionId, colorIndex)
    } else {
      flashRegion(canvas.getContext('2d')!, regionId, rm, canvasWidth, canvasHeight)
    }
  }

  onPointerMoveRef.current = (clientX: number, clientY: number) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const pos = panZoom.screenToCanvas(clientX, clientY)
    const rm = getRegionMap()
    if (pos && rm && activeColorRef.current !== null) {
      const regionId = getRegionAt(pos.x, pos.y, rm, canvasWidth, canvasHeight)
      const region = regionId >= 0 ? regionsRef.current.find(r => r.id === regionId) : null
      const canFill = region
        && playerColorsRef.current[regionId] === undefined
        && activeColorRef.current === region.colorIndex
      wrap.style.cursor = canFill ? CURSOR_CAN_FILL : CURSOR_CANT_FILL
    } else {
      wrap.style.cursor = CURSOR_CANT_FILL
    }
  }

  // Sort palette by nearest-neighbor chaining (greedy, RGB Euclidean distance)
  const { sortedPaletteIndices, colorDisplayNumbers } = useMemo(() => {
    const n = palette.length
    const dist = (a: number, b: number) =>
      colorDist(palette[a].r, palette[a].g, palette[a].b, palette[b].r, palette[b].g, palette[b].b)

    let bestChain: number[] = []
    let bestTotal = Infinity

    for (let start = 0; start < n; start++) {
      const visited = new Uint8Array(n)
      const chain: number[] = []
      let current = start
      let total = 0

      while (chain.length < n) {
        visited[current] = 1
        chain.push(current)
        let nearest = -1, nearestDist = Infinity
        for (let i = 0; i < n; i++) {
          if (!visited[i]) {
            const d = dist(current, i)
            if (d < nearestDist) { nearestDist = d; nearest = i }
          }
        }
        if (nearest < 0) break
        total += nearestDist
        current = nearest
      }

      if (total < bestTotal) { bestTotal = total; bestChain = chain }
    }

    const displayNums: Record<number, number> = {}
    bestChain.forEach((colorIdx, pos) => { displayNums[colorIdx] = pos + 1 })
    sortedPaletteRef.current = bestChain
    return { sortedPaletteIndices: bestChain, colorDisplayNumbers: displayNums }
  }, [palette])

  const regionsByColorIndex = useMemo(() => {
    const m = new Map<number, typeof regions>()
    for (const r of regions) {
      const list = m.get(r.colorIndex)
      if (list) list.push(r)
      else m.set(r.colorIndex, [r])
    }
    return m
  }, [regions])

  // When the active color is null or fully filled, auto-select the color with the most remaining unfilled pixels
  useEffect(() => {
    if (activeColorIndex !== null) {
      const group = regionsByColorIndex.get(activeColorIndex) ?? []
      const allFilled = group.length > 0 && group.every(r => playerColors[r.id] !== undefined)
      if (!allFilled) return
    }

    const unfilled = new Map<number, number>()
    for (const r of regions) {
      if (playerColors[r.id] === undefined) {
        unfilled.set(r.colorIndex, (unfilled.get(r.colorIndex) ?? 0) + r.pixelCount)
      }
    }
    if (unfilled.size === 0) { setActiveColorIndex(null); return }

    let next = activeColorIndex ?? 0, max = 0
    for (const [ci, total] of unfilled) {
      if (total > max) { max = total; next = ci }
    }
    setActiveColorIndex(next)
  }, [playerColors, activeColorIndex, regions, regionsByColorIndex])

  // --- Render puzzle pixels ---
  useEffect(() => {
    const canvas = canvasRef.current
    const im = getIndexMap(), rm = getRegionMap()
    if (!canvas || !im || !rm) return
    const ctx = canvas.getContext('2d')!
    renderPuzzle(ctx, canvasWidth, canvasHeight, im, rm, regions, palette, {
      playerColors,
      activeColorIndex,
      originalImageData: getOriginalImageData(),
      showHint,
    })
  }, [playerColors, activeColorIndex, regions, palette, showOutline, screen, canvasWidth, canvasHeight, getIndexMap, getRegionMap, getOriginalImageData, showHint])

  // Update number labels when fills, active color, or palette change
  useEffect(() => {
    updateNumbersSvg()
  }, [playerColors, activeColorIndex, palette, updateNumbersSvg])

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W') {
        for (const r of regionsRef.current) fillRegionRef.current(r.id, r.colorIndex)
      }
      const numKey = e.key >= '0' && e.key <= '9'
        ? (e.key === '0' ? 10 : Number(e.key))
        : 0
      if (numKey > 0 && numKey <= sortedPaletteRef.current.length) {
        const colorIdx = sortedPaletteRef.current[numKey - 1]
        setActiveColorIndex(colorIdx)
      }
      if (e.key === '/') { e.preventDefault(); actions.toggleSpreadPalette() }
      if (e.key === '\\') setOutlineMagenta(v => !v)
    }
    window.addEventListener('keydown', down)
    return () => { window.removeEventListener('keydown', down) }
  }, [])

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'doodlebloom.png'
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [])

  const filledCount = regions.filter(r => playerColors[r.id] !== undefined).length
  const totalCount = regions.length
  const progress = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0

  const colorRegions = activeColorIndex !== null ? regions.filter(r => r.colorIndex === activeColorIndex) : []
  const colorFilled = colorRegions.filter(r => playerColors[r.id] !== undefined).length
  const colorProgress = colorRegions.length > 0 ? Math.round((colorFilled / colorRegions.length) * 100) : 0
  const activeColor = activeColorIndex !== null ? palette[activeColorIndex] : null
  const colorRgb = activeColor ? `${activeColor.r},${activeColor.g},${activeColor.b}` : '128,128,128'
  const activeLum = activeColor ? (0.299 * activeColor.r + 0.587 * activeColor.g + 0.114 * activeColor.b) / 255 : 0.5
  const incompleteFill = !activeColor ? 'transparent' : activeLum < 0.5
    ? `rgba(${Math.min(255, activeColor.r + 80)},${Math.min(255, activeColor.g + 80)},${Math.min(255, activeColor.b + 80)},0.3)`
    : `rgba(${Math.max(0, activeColor.r - 80)},${Math.max(0, activeColor.g - 80)},${Math.max(0, activeColor.b - 80)},0.3)`

  return (
    <div className="screen game-screen">
      <div className="game-header">
        <button className="btn btn-ghost btn-icon btn-small" onClick={actions.resetPuzzle} title="New puzzle" aria-label="New puzzle">
          <ArrowLeft size={18} />
        </button>
        <button className="btn btn-ghost btn-icon btn-small" onClick={actions.resetProgress} title="Reset progress" aria-label="Reset progress">
          <RotateCcw size={18} />
        </button>
        <div className="game-header-logo"><DoodlebloomLogo /></div>
        <div className="game-header-mini">
          <DoodlebloomMini />
          <div className="mini-progress-stack" style={{ cursor: 'pointer' }} onMouseDown={hintDown} onMouseUp={hintUp} onMouseLeave={hintUp} onTouchStart={(e) => { e.preventDefault(); hintDown() }} onTouchEnd={(e) => { e.preventDefault(); hintUp() }} onTouchCancel={hintUp}>
            {activeColor && colorProgress < 100 && (
              <div className="mini-progress color-progress" style={{ border: '1px solid #000', background: incompleteFill }}>
                <div className="mini-progress-fill" style={{ width: `${colorProgress}%`, background: `rgb(${colorRgb})` }} />
              </div>
            )}
            <div className="mini-progress">
              <div className="mini-progress-fill" style={{ width: `${progress}%` }} />
              <span className="mini-progress-text">{filledCount}/{totalCount}</span>
            </div>
          </div>
        </div>
        <div className="game-header-spacer" />
        <div className="progress-bars" style={{ cursor: 'pointer' }} onMouseDown={hintDown} onMouseUp={hintUp} onMouseLeave={hintUp}>
          {activeColor && colorProgress < 100 && (
            <div className="progress-row">
              <div className="progress-bar color-progress" style={{ border: '1px solid #000', background: incompleteFill }}>
                <div className="progress-fill" style={{ width: `${colorProgress}%`, background: `rgb(${colorRgb})` }} />
              </div>
              <span className="progress-text">{colorFilled}/{colorRegions.length}</span>
            </div>
          )}
          <div className="progress-row">
            <div className="progress-bar" style={{ border: '1px solid #000' }}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">{filledCount}/{totalCount}</span>
          </div>
        </div>
        {state.screen !== 'complete' && (
          <button
            className="btn btn-ghost btn-icon btn-small"
            onMouseDown={hintDown}
            onMouseUp={hintUp}
            onMouseLeave={hintUp}
            onTouchStart={(e) => { e.preventDefault(); hintDown() }}
            onTouchEnd={(e) => { e.preventDefault(); hintUp() }}
            onTouchCancel={hintUp}
            onContextMenu={(e) => e.preventDefault()}
            title="Tap to flash, hold to highlight"
            aria-label="Highlight regions"
          >
            <Lightbulb size={18} />
          </button>
        )}
        {panZoom.isZoomed && (
          <button
            className="btn btn-ghost btn-icon btn-small"
            onClick={() => panZoom.setTransform({ scale: 1, tx: 0, ty: 0 })}
            title="Reset zoom"
            aria-label="Reset zoom"
          >
            <ScanSearch size={18} />
          </button>
        )}
        {!IS_STANDALONE && (
          <button
            className="btn btn-ghost btn-icon btn-small"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        )}
      </div>

      <div className="canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="puzzle-canvas"
        />
        <svg
          ref={numbersSvgRef}
          className="outline-svg"
          style={{ visibility: state.screen === 'complete' ? 'hidden' : 'visible' }}
        />
        <svg
          ref={outlineSvgRef}
          className="outline-svg"
          style={{ visibility: state.screen === 'complete' ? 'hidden' : 'visible' }}
        >
          <path fill={outlineMagenta ? 'rgba(255,0,255,0.85)' : 'rgba(0,0,0,0.75)'} stroke="none" />
        </svg>
      </div>

      {state.screen === 'complete' ? (
        <div className="win-footer">
          <div className="win-footer-title">You did it!</div>
          <div className="win-footer-actions">
            <button className="btn btn-secondary" onClick={onNewPuzzle}>New puzzle</button>
            <button className="btn btn-primary" onClick={handleDownload}>Download</button>
          </div>
        </div>
      ) : (
      <div className="scroll-chevron-wrap palette-wrap">
        <ScrollChevrons scrollRef={paletteRef} />
        <div className="palette" ref={paletteRef}>
          {sortedPaletteIndices.map(idx => {
            const color = palette[idx]
            const { r, g, b } = color
            const regionsOfColor = regionsByColorIndex.get(idx)
            if (!regionsOfColor || regionsOfColor.length === 0) return null
            const isActive = activeColorIndex === idx
            const isComplete = regionsOfColor.every(region => playerColors[region.id] === idx)
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
            const checkColor = luminance < 0.5 ? '#fff' : '#000'
            return (
              <button
                key={idx}
                className={`palette-swatch ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`}
                style={{ backgroundColor: `rgb(${r},${g},${b})` }}
                onClick={() => { if (!isComplete) setActiveColorIndex(idx) }}
                aria-label={`Color ${idx + 1}`}
                aria-pressed={isActive}
              >
                {isComplete
                  ? <span className="swatch-check" style={{ color: checkColor }}>✓</span>
                  : <span className="swatch-number">{colorDisplayNumbers[idx]}</span>}
              </button>
            )
          })}
        </div>
      </div>
      )}
      {showResumePrompt && (
        <div className="resume-overlay">
          <div className="resume-dialog">
            <p>Resume previous game?</p>
            <div className="resume-actions">
              <button className="btn btn-secondary" onClick={() => { setShowResumePrompt(false); onStartFresh() }}>Start New</button>
              <button className="btn btn-primary" onClick={() => setShowResumePrompt(false)}>Resume</button>
            </div>
          </div>
        </div>
      )}

      <div className="confetti-container" ref={confetti.ref} />
    </div>
  )
}
