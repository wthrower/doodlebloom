import type { PaletteColor, Region } from '../types'
import type { Int32ArrayLike } from './types-internal'

export interface RenderOptions {
  playerColors: Record<number, number>
  activeColorIndex: number | null
  originalImageData: ImageData | null
  showHint?: boolean
  fadingColors?: Map<number, number>
}

/** A chain of (x, y) boundary grid points in canvas coordinates. */
export type OutlineChain = [number, number][]

/** Outline chains plus per-chain bounding boxes for viewport culling. */
export interface OutlineBatch {
  chains: OutlineChain[]
  bboxes: Float32Array    // [minX, minY, maxX, maxY] × chains.length, packed
}

export interface PuzzleRenderer {
  /** Repaint to match opts. Diffs against the previous call and rewrites only
   *  the regions whose appearance changed, pushing just their bounding rect. */
  render(opts: RenderOptions): void
  /** Draw a brief "wrong color" flash on a region. */
  flashRegion(regionId: number): void
}

/**
 * Create a renderer for one puzzle. Owns a persistent pixel buffer plus
 * per-region pixel-index lists and bounding boxes (built once here), so a
 * normal fill rewrites a few hundred pixels instead of allocating and
 * repainting the full ~1.5MP canvas on every tap.
 *
 * Region appearance rules:
 * - Unfilled: white (pale diagonal stripes when hinting the active color)
 * - Filled: flat palette color; original image pixels once the whole color
 *   group is complete
 * - Pixels not in any kept region: settled gray background, painted once.
 *
 * Recreate the renderer when regionMap/regions/palette/dimensions change.
 */
