import quantize from 'quantize'
import type { PaletteColor } from '../types'

export interface QuantizeResult {
  palette: PaletteColor[]
  /** flat array of palette indices, one per pixel, length = width * height */
  indexMap: Uint8Array
}

export function quantizeImage(
  imageData: ImageData,
  colorCount: number
): QuantizeResult {
  const { data, width, height } = imageData
  const pixels = width * height

  const allPixels = buildPixelArray(data, pixels)
  const palette = mmcqPalette(allPixels, colorCount)
  const indexMap = assignPixels(data, pixels, palette)

  // Replace MMCQ centroids with the actual median of assigned pixels
  refinePalette(palette, indexMap, imageData)

  return { palette, indexMap }
}

function buildPixelArray(data: Uint8ClampedArray, pixels: number): [number, number, number][] {
  const arr: [number, number, number][] = []
  for (let i = 0; i < pixels; i++) {
    if (data[i * 4 + 3] > 128) arr.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]])
  }
  return arr
}

function mmcqPalette(pixelArray: [number, number, number][], colorCount: number): PaletteColor[] {
  const colorMap = quantize(pixelArray, colorCount)
  const raw = colorMap ? colorMap.palette() : [[0, 0, 0]] as [number, number, number][]
  return raw.map(([r, g, b]) => ({ r, g, b }))
}

function assignPixels(data: Uint8ClampedArray, pixels: number, palette: PaletteColor[]): Uint8Array {
  const indexMap = new Uint8Array(pixels)
  for (let i = 0; i < pixels; i++) {
    indexMap[i] = nearestPaletteIndex(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], palette)
  }
  return indexMap
}

function refinePalette(palette: PaletteColor[], indexMap: Uint8Array, imageData: ImageData): void {
  const { data } = imageData
  const n = palette.length
  const rs: number[][] = Array.from({ length: n }, () => [])
  const gs: number[][] = Array.from({ length: n }, () => [])
  const bs: number[][] = Array.from({ length: n }, () => [])

  for (let i = 0; i < indexMap.length; i++) {
    const idx = indexMap[i]
    rs[idx].push(data[i * 4])
    gs[idx].push(data[i * 4 + 1])
    bs[idx].push(data[i * 4 + 2])
  }

  for (let i = 0; i < n; i++) {
    if (rs[i].length === 0) continue
    palette[i] = { r: median(rs[i]), g: median(gs[i]), b: median(bs[i]) }
  }
}

function median(values: number[]): number {
  values.sort((a, b) => a - b)
  const mid = values.length >> 1
  return values.length % 2 === 1 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2)
}

function nearestPaletteIndex(r: number, g: number, b: number, palette: PaletteColor[]): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < palette.length; i++) {
    const dr = r - palette[i].r
    const dg = g - palette[i].g
    const db = b - palette[i].b
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) { bestDist = dist; best = i }
  }
  return best
}
