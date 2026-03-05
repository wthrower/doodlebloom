import type { Region } from '../types'

/** Minimum pixel count for a region to be included in the puzzle */
const MIN_REGION_SIZE = 50

export function buildRegions(
  indexMap: Uint8Array,
  width: number,
  height: number
): { regions: Region[]; regionMap: Int32Array } {
  const pixels = width * height
  /** -1 = unvisited, >=0 = region id */
  const regionMap = new Int32Array(pixels).fill(-1)
  const regions: Region[] = []
  let nextId = 0

  for (let start = 0; start < pixels; start++) {
    if (regionMap[start] !== -1) continue

    const colorIndex = indexMap[start]
    const regionId = nextId++
    const queue: number[] = [start]
    regionMap[start] = regionId

    let sumX = 0
    let sumY = 0
    let count = 0

    while (queue.length > 0) {
      const idx = queue.pop()!
      const x = idx % width
      const y = Math.floor(idx / width)
      sumX += x
      sumY += y
      count++

      // 4-connected neighbors
      const neighbors = [
        idx - width, // up
        idx + width, // down
        x > 0 ? idx - 1 : -1, // left
        x < width - 1 ? idx + 1 : -1, // right
      ]
      for (const n of neighbors) {
        if (n >= 0 && n < pixels && regionMap[n] === -1 && indexMap[n] === colorIndex) {
          regionMap[n] = regionId
          queue.push(n)
        }
      }
    }

    if (count >= MIN_REGION_SIZE) {
      regions.push({
        id: regionId,
        colorIndex,
        centroid: { x: Math.round(sumX / count), y: Math.round(sumY / count) },
        pixelCount: count,
      })
    }
  }

  return { regions, regionMap }
}

/** Given canvas coordinates, return the region id at that point (or -1) */
export function getRegionAt(
  x: number,
  y: number,
  regionMap: Int32Array,
  width: number,
  height: number
): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return -1
  return regionMap[Math.floor(y) * width + Math.floor(x)]
}
