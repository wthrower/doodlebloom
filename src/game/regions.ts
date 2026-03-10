import { colorDist, chromaDist, chroma } from './colorDistance'
import type { LabelPoint, PaletteColor, Region } from '../types'

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

/** Phase 2: Absorb regions below MIN_REGION_PIXELS into best adjacent neighbor.
 *  Mutates regionMap and regionMeta in place. */
export function mergeRegions(state: RegionIntermediate, palette: PaletteColor[]): void {
  const { regionMap, regionMeta, width, height } = state
  const pixels = width * height

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
      const cd = adj.colorIndex === s.colorIndex
        ? 0
        : palette.length > 0
          ? colorDist(
              palette[s.colorIndex].r, palette[s.colorIndex].g, palette[s.colorIndex].b,
              palette[adj.colorIndex].r, palette[adj.colorIndex].g, palette[adj.colorIndex].b
            )
          : 1
      if (cd < bestScore) { bestScore = cd; best = adj }
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

  // Thin region filter: find max distance per region to identify regions
  // too narrow for a label. Label positions are computed later, after all merges.
  const regionMaxDist = new Map<number, number>()
  for (let i = 0; i < pixels; i++) {
    const rid = regionMap[i]
    if (rid < 0) continue
    const d = dist[i]
    const cur = regionMaxDist.get(rid) ?? 0
    if (d > cur) regionMaxDist.set(rid, d)
  }

  const thinIds = new Set<number>()
  const regions: Region[] = []
  for (const [rid, maxDist] of regionMaxDist) {
    if (maxDist < MIN_LABEL_RADIUS) {
      thinIds.add(rid)
      continue
    }
    const meta = regionMeta.get(rid)!
    regions.push({
      id: rid,
      colorIndex: meta.colorIndex,
      centroid: { x: 0, y: 0 },
      pixelCount: meta.pixelCount,
      labelRadius: 0,
      labels: [],
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

    // Build merge candidates: each thin region → best-color adjacent region.
    // If no adjacent neighbor is close in color, pixel-BFS outward to find
    // a nearby region that is (thin regions are small so this is affordable).
    const MAX_THIN_CD = 20
    const MAX_SEARCH_DIST = 60

    /** Pixel BFS from thin region's border to find nearest region with cd < maxCd. */
    const findNearbyByPixel = (tid: number, tmeta: RegionMeta): number => {
      // Collect border pixels of this thin region
      const border: number[] = []
      for (let i = 0; i < pixels; i++) {
        if (regionMap[i] !== tid) continue
        const x = i % width
        const ns = [
          x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1,
          i >= width ? i - width : -1, i + width < pixels ? i + width : -1,
        ]
        for (const n of ns) {
          if (n >= 0 && regionMap[n] !== tid) { border.push(i); break }
        }
      }
      // BFS outward with distance cap
      const dist = new Map<number, number>()
      for (const b of border) dist.set(b, 0)
      const queue = [...border]
      let head = 0
      while (head < queue.length) {
        const i = queue[head++]
        const d = dist.get(i)!
        if (d >= MAX_SEARCH_DIST) continue
        const x = i % width
        for (const n of [
          x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1,
          i >= width ? i - width : -1, i + width < pixels ? i + width : -1,
        ]) {
          if (n < 0 || dist.has(n)) continue
          dist.set(n, d + 1)
          const nrid = regionMap[n]
          if (nrid >= 0 && nrid !== tid && !thinIds.has(nrid)) {
            const nmeta = regionMeta.get(nrid)
            if (nmeta && cdBetween(tmeta, nmeta) < MAX_THIN_CD) return nrid
          }
          queue.push(n)
        }
      }
      return -1
    }

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
        if (cd < bestCd || (cd === bestCd && bestThin && !thin)) {
          bestCd = cd; bestId = adjId; bestThin = thin
        }
      }
      // If no adjacent neighbor is close in color, search outward
      if (bestCd > MAX_THIN_CD) {
        const nearbyId = findNearbyByPixel(tid, tmeta)
        if (nearbyId >= 0) {
          const nmeta = regionMeta.get(nearbyId)!
          bestId = nearbyId; bestCd = cdBetween(tmeta, nmeta)
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

/** Minimum inscribed-circle radius for a lobe to get its own label. */
const MIN_LOBE_LABEL_RADIUS = 20

/** Find label positions for a region by detecting lobes.
 *  Computes a distance transform, thresholds it to find wide areas,
 *  finds connected components (lobes), and places a centered label
 *  in each lobe that has enough space. */
function findRegionLabels(
  rid: number, regionMap: Int32Array, width: number, height: number,
): LabelPoint[] {
  const pixels = width * height
  const dist = new Int32Array(pixels).fill(-1)
  const queue: number[] = []

  // BFS distance-from-boundary
  for (let i = 0; i < pixels; i++) {
    if (regionMap[i] !== rid) continue
    const x = i % width, y = (i - x) / width
    const onBoundary =
      x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
      regionMap[i - 1] !== rid || regionMap[i + 1] !== rid ||
      regionMap[i - width] !== rid || regionMap[i + width] !== rid
    if (onBoundary) { dist[i] = 0; queue.push(i) }
    else dist[i] = -2  // mark as region pixel, not yet visited
  }

  let head = 0
  while (head < queue.length) {
    const i = queue[head++]
    const x = i % width, y = (i - x) / width
    const d = dist[i] + 1
    for (const n of [
      x > 0 ? i - 1 : -1,
      x < width - 1 ? i + 1 : -1,
      y > 0 ? i - width : -1,
      y < height - 1 ? i + width : -1,
    ]) {
      if (n >= 0 && dist[n] === -2) {
        dist[n] = d; queue.push(n)
      }
    }
  }

  // Find global max distance
  let maxDist = 0
  for (const i of queue) { if (dist[i] > maxDist) maxDist = dist[i] }

  // Threshold: pixels with dist >= threshold are "wide" areas
  const threshold = Math.max(MIN_LOBE_LABEL_RADIUS, Math.round(maxDist * 0.3))

  // Find connected components among above-threshold pixels
  const lobeId = new Int32Array(pixels).fill(-1)
  let lobeCount = 0
  for (const i of queue) {
    if (dist[i] < threshold || lobeId[i] >= 0) continue
    // Flood-fill this lobe
    const id = lobeCount++
    const lobeQueue = [i]
    lobeId[i] = id
    let lh = 0
    while (lh < lobeQueue.length) {
      const pi = lobeQueue[lh++]
      const px = pi % width, py = (pi - px) / width
      for (const n of [
        px > 0 ? pi - 1 : -1,
        px < width - 1 ? pi + 1 : -1,
        py > 0 ? pi - width : -1,
        py < height - 1 ? pi + width : -1,
      ]) {
        if (n >= 0 && dist[n] >= threshold && lobeId[n] < 0) {
          lobeId[n] = id; lobeQueue.push(n)
        }
      }
    }
  }

  if (lobeCount === 0) {
    // Region too small for any lobe -- single label at global max, centered
    return [bestLabel(queue, dist, maxDist, width, height)]
  }

  // For each lobe, find the best label point
  const lobePixels: number[][] = Array.from({ length: lobeCount }, () => [])
  for (const i of queue) {
    if (lobeId[i] >= 0) lobePixels[lobeId[i]].push(i)
  }

  const candidates: LabelPoint[] = []
  for (let l = 0; l < lobeCount; l++) {
    let lobMax = 0
    for (const i of lobePixels[l]) { if (dist[i] > lobMax) lobMax = dist[i] }
    if (lobMax < MIN_LOBE_LABEL_RADIUS) continue
    candidates.push(bestLabel(lobePixels[l], dist, lobMax, width, height))
  }

  if (candidates.length === 0) {
    return [bestLabel(queue, dist, maxDist, width, height)]
  }

  // Primary first (largest radius), then cull nearby secondaries
  candidates.sort((a, b) => b.radius - a.radius)
  const labels: LabelPoint[] = [candidates[0]]
  const minSecondary = candidates[0].radius * 0.4
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]
    if (c.radius < minSecondary || c.radius < MIN_LOBE_LABEL_RADIUS) continue
    let tooClose = false
    for (const k of labels) {
      const dx = c.x - k.x, dy = c.y - k.y
      const minSep = 8 * Math.min(c.radius, k.radius)
      if (dx * dx + dy * dy < minSep * minSep) { tooClose = true; break }
    }
    if (!tooClose) labels.push(c)
  }
  return labels
}

/** Among pixels tied at maxDist, pick the most centered one. */
function bestLabel(
  pixels: number[], dist: Int32Array, maxDist: number, width: number, height: number,
): LabelPoint {
  // Build row/col extents for centering
  const rowMin = new Int32Array(height).fill(width)
  const rowMax = new Int32Array(height).fill(-1)
  const colMin = new Int32Array(width).fill(height)
  const colMax = new Int32Array(width).fill(-1)
  for (const i of pixels) {
    const x = i % width, y = (i - x) / width
    if (x < rowMin[y]) rowMin[y] = x
    if (x > rowMax[y]) rowMax[y] = x
    if (y < colMin[x]) colMin[x] = y
    if (y > colMax[x]) colMax[x] = y
  }

  let bestIdx = pixels[0] ?? 0, bestScore = -1
  for (const i of pixels) {
    if (dist[i] !== maxDist) continue
    const x = i % width, y = (i - x) / width
    const score = Math.min(x - rowMin[y], rowMax[y] - x, y - colMin[x], colMax[x] - y)
    if (score > bestScore) { bestScore = score; bestIdx = i }
  }

  return { x: bestIdx % width, y: Math.floor(bestIdx / width), radius: maxDist }
}

/** Recompute label positions for all regions from scratch on the final regionMap. */
export function relabelRegions(regions: Region[], regionMap: Int32Array, width: number): void {
  const height = regionMap.length / width
  for (const r of regions) {
    r.labels = findRegionLabels(r.id, regionMap, width, height)
    r.centroid = { x: r.labels[0].x, y: r.labels[0].y }
    r.labelRadius = r.labels[0].radius
  }
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
