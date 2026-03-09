import quantize from 'quantize'
import { rgbToLab } from './colorDistance'
import type { PaletteColor } from '../types'

export interface QuantizeResult {
  palette: PaletteColor[]
  /** flat array of palette indices, one per pixel, length = width * height */
  indexMap: Uint8Array
}

/** Stage 1 of 2: MMCQ palette from raw pixel data. */
export function analyzeColors(
  imageData: ImageData,
  colorCount: number
): PaletteColor[] {
  const pixels = imageData.width * imageData.height
  const allPixels = buildPixelArray(imageData.data, pixels)
  return mmcqPalette(allPixels, colorCount * 2)
}

/** Stage 2 of 2: assign each pixel to its nearest palette color, then refine palette. */
export function assignColors(
  palette: PaletteColor[],
  imageData: ImageData
): Uint8Array {
  const pixels = imageData.width * imageData.height
  const indexMap = assignPixels(imageData.data, pixels, palette)
  refinePalette(palette, indexMap, imageData)
  return indexMap
}

export function quantizeImage(
  imageData: ImageData,
  colorCount: number
): QuantizeResult {
  const palette = analyzeColors(imageData, colorCount)
  const indexMap = assignColors(palette, imageData)
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

export function assignPixels(data: Uint8ClampedArray, pixels: number, palette: PaletteColor[]): Uint8Array {
  const paletteLab = palette.map(p => rgbToLab(p.r, p.g, p.b))
  const indexMap = new Uint8Array(pixels)
  for (let i = 0; i < pixels; i++) {
    const [L, a, b] = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    indexMap[i] = nearestPaletteIndex(L, a, b, paletteLab)
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
    palette[i] = { r: mode(rs[i]), g: mode(gs[i]), b: mode(bs[i]) }
  }
}

const MODE_BIN = 16

function mode(values: number[]): number {
  const bins = Math.ceil(256 / MODE_BIN)
  const counts = new Uint32Array(bins)
  for (const v of values) counts[Math.min(bins - 1, Math.floor(v / MODE_BIN))]++
  let best = 0
  for (let i = 1; i < bins; i++) if (counts[i] > counts[best]) best = i
  return best * MODE_BIN + MODE_BIN / 2
}

function nearestPaletteIndex(L: number, a: number, b: number, paletteLab: [number, number, number][]): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < paletteLab.length; i++) {
    const dL = L - paletteLab[i][0], da = a - paletteLab[i][1], db = b - paletteLab[i][2]
    const dist = dL * dL + da * da + db * db
    if (dist < bestDist) { bestDist = dist; best = i }
  }
  return best
}
