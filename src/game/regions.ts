import { colorDist, chromaDist, chroma } from './colorDistance'
import type { PaletteColor, Region } from '../types'

/** A region whose "inscribed circle" radius is smaller than this won't have
 *  enough room to display a legible number label -- absorb it into a neighbor. */
const MIN_LABEL_RADIUS = 6

/** Regions with fewer pixels than this are absorbed into the best adjacent neighbor. */
const MIN_REGION_PIXELS = 200

interface RegionMeta {
  id: number
  colorIndex: number
  pixelCount: number
  adjIds: Set<number>
}

class MinHeap<T> {
  private items: T[] = []
  private index = new Map<T, number>()
  private key: (item: T) => number

  constructor(items: Iterable<T>, key: (item: T) => number) {
    this.key = key
    for (const item of items) this._push(item)
  }

  empty(): boolean { return this.items.length === 0 }
  min(): T { return this.items[0] }

  pop(): T {
    const top = this.items[0]
    const last = this.items.pop()!
    this.index.delete(top)
    if (this.items.length > 0) {
      this.items[0] = last
      this.index.set(last, 0)
      this._siftDown(0)
    }
    return top
  }

  update(item: T): void {
    const i = this.index.get(item)
    if (i === undefined) return
    this._siftUp(i)
    this._siftDown(this.index.get(item)!)
  }

  private _push(item: T): void {
    const i = this.items.length
    this.items.push(item)
    this.index.set(item, i)
    this._siftUp(i)
  }

  private _siftUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.key(this.items[p]) <= this.key(this.items[i])) break
      this._swap(i, p)
      i = p
    }
  }

  private _siftDown(i: number): void {
    const n = this.items.length
    while (true) {
      const l = 2 * i + 1, r = 2 * i + 2
      let s = i
      if (l < n && this.key(this.items[l]) < this.key(this.items[s])) s = l
      if (r < n && this.key(this.items[r]) < this.key(this.items[s])) s = r
      if (s === i) break
      this._swap(i, s)
      i = s
    }
  }

  private _swap(i: number, j: number): void {
    this.index.set(this.items[i], j)
    this.index.set(this.items[j], i)
    ;[this.items[i], this.items[j]] = [this.items[j], this.items[i]]
  }
}

/** Debug snapshot of the region map at a pipeline stage. */
export interface RegionSnapshot {
  label: string
  regionMap: Int32Array
  colorOf: Map<number, number>  // regionId → colorIndex
}

/** Capture a snapshot of current region state for debug visualization. */
export function snapshotRegions(label: string, state: RegionIntermediate): RegionSnapshot {
  const colorOf = new Map<number, number>()
  for (const [id, meta] of state.regionMeta) colorOf.set(id, meta.colorIndex)
  return { label, regionMap: state.regionMap.slice(), colorOf }
}

/** Opaque intermediate state passed between pipeline phases. */
export interface RegionIntermediate {
  regionMap: Int32Array
  regionMeta: Map<number, RegionMeta>
  width: number
  height: number
}

/** Phase 1: BFS connected components + adjacency tracking. */
export function traceRegions(
  indexMap: Uint8Array,
  width: number,
  height: number,
): RegionIntermediate {
  const pixels = width * height
  const regionMap = new Int32Array(pixels).fill(-1)
  const regionMeta = new Map<number, RegionMeta>()
  let nextId = 0

  for (let start = 0; start < pixels; start++) {
    if (regionMap[start] !== -1) continue

    const colorIndex = indexMap[start]
    const regionId = nextId++
    const meta: RegionMeta = { id: regionId, colorIndex, pixelCount: 0, adjIds: new Set() }
    regionMeta.set(regionId, meta)
    const queue: number[] = [start]
    regionMap[start] = regionId
    let count = 0

    while (queue.length > 0) {
      const idx = queue.pop()!
      count++
      const x = idx % width
      const neighbors = [
        idx - width,
        idx + width,
        x > 0 ? idx - 1 : -1,
        x < width - 1 ? idx + 1 : -1,
      ]
      for (const n of neighbors) {
        if (n < 0 || n >= pixels) continue
        const nrid = regionMap[n]
        if (nrid === -1) {
          if (indexMap[n] === colorIndex) {
            regionMap[n] = regionId
            queue.push(n)
          }
        } else if (nrid !== regionId) {
          meta.adjIds.add(nrid)
          regionMeta.get(nrid)!.adjIds.add(regionId)
        }
      }
    }

    meta.pixelCount = count
  }

  return { regionMap, regionMeta, width, height }
}

