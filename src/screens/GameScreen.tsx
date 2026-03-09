import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minimize2, ScanSearch } from 'lucide-react'
import type { GameActions, GameState } from '../App'
import type { RegionSnapshot } from '../game/regions'
import { PillToggle } from '../components/PillToggle'
import { REVEAL_MODE_OPTIONS } from '../types'
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
  const [outlineMagenta, setOutlineMagenta] = useState(false)
  const [debugStage, setDebugStage] = useState(-1)
  const { palette, regions, playerColors, canvasWidth, canvasHeight, revealMode, showOutline, screen } = state
  const { indexMapRef, regionMapRef, originalImageDataRef, debugSnapshotsRef, fillRegion } = actions

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

      // Epsilon in canvas units: 1.5 preserves gentle curves better than 2
      // while still collapsing pixel-level noise.
      const epsilon = Math.max(1.5, 1.5 / pixelScale)

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
      const imgData = originalImageDataRef.current
      const imgW = canvasWidth

      // Sample contrast at a boundary-grid point (gx, gy) from the original image.
      // High contrast (dark next to bright) → thick line; low contrast → thin line.
      // Uses luminance range (max − min) across a small neighborhood so that
      // nearby boundary points get consistent weights even across chain junctions.
      // Returns 0 (no contrast) – 1 (max contrast).
      const sampleRadius = 4
      const sampleContrast = (gx: number, gy: number): number => {
        if (!imgData) return 0.5
        let minL = 1, maxL = 0
        for (let py = gy - sampleRadius; py <= gy + sampleRadius; py++) {
          for (let px = gx - sampleRadius; px <= gx + sampleRadius; px++) {
            if (px < 0 || py < 0 || px >= imgW || py >= imgData.height) continue
            const i = (py * imgW + px) * 4
            const d = imgData.data
            const L = (0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]) / 255
            if (L < minL) minL = L
            if (L > maxL) maxL = L
          }
        }
        return maxL - minL
      }

      // Half-width range in screen pixels (thin for bright, thick for dark)
      const minHW = 0.5
      const maxHW = Math.min(3, Math.max(0.75, scale * 0.75))
      const t = 0.5 // Catmull-Rom tension

      // Catmull-Rom → cubic Bezier, clamping control vectors to chord length.
      // When a control vector exceeds the chord, the curve can loop -- clamping
      // prevents overshooting without abandoning smooth curves elsewhere.
      const crSeg = (arr: [number, number][], i: number): string => {
        const p0 = arr[Math.max(0, i - 1)]
        const p1 = arr[i]
        const p2 = arr[i + 1]
        const p3 = arr[Math.min(arr.length - 1, i + 2)]
        let cp1x = p1[0] + (p2[0] - p0[0]) * t / 3
        let cp1y = p1[1] + (p2[1] - p0[1]) * t / 3
        let cp2x = p2[0] - (p3[0] - p1[0]) * t / 3
        let cp2y = p2[1] - (p3[1] - p1[1]) * t / 3
        const chord = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        const cv1 = Math.hypot(cp1x - p1[0], cp1y - p1[1])
        const cv2 = Math.hypot(cp2x - p2[0], cp2y - p2[1])
        if (cv1 > chord && cv1 > 0) { const s = chord / cv1; cp1x = p1[0] + (cp1x - p1[0]) * s; cp1y = p1[1] + (cp1y - p1[1]) * s }
        if (cv2 > chord && cv2 > 0) { const s = chord / cv2; cp2x = p2[0] + (cp2x - p2[0]) * s; cp2y = p2[1] + (cp2y - p2[1]) * s }
        return `C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
      }

      const polygons: string[] = []

      for (let ci = 0; ci < chains.length; ci++) {
        // Viewport cull
        const bi = ci * 4
        if (bboxes[bi + 2] < visMinX || bboxes[bi] > visMaxX ||
            bboxes[bi + 3] < visMinY || bboxes[bi + 1] > visMaxY) continue

        const pts = dpSimplify(chains[ci], epsilon)
        if (pts.length < 2) continue
        const n = pts.length

        // Convert to screen coords
        const sp = pts.map(([x, y]) => [ox + x * pixelScale, oy + y * pixelScale] as [number, number])

        const hwCore = pts.map(([gx, gy]) => minHW + Math.max(0.5, sampleContrast(gx, gy)) * (maxHW - minHW))
        const hwSmooth = hwCore.map((_, i) => {
          let sum = 0, count = 0
          for (let j = Math.max(0, i - 6); j <= Math.min(n - 1, i + 6); j++) { sum += hwCore[j]; count++ }
          return sum / count
        })
        for (let i = 1; i < n - 1; i++) {
          const dx1 = pts[i][0] - pts[i-1][0], dy1 = pts[i][1] - pts[i-1][1]
          const dx2 = pts[i+1][0] - pts[i][0],  dy2 = pts[i+1][1] - pts[i][1]
          const len = Math.hypot(dx1, dy1) * Math.hypot(dx2, dy2)
          if (len > 0 && (dx1*dx2 + dy1*dy2) / len < 0) hwSmooth[i] = 0
        }
        const taperK = 2
        const taperFloor = 0.2
        const hw = hwSmooth.map((v, i) => {
          const taper = taperFloor + (1 - taperFloor) * Math.min(1, i / taperK) * Math.min(1, (n - 1 - i) / taperK)
          return Math.max(0.75, v * taper)
        })

        // Spine sharpness: detect corners for segment-type decisions
        const spineSharp = (i: number): boolean => {
          if (i <= 0 || i >= n - 1) return false
          const dx1 = pts[i][0] - pts[i-1][0], dy1 = pts[i][1] - pts[i-1][1]
          const dx2 = pts[i+1][0] - pts[i][0],  dy2 = pts[i+1][1] - pts[i][1]
          const len = Math.hypot(dx1, dy1) * Math.hypot(dx2, dy2)
          return len > 0 && (dx1*dx2 + dy1*dy2) / len <= 0.7
        }
        const sharpAt = new Uint8Array(n)
        for (let i = 0; i < n; i++) if (spineSharp(i)) sharpAt[i] = 1
        const nearSharp = (i: number): boolean => {
          for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
            if (sharpAt[j]) return true
          }
          return false
        }

        // Build offset left/right sides with miter correction at corners.
        const left:  [number, number][] = []
        const right: [number, number][] = []
        for (let i = 0; i < n; i++) {
          const [x, y] = sp[i]
          const h = hw[i]
          let nx: number, ny: number
          if (i === 0 || i === n - 1) {
            const [ax, ay] = sp[Math.max(0, i - 1)]
            const [bx, by] = sp[Math.min(n - 1, i + 1)]
            const dx = bx - ax, dy = by - ay
            const len = Math.hypot(dx, dy) || 1
            nx = -dy / len; ny = dx / len
          } else {
            const dx1 = sp[i][0] - sp[i-1][0], dy1 = sp[i][1] - sp[i-1][1]
            const dx2 = sp[i+1][0] - sp[i][0], dy2 = sp[i+1][1] - sp[i][1]
            const len1 = Math.hypot(dx1, dy1) || 1
            const len2 = Math.hypot(dx2, dy2) || 1
            const n1x = -dy1 / len1, n1y = dx1 / len1
            const n2x = -dy2 / len2, n2y = dx2 / len2
            const bx = n1x + n2x, by = n1y + n2y
            const blen = Math.hypot(bx, by)
            if (blen < 1e-6) {
              nx = n1x; ny = n1y
            } else {
              nx = bx / blen; ny = by / blen
              const dot = nx * n1x + ny * n1y
              const miter = Math.min(3, 1 / Math.max(dot, 0.01))
              nx *= miter; ny *= miter
            }
          }
          left.push( [x + nx * h, y + ny * h])
          right.push([x - nx * h, y - ny * h])
        }

        // Miter + L near sharp corners, CR elsewhere.
        const spineLen = (i: number) => Math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1])
        const useCR = (i: number): boolean => {
          if (spineLen(i) > 40) return false
          return !nearSharp(i) && !nearSharp(i + 1)
        }
        const rightRev = [...right].reverse()
        const f = ([x, y]: [number, number]) => `${x.toFixed(1)},${y.toFixed(1)}`
        const segs = [`M${f(left[0])}`]
        for (let i = 0; i < n - 1; i++) {
          segs.push(useCR(i) ? crSeg(left, i) : `L${f(left[i + 1])}`)
        }
        segs.push(`L${f(right[n - 1])}`)
        for (let i = 0; i < n - 1; i++) {
          const si = n - 2 - i
          segs.push(useCR(si) ? crSeg(rightRev, i) : `L${f(rightRev[i + 1])}`)
        }

        segs.push('Z')
        polygons.push(segs.join(' '))
      }

      // Update single path directly (bypass React VDOM for perf)
      const path = svg.querySelector('path')
      if (path) path.setAttribute('d', polygons.join(' '))
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

  // --- Debug region map overlay (renders onto main canvas after normal render) ---
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || debugStage < 0) return
    const snap = debugSnapshotsRef.current[debugStage]
    if (!snap) return
    const ctx = canvas.getContext('2d')!
    const rawPalette = state.rawPalette ?? []
    const imageData = ctx.createImageData(canvasWidth, canvasHeight)
    const buf = imageData.data
    const pixels = canvasWidth * canvasHeight
    const regionHue = new Map<number, number>()
    let hueCounter = 0
    for (let i = 0; i < pixels; i++) {
      const rid = snap.regionMap[i]
      const ci = snap.colorOf.get(rid)
      const pi = i * 4
      if (rid < 0) {
        buf[pi] = 40; buf[pi+1] = 40; buf[pi+2] = 40; buf[pi+3] = 255
      } else if (ci !== undefined && ci < rawPalette.length) {
        buf[pi]   = rawPalette[ci].r
        buf[pi+1] = rawPalette[ci].g
        buf[pi+2] = rawPalette[ci].b
        buf[pi+3] = 255
      } else {
        if (!regionHue.has(rid)) regionHue.set(rid, (hueCounter++ * 137) % 360)
        const h = regionHue.get(rid)!
        const [r, g, b] = hslToRgb(h / 360, 0.7, 0.5)
        buf[pi] = r; buf[pi+1] = g; buf[pi+2] = b; buf[pi+3] = 255
      }
    }
    ctx.putImageData(imageData, 0, 0)
  }, [debugStage, canvasWidth, canvasHeight, state.rawPalette, playerColors, activeColorIndex, regions, palette, revealMode, showOutline, screen, cheatActive, colorDisplayNumbers])

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
      if (e.key === '\\') setOutlineMagenta(v => !v)
      if (e.key === 'd' || e.key === 'D') {
        setDebugStage(prev => {
          const count = debugSnapshotsRef.current.length
          if (count === 0) return -1
          return prev + 1 >= count ? -1 : prev + 1
        })
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
          options={REVEAL_MODE_OPTIONS}
          value={revealMode}
          onChange={actions.setRevealMode}
        />
        {activeColorIndex !== null && state.screen !== 'complete' && (() => {
          const c = palette[activeColorIndex]
          return (
            <div className="toolbar-active-color" aria-label={`Selected color ${colorDisplayNumbers[activeColorIndex]}`}>
              <div className="toolbar-active-swatch" style={{ background: `rgb(${c.r},${c.g},${c.b})` }} />
              <span className="toolbar-active-num">{colorDisplayNumbers[activeColorIndex]}</span>
            </div>
          )
        })()}
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
        {debugStage >= 0 && (
          <div style={{
            position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.7)',
            color: '#fff', padding: '4px 10px', borderRadius: 4, fontSize: 13,
            fontFamily: 'monospace', pointerEvents: 'none',
          }}>
            {debugSnapshotsRef.current[debugStage]?.label ?? `stage ${debugStage}`}
            {' '}({debugStage + 1}/{debugSnapshotsRef.current.length}) — press D to cycle
          </div>
        )}
{/* SVG outline overlay: not CSS-transformed, redrawn in screen coords on zoom/pan */}
        <svg
          ref={outlineSvgRef}
          className="outline-svg"
          style={{ visibility: (state.screen === 'complete' && !showOutline) ? 'hidden' : 'visible' }}
        >
          <path fill={outlineMagenta ? 'rgba(255,0,255,0.85)' : 'rgba(0,0,0,0.75)'} stroke="none" />
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

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}
