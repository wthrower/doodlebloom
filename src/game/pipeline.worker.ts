import { analyzeColors, assignColors } from './quantize'
import {
  traceRegions, mergeRegions, finalizeRegions,
  mergeGradientSeams, fuseSameColorRegions, relabelRegions, mergeToTarget, capRegions,
} from './regions'
import { recomputePalette, spreadPalette } from './paletteColor'
import type { PaletteColor, Region } from '../types'

/** Maximum number of regions in the final puzzle. */
const MAX_REGIONS = 500

export interface PipelineInput {
  imageData: ImageData
  colorCount: number
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
  const { imageData, colorCount } = e.data
  try {
    post('palette')
    const rawPalette = analyzeColors(imageData, colorCount)

    post('assign')
    const indexMap = assignColors(rawPalette, imageData)

    const cw = imageData.width
    const ch = imageData.height

    post('trace')
    const regionState = traceRegions(indexMap, cw, ch)

    post('merge')
    mergeRegions(regionState, rawPalette)

    post('measure')
    const { regions: rawRegions, regionMap } = finalizeRegions(regionState, rawPalette)

    post('seams')
    const seamedRegions = mergeGradientSeams(rawRegions, regionMap, imageData, cw, 0.01, rawPalette)

    post('finish')

    // Compact: remove palette colors with no surviving regions
    const usedIndices = [...new Set(seamedRegions.map(r => r.colorIndex))].sort((a, b) => a - b)
    const compactRemap = new Map(usedIndices.map((old, i) => [old, i]))
    let palette: PaletteColor[] = usedIndices.map(i => rawPalette[i])
    let regions: Region[] = seamedRegions.map(r => ({ ...r, colorIndex: compactRemap.get(r.colorIndex)! }))

    if (palette.length > colorCount) {
      mergeToTarget(palette, regions, colorCount)
    }
    regions = fuseSameColorRegions(regions, regionMap, cw)
    regions = capRegions(regions, regionMap, cw, palette, MAX_REGIONS)
    regions = fuseSameColorRegions(regions, regionMap, cw)
    relabelRegions(regions, regionMap, cw)

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