export function createPuzzleRenderer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  regionMap: Int32ArrayLike,
  regions: Region[],
  palette: PaletteColor[],
): PuzzleRenderer {
  const pixels = width * height
  const imageData = ctx.createImageData(width, height)
  const buf = imageData.data

  const regionsByColor = new Map<number, Region[]>()
  for (const r of regions) {
    let list = regionsByColor.get(r.colorIndex)
    if (!list) { list = []; regionsByColor.set(r.colorIndex, list) }
    list.push(r)
  }

  // Per-region pixel lists and bounding boxes: count, allocate, fill.
  const keptIds = new Set(regions.map(r => r.id))
  const counts = new Map<number, number>()
  for (let i = 0; i < pixels; i++) {
    const id = regionMap[i]
    if (keptIds.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const regionPixels = new Map<number, Int32Array>()
  const cursor = new Map<number, number>()
  for (const [id, n] of counts) { regionPixels.set(id, new Int32Array(n)); cursor.set(id, 0) }
  const bboxes = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>()
  for (let i = 0; i < pixels; i++) {
    const id = regionMap[i]
    const arr = regionPixels.get(id)
    if (!arr) {
      // Unmerged tiny fragment too small to promote -- settled gray background.
      buf[i * 4] = 160
      buf[i * 4 + 1] = 160
      buf[i * 4 + 2] = 160
      buf[i * 4 + 3] = 255
      continue
    }
    const k = cursor.get(id)!
    arr[k] = i
    cursor.set(id, k + 1)
    const x = i % width, y = (i / width) | 0
    let b = bboxes.get(id)
    if (!b) { b = { minX: x, minY: y, maxX: x, maxY: y }; bboxes.set(id, b) }
    else {
      if (x < b.minX) b.minX = x
      if (x > b.maxX) b.maxX = x
      if (y < b.minY) b.minY = y
      if (y > b.maxY) b.maxY = y
    }
  }

  /** Colors whose every region is filled correctly (reveal originals). */
  const computeColorComplete = (opts: RenderOptions): Set<number> => {
    const complete = new Set<number>()
    if (!opts.originalImageData) return complete
    for (const [colorIdx, list] of regionsByColor) {
      if (list.every(r => opts.playerColors[r.id] === colorIdx)) complete.add(colorIdx)
    }
    return complete
  }

  const paintRegion = (region: Region, opts: RenderOptions, colorComplete: Set<number>): void => {
    const arr = regionPixels.get(region.id)
    if (!arr) return
    const filledColorIdx = opts.playerColors[region.id]
    if (filledColorIdx !== undefined) {
      if (colorComplete.has(region.colorIndex) && opts.originalImageData) {
        const src = opts.originalImageData.data
        const fadeT = opts.fadingColors?.get(region.colorIndex)
        if (fadeT !== undefined && fadeT < 1) {
          // Mid-reveal: blend flat fill → color/white midpoint → original,
          // softening the transition instead of flashing through white.
          const c = palette[filledColorIdx]
          const midR = (c.r + 255) / 2
          const midG = (c.g + 255) / 2
          const midB = (c.b + 255) / 2
          for (let k = 0; k < arr.length; k++) {
            const i = arr[k]
            const or = src[i * 4], og = src[i * 4 + 1], ob = src[i * 4 + 2]
            let sr: number, sg: number, sb: number
            if (fadeT < 0.3) {
              const t = fadeT / 0.3
              sr = c.r + (midR - c.r) * t
              sg = c.g + (midG - c.g) * t
              sb = c.b + (midB - c.b) * t
            } else {
              const t = (fadeT - 0.3) / 0.7
              sr = midR + (or - midR) * t
              sg = midG + (og - midG) * t
              sb = midB + (ob - midB) * t
            }
            buf[i * 4]     = sr + 0.5 | 0
            buf[i * 4 + 1] = sg + 0.5 | 0
            buf[i * 4 + 2] = sb + 0.5 | 0
            buf[i * 4 + 3] = 255
          }
        } else {
          // Color fully completed -- reveal original image
          for (let k = 0; k < arr.length; k++) {
            const i = arr[k]
            buf[i * 4] = src[i * 4]
            buf[i * 4 + 1] = src[i * 4 + 1]
            buf[i * 4 + 2] = src[i * 4 + 2]
            buf[i * 4 + 3] = 255
          }
        }
      } else {
        // Still in progress -- flat fill
        const c = palette[filledColorIdx]
        for (let k = 0; k < arr.length; k++) {
          const i = arr[k]
          buf[i * 4] = c.r
          buf[i * 4 + 1] = c.g
          buf[i * 4 + 2] = c.b
          buf[i * 4 + 3] = 255
        }
      }
    } else if (opts.showHint && opts.activeColorIndex !== null && region.colorIndex === opts.activeColorIndex) {
      // Unfilled, active color: pale pink/green diagonal stripes (hint mode)
      for (let k = 0; k < arr.length; k++) {
        const i = arr[k]
        const px = i % width, py = (i / width) | 0
        const stripe = ((px + py) >> 2) & 1  // 4px diagonal stripes
        buf[i * 4]     = stripe ? 253 : 210
        buf[i * 4 + 1] = stripe ? 205 : 185
        buf[i * 4 + 2] = stripe ? 229 : 240
        buf[i * 4 + 3] = 255
      }
    } else {
      // Unfilled: white
      for (let k = 0; k < arr.length; k++) {
        const i = arr[k]
        buf[i * 4] = 255
        buf[i * 4 + 1] = 255
        buf[i * 4 + 2] = 255
        buf[i * 4 + 3] = 255
      }
    }
  }

  const putRect = (minX: number, minY: number, maxX: number, maxY: number): void => {
    ctx.putImageData(imageData, 0, 0, minX, minY, maxX - minX + 1, maxY - minY + 1)
  }

  let last: RenderOptions | null = null
  let lastColorComplete = new Set<number>()
  // Snapshot of fade progress at the previous render. fadingColors is mutated
  // in place by the animation loop, so identity comparison can't detect
  // movement — compare values instead.
  let lastFades = new Map<number, number>()

  const render = (opts: RenderOptions): void => {
    const colorComplete = computeColorComplete(opts)

    if (!last || opts.originalImageData !== last.originalImageData) {
      for (const r of regions) paintRegion(r, opts, colorComplete)
      ctx.putImageData(imageData, 0, 0)
    } else {
      const dirty = new Set<Region>()

      if (opts.playerColors !== last.playerColors) {
        for (const r of regions) {
          if (opts.playerColors[r.id] !== last.playerColors[r.id]) dirty.add(r)
        }
      }

      // A color group flipping (in)complete switches ALL its regions between
      // flat fill and revealed originals, including ones whose fill didn't change.
      for (const color of colorComplete) {
        if (!lastColorComplete.has(color)) for (const r of regionsByColor.get(color) ?? []) dirty.add(r)
      }
      for (const color of lastColorComplete) {
        if (!colorComplete.has(color)) for (const r of regionsByColor.get(color) ?? []) dirty.add(r)
      }

      // Fading colors change appearance every frame: repaint groups whose
      // fade progress moved, started, or ended since the last render.
      const fades = opts.fadingColors
      const fadeDirty = new Set<number>()
      if (fades) {
        for (const [color, t] of fades) {
          if (lastFades.get(color) !== t) fadeDirty.add(color)
        }
      }
      for (const color of lastFades.keys()) {
        if (!fades?.has(color)) fadeDirty.add(color)
      }
      for (const color of fadeDirty) {
        for (const r of regionsByColor.get(color) ?? []) dirty.add(r)
      }

      // Hint stripes apply to unfilled regions of one color; repaint the old
      // and new hinted groups when that color changes (incl. hint on/off).
      const hintColorNow = opts.showHint ? opts.activeColorIndex : null
      const hintColorBefore = last.showHint ? last.activeColorIndex : null
      if (hintColorNow !== hintColorBefore) {
        for (const color of [hintColorNow, hintColorBefore]) {
          if (color === null) continue
          for (const r of regionsByColor.get(color) ?? []) {
            if (opts.playerColors[r.id] === undefined) dirty.add(r)
          }
        }
      }

      if (dirty.size > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const r of dirty) {
          paintRegion(r, opts, colorComplete)
          const b = bboxes.get(r.id)
          if (!b) continue
          if (b.minX < minX) minX = b.minX
          if (b.minY < minY) minY = b.minY
          if (b.maxX > maxX) maxX = b.maxX
          if (b.maxY > maxY) maxY = b.maxY
        }
        if (minX !== Infinity) putRect(minX, minY, maxX, maxY)
      }
    }

    last = {
      playerColors: opts.playerColors,
      activeColorIndex: opts.activeColorIndex,
      originalImageData: opts.originalImageData,
      showHint: !!opts.showHint,
    }
    lastColorComplete = colorComplete
    lastFades = new Map(opts.fadingColors ?? [])
  }

  /** Subtle "shake" flash on a region to indicate wrong color. Only the red
   *  channel pulses, within the region's bounding rect. */
  const flashRegion = (regionId: number): void => {
    const arr = regionPixels.get(regionId)
    const b = bboxes.get(regionId)
    if (!arr || !b) return
    const orig = new Uint8ClampedArray(arr.length)
    for (let k = 0; k < arr.length; k++) orig[k] = buf[arr[k] * 4]

    let frame = 0
    const animate = () => {
      frame++
      if (frame <= 8) {
        const boost = Math.round(Math.sin((frame / 8) * Math.PI) * 0.5 * 150)
        for (let k = 0; k < arr.length; k++) buf[arr[k] * 4] = Math.min(255, orig[k] + boost)
        putRect(b.minX, b.minY, b.maxX, b.maxY)
        requestAnimationFrame(animate)
      } else {
        for (let k = 0; k < arr.length; k++) buf[arr[k] * 4] = orig[k]
        putRect(b.minX, b.minY, b.maxX, b.maxY)
      }
    }
    requestAnimationFrame(animate)
  }

  return { render, flashRegion }
}

/**
 * Build boundary chains for SVG outline rendering.
 * Traces pixel-boundary edges into connected polylines and simplifies with
 * Douglas-Peucker (ε=0.5px) to collapse pixel staircases into diagonals.
 * Call once when the puzzle loads; pass chains to updateOutlineSvg on zoom/pan.
 */
export function buildOutlineChains(
  regionMap: Int32ArrayLike,
  regions: Region[],
  width: number,
  height: number
): OutlineBatch {
  const keptIds = new Set(regions.map(r => r.id))

  // Boundary grid: integer coordinates (x ∈ [0,width], y ∈ [0,height]).
  // Each pixel (px, py) occupies canvas rect [px, px+1] × [py, py+1].
  const W1 = width + 1
  const adj = new Map<number, Set<number>>()
  const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
    const k1 = y1 * W1 + x1, k2 = y2 * W1 + x2
    if (!adj.has(k1)) adj.set(k1, new Set())
    if (!adj.has(k2)) adj.set(k2, new Set())
    adj.get(k1)!.add(k2)
    adj.get(k2)!.add(k1)
  }

  // Horizontal boundary segments (between pixel rows y and y+1)
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width; x++) {
      const a = regionMap[y * width + x], b = regionMap[(y + 1) * width + x]
      if (a !== b && (keptIds.has(a) || keptIds.has(b))) addEdge(x, y + 1, x + 1, y + 1)
    }
  }

  // Vertical boundary segments (between pixel columns x and x+1)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = regionMap[y * width + x], b = regionMap[y * width + x + 1]
      if (a !== b && (keptIds.has(a) || keptIds.has(b))) addEdge(x + 1, y, x + 1, y + 1)
    }
  }

  // Image border edges
  for (let x = 0; x < width; x++) {
    if (keptIds.has(regionMap[x])) addEdge(x, 0, x + 1, 0)
    if (keptIds.has(regionMap[(height - 1) * width + x])) addEdge(x, height, x + 1, height)
  }
  for (let y = 0; y < height; y++) {
    if (keptIds.has(regionMap[y * width])) addEdge(0, y, 0, y + 1)
    if (keptIds.has(regionMap[y * width + width - 1])) addEdge(width, y, width, y + 1)
  }

  // Trace connected chains, deleting edges as visited.
  const toXY = (k: number): [number, number] => [k % W1, (k / W1) | 0]
  const rawChains: OutlineChain[] = []

  for (const [startK, startNeighbors] of adj) {
    while (startNeighbors.size > 0) {
      const nextK = startNeighbors.values().next().value!
      startNeighbors.delete(nextK)
      adj.get(nextK)!.delete(startK)

      const chain: OutlineChain = [toXY(startK), toXY(nextK)]
      let currK = nextK

      while (true) {
        const neighbors = adj.get(currK)!
        if (neighbors.size !== 1) break
        const cont = neighbors.values().next().value!
        neighbors.delete(cont)
        adj.get(cont)!.delete(currK)
        chain.push(toXY(cont))
        currK = cont
      }

      rawChains.push(chain)
    }
  }

  const epsilon = 1.5
  const chains = rawChains.map(c => {
    const dp = dpSimplify(c, epsilon)
    if (dp.length < 4) return dp
    // Only apply collinearity merge to mostly-straight chains.
    // Curved chains (low chord/path ratio) get distorted by greedy corridor merging.
    let pathLen = 0
    for (let i = 1; i < dp.length; i++) {
      pathLen += Math.hypot(dp[i][0] - dp[i - 1][0], dp[i][1] - dp[i - 1][1])
    }
    const chordLen = Math.hypot(dp[dp.length - 1][0] - dp[0][0], dp[dp.length - 1][1] - dp[0][1])
    if (pathLen > 0 && chordLen / pathLen < 0.9) return dp
    return mergeCollinear(dp, epsilon)
  })

  // Recompute bboxes from simplified chains
  const simplifiedBboxes = new Float32Array(chains.length * 4)
  for (let i = 0; i < chains.length; i++) {
    const c = chains[i]
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of c) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    simplifiedBboxes[i * 4]     = minX
    simplifiedBboxes[i * 4 + 1] = minY
    simplifiedBboxes[i * 4 + 2] = maxX
    simplifiedBboxes[i * 4 + 3] = maxY
  }

  return { chains, bboxes: simplifiedBboxes }
}

