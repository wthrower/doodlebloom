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

  // Pass 1: Initial quantization to identify large vs small regions
  const palette1 = mmcqPalette(allPixels, colorCount)
  const indexMap1 = assignPixels(data, pixels, palette1)
  const smoothed1 = modeFilter(indexMap1, width, height, 2)
  const regionSizes = computeRegionSizes(smoothed1, width, height)

  // Pass 2: Re-quantize using only pixels from large regions.
  // This ensures palette slots go to dominant color zones, not tiny gradient fragments.
  const minRegionPixels = Math.max(200, pixels * 0.003)
  const largePixels: [number, number, number][] = []
  for (let i = 0; i < pixels; i++) {
    if (regionSizes[i] >= minRegionPixels && data[i * 4 + 3] > 128) {
      largePixels.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]])
    }
  }

  const palette = mmcqPalette(largePixels.length >= colorCount ? largePixels : allPixels, colorCount)
  const indexMap2 = assignPixels(data, pixels, palette)
  const smoothed2 = modeFilter(indexMap2, width, height, 2)

  // Refine palette: replace MMCQ centroids with actual median of assigned pixels
  refinePalette(palette, smoothed2, imageData)

  return { palette, indexMap: smoothed2 }
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

/** Replace each pixel's palette index with the most common in its 3×3 neighborhood.
 *  Multiple passes eliminate isolated pixels and thin fragments while preserving
 *  color boundaries (unlike blurring, which averages across them). */
function modeFilter(indexMap: Uint8Array, width: number, height: number, passes: number): Uint8Array {
  const buf = new Uint8Array(indexMap)
  const out = new Uint8Array(indexMap.length)
  const counts = new Map<number, number>()

  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        counts.clear()
        let best = buf[y * width + x], bestCount = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const v = buf[ny * width + nx]
              const c = (counts.get(v) ?? 0) + 1
              counts.set(v, c)
              if (c > bestCount) { bestCount = c; best = v }
            }
          }
        }
        out[y * width + x] = best
      }
    }
    buf.set(out)
  }

  return buf
}

/** BFS connected components → returns per-pixel region size. */
function computeRegionSizes(indexMap: Uint8Array, width: number, height: number): Uint32Array {
  const pixels = width * height
  const regionMap = new Int32Array(pixels).fill(-1)
  const sizes: number[] = []
  let nextId = 0

  for (let start = 0; start < pixels; start++) {
    if (regionMap[start] !== -1) continue
    const color = indexMap[start]
    const rid = nextId++
    const queue = [start]
    regionMap[start] = rid
    let count = 0
    while (queue.length > 0) {
      const idx = queue.pop()!
      const x = idx % width, y = Math.floor(idx / width)
      count++
      const ns = [idx - width, idx + width, x > 0 ? idx - 1 : -1, x < width - 1 ? idx + 1 : -1]
      for (const n of ns) {
        if (n >= 0 && n < pixels && regionMap[n] === -1 && indexMap[n] === color) {
          regionMap[n] = rid
          queue.push(n)
        }
      }
    }
    sizes.push(count)
  }

  const result = new Uint32Array(pixels)
  for (let i = 0; i < pixels; i++) result[i] = sizes[regionMap[i]]
  return result
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
