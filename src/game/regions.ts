import { colorDist } from './colorDistance'
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

export function buildRegions(
  indexMap: Uint8Array,
  width: number,
  height: number,
  palette: PaletteColor[] = []
): { regions: Region[]; regionMap: Int32Array } {
  const pixels = width * height
  const regionMap = new Int32Array(pixels).fill(-1)
  const regionMeta = new Map<number, RegionMeta>()
  let nextId = 0

  // Phase 1: BFS connected components + adjacency tracking
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
      const y = Math.floor(idx / width)
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

  // Region merge: absorb regions below MIN_REGION_PIXELS into best adjacent neighbor.
  // Prefer same colorIndex; otherwise prefer nearest Lab color.
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let root = x
    while (parent.has(root)) root = parent.get(root)!
    // Path compression
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
    if (find(s.id) !== s.id) continue  // already absorbed as non-canonical
    if (s.adjIds.size === 0) continue   // image-boundary isolate

    // Best neighbor: same colorIndex (score 0) > nearest Lab color (score > 0)
    let best: RegionMeta | null = null
    let bestScore = Infinity
    for (const adjId of s.adjIds) {
      const canon = find(adjId)
      const adj = regionMeta.get(canon)
      if (!adj || adj.id === s.id) continue
      const sc = adj.colorIndex === s.colorIndex
        ? 0
        : palette.length > 0
          ? colorDist(
              palette[s.colorIndex].r, palette[s.colorIndex].g, palette[s.colorIndex].b,
              palette[adj.colorIndex].r, palette[adj.colorIndex].g, palette[adj.colorIndex].b
            )
          : 1
      if (sc < bestScore) { bestScore = sc; best = adj }
    }
    if (!best) continue

    // Merge s into best via union-find
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

  // Merge adjacent same-color canonical regions.
  // Scan all pixel boundaries; wherever two canonical regions share a colorIndex, union them.
  // Reuses the existing union-find -- no extra data structures needed.
  for (let i = 0; i < pixels; i++) {
    const x = i % width
    const right  = x < width - 1 ? i + 1 : -1
    const bottom = i + width < pixels ? i + width : -1
    for (const j of [right, bottom]) {
      if (j < 0) continue
      const ridA = find(regionMap[i])
      const ridB = find(regionMap[j])
      if (ridA === ridB) continue
      const metaA = regionMeta.get(ridA)!
      const metaB = regionMeta.get(ridB)!
      if (metaA.colorIndex !== metaB.colorIndex) continue
      // Merge smaller into larger to keep the better pole as canonical
      const [small, large] = metaA.pixelCount <= metaB.pixelCount ? [ridA, ridB] : [ridB, ridA]
      parent.set(small, large)
      regionMeta.get(large)!.pixelCount += regionMeta.get(small)!.pixelCount
    }
  }

  // Apply union-find to regionMap: O(n)
  for (let i = 0; i < pixels; i++) {
    if (regionMap[i] >= 0) regionMap[i] = find(regionMap[i])
  }

  // Phase 2: Multi-source BFS distance transform.
  // Each pixel gets the L1 distance to the nearest pixel outside its region.
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

  // Phase 3: Pole finding + labelRadius filter.
  // Regions where max distance < MIN_LABEL_RADIUS are thin/elongated -- absorb them.
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

  // Absorb thin regions: BFS from kept-region borders inward.
  if (thinIds.size > 0) {
    const thinQueue: number[] = []
    for (let i = 0; i < pixels; i++) {
      if (thinIds.has(regionMap[i])) continue
      const x = i % width, y = Math.floor(i / width)
      const ns = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]
      for (const n of ns) {
        if (n >= 0 && thinIds.has(regionMap[n])) thinQueue.push(n)
      }
    }

    let tHead = 0
    while (tHead < thinQueue.length) {
      const i = thinQueue[tHead++]
      if (!thinIds.has(regionMap[i])) continue  // already absorbed

      const x = i % width, y = Math.floor(i / width)
      const ns = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]
      const smeta = regionMeta.get(regionMap[i])
      let bestId = -1, bestScore = Infinity
      for (const n of ns) {
        if (n < 0 || thinIds.has(regionMap[n])) continue
        const nrid = regionMap[n]
        if (nrid < 0) continue
        const nmeta = regionMeta.get(nrid)
        if (!nmeta || !smeta) continue
        const sc = nmeta.colorIndex === smeta.colorIndex
          ? 0
          : palette.length > 0
            ? colorDist(
                palette[smeta.colorIndex].r, palette[smeta.colorIndex].g, palette[smeta.colorIndex].b,
                palette[nmeta.colorIndex].r, palette[nmeta.colorIndex].g, palette[nmeta.colorIndex].b
              )
            : 1
        if (sc < bestScore) { bestScore = sc; bestId = nrid }
      }
      if (bestId >= 0) {
        regionMap[i] = bestId
        for (const n of ns) {
          if (n >= 0 && thinIds.has(regionMap[n])) thinQueue.push(n)
        }
      }
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
