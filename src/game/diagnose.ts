import { rgbToLab, labToRgb, colorDist } from './colorDistance'
import type { PaletteColor, Region } from '../types'

export interface SubCluster {
  meanLab: [number, number, number]
  meanRgb: [number, number, number]
  pixelCount: number
  /** Fraction of the region's total pixels */
  fraction: number
  /** Bounding box */
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

export interface RegionDiagnostic {
  regionId: number
  colorIndex: number
  paletteColor: PaletteColor
  pixelCount: number
  /** Mean Lab of actual original-image pixels in this region */
  meanLab: [number, number, number]
  /** Standard deviation of Lab values across the region */
  stddevLab: [number, number, number]
  /** ΔE76 between the two most different sub-areas */
  maxInternalSpread: number
  /** If internal spread is high, these are the sub-clusters found by spatial k-means */
  subClusters: SubCluster[]
  /** ΔE76 between sub-cluster centers (0 if only 1 cluster) */
  subClusterDeltaE: number
  /** Fraction of boundary pixels between sub-clusters (spatial coherence measure).
   *  Low = clusters are interleaved noise. High = clusters are spatially distinct blobs. */
  spatialCoherence: number
}

export interface MergeStep {
  step: number
  droppedIndex: number
  keptIndex: number
  droppedColor: PaletteColor
  keptColor: PaletteColor
  deltaE: number
  droppedPixels: number
  keptPixels: number
}

export interface DiagnosticReport {
  /** Regions sorted by maxInternalSpread descending — worst offenders first */
  regions: RegionDiagnostic[]
  /** mergeToTarget steps in order */
  mergeSteps: MergeStep[]
  /** Summary stats */
  totalRegions: number
  suspectRegions: number
  /** ΔE threshold used to flag suspect regions */
  suspectThreshold: number
}

/**
 * Analyze the final pipeline result to find regions that contain visually
 * dissimilar pixels — regions that should probably be split.
 */
export function diagnoseRegions(
  regions: Region[],
  regionMap: Int32Array,
  imageData: ImageData,
  palette: PaletteColor[],
): RegionDiagnostic[] {
  const { width, height, data } = imageData
  const pixels = width * height

  const results: RegionDiagnostic[] = []

  for (const region of regions) {
    const rid = region.id
    const ci = region.colorIndex

    // Collect all pixel positions and their Lab colors
    const positions: number[] = []
    const labs: [number, number, number][] = []
    for (let i = 0; i < pixels; i++) {
      if (regionMap[i] !== rid) continue
      positions.push(i)
      const pi = i * 4
      labs.push(rgbToLab(data[pi], data[pi + 1], data[pi + 2]))
    }

    if (positions.length < 10) continue

    // Mean Lab
    let sumL = 0, sumA = 0, sumB = 0
    for (const [L, a, b] of labs) { sumL += L; sumA += a; sumB += b }
    const n = labs.length
    const meanLab: [number, number, number] = [sumL / n, sumA / n, sumB / n]

    // Stddev Lab
    let varL = 0, varA = 0, varB = 0
    for (const [L, a, b] of labs) {
      varL += (L - meanLab[0]) ** 2
      varA += (a - meanLab[1]) ** 2
      varB += (b - meanLab[2]) ** 2
    }
    const stddevLab: [number, number, number] = [
      Math.sqrt(varL / n), Math.sqrt(varA / n), Math.sqrt(varB / n),
    ]

    // Overall spread: ΔE of the stddev vector (approximation of internal variation)
    const maxInternalSpread = Math.sqrt(varL / n + varA / n + varB / n) * 2

    // Sub-cluster detection via k-means (k=2) in Lab space
    const { clusters, assignments } = kMeans2(labs)
    const subClusters = buildSubClusters(clusters, assignments, positions, labs, width)
    const subClusterDeltaE = labDist(clusters[0], clusters[1])

    // Spatial coherence: what fraction of intra-region boundary pixels
    // separate different clusters? High = spatially distinct blobs.
    let interClusterBoundary = 0
    let totalInternalBoundary = 0
    const assignMap = new Map<number, number>()
    for (let k = 0; k < positions.length; k++) assignMap.set(positions[k], assignments[k])

    for (let k = 0; k < positions.length; k++) {
      const i = positions[k]
      const x = i % width
      const neighbors = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        i >= width ? i - width : -1,
        i + width < pixels ? i + width : -1,
      ]
      for (const ni of neighbors) {
        if (ni < 0 || regionMap[ni] !== rid) continue
        totalInternalBoundary++
        const na = assignMap.get(ni)
        if (na !== undefined && na !== assignments[k]) interClusterBoundary++
      }
    }
    const spatialCoherence = totalInternalBoundary > 0
      ? 1 - (interClusterBoundary / totalInternalBoundary)
      : 0

    results.push({
      regionId: rid,
      colorIndex: ci,
      paletteColor: palette[ci],
      pixelCount: positions.length,
      meanLab,
      stddevLab,
      maxInternalSpread,
      subClusters,
      subClusterDeltaE,
      spatialCoherence,
    })
  }

