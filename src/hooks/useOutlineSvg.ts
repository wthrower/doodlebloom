import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { buildOutlineChains } from '../game/canvas'
import type { OutlineBatch, OutlineChain } from '../game/canvas'
import { labDist, rgbToLab } from '../game/colorDistance'
import type { Region } from '../types'
import type { Transform } from './usePanZoom'

// Outline thickness tracks the local color difference across each boundary.
// At every chain vertex we sample a small window, split it by region, and take
// the Lab ΔE76 between the per-channel Lab medians of the two adjoining regions.
// Tweakables:
const SAMPLE_RADIUS = 3   // px half-size of the window sampled around each vertex
const DELTA_FULL = 45     // Lab ΔE76 that maps to maximum line thickness
const EDGE_GAMMA = 1.0    // thickness curve: >1 thins subtle edges and pops strong ones; <1 evens them out; 1 = linear
// Weak (low-ΔE) edges rendering near-invisible is deliberate: it de-emphasizes
// gradient-banding seams while keeping real edges prominent. Don't add a floor.
const MIN_THICKNESS_FRAC = 0.14  // weak-edge min half-width as a fraction of maxHW (0..1); 1 = uniform, 0 = thin edges vanish
const MAX_HW_PER_SCALE = 2.0    // strong-edge half-width in image px; thickness is proportional to pixelScale (no fixed-px cap)
const PROBE_DEPTHS = [0.5, 1.5, 2.5]  // normal offsets used to identify each side's region

/** k-th smallest of a[0..n) via in-place Hoare quickselect (mutates a). */
function quickSelectF(a: Float64Array, n: number, k: number): number {
  let lo = 0, hi = n - 1
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1]
    let i = lo, j = hi
    while (i <= j) {
      while (a[i] < pivot) i++
      while (a[j] > pivot) j--
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j-- }
    }
    if (k <= j) hi = j
    else if (k >= i) lo = i
    else break
  }
  return a[k]
}

const medianF = (a: Float64Array, n: number) => quickSelectF(a, n, n >> 1)

/** Fill unmeasured vertices with the nearest measured delta along the chain.
 *  Returns false if the chain has no measured vertex at all. */
function fillNearestMeasured(d: Float32Array, m: Uint8Array): boolean {
  const n = d.length
  let any = false
  const fv = new Float32Array(n)
  const fd = new Int32Array(n)
  let v = 0, dist = -1
  for (let i = 0; i < n; i++) {
    if (m[i]) { any = true; v = d[i]; dist = 0 } else if (dist >= 0) dist++
    fv[i] = v; fd[i] = dist
  }
  if (!any) return false
  v = 0; dist = -1
  for (let i = n - 1; i >= 0; i--) {
    if (m[i]) { v = d[i]; dist = 0 }
    else {
      if (dist >= 0) dist++
      d[i] = dist >= 0 && (fd[i] < 0 || dist < fd[i]) ? v : fv[i]
    }
  }
  return true
}

/**
 * For each chain vertex, the Lab ΔE76 between the two regions it separates,
 * sampled locally: a SAMPLE_RADIUS window split by regionMap, then the ΔE
 * between each side's per-channel Lab median. Returns one Float32Array per chain.
 *
 * Lab is converted on the fly (only boundary-band pixels are touched, a small
 * fraction of the image) and the whole thing runs once at chain-build, cached.
 */
