import { colorDist } from './colorDistance'
import type { PaletteColor, Region } from '../types'

/** A region whose "inscribed circle" radius is smaller than this won't have
 *  enough room to display a legible number label -- it stays as gray background. */
const MIN_LABEL_RADIUS = 6

export interface PromotedRegion {
  regionId: number
  pixelCount: number
  meanR: number
  meanG: number
  meanB: number
}

export function buildRegions(
  indexMap: Uint8Array,
  width: number,
  height: number,
  palette: PaletteColor[] = []
): { regions: Region[]; regionMap: Int32Array; promotedRegions: PromotedRegion[] } {
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

  // Phase 4: Promote large clusters of excluded pixels to labeled regions.
  // BFS on excluded pixels finds spatially contiguous "gray splotches"; large ones
  // get promoted to kept regions labeled with their most common palette color.
  const superRegionMap = new Int32Array(pixels).fill(-1)
  const superRegionPixelLists = new Map<number, number[]>()
  let superNextId = 0

  for (let start = 0; start < pixels; start++) {
    const rid = regionMap[start]
    if (rid < 0 || keptIds.has(rid)) continue
    if (superRegionMap[start] >= 0) continue

    const spid = superNextId++
    const pixelList: number[] = []
    const queue: number[] = [start]
    superRegionMap[start] = spid
    let head = 0

    while (head < queue.length) {
      const i = queue[head++]
      pixelList.push(i)
      const x = i % width, y = Math.floor(i / width)
      const ns = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ]
      for (const n of ns) {
        if (n >= 0 && superRegionMap[n] < 0) {
          const nrid = regionMap[n]
          if (nrid >= 0 && !keptIds.has(nrid)) {
            superRegionMap[n] = spid
            queue.push(n)
          }
        }
      }
    }
    superRegionPixelLists.set(spid, pixelList)
  }

  // Distance transform for super-regions to find inscribed radius and best centroid pixel
  const superDist = new Int32Array(pixels).fill(-1)
  const superBfsQueue: number[] = []

  for (let i = 0; i < pixels; i++) {
    const spid = superRegionMap[i]
    if (spid < 0) continue
    const x = i % width, y = Math.floor(i / width)
    const ns = [
      x > 0 ? i - 1 : -1,
      x < width - 1 ? i + 1 : -1,
      y > 0 ? i - width : -1,
      y < height - 1 ? i + width : -1,
    ]
    for (const n of ns) {
      if (n < 0 || superRegionMap[n] !== spid) {
        superDist[i] = 0
        superBfsQueue.push(i)
        break
      }
    }
  }

  {
    let head = 0
    while (head < superBfsQueue.length) {
      const i = superBfsQueue[head++]
      const spid = superRegionMap[i]
      const x = i % width, y = Math.floor(i / width)
      const ns = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ]
      for (const n of ns) {
        if (n >= 0 && superRegionMap[n] === spid && superDist[n] < 0) {
          superDist[n] = superDist[i] + 1
          superBfsQueue.push(n)
        }
      }
    }
  }

  const superBest = new Map<number, { maxDist: number; bestPixel: number }>()
  for (let i = 0; i < pixels; i++) {
    const spid = superRegionMap[i]
    if (spid < 0) continue
    const d = superDist[i]
    const cur = superBest.get(spid)
    if (!cur || d > cur.maxDist) superBest.set(spid, { maxDist: d, bestPixel: i })
  }

  const promotedRegions: PromotedRegion[] = []

  for (const [spid, best] of superBest) {
    if (best.maxDist < MIN_LABEL_RADIUS) continue

    const pixelList = superRegionPixelLists.get(spid)!

    // Compute mean RGB weighted by pixel count per palette entry
    const colorCounts = new Map<number, number>()
    for (const i of pixelList) {
      const ci = indexMap[i]
      colorCounts.set(ci, (colorCounts.get(ci) ?? 0) + 1)
    }
    let meanR = 0, meanG = 0, meanB = 0
    for (const [ci, cnt] of colorCounts) {
      const c = ci < palette.length ? palette[ci] : { r: 128, g: 128, b: 128 }
      meanR += c.r * cnt; meanG += c.g * cnt; meanB += c.b * cnt
    }
    const total = pixelList.length
    meanR = Math.round(meanR / total)
    meanG = Math.round(meanG / total)
    meanB = Math.round(meanB / total)

    // Default: nearest existing palette color (caller may override with a new color)
    let nearestIdx = 0, nearestDist = Infinity
    for (let ci = 0; ci < palette.length; ci++) {
      const c = palette[ci]
      const d = colorDist(meanR, meanG, meanB, c.r, c.g, c.b)
      if (d < nearestDist) { nearestDist = d; nearestIdx = ci }
    }

    const newId = nextId++
    for (const i of pixelList) regionMap[i] = newId
    keptIds.add(newId)
    regions.push({
      id: newId,
      colorIndex: nearestIdx,
      centroid: {
        x: best.bestPixel % width,
        y: Math.floor(best.bestPixel / width),
      },
      pixelCount: pixelList.length,
      labelRadius: best.maxDist,
    })
    promotedRegions.push({ regionId: newId, pixelCount: pixelList.length, meanR, meanG, meanB })
  }

  // Phase 5: Merge residual tiny fragments (still not in keptIds) into the largest
  // adjacent kept region. BFS outward from kept-region borders into excluded pixels.
  // "Largest" = kept region with most pixels overall (regionMeta pixelCount).
  const regionSize = new Map<number, number>()
  for (const r of regions) regionSize.set(r.id, r.pixelCount)

  const phase5Queue: number[] = []
  for (let i = 0; i < pixels; i++) {
    if (keptIds.has(regionMap[i])) {
      const x = i % width, y = Math.floor(i / width)
      const ns = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ]
      for (const n of ns) {
        if (n >= 0 && regionMap[n] >= 0 && !keptIds.has(regionMap[n])) {
          phase5Queue.push(n)
        }
      }
    }
  }

  // For each excluded pixel, pick the largest adjacent kept region
  {
    let head = 0
    while (head < phase5Queue.length) {
      const i = phase5Queue[head++]
      if (keptIds.has(regionMap[i])) continue  // already absorbed
      const x = i % width, y = Math.floor(i / width)
      const ns = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ]
      let bestId = -1, bestSize = -1
      for (const n of ns) {
        if (n < 0) continue
        const nrid = regionMap[n]
        if (!keptIds.has(nrid)) continue
        const sz = regionSize.get(nrid) ?? 0
        if (sz > bestSize) { bestSize = sz; bestId = nrid }
      }
      if (bestId >= 0) {
        regionMap[i] = bestId
        // Propagate to excluded neighbors
        for (const n of ns) {
          if (n >= 0 && regionMap[n] >= 0 && !keptIds.has(regionMap[n])) {
            phase5Queue.push(n)
          }
        }
      }
    }
  }

  return { regions, regionMap, promotedRegions }
}

