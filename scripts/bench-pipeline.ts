/**
 * Pipeline benchmark: runs the real worker stages from src/game on a seeded
 * synthetic image and prints per-stage timings. Used to measure perf work
 * before/after — run it on both versions of the code with the same args.
 *
 * Usage:
 *   npx esbuild scripts/bench-pipeline.ts --bundle --format=esm --platform=node \
 *     --outfile=tmp/bench.mjs --log-level=warning && node tmp/bench.mjs
 *
 * The image generator is deterministic (seeded PRNG); any change to it
 * invalidates comparisons across runs.
 */

import { analyzeColors, assignColors, assignPixels } from '../src/game/quantize'
import {
  traceRegions, mergeRegions, finalizeRegions,
  mergeGradientSeams, fuseSameColorRegions, relabelRegions, mergeToTarget, capRegions,
} from '../src/game/regions'
import { recomputePalette, spreadPalette } from '../src/game/paletteColor'
import { medianFilterRGB } from '../src/game/smooth'
import { DETAIL_SETTINGS } from '../src/types'
import type { PaletteColor, Region, DetailLevel } from '../src/types'

// --- Node polyfill: smooth.ts constructs `new ImageData(...)` ---
if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data
      this.width = width
      this.height = height
    }
  }
}

// --- Seeded PRNG (mulberry32) ---
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Synthetic test image: multi-octave value noise driving a color ramp, plus
 * fine per-pixel noise. Produces organic blobby regions at several scales —
 * the same general structure the segmenter sees in stock/generated art.
 */
function makeImage(width: number, height: number, seed: number): ImageData {
  const rand = mulberry32(seed)

  const octaves = [
    { cell: 192, amp: 1.0 },
    { cell: 48, amp: 0.8 },
    { cell: 20, amp: 0.45 },
    { cell: 10, amp: 0.1 },
  ].map(({ cell, amp }) => {
    const gw = Math.ceil(width / cell) + 2
    const gh = Math.ceil(height / cell) + 2
    const grid = new Float64Array(gw * gh)
    for (let i = 0; i < grid.length; i++) grid[i] = rand()
    return { cell, amp, gw, grid }
  })

  const smooth = (t: number) => t * t * (3 - 2 * t)
  const noiseAt = (x: number, y: number): number => {
    let v = 0, norm = 0
    for (const { cell, amp, gw, grid } of octaves) {
      const gx = x / cell, gy = y / cell
      const x0 = Math.floor(gx), y0 = Math.floor(gy)
      const fx = smooth(gx - x0), fy = smooth(gy - y0)
      const i = y0 * gw + x0
      const top = grid[i] + (grid[i + 1] - grid[i]) * fx
      const bot = grid[i + gw] + (grid[i + gw + 1] - grid[i + gw]) * fx
      v += (top + (bot - top) * fy) * amp
      norm += amp
    }
    return v / norm
  }

  // Color ramp: distinct hues so MMCQ finds a real palette
  const ramp: [number, number, number][] = [
    [24, 32, 84], [46, 86, 158], [96, 158, 196], [186, 214, 188],
    [240, 224, 150], [228, 162, 88], [196, 96, 72], [140, 52, 86],
    [88, 40, 108], [44, 26, 64],
  ]

  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.min(0.9999, Math.max(0, noiseAt(x, y)))
      const f = v * (ramp.length - 1)
      const i0 = Math.floor(f), t = f - i0
      const c0 = ramp[i0], c1 = ramp[Math.min(i0 + 1, ramp.length - 1)]
      const jitter = (rand() - 0.5) * 14 // fine texture for the median filter to chew on
      const o = (y * width + x) * 4
      data[o] = c0[0] + (c1[0] - c0[0]) * t + jitter
      data[o + 1] = c0[1] + (c1[1] - c0[1]) * t + jitter
      data[o + 2] = c0[2] + (c1[2] - c0[2]) * t + jitter
      data[o + 3] = 255
    }
  }
  return new ImageData(data, width, height)
}