function computeOutlineDeltas(
  chains: OutlineChain[],
  regionMap: Int32Array,
  imgData: ImageData,
  width: number,
  height: number,
): Float32Array[] {
  const data = imgData.data
  const R = SAMPLE_RADIUS
  const cap = (2 * R + 1) * (2 * R + 1)
  // per-side Lab scratch buffers, reused across all vertices
  const La = new Float64Array(cap), Aa = new Float64Array(cap), Ba = new Float64Array(cap)
  const Lb = new Float64Array(cap), Ab = new Float64Array(cap), Bb = new Float64Array(cap)

  // Region on side `s` (±1) of grid point (gx, gy), probed along the normal.
  const sideRegion = (gx: number, gy: number, nx: number, ny: number, s: number): number => {
    for (const d of PROBE_DEPTHS) {
      const px = Math.floor(gx + nx * d * s)
      const py = Math.floor(gy + ny * d * s)
      if (px >= 0 && py >= 0 && px < width && py < height) {
        const rid = regionMap[py * width + px]
        if (rid >= 0) return rid
      }
    }
    return -1
  }

  const out: Float32Array[] = []
  const measuredAll: Uint8Array[] = []
  for (const pts of chains) {
    const n = pts.length
    const deltas = new Float32Array(n)
    const measured = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      const gx = pts[i][0], gy = pts[i][1]
      // local unit normal from neighboring vertices
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]
      let tx = b[0] - a[0], ty = b[1] - a[1]
      const tl = Math.hypot(tx, ty) || 1
      tx /= tl; ty /= tl
      const nx = -ty, ny = tx

      const ridA = sideRegion(gx, gy, nx, ny, 1)
      const ridB = sideRegion(gx, gy, nx, ny, -1)
      if (ridA < 0 || ridB < 0 || ridA === ridB) continue  // unmeasurable, filled below

      const cx = Math.min(width - 1, Math.max(0, Math.floor(gx)))
      const cy = Math.min(height - 1, Math.max(0, Math.floor(gy)))
      let na = 0, nb = 0
      for (let py = cy - R; py <= cy + R; py++) {
        if (py < 0 || py >= height) continue
        for (let px = cx - R; px <= cx + R; px++) {
          if (px < 0 || px >= width) continue
          const rid = regionMap[py * width + px]
          if (rid !== ridA && rid !== ridB) continue
          const o = (py * width + px) * 4
          const [L, A, B] = rgbToLab(data[o], data[o + 1], data[o + 2])
          if (rid === ridA) { La[na] = L; Aa[na] = A; Ba[na] = B; na++ }
          else { Lb[nb] = L; Ab[nb] = A; Bb[nb] = B; nb++ }
        }
      }
      if (na === 0 || nb === 0) continue

      deltas[i] = labDist(
        medianF(La, na), medianF(Aa, na), medianF(Ba, na),
        medianF(Lb, nb), medianF(Ab, nb), medianF(Bb, nb),
      )
      measured[i] = 1
    }
    out.push(deltas)
    measuredAll.push(measured)
  }

  // Unmeasurable vertices (out-of-bounds probes near the image border,
  // junction corners) inherit the nearest measured delta along their chain
  // instead of tapering to hairline. Chains with no measured vertex at all
  // (the rectangular image-border runs) keep delta 0 — hairline is fine there.
  for (let c = 0; c < chains.length; c++) {
    fillNearestMeasured(out[c], measuredAll[c])
  }
  return out
}

export interface UseOutlineSvgOptions {
  outlineSvgRef: RefObject<SVGSVGElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  wrapRef: RefObject<HTMLDivElement | null>
  transformRef: RefObject<Transform>
  displaySizeRef: RefObject<number>
  getRegionMap: () => Int32Array | null
  getOriginalImageData: () => ImageData | null
  regions: Region[]
  canvasWidth: number
  canvasHeight: number
}

