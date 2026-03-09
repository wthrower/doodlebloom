import type { PaletteColor, Region } from '../types'
import type { Int32ArrayLike } from './types-internal'

export interface RenderOptions {
  playerColors: Record<number, number>
  activeColorIndex: number | null
  originalImageData: ImageData | null
}

/** A chain of (x, y) boundary grid points in canvas coordinates. */
export type OutlineChain = [number, number][]

/** Outline chains plus per-chain bounding boxes for viewport culling. */
export interface OutlineBatch {
  chains: OutlineChain[]
  bboxes: Float32Array    // [minX, minY, maxX, maxY] × chains.length, packed
}

/**
 * Draw the puzzle onto ctx.
 * - Unfilled regions: light gray fill + dark outline
 * - Filled regions: palette color (flat) or original pixels (photo)
 * - Numbers at centroids for unfilled regions
 */
export function renderPuzzle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  indexMap: Uint8Array,
  regionMap: Int32ArrayLike,
  regions: Region[],
  palette: PaletteColor[],
  opts: RenderOptions
): void {
  const { playerColors, activeColorIndex, originalImageData } = opts

  // Build pixel buffer
  const imageData = ctx.createImageData(width, height)
  const buf = imageData.data

  const regionById = new Map(regions.map(r => [r.id, r]))

  // Pre-compute which colors are fully completed (all regions filled correctly)
  const colorComplete = new Set<number>()
  if (originalImageData) {
    const colorRegions = new Map<number, Region[]>()
    for (const r of regions) {
      let list = colorRegions.get(r.colorIndex)
      if (!list) { list = []; colorRegions.set(r.colorIndex, list) }
      list.push(r)
    }
    for (const [colorIdx, list] of colorRegions) {
      if (list.every(r => playerColors[r.id] === colorIdx)) {
        colorComplete.add(colorIdx)
      }
    }
  }

  for (let i = 0; i < width * height; i++) {
    const regionId = regionMap[i]
    const region = regionId >= 0 ? regionById.get(regionId) : undefined

    if (!region) {
      // Unmerged tiny fragment too small to promote -- paint gray as settled background.
      buf[i * 4] = 160
      buf[i * 4 + 1] = 160
      buf[i * 4 + 2] = 160
      buf[i * 4 + 3] = 255
      continue
    }

    const filledColorIdx = playerColors[region.id]
    if (filledColorIdx !== undefined) {
      if (colorComplete.has(region.colorIndex) && originalImageData) {
        // Color fully completed -- reveal original image
        buf[i * 4] = originalImageData.data[i * 4]
        buf[i * 4 + 1] = originalImageData.data[i * 4 + 1]
        buf[i * 4 + 2] = originalImageData.data[i * 4 + 2]
        buf[i * 4 + 3] = 255
      } else {
        // Still in progress -- flat fill
        const c = palette[filledColorIdx]
        buf[i * 4] = c.r
        buf[i * 4 + 1] = c.g
        buf[i * 4 + 2] = c.b
        buf[i * 4 + 3] = 255
      }
    } else if (activeColorIndex !== null && region.colorIndex === activeColorIndex) {
      // Unfilled, active color: pale pink/green diagonal stripes
      const px = i % width, py = (i / width) | 0
      const stripe = ((px + py) >> 2) & 1  // 4px diagonal stripes
      buf[i * 4]     = stripe ? 253 : 210
      buf[i * 4 + 1] = stripe ? 205 : 185
      buf[i * 4 + 2] = stripe ? 229 : 240
      buf[i * 4 + 3] = 255
    } else {
      // Unfilled: white
      buf[i * 4] = 255
      buf[i * 4 + 1] = 255
      buf[i * 4 + 2] = 255
      buf[i * 4 + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)
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

  // Compute per-chain bounding boxes (used for viewport culling in updateOutlineSvg).
  const bboxes = new Float32Array(rawChains.length * 4)
  for (let i = 0; i < rawChains.length; i++) {
    const c = rawChains[i]
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of c) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    bboxes[i * 4]     = minX
    bboxes[i * 4 + 1] = minY
    bboxes[i * 4 + 2] = maxX
    bboxes[i * 4 + 3] = maxY
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

/** Douglas-Peucker polyline simplification (exported for zoom-adaptive use in callers). */
export function dpSimplify(pts: [number, number][], epsilon: number): [number, number][] {
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
export function mergeCollinear(
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

/** Draw a subtle "shake" flash on a region to indicate wrong color */
export function flashRegion(
  ctx: CanvasRenderingContext2D,
  regionId: number,
  regionMap: Int32ArrayLike,
  width: number,
  height: number
): void {
  const pixels: number[] = []
  for (let i = 0; i < width * height; i++) {
    if (regionMap[i] === regionId) pixels.push(i)
  }
  const imageData = ctx.getImageData(0, 0, width, height)
  const orig = new Uint8ClampedArray(imageData.data)

  let frame = 0
  const animate = () => {
    frame++
    const alpha = Math.sin((frame / 8) * Math.PI) * 0.5
    if (frame <= 8) {
      for (const i of pixels) {
        imageData.data[i * 4] = Math.min(255, orig[i * 4] + Math.round(alpha * 150))
        imageData.data[i * 4 + 1] = orig[i * 4 + 1]
        imageData.data[i * 4 + 2] = orig[i * 4 + 2]
        imageData.data[i * 4 + 3] = 255
      }
      ctx.putImageData(imageData, 0, 0)
      requestAnimationFrame(animate)
    } else {
      // Restore
      for (const i of pixels) {
        imageData.data[i * 4] = orig[i * 4]
        imageData.data[i * 4 + 1] = orig[i * 4 + 1]
        imageData.data[i * 4 + 2] = orig[i * 4 + 2]
        imageData.data[i * 4 + 3] = orig[i * 4 + 3]
      }
      ctx.putImageData(imageData, 0, 0)
    }
  }
  requestAnimationFrame(animate)
}
