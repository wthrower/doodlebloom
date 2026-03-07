import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minimize2, ScanSearch } from 'lucide-react'
import type { GameActions, GameState } from '../App'
import { PillToggle } from '../components/PillToggle'
import { renderPuzzle, flashRegion, buildOutlineChains, dpSimplify } from '../game/canvas'
import type { OutlineBatch } from '../game/canvas'
import { colorDist } from '../game/colorDistance'
import { getRegionAt } from '../game/regions'
import { CURSOR_CAN_FILL, CURSOR_CANT_FILL } from '../game/cursors'

interface Props {
  state: GameState
  actions: GameActions
  onNewPuzzle: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
}

interface Transform { scale: number; tx: number; ty: number }

const MIN_SCALE = 1
const MAX_SCALE = 8

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

function clampTransform(t: Transform): Transform {
  if (t.scale <= MIN_SCALE) return { scale: MIN_SCALE, tx: 0, ty: 0 }
  return t
}

export function GameScreen({ state, actions, onNewPuzzle, isFullscreen, onToggleFullscreen }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const outlineSvgRef = useRef<SVGSVGElement>(null)
  const outlineChainsRef = useRef<OutlineBatch | null>(null)
  const outlineRafRef = useRef(0)
  const [activeColorIndex, setActiveColorIndex] = useState<number | null>(() => {
    const rs = state.regions
    if (rs.length === 0) return null
    const totals = new Map<number, number>()
    for (const r of rs) totals.set(r.colorIndex, (totals.get(r.colorIndex) ?? 0) + r.pixelCount)
    let dominant = 0, max = 0
    for (const [ci, total] of totals) { if (total > max) { max = total; dominant = ci } }
    return dominant
  })
  const [cheatActive, setCheatActive] = useState(false)
  const { palette, regions, playerColors, canvasWidth, canvasHeight, revealMode, showOutline, screen } = state
  const { indexMapRef, regionMapRef, originalImageDataRef, fillRegion } = actions

  // --- Refs for event handlers (avoid stale closures, avoid re-adding listeners) ---
  const transformRef = useRef<Transform>({ scale: 1, tx: 0, ty: 0 })
  const displaySizeRef = useRef(0)
  const activeColorRef = useRef<number | null>(null)
  const regionsRef = useRef(regions)
  const playerColorsRef = useRef(playerColors)
  const fillRegionRef = useRef(fillRegion)

  useEffect(() => { activeColorRef.current = activeColorIndex }, [activeColorIndex])
  useEffect(() => { regionsRef.current = regions }, [regions])
  useEffect(() => { playerColorsRef.current = playerColors }, [playerColors])
  useEffect(() => { fillRegionRef.current = fillRegion }, [fillRegion])

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
    return { sortedPaletteIndices: bestChain, colorDisplayNumbers: displayNums }
  }, [palette])

  // When the active color becomes fully filled, auto-select the color with the most remaining unfilled pixels
  useEffect(() => {
    if (activeColorIndex === null) return
    const allFilled = regions
      .filter(r => r.colorIndex === activeColorIndex)
      .every(r => playerColors[r.id] !== undefined)
    if (!allFilled) return

    const unfilled = new Map<number, number>()
    for (const r of regions) {
      if (playerColors[r.id] === undefined) {
        unfilled.set(r.colorIndex, (unfilled.get(r.colorIndex) ?? 0) + r.pixelCount)
      }
    }
    if (unfilled.size === 0) { setActiveColorIndex(null); return }

    let next = activeColorIndex, max = 0
    for (const [ci, total] of unfilled) {
      if (total > max) { max = total; next = ci }
    }
    setActiveColorIndex(next)
  }, [playerColors, activeColorIndex, regions])

  // --- SVG outline overlay: redraws in screen coordinates on every zoom/pan/resize ---
  // The SVG is not CSS-transformed, so its paths are rendered at screen resolution.
  // Throttled to one update per animation frame; adaptive DP epsilon reduces point
  // count at low zoom (fewer points = faster SVG render + fewer string ops).
  const updateOutlineSvg = useCallback(() => {
    cancelAnimationFrame(outlineRafRef.current)
    outlineRafRef.current = requestAnimationFrame(() => {
      const svg = outlineSvgRef.current
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      const batch = outlineChainsRef.current
      if (!svg || !canvas || !wrap || !batch) return

      const { tx, ty, scale } = transformRef.current
      const displayW = displaySizeRef.current || canvasWidth
      const pixelScale = (displayW / canvasWidth) * scale
      const ox = canvas.offsetLeft + tx
      const oy = canvas.offsetTop + ty
      const wrapW = wrap.clientWidth
      const wrapH = wrap.clientHeight

      // Epsilon in canvas units: target ~2 screen pixels of tolerance so noisy
      // pixel-level detail collapses into smooth region boundaries.
      // Scales up at low zoom (fewer points needed when image is small on screen).
      const epsilon = Math.max(2, 2 / pixelScale)

      // Convert canvas coords to screen coords
      const sx = (cx: number) => (ox + cx * pixelScale).toFixed(1)
      const sy = (cy: number) => (oy + cy * pixelScale).toFixed(1)

      // Visible canvas bounds (with small margin for curves that extend slightly outside bbox)
      const margin = epsilon * 2
      const visMinX = (-ox / pixelScale) - margin
      const visMinY = (-oy / pixelScale) - margin
      const visMaxX = visMinX + (wrapW / pixelScale) + margin * 2
      const visMaxY = visMinY + (wrapH / pixelScale) + margin * 2

      const { chains, bboxes } = batch
      const t = 0.6 // Catmull-Rom tension
      const parts: string[] = []

      for (let ci = 0; ci < chains.length; ci++) {
        // Viewport cull: skip chains entirely outside the visible area
        const bi = ci * 4
        if (bboxes[bi + 2] < visMinX || bboxes[bi] > visMaxX ||
            bboxes[bi + 3] < visMinY || bboxes[bi + 1] > visMaxY) continue

        const pts = dpSimplify(chains[ci], epsilon)
        if (pts.length < 2) continue
        parts.push(`M${sx(pts[0][0])},${sy(pts[0][1])}`)

        // Catmull-Rom → cubic Bezier, with straight-line fallback.
        // If both control points deviate less than 1 canvas px from the chord,
        // the curve is imperceptibly different from a line -- use L to avoid
        // bowing long straight segments at sharp-angled junctions.
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)]
          const p1 = pts[i]
          const p2 = pts[i + 1]
          const p3 = pts[Math.min(pts.length - 1, i + 2)]
          const cp1x = p1[0] + (p2[0] - p0[0]) * t / 3
          const cp1y = p1[1] + (p2[1] - p0[1]) * t / 3
          const cp2x = p2[0] - (p3[0] - p1[0]) * t / 3
          const cp2y = p2[1] - (p3[1] - p1[1]) * t / 3
          // Only curve short segments -- long segments are straight lines and
          // Catmull-Rom would bow them based on the angle at their endpoints.
          const segLen = Math.sqrt((p2[0]-p1[0])**2 + (p2[1]-p1[1])**2)
          if (segLen > 12) {
            parts.push(`L${sx(p2[0])},${sy(p2[1])}`)
          } else {
            parts.push(`C${sx(cp1x)},${sy(cp1y)} ${sx(cp2x)},${sy(cp2y)} ${sx(p2[0])},${sy(p2[1])}`)
          }
        }
      }

      // Line thickness scales with zoom so outlines stay proportional to image content.
      // Clamped to 1px minimum when the image is displayed smaller than native.
      const strokeWidth = Math.max(1, scale)

      // Update SVG elements directly (bypass React VDOM for perf)
      const path = svg.querySelector('path')
      if (path) {
        path.setAttribute('d', parts.join(' '))
        path.setAttribute('stroke-width', strokeWidth.toFixed(2))
      }
    })
  }, [canvasWidth])

  // Rebuild outline chains when puzzle changes
  useEffect(() => {
    if (!regionMapRef.current || regions.length === 0) { outlineChainsRef.current = null; return }
    outlineChainsRef.current = buildOutlineChains(regionMapRef.current, regions, canvasWidth, canvasHeight)
    updateOutlineSvg()
  }, [regions, canvasWidth, canvasHeight, regionMapRef, updateOutlineSvg])

  // Trigger a CSS transform + state re-render
  const [, forceRender] = useState(0)
  const setTransform = useCallback((t: Transform) => {
    transformRef.current = t
    const canvas = canvasRef.current
    if (canvas) {
      canvas.style.transformOrigin = '0 0'
      canvas.style.transform = `translate(${t.tx}px,${t.ty}px) scale(${t.scale})`
    }
    updateOutlineSvg()
    forceRender(n => n + 1)
  }, [updateOutlineSvg])

  // --- ResizeObserver: fit canvas inside wrap, maintaining aspect ratio ---
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const aspect = canvasWidth / canvasHeight
      let w = width, h = width / aspect
      if (h > height) { h = height; w = height * aspect }
      displaySizeRef.current = w
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      updateOutlineSvg()
    })
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [updateOutlineSvg])

  // --- Render puzzle pixels ---
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !indexMapRef.current || !regionMapRef.current) return
    const ctx = canvas.getContext('2d')!
    renderPuzzle(ctx, canvasWidth, canvasHeight, indexMapRef.current, regionMapRef.current, regions, palette, {
      playerColors,
      activeColorIndex,
      revealMode,
      originalImageData: originalImageDataRef.current,
      colorDisplayNumbers,
    })

    if (cheatActive && activeColorIndex !== null) {
      const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight)
      const data = imageData.data
      const regionColorMap = new Map(regions.map(r => [r.id, r.colorIndex]))
      for (let i = 0; i < canvasWidth * canvasHeight; i++) {
        const regionId = regionMapRef.current![i]
        if (regionId < 0) continue
        if (regionColorMap.get(regionId) !== activeColorIndex) continue
        if (playerColors[regionId] !== undefined) continue
        const pi = i * 4
        data[pi]     = 255
        data[pi + 1] = 0
        data[pi + 2] = 255
      }
      ctx.putImageData(imageData, 0, 0)
    }
  }, [playerColors, activeColorIndex, regions, palette, revealMode, showOutline, screen, canvasWidth, canvasHeight, indexMapRef, regionMapRef, originalImageDataRef, cheatActive, colorDisplayNumbers])

  // --- Coordinate mapping: screen → canvas pixels ---
  // Use wrap rect + canvas.offsetLeft/Top (layout position, no transform) + explicit transform.
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return null
    const { tx, ty, scale } = transformRef.current
    const displayW = displaySizeRef.current || canvasWidth
    const wr = wrap.getBoundingClientRect()
    // canvas.offsetLeft/Top: layout position within wrap, unaffected by CSS transform
    const lx = (clientX - wr.left - canvas.offsetLeft - tx) / scale
    const ly = (clientY - wr.top - canvas.offsetTop - ty) / scale
    // Uniform scale: canvasWidth/displayW === canvasHeight/displayH (aspect ratio maintained)
    const s = canvasWidth / displayW
    return { x: lx * s, y: ly * s }
  }, [canvasWidth, canvasHeight])

  // --- Tap action ---
  const handleTap = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || !regionMapRef.current || activeColorRef.current === null) return
    const pos = screenToCanvas(clientX, clientY)
    if (!pos) return
    const colorIndex = activeColorRef.current
    const regionId = getRegionAt(pos.x, pos.y, regionMapRef.current, canvasWidth, canvasHeight)
    if (regionId < 0) return
    const region = regionsRef.current.find(r => r.id === regionId)
    if (!region || playerColorsRef.current[regionId] !== undefined) return
    if (colorIndex === region.colorIndex) {
      fillRegionRef.current(regionId, colorIndex)
    } else {
      flashRegion(canvas.getContext('2d')!, regionId, regionMapRef.current, canvasWidth, canvasHeight)
    }
  }, [canvasWidth, canvasHeight, regionMapRef, screenToCanvas])

  // --- Cheat key (x): highlight unfilled cells of selected color ---
  // --- Cheat key (w): fill everything and win ---
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'x' || e.key === 'X') setCheatActive(true)
      if (e.key === 'w' || e.key === 'W') {
        for (const r of regionsRef.current) fillRegionRef.current(r.id, r.colorIndex)
      }
    }
    const up = (e: KeyboardEvent) => { if (e.key === 'x' || e.key === 'X') setCheatActive(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // --- Wheel + mouse + touch gesture listeners (non-passive) ---
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    // Set initial cursor
    canvas.style.cursor = CURSOR_CANT_FILL

    // Mouse pan
    let mouseDown: { x: number; y: number; tx: number; ty: number; scale: number } | null = null
    let mouseDragged = false

    const updateCursor = (clientX: number, clientY: number) => {
      const pos = screenToCanvas(clientX, clientY)
      if (pos && regionMapRef.current && activeColorRef.current !== null) {
        const regionId = getRegionAt(pos.x, pos.y, regionMapRef.current, canvasWidth, canvasHeight)
        const region = regionId >= 0 ? regionsRef.current.find(r => r.id === regionId) : null
        const canFill = region
          && playerColorsRef.current[regionId] === undefined
          && activeColorRef.current === region.colorIndex
        canvas.style.cursor = canFill ? CURSOR_CAN_FILL : CURSOR_CANT_FILL
      } else {
        canvas.style.cursor = CURSOR_CANT_FILL
      }
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      mouseDown = { x: e.clientX, y: e.clientY, ...transformRef.current }
      mouseDragged = false
    }
    const onMouseMove = (e: MouseEvent) => {
      updateCursor(e.clientX, e.clientY)
      if (!mouseDown) return
      const dx = e.clientX - mouseDown.x
      const dy = e.clientY - mouseDown.y
      if (!mouseDragged && Math.hypot(dx, dy) > 4) mouseDragged = true
      if (mouseDragged) {
        setTransform(clampTransform({ scale: mouseDown.scale, tx: mouseDown.tx + dx, ty: mouseDown.ty + dy }))
      }
    }
    const onMouseUp = (e: MouseEvent) => {
      if (!mouseDown) return
      if (!mouseDragged) handleTap(e.clientX, e.clientY)
      mouseDown = null
    }

    // Touch tracking
    const touches = new Map<number, { x: number; y: number }>()
    let pinchStart: { dist: number; midX: number; midY: number; scale: number; tx: number; ty: number } | null = null
    let panStart: { x: number; y: number; scale: number; tx: number; ty: number } | null = null
    let tapStart: { x: number; y: number; time: number } | null = null

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { tx, ty, scale } = transformRef.current
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const newScale = clampScale(scale * factor)
      const r = wrap.getBoundingClientRect()
      // Position relative to canvas layout origin (offsetLeft accounts for flex centering)
      const wx = e.clientX - r.left - canvas.offsetLeft
      const wy = e.clientY - r.top - canvas.offsetTop
      const lx = (wx - tx) / scale
      const ly = (wy - ty) / scale
      setTransform(clampTransform({ scale: newScale, tx: wx - lx * newScale, ty: wy - ly * newScale }))
    }

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      for (const t of Array.from(e.changedTouches)) touches.set(t.identifier, { x: t.clientX, y: t.clientY })
      const all = [...touches.values()]
      if (all.length === 1) {
        const p = all[0]
        tapStart = { x: p.x, y: p.y, time: Date.now() }
        panStart = null
        pinchStart = null
      } else if (all.length >= 2) {
        tapStart = null
        panStart = null
        const [a, b] = all
        pinchStart = {
          dist: Math.hypot(b.x - a.x, b.y - a.y),
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2,
          ...transformRef.current,
        }
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      for (const t of Array.from(e.changedTouches)) touches.set(t.identifier, { x: t.clientX, y: t.clientY })
      const all = [...touches.values()]

      if (all.length === 1) {
        const p = all[0]
        if (tapStart && Math.hypot(p.x - tapStart.x, p.y - tapStart.y) > 8) {
          panStart = { x: p.x, y: p.y, ...transformRef.current }
          tapStart = null
        }
        if (panStart) {
          setTransform(clampTransform({ scale: panStart.scale, tx: panStart.tx + (p.x - panStart.x), ty: panStart.ty + (p.y - panStart.y) }))
        }
      } else if (all.length >= 2 && pinchStart) {
        const [a, b] = all
        const dist = Math.hypot(b.x - a.x, b.y - a.y)
        const midX = (a.x + b.x) / 2
        const midY = (a.y + b.y) / 2
        const newScale = clampScale(pinchStart.scale * (dist / pinchStart.dist))
        const r = wrap.getBoundingClientRect()
        const ox = canvas.offsetLeft, oy = canvas.offsetTop
        // Anchor the starting pinch midpoint in canvas-local space
        const wStart = { x: pinchStart.midX - r.left - ox, y: pinchStart.midY - r.top - oy }
        const lx = (wStart.x - pinchStart.tx) / pinchStart.scale
        const ly = (wStart.y - pinchStart.ty) / pinchStart.scale
        const wNew = { x: midX - r.left - ox, y: midY - r.top - oy }
        setTransform(clampTransform({ scale: newScale, tx: wNew.x - lx * newScale, ty: wNew.y - ly * newScale }))
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault()
      const wasSingle = touches.size === 1
      for (const t of Array.from(e.changedTouches)) touches.delete(t.identifier)
      if (wasSingle && tapStart && Date.now() - tapStart.time < 300) {
        handleTap(tapStart.x, tapStart.y)
      }
      if (touches.size === 0) { pinchStart = null; panStart = null; tapStart = null }
    }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd, { passive: false })
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [canvasWidth, handleTap, setTransform]) // handleTap is stable via useCallback with refs

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
  const isZoomed = transformRef.current.scale > 1.05

  return (
    <div className="screen game-screen">
      <div className="game-header">
        <button className="btn btn-ghost btn-small" onClick={actions.resetPuzzle}>
          New
        </button>
        <PillToggle
          options={[{ value: 'flat', label: 'Flat' }, { value: 'photo', label: 'Reveal' }]}
          value={revealMode}
          onChange={actions.setRevealMode}
        />
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="progress-text">{progress}%</span>
        {state.screen !== 'complete' && (
          <button
            className={`btn btn-small ${cheatActive ? 'btn-active' : 'btn-ghost'}`}
            onMouseDown={() => setCheatActive(true)}
            onMouseUp={() => setCheatActive(false)}
            onMouseLeave={() => setCheatActive(false)}
            onTouchStart={e => { e.preventDefault(); setCheatActive(true) }}
            onTouchEnd={() => setCheatActive(false)}
          >
            Hint
          </button>
        )}
        {isZoomed && (
          <button
            className="btn btn-ghost btn-icon btn-small"
            onClick={() => setTransform({ scale: 1, tx: 0, ty: 0 })}
            aria-label="Reset zoom"
          >
            <ScanSearch size={15} />
          </button>
        )}
        <button
          className="btn btn-ghost btn-icon btn-small"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      <div className="canvas-wrap" ref={wrapRef}>
        {/* Canvas stays in DOM when complete so download still works */}
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="puzzle-canvas"
        />
        {/* SVG outline overlay: not CSS-transformed, redrawn in screen coords on zoom/pan */}
        <svg
          ref={outlineSvgRef}
          className="outline-svg"
          style={{ visibility: (state.screen === 'complete' && !showOutline) ? 'hidden' : 'visible' }}
        >
          <path fill="none" stroke="rgba(0,0,0,0.75)" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>

      {state.screen === 'complete' ? (
        <div className="win-footer">
          <div className="win-footer-title">You did it!</div>
          <div className="win-footer-actions">
            <PillToggle
              options={[{ value: true, label: 'Outline' }, { value: false, label: 'Clean' }]}
              value={showOutline}
              onChange={actions.setShowOutline}
            />
            <button className="btn btn-secondary" onClick={onNewPuzzle}>New puzzle</button>
            <button className="btn btn-primary" onClick={handleDownload}>Download</button>
          </div>
        </div>
      ) : (
      <div className="palette">
        {sortedPaletteIndices.map(idx => {
          const color = palette[idx]
          const { r, g, b } = color
          const regionsOfColor = regions.filter(region => region.colorIndex === idx)
          if (regionsOfColor.length === 0) return null
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
              <span className="swatch-number">{colorDisplayNumbers[idx]}</span>
              {isComplete && <span className="swatch-check" style={{ color: checkColor }}>✓</span>}
            </button>
          )
        })}
      </div>
      )}
    </div>
  )
}