  results.sort((a, b) => b.maxInternalSpread - a.maxInternalSpread)
  return results
}

/**
 * Track what mergeToTarget does: which pairs get merged and how many pixels
 * are affected. This is a diagnostic wrapper that replays the merge logic.
 */
export function traceMergeToTarget(
  palette: PaletteColor[],
  regions: Region[],
  targetCount: number,
): MergeStep[] {
  const pal = palette.map(p => ({ ...p }))
  const counts = new Array(pal.length).fill(0)
  for (const r of regions) counts[r.colorIndex] += r.pixelCount

  const steps: MergeStep[] = []
  let step = 0

  while (pal.length > targetCount) {
    let minDist = Infinity, minI = 0, minJ = 1
    for (let a = 0; a < pal.length; a++) {
      for (let b = a + 1; b < pal.length; b++) {
        const d = colorDist(pal[a].r, pal[a].g, pal[a].b, pal[b].r, pal[b].g, pal[b].b)
        if (d < minDist) { minDist = d; minI = a; minJ = b }
      }
    }
    const [keep, drop] = counts[minI] >= counts[minJ] ? [minI, minJ] : [minJ, minI]
    steps.push({
      step: step++,
      droppedIndex: drop,
      keptIndex: keep,
      droppedColor: { ...pal[drop] },
      keptColor: { ...pal[keep] },
      deltaE: minDist,
      droppedPixels: counts[drop],
      keptPixels: counts[keep],
    })
    counts[keep] += counts[drop]
    pal.splice(drop, 1)
    counts.splice(drop, 1)
  }

  return steps
}

/**
 * Generate the full diagnostic report.
 */
export function generateDiagnosticReport(
  regions: Region[],
  regionMap: Int32Array,
  imageData: ImageData,
  palette: PaletteColor[],
  rawPalette: PaletteColor[],
  rawRegions: Region[],
  targetColorCount: number,
): DiagnosticReport {
  const regionDiags = diagnoseRegions(regions, regionMap, imageData, palette)

  const mergeSteps = rawPalette.length > targetColorCount
    ? traceMergeToTarget(rawPalette, rawRegions, targetColorCount)
    : []

  const suspectThreshold = 10
  const suspectRegions = regionDiags.filter(r =>
    r.maxInternalSpread > suspectThreshold && r.spatialCoherence > 0.7
  ).length

  return {
    regions: regionDiags,
    mergeSteps,
    totalRegions: regions.length,
    suspectRegions,
    suspectThreshold,
  }
}

/**
 * Print a human-readable summary to the console.
 */
export function printDiagnosticReport(report: DiagnosticReport): void {
  console.group('🔍 Doodlebloom Pipeline Diagnostic Report')

  console.log(`Total regions: ${report.totalRegions}`)
  console.log(`Suspect regions (spread > ${report.suspectThreshold} ΔE, spatially coherent): ${report.suspectRegions}`)

  // mergeToTarget steps
  if (report.mergeSteps.length > 0) {
    console.group(`mergeToTarget: ${report.mergeSteps.length} merges`)
    for (const s of report.mergeSteps) {
      const pctDropped = ((s.droppedPixels / (s.droppedPixels + s.keptPixels)) * 100).toFixed(1)
      console.log(
        `Step ${s.step}: ΔE=${s.deltaE.toFixed(1)} — ` +
        `dropped rgb(${s.droppedColor.r},${s.droppedColor.g},${s.droppedColor.b}) ` +
        `(${s.droppedPixels.toLocaleString()}px, ${pctDropped}%) → ` +
        `kept rgb(${s.keptColor.r},${s.keptColor.g},${s.keptColor.b}) ` +
        `(${s.keptPixels.toLocaleString()}px)`
      )
    }
    console.groupEnd()
  }

  // Top suspect regions
  const suspects = report.regions.filter(r =>
    r.maxInternalSpread > report.suspectThreshold
  ).slice(0, 15)

  if (suspects.length > 0) {
    console.group(`Top ${suspects.length} regions by internal color spread`)
    for (const r of suspects) {
      const pct = ((r.pixelCount / report.regions.reduce((s, x) => s + x.pixelCount, 0)) * 100).toFixed(1)
      console.group(
        `Region ${r.regionId} — color #${r.colorIndex} ` +
        `rgb(${r.paletteColor.r},${r.paletteColor.g},${r.paletteColor.b}) — ` +
        `${r.pixelCount.toLocaleString()}px (${pct}%)`
      )
      console.log(`Internal spread: ${r.maxInternalSpread.toFixed(1)} ΔE`)
      console.log(`Lab stddev: L=${r.stddevLab[0].toFixed(1)}, a=${r.stddevLab[1].toFixed(1)}, b=${r.stddevLab[2].toFixed(1)}`)
      console.log(`Spatial coherence: ${(r.spatialCoherence * 100).toFixed(0)}% (high = blobs, low = noise)`)
      if (r.subClusters.length === 2) {
        console.log(`Sub-cluster ΔE: ${r.subClusterDeltaE.toFixed(1)}`)
        for (let i = 0; i < 2; i++) {
          const sc = r.subClusters[i]
          console.log(
            `  Cluster ${i}: ${sc.pixelCount.toLocaleString()}px (${(sc.fraction * 100).toFixed(0)}%) — ` +
            `rgb(${sc.meanRgb[0]},${sc.meanRgb[1]},${sc.meanRgb[2]}) — ` +
            `bbox [${sc.bbox.x0},${sc.bbox.y0}]→[${sc.bbox.x1},${sc.bbox.y1}]`
          )
        }
        if (r.spatialCoherence > 0.7 && r.subClusterDeltaE > 8) {
          console.log(`  ⚠️ SHOULD SPLIT: spatially distinct sub-areas with ΔE=${r.subClusterDeltaE.toFixed(1)}`)
        }
      }
      console.groupEnd()
    }
    console.groupEnd()
  }

  console.groupEnd()
}

