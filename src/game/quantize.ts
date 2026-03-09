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
): { blurred: Uint8ClampedArray; palette: PaletteColor[] } {
  const { data } = imageData
  const pixels = imageData.width * imageData.height
  const allPixels = buildPixelArray(data, pixels)
  const palette = mmcqPalette(allPixels, colorCount * 2)
  return { blurred: data, palette }
}

/** Stage 2 of 2: assign each pixel to its nearest palette color, then refine palette. */
export function assignColors(
  blurred: Uint8ClampedArray,
  palette: PaletteColor[],
  imageData: ImageData
): Uint8Array {
  const pixels = imageData.width * imageData.height
  const indexMap = assignPixels(blurred, pixels, palette)
  refinePalette(palette, indexMap, imageData)
  return indexMap
}

export function quantizeImage(
  imageData: ImageData,
  colorCount: number
): QuantizeResult {
  const { blurred, palette } = analyzeColors(imageData, colorCount)
  const indexMap = assignColors(blurred, palette, imageData)
  return { palette, indexMap }
}

/** Separable 5-tap Gaussian blur followed by selective restore:
 *  pixels that shifted more than THRESHOLD are returned to their original value.
 *  Smooths gradient noise while keeping hard color edges intact. */
const BLUR_THRESHOLD2 = 8100  // 90² squared-RGB units -- tune if needed

function edgeAwareBlur(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const K = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16]
  const temp = new Uint8ClampedArray(data.length)
  const out  = new Uint8ClampedArray(data.length)

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0
      for (let k = -2; k <= 2; k++) {
        const nx = Math.max(0, Math.min(width - 1, x + k))
        const i = (y * width + nx) * 4
        const w = K[k + 2]
        r += data[i] * w; g += data[i + 1] * w; b += data[i + 2] * w
      }
      const j = (y * width + x) * 4
      temp[j] = r; temp[j + 1] = g; temp[j + 2] = b; temp[j + 3] = data[j + 3]
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0
      for (let k = -2; k <= 2; k++) {
        const ny = Math.max(0, Math.min(height - 1, y + k))
        const i = (ny * width + x) * 4
        const w = K[k + 2]
        r += temp[i] * w; g += temp[i + 1] * w; b += temp[i + 2] * w
      }
      const j = (y * width + x) * 4
      out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = data[j + 3]
    }
  }

  // Selective restore: put back pixels that moved too far from the original
  for (let i = 0; i < data.length; i += 4) {
    const dr = out[i] - data[i], dg = out[i + 1] - data[i + 1], db = out[i + 2] - data[i + 2]
    if (dr * dr + dg * dg + db * db > BLUR_THRESHOLD2) {
      out[i] = data[i]; out[i + 1] = data[i + 1]; out[i + 2] = data[i + 2]
    }
  }

  return out
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
