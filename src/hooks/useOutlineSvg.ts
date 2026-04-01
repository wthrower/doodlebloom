import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { buildOutlineChains } from '../game/canvas'
import type { OutlineBatch } from '../game/canvas'
import type { Region } from '../types'
import type { Transform } from './usePanZoom'

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

      // Visible canvas bounds (with small margin for curves that extend slightly outside bbox)
      const margin = 3
      const visMinX = (-ox / pixelScale) - margin
      const visMinY = (-oy / pixelScale) - margin
      const visMaxX = visMinX + (wrapW / pixelScale) + margin * 2
      const visMaxY = visMinY + (wrapH / pixelScale) + margin * 2

      const { chains, bboxes } = batch
      const imgData = getOriginalImageData()
      const imgW = canvasWidth

      // Sample contrast at a boundary-grid point (gx, gy) from the original image.
      const sampleRadius = 4
      const sampleContrast = (gx: number, gy: number): number => {
        if (!imgData) return 0.5
        let minL = 1, maxL = 0
        for (let py = gy - sampleRadius; py <= gy + sampleRadius; py++) {
          for (let px = gx - sampleRadius; px <= gx + sampleRadius; px++) {
            if (px < 0 || py < 0 || px >= imgW || py >= imgData.height) continue
            const i = (py * imgW + px) * 4
            const d = imgData.data
            const L = (0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]) / 255
            if (L < minL) minL = L
            if (L > maxL) maxL = L
          }
        }
        return maxL - minL
      }

      const minHW = 0.5
      const maxHW = Math.min(3, Math.max(0.75, scale * 0.75))
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

        const hwCore = pts.map(([gx, gy]) => minHW + Math.max(0.5, sampleContrast(gx, gy)) * (maxHW - minHW))
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
          return Math.max(0.75, v * taper)
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
    if (!rm || regions.length === 0) { outlineChainsRef.current = null; return }
    outlineChainsRef.current = buildOutlineChains(rm, regions, canvasWidth, canvasHeight)
    updateOutlineSvg()
  }, [regions, canvasWidth, canvasHeight, getRegionMap, updateOutlineSvg])

  return { updateOutlineSvg }
}
