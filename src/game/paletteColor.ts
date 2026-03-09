import type { PaletteColor, Region } from '../types'
import { colorDist, rgbToLab, labToRgb } from './colorDistance'

export type PaletteMode = 'average' | 'saturated'

/**
 * Recompute palette colors from the original image pixels.
 * - 'average': mean RGB of all pixels belonging to each color index
 * - 'saturated': pick the most saturated pixel per color index
 */
export function recomputePalette(
  mode: PaletteMode,
  regions: Region[],
  regionMap: Int32Array,
  imageData: ImageData,
  paletteLength: number,
): PaletteColor[] {
  const w = imageData.width
  const h = imageData.height
  const data = imageData.data
  const regionColorMap = new Map(regions.map(r => [r.id, r.colorIndex]))

  if (mode === 'average') {
    const sums = Array.from({ length: paletteLength }, () => ({ r: 0, g: 0, b: 0, count: 0 }))
    for (let i = 0; i < w * h; i++) {
      const rid = regionMap[i]
      if (rid < 0) continue
      const ci = regionColorMap.get(rid)
      if (ci === undefined) continue
      const pi = i * 4
      sums[ci].r += data[pi]
      sums[ci].g += data[pi + 1]
      sums[ci].b += data[pi + 2]
      sums[ci].count++
    }
    return sums.map(s => s.count > 0
      ? { r: Math.round(s.r / s.count), g: Math.round(s.g / s.count), b: Math.round(s.b / s.count) }
      : { r: 128, g: 128, b: 128 }
    )
  }

  // 'saturated': most saturated pixel within a color distance of the average.
  // First compute averages as the anchor.
  const avg = recomputePalette('average', regions, regionMap, imageData, paletteLength)
  const MAX_DIST = 20 // max ΔE76 from average (perceptual Lab distance)
  const best = Array.from({ length: paletteLength }, () => ({ r: 128, g: 128, b: 128, score: -1 }))
  for (let i = 0; i < w * h; i++) {
    const rid = regionMap[i]
    if (rid < 0) continue
    const ci = regionColorMap.get(rid)
    if (ci === undefined) continue
    const pi = i * 4
    const r = data[pi], g = data[pi + 1], b = data[pi + 2]
    // Skip pixels too far from the average in perceptual space
    const dist = colorDist(r, g, b, avg[ci].r, avg[ci].g, avg[ci].b)
    if (dist > MAX_DIST) continue
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    const l = (mx + mn) / 2
    const sat = mx === mn ? 0 : (mx - mn) / (l < 128 ? (mx + mn) : (510 - mx - mn))
    const lPenalty = 1 - Math.abs(l - 128) / 128
    const score = sat * lPenalty
    if (score > best[ci].score) {
      best[ci] = { r, g, b, score }
    }
  }
  // Fall back to average if no pixel passed the distance filter
  return best.map((b, i) => b.score < 0 ? avg[i] : { r: b.r, g: b.g, b: b.b })
}

/**
 * Push nearby palette colors apart in Lab space until all pairs
 * exceed minDist (ΔE76). Iterative repulsion, clamped to valid sRGB.
 */
export function spreadPalette(palette: PaletteColor[], minDist = 18, iterations = 50): PaletteColor[] {
  const n = palette.length
  if (n < 2) return palette

  // Work in Lab space
  const labs = palette.map(c => rgbToLab(c.r, c.g, c.b))

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dL = labs[i][0] - labs[j][0]
        const da = labs[i][1] - labs[j][1]
        const db = labs[i][2] - labs[j][2]
        const dist = Math.sqrt(dL * dL + da * da + db * db)
        if (dist >= minDist) continue
        if (dist < 0.01) {
          // Coincident -- nudge arbitrarily
          labs[i][1] += 1; labs[j][1] -= 1
          moved = true
          continue
        }
        const push = (minDist - dist) / 2
        const scale = push / dist
        labs[i][0] += dL * scale; labs[i][1] += da * scale; labs[i][2] += db * scale
        labs[j][0] -= dL * scale; labs[j][1] -= da * scale; labs[j][2] -= db * scale
        // Clamp L to valid range
        labs[i][0] = Math.max(0, Math.min(100, labs[i][0]))
        labs[j][0] = Math.max(0, Math.min(100, labs[j][0]))
        moved = true
      }
    }
    if (!moved) break
  }

  return labs.map(([L, a, b]) => {
    const [r, g, bv] = labToRgb(L, a, b)
    return { r, g, b: bv }
  })
}