/** Color distance threshold: if no adjacent neighbor is closer than this,
 *  search outward by boundary distance for a better color match. */
const MAX_ADJACENT_CD = 20

/** Phase 2: Absorb regions below MIN_REGION_PIXELS into best adjacent neighbor.
 *  If no adjacent neighbor is close in color, BFS outward to find the nearest
 *  region that is.  Mutates regionMap and regionMeta in place. */
export function mergeRegions(state: RegionIntermediate, palette: PaletteColor[]): void {
  const { regionMap, regionMeta, width, height } = state
  const pixels = width * height

  const cdBetween = (a: RegionMeta, b: RegionMeta): number =>
    a.colorIndex === b.colorIndex
      ? 0
      : palette.length > 0
        ? colorDist(
            palette[a.colorIndex].r, palette[a.colorIndex].g, palette[a.colorIndex].b,
            palette[b.colorIndex].r, palette[b.colorIndex].g, palette[b.colorIndex].b
          )
        : 1

  /** Region-level BFS: expand through adjacency graph to find the nearest
   *  region (by hop count) whose color distance to `src` is below `maxCd`.
   *  Searches up to `maxHops` adjacency hops. Returns canonical id or -1. */
  const MAX_HOPS = 5
  const findNearbyMatch = (src: RegionMeta, maxCd: number, find: (x: number) => number): number => {
    const visited = new Set<number>([src.id])
    let frontier = new Set<number>()
    for (const adjId of src.adjIds) {
      const canon = find(adjId)
      if (canon !== src.id) frontier.add(canon)
    }

    for (let hop = 0; hop < MAX_HOPS && frontier.size > 0; hop++) {
      let bestId = -1, bestCd = maxCd
      for (const rid of frontier) {
        const rmeta = regionMeta.get(rid)
        if (!rmeta) continue
        const cd = cdBetween(src, rmeta)
        if (cd < bestCd) { bestCd = cd; bestId = rid }
      }
      if (bestId >= 0) return bestId

      // Expand frontier
      const next = new Set<number>()
      for (const rid of frontier) {
        visited.add(rid)
        const rmeta = regionMeta.get(rid)
        if (!rmeta) continue
        for (const adjId of rmeta.adjIds) {
          const canon = find(adjId)
          if (!visited.has(canon) && !frontier.has(canon)) next.add(canon)
        }
      }
      frontier = next
    }
    return -1
  }

  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let root = x
    while (parent.has(root)) root = parent.get(root)!
    while (parent.has(x)) {
      const next = parent.get(x)!
      parent.set(x, root)
      x = next
    }
    return root
  }

  const heap = new MinHeap<RegionMeta>(regionMeta.values(), r => r.pixelCount)
  while (!heap.empty() && heap.min().pixelCount < MIN_REGION_PIXELS) {
    const s = heap.pop()
    if (find(s.id) !== s.id) continue
    if (s.adjIds.size === 0) continue

    let best: RegionMeta | null = null
    let bestScore = Infinity
    for (const adjId of s.adjIds) {
      const canon = find(adjId)
      const adj = regionMeta.get(canon)
      if (!adj || adj.id === s.id) continue
      const cd = cdBetween(s, adj)
      if (cd < bestScore) { bestScore = cd; best = adj }
    }

    // If best adjacent neighbor is too far in color and the region is large
    // enough to be visually noticeable, search outward for a closer match
    if (best && bestScore > MAX_ADJACENT_CD && s.pixelCount >= 40) {
      const nearbyId = findNearbyMatch(s, MAX_ADJACENT_CD, find)
      if (nearbyId >= 0) {
        const nearby = regionMeta.get(nearbyId)
        if (nearby) best = nearby
      }
    }

    if (!best) continue

    parent.set(s.id, best.id)
    best.pixelCount += s.pixelCount
    for (const adjId of s.adjIds) {
      const canon = find(adjId)
      if (canon === best.id) continue
      const adj = regionMeta.get(canon)
      if (!adj) continue
      adj.adjIds.delete(s.id)
      adj.adjIds.add(best.id)
      best.adjIds.add(canon)
    }
    best.adjIds.delete(s.id)
    heap.update(best)
  }

  for (let i = 0; i < pixels; i++) {
    if (regionMap[i] >= 0) regionMap[i] = find(regionMap[i])
  }
}