/** Merge adjacent regions that share the same colorIndex.
 *  Mutates regionMap in place. Returns the merged region list and a remap
 *  of [oldId, canonicalId] pairs for any IDs that were absorbed. */
export function mergeAdjacentSameColorRegions(
  regions: Region[],
  regionMap: Int32Array,
  width: number,
): { regions: Region[]; remap: [number, number][] } {
  const colorOf = new Map<number, number>()
  for (const r of regions) colorOf.set(r.id, r.colorIndex)

  // Union-Find
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    if (!parent.has(x)) return x
    const p = find(parent.get(x)!)
    parent.set(x, p)
    return p
  }
  const union = (a: number, b: number) => {
    a = find(a); b = find(b)
    if (a !== b) parent.set(b, a)
  }

  const pixels = regionMap.length
  for (let i = 0; i < pixels; i++) {
    const rid = regionMap[i]
    if (rid < 0) continue
    const x = i % width
    if (x < width - 1) {
      const nrid = regionMap[i + 1]
      if (nrid >= 0 && nrid !== rid && colorOf.get(rid) === colorOf.get(nrid)) union(rid, nrid)
    }
    if (i + width < pixels) {
      const nrid = regionMap[i + width]
      if (nrid >= 0 && nrid !== rid && colorOf.get(rid) === colorOf.get(nrid)) union(rid, nrid)
    }
  }

  // Collect remap entries and update regionMap
  const remap: [number, number][] = []
  const seen = new Set<number>()
  for (const r of regions) {
    const canonical = find(r.id)
    if (canonical !== r.id && !seen.has(r.id)) { remap.push([r.id, canonical]); seen.add(r.id) }
  }
  if (remap.length > 0) {
    const remapMap = new Map(remap)
    for (let i = 0; i < pixels; i++) {
      const c = remapMap.get(regionMap[i])
      if (c !== undefined) regionMap[i] = c
    }
  }

  // Merge region metadata: keep canonical, accumulate pixelCount, keep best centroid
  const merged = new Map<number, Region>()
  for (const r of regions) {
    const canonical = find(r.id)
    if (!merged.has(canonical)) {
      merged.set(canonical, { ...r, id: canonical })
    } else {
      const existing = merged.get(canonical)!
      existing.pixelCount += r.pixelCount
      if (r.labelRadius > existing.labelRadius) {
        existing.labelRadius = r.labelRadius
        existing.centroid = r.centroid
      }
    }
  }

  return { regions: [...merged.values()], remap }
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