function dpSimplify(pts: [number, number][], epsilon: number): [number, number][] {
  if (pts.length <= 2) return pts
  const [x1, y1] = pts[0]
  const [x2, y2] = pts[pts.length - 1]
  const dx = x2 - x1, dy = y2 - y1
  const lenSq = dx * dx + dy * dy

  let maxDist = 0, maxIdx = 1
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i]
    const dist = lenSq === 0
      ? Math.hypot(px - x1, py - y1)
      : Math.abs((py - y1) * dx - (px - x1) * dy) / Math.sqrt(lenSq)
    if (dist > maxDist) { maxDist = dist; maxIdx = i }
  }

  if (maxDist <= epsilon) return [pts[0], pts[pts.length - 1]]
  const left = dpSimplify(pts.slice(0, maxIdx + 1), epsilon)
  const right = dpSimplify(pts.slice(maxIdx), epsilon)
  return [...left.slice(0, -1), ...right]
}

/** Collapse near-collinear runs that DP retains from pixel staircases.
 *  Tolerance scales with corridor length: longer straight runs absorb
 *  larger deviations that are visually insignificant at that scale. */
function mergeCollinear(
  pts: [number, number][],
  epsilon: number,
  ratio = 0.035
): [number, number][] {
  if (pts.length <= 2) return pts
  // Protect the first and last few points from length-scaled merging
  // so that approach angles at chain junctions stay accurate.
  const guard = Math.min(3, Math.floor(pts.length / 3))
  const out: [number, number][] = [pts[0]]
  let i = 0
  while (i < pts.length - 1) {
    // Greedily extend: find the furthest j where all points i+1..j-1
    // stay within epsilon of the line from pts[i] to pts[j].
    // Use length-scaled epsilon only for interior points, base epsilon near ends.
    let best = i + 1
    outer: for (let j = i + 2; j < pts.length; j++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[j]
      const dx = bx - ax, dy = by - ay
      const lenSq = dx * dx + dy * dy
      const inInterior = i >= guard && j <= pts.length - 1 - guard
      const corridorLen = Math.sqrt(lenSq)
      const thresh = inInterior && corridorLen > 30 ? epsilon + corridorLen * ratio : epsilon
      for (let k = i + 1; k < j; k++) {
        const [px, py] = pts[k]
        const dist = lenSq === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs((py - ay) * dx - (px - ax) * dy) / Math.sqrt(lenSq)
        if (dist > thresh) break outer
      }
      best = j
    }
    out.push(pts[best])
    i = best
  }
  return out
}

