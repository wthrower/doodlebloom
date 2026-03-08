import type { PaletteColor, Region } from '../types'
import type { Int32ArrayLike } from './types-internal'

export interface RenderOptions {
  playerColors: Record<number, number>
  activeColorIndex: number | null
  revealMode: 'flat' | 'photo'
  originalImageData: ImageData | null
  colorDisplayNumbers: Record<number, number>
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
  const { playerColors, revealMode, originalImageData, colorDisplayNumbers } = opts

  // Build pixel buffer
  const imageData = ctx.createImageData(width, height)
  const buf = imageData.data

  const regionById = new Map(regions.map(r => [r.id, r]))

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
      if (revealMode === 'photo' && originalImageData) {
        buf[i * 4] = originalImageData.data[i * 4]
        buf[i * 4 + 1] = originalImageData.data[i * 4 + 1]
        buf[i * 4 + 2] = originalImageData.data[i * 4 + 2]
        buf[i * 4 + 3] = 255
      } else {
        const c = palette[filledColorIdx]
        buf[i * 4] = c.r
        buf[i * 4 + 1] = c.g
        buf[i * 4 + 2] = c.b
        buf[i * 4 + 3] = 255
      }
    } else {
      // Unfilled: white
      buf[i * 4] = 255
      buf[i * 4 + 1] = 255
      buf[i * 4 + 2] = 255
      buf[i * 4 + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)

  // Draw numbers at centroids for unfilled regions
  drawNumbers(ctx, regions, playerColors, colorDisplayNumbers)
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

  return { chains: rawChains, bboxes }
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

function drawNumbers(
  ctx: CanvasRenderingContext2D,
  regions: Region[],
  playerColors: Record<number, number>,
  colorDisplayNumbers: Record<number, number>
): void {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const region of regions) {
    if (playerColors[region.id] !== undefined) continue
    const { x, y } = region.centroid
    const label = String(colorDisplayNumbers[region.colorIndex] ?? region.colorIndex + 1)

    const fontSize = Math.max(9, Math.min(Math.round(region.labelRadius * 0.8), 28))
    ctx.font = `${fontSize}px sans-serif`
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillText(label, x, y + 0.5)
  }
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
