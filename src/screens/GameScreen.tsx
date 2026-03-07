import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameActions, GameState } from '../App'
import { PillToggle } from '../components/PillToggle'
import { renderPuzzle, flashRegion } from '../game/canvas'
import { colorDist } from '../game/colorDistance'
import { getRegionAt } from '../game/regions'
import { CURSOR_CAN_FILL, CURSOR_CANT_FILL } from '../game/cursors'

interface Props {
  state: GameState
  actions: GameActions
  onNewPuzzle: () => void
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

export function GameScreen({ state, actions, onNewPuzzle }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
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
  const { palette, regions, playerColors, canvasWidth, canvasHeight, revealMode } = state
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

  // Trigger a CSS transform + state re-render
  const [, forceRender] = useState(0)
  const setTransform = useCallback((t: Transform) => {
    transformRef.current = t
    const canvas = canvasRef.current
    if (canvas) {
      canvas.style.transformOrigin = '0 0'
      canvas.style.transform = `translate(${t.tx}px,${t.ty}px) scale(${t.scale})`
    }
    forceRender(n => n + 1)
  }, [])

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
    })
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

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
        data[pi]     = Math.round(data[pi]     * 0.3 + 255 * 0.7)
        data[pi + 1] = Math.round(data[pi + 1] * 0.3)
        data[pi + 2] = Math.round(data[pi + 2] * 0.3 + 255 * 0.7)
      }
      ctx.putImageData(imageData, 0, 0)
    }
  }, [playerColors, activeColorIndex, regions, palette, revealMode, canvasWidth, canvasHeight, indexMapRef, regionMapRef, originalImageDataRef, cheatActive, colorDisplayNumbers])

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
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'x' || e.key === 'X') setCheatActive(true) }
    const up   = (e: KeyboardEvent) => { if (e.key === 'x' || e.key === 'X') setCheatActive(false) }
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

      if (all.length === 1 && tapStart) {
        const p = all[0]
        if (Math.hypot(p.x - tapStart.x, p.y - tapStart.y) > 8) tapStart = null
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
        {isZoomed && (
          <button
            className="btn btn-ghost btn-small"
            onClick={() => setTransform({ scale: 1, tx: 0, ty: 0 })}
          >
            Reset
          </button>
        )}
      </div>

      <div className="canvas-wrap" ref={wrapRef}>
        {/* Canvas stays in DOM when complete so download still works */}
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="puzzle-canvas"
        />
      </div>

      {state.screen === 'complete' ? (
        <div className="win-footer">
          <div className="win-footer-title">You did it!</div>
          <div className="win-footer-actions">
            <button className="btn btn-primary" onClick={handleDownload}>Download painting</button>
            <button className="btn btn-ghost" onClick={onNewPuzzle}>New puzzle</button>
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
