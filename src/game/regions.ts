import type { PaletteColor, Region } from '../types'

/** A region whose "inscribed circle" radius is smaller than this won't have
 *  enough room to display a legible number label -- it gets merged instead. */
const MIN_LABEL_RADIUS = 6

/** Max Euclidean RGB distance allowed when merging an excluded region into a neighbor.
 *  Fragments at high-contrast edges stay as background rather than force a bad merge. */
const MAX_MERGE_COLOR_DIST = 60

export function buildRegions(
  indexMap: Uint8Array,
  width: number,
  height: number,
  palette: PaletteColor[]
): { regions: Region[]; regionMap: Int32Array } {
  const pixels = width * height
  const regionMap = new Int32Array(pixels).fill(-1)
  const regionMeta: Map<number, { colorIndex: number; pixelCount: number }> = new Map()
  let nextId = 0

  // Phase 1: BFS connected components
  for (let start = 0; start < pixels; start++) {
    if (regionMap[start] !== -1) continue

    const colorIndex = indexMap[start]
    const regionId = nextId++
    const queue: number[] = [start]
    regionMap[start] = regionId
    let count = 0

    while (queue.length > 0) {
      const idx = queue.pop()!
      const x = idx % width
      const y = Math.floor(idx / width)
      count++

      const neighbors = [
        idx - width,
        idx + width,
        x > 0 ? idx - 1 : -1,
        x < width - 1 ? idx + 1 : -1,
      ]
      for (const n of neighbors) {
        if (n >= 0 && n < pixels && regionMap[n] === -1 && indexMap[n] === colorIndex) {
          regionMap[n] = regionId
          queue.push(n)
        }
      }
    }

    regionMeta.set(regionId, { colorIndex, pixelCount: count })
  }

  // Phase 2: Multi-source BFS distance transform.
  // Each region pixel gets the L1 distance to the nearest pixel outside its region.
  // Boundary pixels (distance 0) seed the BFS.
  const dist = new Int32Array(pixels).fill(-1)
  const bfsQueue: number[] = []

  for (let i = 0; i < pixels; i++) {
    const rid = regionMap[i]
    if (rid < 0) { dist[i] = 0; continue }

    const x = i % width
    const y = Math.floor(i / width)
    const ns = [
      x > 0 ? i - 1 : -1,
      x < width - 1 ? i + 1 : -1,
      y > 0 ? i - width : -1,
      y < height - 1 ? i + width : -1,
    ]

    for (const n of ns) {
      if (n < 0 || regionMap[n] !== rid) {
        dist[i] = 0
        bfsQueue.push(i)
        break
      }
    }
  }

  let head = 0
  while (head < bfsQueue.length) {
    const i = bfsQueue[head++]
    const rid = regionMap[i]
    const x = i % width
    const y = Math.floor(i / width)
    const ns = [
      x > 0 ? i - 1 : -1,
      x < width - 1 ? i + 1 : -1,
      y > 0 ? i - width : -1,
      y < height - 1 ? i + width : -1,
    ]
    for (const n of ns) {
      if (n >= 0 && regionMap[n] === rid && dist[n] < 0) {
        dist[n] = dist[i] + 1
        bfsQueue.push(n)
      }
    }
  }

  // Phase 3: For each region, find the pixel with max distance (pole of inaccessibility).
  // Regions where max distance < MIN_LABEL_RADIUS are too small to label.
  const regionBest = new Map<number, { maxDist: number; bestPixel: number }>()
  for (let i = 0; i < pixels; i++) {
    const rid = regionMap[i]
    if (rid < 0) continue
    const d = dist[i]
    const cur = regionBest.get(rid)
    if (!cur || d > cur.maxDist) {
      regionBest.set(rid, { maxDist: d, bestPixel: i })
    }
  }

  const keptIds = new Set<number>()
  const regions: Region[] = []
  for (const [rid, best] of regionBest) {
    if (best.maxDist < MIN_LABEL_RADIUS) continue
    keptIds.add(rid)
    const meta = regionMeta.get(rid)!
    regions.push({
      id: rid,
      colorIndex: meta.colorIndex,
      centroid: {
        x: best.bestPixel % width,
        y: Math.floor(best.bestPixel / width),
      },
      pixelCount: meta.pixelCount,
      labelRadius: best.maxDist,
    })
  }

  // Phase 4: Merge excluded regions into their best kept neighbor.
  // Primary criterion: color proximity (palette distance). Secondary: shared border length.
  // This ensures every pixel belongs to an interactive region -- no dead white areas.
  const excludedPixels = new Map<number, number[]>()
  for (let i = 0; i < pixels; i++) {
    const rid = regionMap[i]
    if (rid >= 0 && !keptIds.has(rid)) {
      let list = excludedPixels.get(rid)
      if (!list) { list = []; excludedPixels.set(rid, list) }
      list.push(i)
    }
  }

  for (const [rid, pixList] of excludedPixels) {
    const excColorIndex = regionMeta.get(rid)!.colorIndex
    // colorIndex may exceed palette length when restoring with a pre-compaction indexMap
    const excludedColor = excColorIndex < palette.length ? palette[excColorIndex] : { r: 128, g: 128, b: 128 }

    // Collect adjacent kept region IDs and shared border pixel counts
    const borderCounts = new Map<number, number>()
    for (const i of pixList) {
      const x = i % width, y = Math.floor(i / width)
      const ns = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ]
      for (const n of ns) {
        if (n >= 0 && keptIds.has(regionMap[n])) {
          borderCounts.set(regionMap[n], (borderCounts.get(regionMap[n]) ?? 0) + 1)
        }
      }
    }

    let bestId = -1
    let bestScore = Infinity
    for (const [nid, count] of borderCounts) {
      const nc = palette[regionMeta.get(nid)!.colorIndex]
      const dr = excludedColor.r - nc.r
      const dg = excludedColor.g - nc.g
      const db = excludedColor.b - nc.b
      const colorDistSq = dr * dr + dg * dg + db * db
      if (Math.sqrt(colorDistSq) > MAX_MERGE_COLOR_DIST) continue
      // Pure color proximity -- border count only breaks exact ties
      const score = colorDistSq * 1000 - count
      if (score < bestScore) { bestScore = score; bestId = nid }
    }

    // Fallback: no adjacent kept region within threshold -- find globally nearest by color,
    // but only if still within the max merge distance.
    if (bestId < 0) {
      let globalBest = Infinity
      for (const r of regions) {
        const nc = palette[r.colorIndex]
        const dr = excludedColor.r - nc.r
        const dg = excludedColor.g - nc.g
        const db = excludedColor.b - nc.b
        const d = dr * dr + dg * dg + db * db
        if (d < globalBest) { globalBest = d; bestId = r.id }
      }
      // If even the globally nearest is too far, leave the fragment as background
      if (Math.sqrt(globalBest) > MAX_MERGE_COLOR_DIST) bestId = -1
    }

    if (bestId >= 0) {
      for (const i of pixList) regionMap[i] = bestId
    }
  }

  return { regions, regionMap }
}

export function getRegionAt(
  x: number,
  y: number,
  regionMap: Int32Array,
  width: number,
  height: number
): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return -1
  return regionMap[Math.floor(y) * width + Math.floor(x)]
}