/** Phase 3: Distance transform → pole finding → thin region absorption → final Region list. */
export function finalizeRegions(
  state: RegionIntermediate,
  palette: PaletteColor[]
): { regions: Region[]; regionMap: Int32Array } {
  const { regionMap, regionMeta, width, height } = state
  const pixels = width * height

  // Multi-source BFS distance transform
  const dist = new Int32Array(pixels).fill(-1)
  const bfsQueue: number[] = []

  for (let i = 0; i < pixels; i++) {
    const rid = regionMap[i]
    if (rid < 0) { dist[i] = 0; continue }
    const x = i % width, y = Math.floor(i / width)
    const ns = [
      x > 0 ? i - 1 : -1,
      x < width - 1 ? i + 1 : -1,
      y > 0 ? i - width : -1,
      y < height - 1 ? i + width : -1,
    ]
    for (const n of ns) {
      if (n < 0 || regionMap[n] !== rid) { dist[i] = 0; bfsQueue.push(i); break }
    }
  }

  let head = 0
  while (head < bfsQueue.length) {
    const i = bfsQueue[head++]
    const rid = regionMap[i]
    const x = i % width, y = Math.floor(i / width)
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

  // Pole finding + thin region filter
  const regionBest = new Map<number, { maxDist: number; bestPixel: number }>()
  for (let i = 0; i < pixels; i++) {
    const rid = regionMap[i]
    if (rid < 0) continue
    const d = dist[i]
    const cur = regionBest.get(rid)
    if (!cur || d > cur.maxDist) regionBest.set(rid, { maxDist: d, bestPixel: i })
  }

  const thinIds = new Set<number>()
  const regions: Region[] = []
  for (const [rid, best] of regionBest) {
    if (best.maxDist < MIN_LABEL_RADIUS) {
      thinIds.add(rid)
      continue
    }
    const meta = regionMeta.get(rid)!
    regions.push({
      id: rid,
      colorIndex: meta.colorIndex,
      centroid: { x: best.bestPixel % width, y: Math.floor(best.bestPixel / width) },
      pixelCount: meta.pixelCount,
      labelRadius: best.maxDist,
    })
  }

  // Absorb thin regions: first merge each thin region into its closest-color
  // adjacent region (thin or non-thin) at the region level, then rewrite pixels.
  if (thinIds.size > 0) {
    const cdBetween = (a: RegionMeta, b: RegionMeta): number =>
      a.colorIndex === b.colorIndex
        ? 0
        : palette.length > 0
          ? colorDist(
              palette[a.colorIndex].r, palette[a.colorIndex].g, palette[a.colorIndex].b,
              palette[b.colorIndex].r, palette[b.colorIndex].g, palette[b.colorIndex].b
            )
          : 1

    // Rebuild adjacency for thin regions from the pixel map (regionMeta.adjIds
    // may be stale after mergeRegions mutations).
    const thinAdj = new Map<number, Set<number>>()
    for (const tid of thinIds) thinAdj.set(tid, new Set())
    for (let i = 0; i < pixels; i++) {
      const rid = regionMap[i]
      if (!thinIds.has(rid)) continue
      const x = i % width
      const neighbors = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        i >= width ? i - width : -1,
        i + width < pixels ? i + width : -1,
      ]
      const adj = thinAdj.get(rid)!
      for (const n of neighbors) {
        if (n >= 0 && regionMap[n] !== rid && regionMap[n] >= 0) adj.add(regionMap[n])
      }
    }

    // Build merge candidates: each thin region → best-color adjacent region
    const candidates: { thinId: number; targetId: number; cd: number }[] = []
    for (const tid of thinIds) {
      const tmeta = regionMeta.get(tid)
      if (!tmeta) continue
      const adj = thinAdj.get(tid)!
      let bestId = -1, bestCd = Infinity, bestThin = true
      for (const adjId of adj) {
        const ameta = regionMeta.get(adjId)
        if (!ameta) continue
        const cd = cdBetween(tmeta, ameta)
        const thin = thinIds.has(adjId)
        // Prefer non-thin neighbors at equal color distance to avoid creating
        // stillThin groups that fall through to the fallback.
        if (cd < bestCd || (cd === bestCd && bestThin && !thin)) {
          bestCd = cd; bestId = adjId; bestThin = thin
        }
      }
      if (bestId >= 0) {
        candidates.push({ thinId: tid, targetId: bestId, cd: bestCd })
      }
    }
    // Merge closest-color pairs first
    candidates.sort((a, b) => a.cd - b.cd)

    const thinParent = new Map<number, number>()
    const thinFind = (x: number): number => {
      let root = x
      while (thinParent.has(root)) root = thinParent.get(root)!
      while (thinParent.has(x)) { const next = thinParent.get(x)!; thinParent.set(x, root); x = next }
      return root
    }

    for (const { thinId, targetId } of candidates) {
      const rt = thinFind(thinId), ra = thinFind(targetId)
      if (rt === ra) continue
      const tmeta = regionMeta.get(rt)!, ameta = regionMeta.get(ra)!
      const [keep, absorb] = thinIds.has(ra) && !thinIds.has(rt)
        ? [tmeta, ameta]   // target thin, source not → keep source (non-thin)
        : !thinIds.has(ra) && thinIds.has(rt)
          ? [ameta, tmeta] // source thin, target not → keep target (non-thin)
          : ameta.pixelCount >= tmeta.pixelCount
            ? [ameta, tmeta]
            : [tmeta, ameta]
      thinParent.set(absorb.id, keep.id)
      keep.pixelCount += absorb.pixelCount
      for (const adj of absorb.adjIds) {
        const canon = thinFind(adj)
        if (canon === keep.id) continue
        const adjMeta = regionMeta.get(canon)
        if (!adjMeta) continue
        adjMeta.adjIds.delete(absorb.id)
        adjMeta.adjIds.add(keep.id)
        keep.adjIds.add(canon)
      }
      keep.adjIds.delete(absorb.id)
    }

    // Rewrite pixels for merged thin regions
    for (let i = 0; i < pixels; i++) {
      if (thinIds.has(regionMap[i])) regionMap[i] = thinFind(regionMap[i])
    }

    // Pixel-level BFS fallback for any remaining thin regions
    const stillThin = new Set<number>()
    for (const tid of thinIds) {
      const canon = thinFind(tid)
      if (!thinIds.has(canon)) continue
      stillThin.add(canon)
    }

    if (stillThin.size > 0) {
      // Build pixel-level adjacency for stillThin regions (including thin-to-thin
      // so that when one resolves, its thin neighbors discover the new non-thin target).
      const stNeighbors = new Map<number, Set<number>>()
      for (const st of stillThin) stNeighbors.set(st, new Set())
      for (let i = 0; i < pixels; i++) {
        const rid = regionMap[i]
        if (!stillThin.has(rid)) continue
        const x = i % width
        for (const n of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i >= width ? i - width : -1, i + width < pixels ? i + width : -1]) {
          if (n >= 0 && regionMap[n] !== rid && regionMap[n] >= 0) stNeighbors.get(rid)!.add(regionMap[n])
        }
      }
      // Region-level assignment: for each stillThin region, find best-color
      // non-thin neighbor and assign ALL its pixels there. Repeat until stable
      // (resolves chains where one stillThin is surrounded by another).
      let resolved = true
      while (resolved) {
        resolved = false
        for (const st of stillThin) {
          const smeta = regionMeta.get(st)
          if (!smeta) continue
          const nbs = stNeighbors.get(st)
          if (!nbs || nbs.size === 0) continue
          // Find non-thin neighbors from pixel adjacency
          const nonThinNbs = new Set<number>()
          for (const nb of nbs) {
            if (!stillThin.has(nb)) nonThinNbs.add(nb)
          }
          if (nonThinNbs.size === 0) continue
          let bestId = -1, bestCd = Infinity
          for (const nb of nonThinNbs) {
            const nmeta = regionMeta.get(nb)
            if (!nmeta) continue
            const cd = cdBetween(smeta, nmeta)
            if (cd < bestCd) { bestCd = cd; bestId = nb }
          }
          if (bestId < 0) continue
          // Reassign all pixels
          for (let i = 0; i < pixels; i++) {
            if (regionMap[i] === st) regionMap[i] = bestId
          }
          stillThin.delete(st)
          // Update neighbors: regions adjacent to st are now adjacent to bestId
          for (const other of stillThin) {
            const onbs = stNeighbors.get(other)
            if (onbs?.has(st)) { onbs.delete(st); onbs.add(bestId) }
          }
          resolved = true
        }
      }
    }
  }

  return { regions, regionMap }
}

