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

  // Build pixel array for quantize (ignores fully transparent pixels)
  const pixelArray: [number, number, number][] = []
  for (let i = 0; i < pixels; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const a = data[i * 4 + 3]
    if (a > 128) pixelArray.push([r, g, b])
  }

  const colorMap = quantize(pixelArray, colorCount)
  const rawPalette = colorMap ? colorMap.palette() : [[0, 0, 0]] as [number, number, number][]

  const palette: PaletteColor[] = rawPalette.map(([r, g, b]) => ({ r, g, b }))

  // Map each pixel to nearest palette index
  const indexMap = new Uint8Array(pixels)
  for (let i = 0; i < pixels; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    indexMap[i] = nearestPaletteIndex(r, g, b, palette)
  }

  return { palette, indexMap }
}

function nearestPaletteIndex(
  r: number,
  g: number,
  b: number,
  palette: PaletteColor[]
): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < palette.length; i++) {
    const dr = r - palette[i].r
    const dg = g - palette[i].g
    const db = b - palette[i].b
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}