// --- Internal helpers ---

function labDist(a: [number, number, number], b: [number, number, number]): number {
  const dL = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2]
  return Math.sqrt(dL * dL + da * da + db * db)
}

function kMeans2(labs: [number, number, number][]): {
  clusters: [[number, number, number], [number, number, number]]
  assignments: Uint8Array
} {
  const n = labs.length
  if (n < 2) {
    return {
      clusters: [labs[0] ?? [50, 0, 0], labs[0] ?? [50, 0, 0]],
      assignments: new Uint8Array(n),
    }
  }

  // Initialize: pick the two most distant points from a sample
  const sampleSize = Math.min(n, 500)
  const step = Math.max(1, Math.floor(n / sampleSize))
  let maxDist = 0, seedA = 0, seedB = 1
  for (let i = 0; i < n; i += step) {
    for (let j = i + step; j < n; j += step) {
      const d = labDist(labs[i], labs[j])
      if (d > maxDist) { maxDist = d; seedA = i; seedB = j }
    }
  }

  const c0: [number, number, number] = [...labs[seedA]]
  const c1: [number, number, number] = [...labs[seedB]]
  const assignments = new Uint8Array(n)

  for (let iter = 0; iter < 20; iter++) {
    // Assign
    let changed = false
    for (let i = 0; i < n; i++) {
      const d0 = labDist(labs[i], c0)
      const d1 = labDist(labs[i], c1)
      const a = d0 <= d1 ? 0 : 1
      if (a !== assignments[i]) { assignments[i] = a; changed = true }
    }
    if (!changed && iter > 0) break

    // Update centers
    let s0L = 0, s0a = 0, s0b = 0, n0 = 0
    let s1L = 0, s1a = 0, s1b = 0, n1 = 0
    for (let i = 0; i < n; i++) {
      if (assignments[i] === 0) {
        s0L += labs[i][0]; s0a += labs[i][1]; s0b += labs[i][2]; n0++
      } else {
        s1L += labs[i][0]; s1a += labs[i][1]; s1b += labs[i][2]; n1++
      }
    }
    if (n0 > 0) { c0[0] = s0L / n0; c0[1] = s0a / n0; c0[2] = s0b / n0 }
    if (n1 > 0) { c1[0] = s1L / n1; c1[1] = s1a / n1; c1[2] = s1b / n1 }
  }

  return { clusters: [c0, c1], assignments }
}

function buildSubClusters(
  clusters: [[number, number, number], [number, number, number]],
  assignments: Uint8Array,
  positions: number[],
  labs: [number, number, number][],
  width: number,
): SubCluster[] {
  const n = positions.length
  const subs: SubCluster[] = []

  for (let c = 0; c < 2; c++) {
    let sumL = 0, sumA = 0, sumB = 0, sumR = 0, sumG = 0, sumBl = 0, count = 0
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let i = 0; i < n; i++) {
      if (assignments[i] !== c) continue
      sumL += labs[i][0]; sumA += labs[i][1]; sumB += labs[i][2]
      count++
      const x = positions[i] % width
      const y = Math.floor(positions[i] / width)
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
    if (count === 0) continue

    const meanLab: [number, number, number] = [sumL / count, sumA / count, sumB / count]
    const [mr, mg, mb] = labToRgb(meanLab[0], meanLab[1], meanLab[2])

    subs.push({
      meanLab,
      meanRgb: [mr, mg, mb],
      pixelCount: count,
      fraction: count / n,
      bbox: { x0, y0, x1, y1 },
    })
  }

  return subs
}