export function buildRegions(
  indexMap: Uint8Array,
  width: number,
  height: number,
  palette: PaletteColor[] = []
): { regions: Region[]; regionMap: Int32Array } {
  const state = traceRegions(indexMap, width, height)
  mergeRegions(state, palette)
  return finalizeRegions(state, palette)
}

/** Merge adjacent regions that now share the same colorIndex (e.g. after a
 *  palette color merge). Mutates regionMap in place, returns the updated
 *  region list with the smaller partner absorbed into the larger. */
export function fuseSameColorRegions(
  regions: Region[],
  regionMap: Int32Array,
  width: number,
): Region[] {
  const colorOf = new Map<number, number>()
  for (const r of regions) colorOf.set(r.id, r.colorIndex)

  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let root = x
    while (parent.has(root)) root = parent.get(root)!
    while (parent.has(x)) { const next = parent.get(x)!; parent.set(x, root); x = next }
    return root
  }

  const pixels = regionMap.length
  for (let i = 0; i < pixels; i++) {
    const rid = regionMap[i]
    if (rid < 0) continue
    const x = i % width
    const right  = x < width - 1 ? i + 1 : -1
    const bottom = i + width < pixels ? i + width : -1
    for (const j of [right, bottom]) {
      if (j < 0) continue
      const nrid = regionMap[j]
      if (nrid < 0) continue
      const ra = find(rid), rb = find(nrid)
      if (ra === rb) continue
      if (colorOf.get(ra) === colorOf.get(rb)) parent.set(rb, ra)
    }
  }

  for (let i = 0; i < pixels; i++) {
    if (regionMap[i] >= 0) regionMap[i] = find(regionMap[i])
  }

  const merged = new Map<number, Region>()
  for (const r of regions) {
    const canon = find(r.id)
    if (!merged.has(canon)) {
      merged.set(canon, { ...r, id: canon })
    } else {
      const m = merged.get(canon)!
      m.pixelCount += r.pixelCount
      if (r.labelRadius > m.labelRadius) { m.labelRadius = r.labelRadius; m.centroid = r.centroid }
    }
  }

  return [...merged.values()]
}

