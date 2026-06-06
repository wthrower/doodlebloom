import { analyzeColors, assignColors } from './quantize'
import {
  traceRegions, mergeRegions, finalizeRegions,
  mergeGradientSeams, fuseSameColorRegions, relabelRegions, mergeToTarget, capRegions,
} from './regions'
import { recomputePalette, spreadPalette } from './paletteColor'
import { medianFilterRGB } from './smooth'
import type { PaletteColor, Region } from '../types'

export interface PipelineInput {
  imageData: ImageData
  colorCount: number
  minRegionPixels: number
  maxRegions: number
  smoothRadius: number
}

export interface PipelineResult {
  palette: PaletteColor[]
  basePalette: PaletteColor[]
  regions: Region[]
  indexMap: Uint8Array
  regionMap: Int32Array
  rawPalette: PaletteColor[]
}

export type PipelineMessage =
  | { type: 'progress'; stage: string }
  | { type: 'error'; message: string }
  | { type: 'complete'; result: PipelineResult }

function post(stage: string) {
  self.postMessage({ type: 'progress', stage } satisfies PipelineMessage)
}

self.onmessage = (e: MessageEvent<PipelineInput>) => {
  const { imageData, colorCount, minRegionPixels, maxRegions, smoothRadius } = e.data
  try {
    // Smooth only the image that drives segmentation (quantize + assign). The crisp
    // original is kept for gradient-seam contrast and palette recompute below, so
    // painted colors stay vivid and the completion reveal stays sharp.
    const segImage = smoothRadius > 0 ? medianFilterRGB(imageData, smoothRadius) : imageData

    post('palette')
    const rawPalette = analyzeColors(segImage, colorCount)

    post('assign')
    const indexMap = assignColors(rawPalette, segImage)

    const cw = imageData.width
    const ch = imageData.height

    post('trace')
    const regionState = traceRegions(indexMap, cw, ch)

    post('merge')
    mergeRegions(regionState, rawPalette, minRegionPixels)

    post('measure')
    const { regions: rawRegions, regionMap } = finalizeRegions(regionState, rawPalette)

    post('seams')
    const seamedRegions = mergeGradientSeams(rawRegions, regionMap, imageData, cw, 0.01, rawPalette)

    post('finish')

    let palette: PaletteColor[] = [...rawPalette]
    let regions: Region[] = [...seamedRegions]

    if (palette.length > colorCount) {
      mergeToTarget(palette, regions, colorCount)
    }
    regions = fuseSameColorRegions(regions, regionMap, cw)
    regions = capRegions(regions, regionMap, cw, palette, maxRegions)
    regions = fuseSameColorRegions(regions, regionMap, cw)

    // Compact: remove palette colors with no surviving regions
    const usedIndices = [...new Set(regions.map(r => r.colorIndex))].sort((a, b) => a - b)
    const compactRemap = new Map(usedIndices.map((old, i) => [old, i]))
    palette = usedIndices.map(i => palette[i])
    regions = regions.map(r => ({ ...r, colorIndex: compactRemap.get(r.colorIndex)! }))

    relabelRegions(regions, regionMap, cw)

    // Reconcile pixel counts against the finalized regionMap. Upstream merge
    // stages accumulate pixelCount incrementally and can drift from the actual
    // pixels -- e.g. finalizeRegions snapshots counts before absorbing thin
    // regions, and a "thin" (narrow) region can still hold many pixels. Counting
    // straight from the final map guarantees pixelCount == on-screen area, which
    // the paint UI relies on to auto-advance to the color with the most pixels.
    const finalCounts = new Map<number, number>()
    for (let i = 0; i < regionMap.length; i++) {
      const rid = regionMap[i]
      if (rid >= 0) finalCounts.set(rid, (finalCounts.get(rid) ?? 0) + 1)
    }
    for (const r of regions) r.pixelCount = finalCounts.get(r.id) ?? 0

    // Recompute palette: most saturated pixel near the average, then spread apart
    const basePalette = recomputePalette('saturated', regions, regionMap, imageData, palette.length)
    palette = spreadPalette(basePalette)

    const result: PipelineResult = { palette, basePalette, regions, indexMap, regionMap, rawPalette }
    self.postMessage(
      { type: 'complete', result } satisfies PipelineMessage,
      { transfer: [indexMap.buffer, regionMap.buffer] },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    self.postMessage({ type: 'error', message } satisfies PipelineMessage)
  }
}