// --- The worker's stage sequence, verbatim, with timers ---
function runPipeline(imageData: ImageData, colorCount: number, detail: DetailLevel) {
  const { minRegionPixels, maxRegions, smoothRadius } = DETAIL_SETTINGS[detail]
  const timings: [string, number][] = []
  const time = <T>(label: string, fn: () => T): T => {
    const t0 = performance.now()
    const out = fn()
    timings.push([label, performance.now() - t0])
    return out
  }

  const segImage = time('smooth', () =>
    smoothRadius > 0 ? medianFilterRGB(imageData, smoothRadius) : imageData)
  const rawPalette = time('palette', () => analyzeColors(segImage, colorCount))
  const indexMap = time('assign', () => assignColors(rawPalette, segImage))

  const cw = imageData.width
  const regionState = time('trace', () => traceRegions(indexMap, cw, imageData.height))
  time('merge', () => mergeRegions(regionState, rawPalette, minRegionPixels))
  const { regions: rawRegions, regionMap } = time('measure', () =>
    finalizeRegions(regionState, rawPalette))
  const seamedRegions = time('seams', () =>
    mergeGradientSeams(rawRegions, regionMap, imageData, cw, 0.01, rawPalette))

  let palette: PaletteColor[] = [...rawPalette]
  let regions: Region[] = [...seamedRegions]
  time('finish:mergeToTarget', () => {
    if (palette.length > colorCount) mergeToTarget(palette, regions, colorCount)
  })
  regions = time('finish:fuse1', () => fuseSameColorRegions(regions, regionMap, cw))
  regions = time('finish:cap', () => capRegions(regions, regionMap, cw, palette, maxRegions))
  regions = time('finish:fuse2', () => fuseSameColorRegions(regions, regionMap, cw))

  const usedIndices = [...new Set(regions.map(r => r.colorIndex))].sort((a, b) => a - b)
  const compactRemap = new Map(usedIndices.map((old, i) => [old, i]))
  palette = usedIndices.map(i => palette[i])
  regions = regions.map(r => ({ ...r, colorIndex: compactRemap.get(r.colorIndex)! }))

  time('finish:relabel', () => relabelRegions(regions, regionMap, cw))

  time('finish:recount', () => {
    const finalCounts = new Map<number, number>()
    for (let i = 0; i < regionMap.length; i++) {
      const rid = regionMap[i]
      if (rid >= 0) finalCounts.set(rid, (finalCounts.get(rid) ?? 0) + 1)
    }
    for (const r of regions) r.pixelCount = finalCounts.get(r.id) ?? 0
  })

  const basePalette = time('finish:recompute', () =>
    recomputePalette('saturated', regions, regionMap, imageData, palette.length))
  palette = time('finish:spread', () => spreadPalette(basePalette))

  return { timings, regions, palette }
}

// --- Main ---
const WIDTH = 1024
const HEIGHT = 1536
const COLOR_COUNT = 16
const SEED = 12345
const RUNS = 2

const levels = (process.argv[2]?.split(',') as DetailLevel[]) ?? ['very high', 'medium']

console.log(`image ${WIDTH}x${HEIGHT} (${((WIDTH * HEIGHT) / 1e6).toFixed(2)}MP), colorCount ${COLOR_COUNT}, seed ${SEED}, node ${process.version}`)
const image = makeImage(WIDTH, HEIGHT, SEED)

for (const detail of levels) {
  if (!DETAIL_SETTINGS[detail]) {
    console.error(`unknown detail level: ${detail}`)
    process.exit(1)
  }
  console.log(`\n=== detail: ${detail} (${JSON.stringify(DETAIL_SETTINGS[detail])}) ===`)
  for (let run = 1; run <= RUNS; run++) {
    const { timings, regions, palette } = runPipeline(image, COLOR_COUNT, detail)
    const total = timings.reduce((s, [, ms]) => s + ms, 0)
    console.log(`run ${run}: total ${total.toFixed(0)}ms — ${regions.length} regions, ${palette.length} colors`)
    for (const [label, ms] of timings) {
      console.log(`  ${label.padEnd(22)} ${ms.toFixed(1).padStart(9)}ms`)
    }
    // DUMP=prefix: write final regions to ${prefix}-${detail}.json so a
    // refactor can be diffed for behavioral equivalence.
    if (run === RUNS && process.env.DUMP) {
      const { writeFileSync } = await import('node:fs')
      const path = `${process.env.DUMP}-${detail.replace(' ', '_')}.json`
      writeFileSync(path, JSON.stringify(regions, null, 1))
      console.log(`  regions dumped to ${path}`)
    }
  }
}

// Session-restore path: useGame runs assignPixels over the full image on every
// restore (feeding the indexMap chain). Timed separately so its removal is
// measurable.
{
  const palette = analyzeColors(image, COLOR_COUNT)
  const t0 = performance.now()
  assignPixels(image.data, WIDTH * HEIGHT, palette)
  console.log(`\nrestore-path assignPixels: ${(performance.now() - t0).toFixed(0)}ms`)
}