export function useOutlineSvg({
  outlineSvgRef, canvasRef, wrapRef,
  transformRef, displaySizeRef,
  getRegionMap, getOriginalImageData,
  regions, canvasWidth, canvasHeight,
}: UseOutlineSvgOptions) {
  const outlineChainsRef = useRef<OutlineBatch | null>(null)
  const outlineDeltasRef = useRef<Float32Array[] | null>(null)
  const outlineRafRef = useRef(0)

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

      // Visible canvas bounds, with margin for curves that extend slightly
      // outside the bbox plus the stroke's own extent (maxHW image px, up to
      // 3x at miter corners) so thick strokes don't pop at viewport edges.
      const margin = 3 + MAX_HW_PER_SCALE * 3
      const visMinX = (-ox / pixelScale) - margin
      const visMinY = (-oy / pixelScale) - margin
      const visMaxX = visMinX + (wrapW / pixelScale) + margin * 2
      const visMaxY = visMinY + (wrapH / pixelScale) + margin * 2

      const { chains, bboxes } = batch
      const deltas = outlineDeltasRef.current

      // Thickness scales with content magnification (pixelScale, not the bare
      // gesture scale) so line weight stays constant relative to the image
      // content across viewport sizes -- no fixed-px floor/ceiling that would
      // freeze at high zoom.
      const maxHW = pixelScale * MAX_HW_PER_SCALE
      const minHW = maxHW * MIN_THICKNESS_FRAC
      const shortSeg = 15
      const t = 0.5 // Catmull-Rom tension

      // Catmull-Rom → cubic Bezier, clamping control vectors to chord length.
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

        const pts = chains[ci]
        if (pts.length < 2) continue
        const n = pts.length

        const sp = pts.map(([x, y]) => [ox + x * pixelScale, oy + y * pixelScale] as [number, number])

        const cd = deltas?.[ci]
        const hwCore = pts.map((_, i) => {
          const raw = Math.min(1, (cd ? cd[i] : 0) / DELTA_FULL)
          const norm = Math.pow(raw, EDGE_GAMMA)
          return minHW + norm * (maxHW - minHW)
        })
        const hwSmooth = hwCore.map((_, i) => {
          let sum = 0, count = 0
          for (let j = Math.max(0, i - 6); j <= Math.min(n - 1, i + 6); j++) { sum += hwCore[j]; count++ }
          return sum / count
        })
        for (let i = 1; i < n - 1; i++) {
          const dx1 = pts[i][0] - pts[i-1][0], dy1 = pts[i][1] - pts[i-1][1]
          const dx2 = pts[i+1][0] - pts[i][0],  dy2 = pts[i+1][1] - pts[i][1]
          const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2)
          const len = len1 * len2
          if (len > 0 && (dx1*dx2 + dy1*dy2) / len < 0 && Math.min(len1, len2) > shortSeg) hwSmooth[i] = 0
        }
        const taperK = 2
        const taperFloor = 0.2
        const hw = hwSmooth.map((v, i) => {
          const taper = taperFloor + (1 - taperFloor) * Math.min(1, i / taperK) * Math.min(1, (n - 1 - i) / taperK)
          return Math.max(minHW, v * taper)  // minHW is a hard floor: taper/corner-zeroing can't make hairlines
        })

        const spineSharp = (i: number): boolean => {
          if (i <= 0 || i >= n - 1) return false
          const dx1 = pts[i][0] - pts[i-1][0], dy1 = pts[i][1] - pts[i-1][1]
          const dx2 = pts[i+1][0] - pts[i][0],  dy2 = pts[i+1][1] - pts[i][1]
          const len = Math.hypot(dx1, dy1) * Math.hypot(dx2, dy2)
          return len > 0 && (dx1*dx2 + dy1*dy2) / len <= 0.7
        }
        const sharpAt = new Uint8Array(n)
        for (let i = 0; i < n; i++) if (spineSharp(i)) sharpAt[i] = 1

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

        // Adaptive Catmull-Rom with cosine-based chord clamping
        const vtxCos = new Float32Array(n)
        for (let i = 0; i < n; i++) {
          if (i === 0 || i === n - 1) { vtxCos[i] = 1; continue }
          const dx1 = pts[i][0] - pts[i-1][0], dy1 = pts[i][1] - pts[i-1][1]
          const dx2 = pts[i+1][0] - pts[i][0], dy2 = pts[i+1][1] - pts[i][1]
          const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2)
          const len = len1 * len2
          const cos = len > 0 ? (dx1*dx2 + dy1*dy2) / len : 1
          const blend = Math.min(1, Math.min(len1, len2) / shortSeg)
          vtxCos[i] = cos * blend + 1 * (1 - blend)
        }
        const crSegAdaptive = (arr: [number, number][], i: number, si: number): string => {
          const p0 = arr[Math.max(0, i - 1)]
          const p1 = arr[i]
          const p2 = arr[i + 1]
          const p3 = arr[Math.min(arr.length - 1, i + 2)]
          let cp1x = p1[0] + (p2[0] - p0[0]) * t / 3
          let cp1y = p1[1] + (p2[1] - p0[1]) * t / 3
          let cp2x = p2[0] - (p3[0] - p1[0]) * t / 3
          let cp2y = p2[1] - (p3[1] - p1[1]) * t / 3
          const clamp = Math.max(0.05, Math.min(vtxCos[si], vtxCos[Math.min(si + 1, n - 1)]))
          const chord = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
          const maxCV = chord * clamp
          const cv1 = Math.hypot(cp1x - p1[0], cp1y - p1[1])
          const cv2 = Math.hypot(cp2x - p2[0], cp2y - p2[1])
          if (cv1 > maxCV && cv1 > 0) { const s = maxCV / cv1; cp1x = p1[0] + (cp1x - p1[0]) * s; cp1y = p1[1] + (cp1y - p1[1]) * s }
          if (cv2 > maxCV && cv2 > 0) { const s = maxCV / cv2; cp2x = p2[0] + (cp2x - p2[0]) * s; cp2y = p2[1] + (cp2y - p2[1]) * s }
          return `C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
        }
        const spineLen = (i: number) => Math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1])
        const rightRev = [...right].reverse()
        const f = ([x, y]: [number, number]) => `${x.toFixed(1)},${y.toFixed(1)}`
        const segs = [`M${f(left[0])}`]
        for (let i = 0; i < n - 1; i++) {
          segs.push(spineLen(i) > 40 ? `L${f(left[i + 1])}` : crSegAdaptive(left, i, i))
        }
        segs.push(`L${f(right[n - 1])}`)
        for (let i = 0; i < n - 1; i++) {
          const si = n - 2 - i
          segs.push(spineLen(si) > 40 ? `L${f(rightRev[i + 1])}` : crSegAdaptive(rightRev, i, si))
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
    const rm = getRegionMap()
    if (!rm || regions.length === 0) {
      outlineChainsRef.current = null
      outlineDeltasRef.current = null
      return
    }
    const batch = buildOutlineChains(rm, regions, canvasWidth, canvasHeight)
    outlineChainsRef.current = batch
    const imgData = getOriginalImageData()
    outlineDeltasRef.current = imgData
      ? computeOutlineDeltas(batch.chains, rm, imgData, canvasWidth, canvasHeight)
      : null
    updateOutlineSvg()
  }, [regions, canvasWidth, canvasHeight, getRegionMap, getOriginalImageData, updateOutlineSvg])

  return { updateOutlineSvg }
}