/** Merge adjacent region pairs whose shared boundary has low average luminance
 *  contrast in the original image -- collapses gradient splits (e.g. sky bands)
 *  while leaving real edges intact. Mutates regionMap in place, returns updated regions. */
export function mergeGradientSeams(
  regions: Region[],
  regionMap: Int32Array,
  imageData: ImageData,
  width: number,
  threshold = 0.01,
  palette: PaletteColor[] = []
): Region[] {
  const pixels = regionMap.length
  const data = imageData.data

  // Accumulate per-pair average boundary contrast
  const pairs = new Map<string, { sum: number; count: number; ridA: number; ridB: number }>()
  for (let i = 0; i < pixels; i++) {
    const ridA = regionMap[i]
    if (ridA < 0) continue
    const x = i % width
    for (const j of [x < width - 1 ? i + 1 : -1, i + width < pixels ? i + width : -1]) {
      if (j < 0) continue
      const ridB = regionMap[j]
      if (ridB < 0 || ridB === ridA) continue
      const key = ridA < ridB ? `${ridA}|${ridB}` : `${ridB}|${ridA}`
      const lA = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255
      const lB = (0.299 * data[j * 4] + 0.587 * data[j * 4 + 1] + 0.114 * data[j * 4 + 2]) / 255
      const p = pairs.get(key)
      if (p) { p.sum += Math.abs(lA - lB); p.count++ }
      else pairs.set(key, { sum: Math.abs(lA - lB), count: 1, ridA, ridB })
    }
  }

  // Union-find: merge pairs below threshold, guarded by chroma distance.
  // Chroma distance (a*b* plane, ignoring lightness) distinguishes gradient
  // bands (same hue, different brightness → low chroma dist) from real edges
  // between different-colored regions (high chroma dist).
  const MAX_SEAM_CHROMA = 40
  const regionById = new Map(regions.map(r => [r.id, r]))
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    while (parent.has(x)) x = parent.get(x)!
    return x
  }

  for (const [, { sum, count, ridA, ridB }] of pairs) {
    const contrast = sum / count
    const ca = find(ridA), cb = find(ridB)
    if (ca === cb) continue
    const ra = regionById.get(ca), rb = regionById.get(cb)
    if (!ra || !rb) continue
    // Adaptive threshold: if regions have similar hue/chroma (gradient bands),
    // allow higher luminance contrast. Otherwise use the strict threshold.
    let effectiveThreshold = threshold
    if (palette.length > 0) {
      const cd = chromaDist(
        palette[ra.colorIndex].r, palette[ra.colorIndex].g, palette[ra.colorIndex].b,
        palette[rb.colorIndex].r, palette[rb.colorIndex].g, palette[rb.colorIndex].b
      )
      if (cd > MAX_SEAM_CHROMA) continue
      // Relax threshold for gradient bands: scale by how saturated both colors
      // are (low chroma = gray, hue is meaningless → no relaxation) and how
      // close they are in hue (low chroma dist → more relaxation).
      const pa = palette[ra.colorIndex], pb = palette[rb.colorIndex]
      const minC = Math.min(chroma(pa.r, pa.g, pa.b), chroma(pb.r, pb.g, pb.b))
      const satFactor = Math.min(1, minC / 40)  // 0→0 at gray, 1 at chroma≥40
      const hueFactor = Math.max(0, 1 - cd / MAX_SEAM_CHROMA)  // 1 at cd=0, 0 at cap
      effectiveThreshold = threshold * (1 + 4 * satFactor * hueFactor)
    }
    if (contrast >= effectiveThreshold) continue
    const [keep, drop] = ra.pixelCount >= rb.pixelCount ? [ca, cb] : [cb, ca]
    parent.set(drop, keep)
  }

  // Apply to regionMap
  for (let i = 0; i < pixels; i++) {
    if (regionMap[i] >= 0) regionMap[i] = find(regionMap[i])
  }

  // Rebuild region list
  const merged = new Map<number, Region>()
  for (const r of regions) {
    const canon = find(r.id)
    if (!merged.has(canon)) merged.set(canon, { ...r, id: canon })
    else {
      const m = merged.get(canon)!
      m.pixelCount += r.pixelCount
      if (r.labelRadius > m.labelRadius) { m.labelRadius = r.labelRadius; m.centroid = r.centroid }
    }
  }
  return [...merged.values()]
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
