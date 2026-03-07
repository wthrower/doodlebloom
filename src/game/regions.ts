import type { Region } from '../types'

/** A region whose "inscribed circle" radius is smaller than this won't have
 *  enough room to display a legible number label -- it stays as gray background. */
const MIN_LABEL_RADIUS = 6

export function buildRegions(
  indexMap: Uint8Array,
  width: number,
  height: number
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

  for (const [spid, best] of superBest) {
    if (best.maxDist < MIN_LABEL_RADIUS) continue

    const pixelList = superRegionPixelLists.get(spid)!
    const colorCounts = new Map<number, number>()
    for (const i of pixelList) {
      const ci = indexMap[i]
      colorCounts.set(ci, (colorCounts.get(ci) ?? 0) + 1)
    }
    let modeColor = 0, modeCount = 0
    for (const [ci, cnt] of colorCounts) {
      if (cnt > modeCount) { modeCount = cnt; modeColor = ci }
    }

    const newId = nextId++
    for (const i of pixelList) regionMap[i] = newId
    keptIds.add(newId)
    regions.push({
      id: newId,
      colorIndex: modeColor,
      centroid: {
        x: best.bestPixel % width,
        y: Math.floor(best.bestPixel / width),
      },
      pixelCount: pixelList.length,
      labelRadius: best.maxDist,
    })
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
