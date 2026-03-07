import type { PaletteColor, Region } from '../types'
import type { Int32ArrayLike } from './types-internal'

export interface RenderOptions {
  playerColors: Record<number, number>
  activeColorIndex: number | null
  revealMode: 'flat' | 'photo'
  originalImageData: ImageData | null
  colorDisplayNumbers: Record<number, number>
  showOutline?: boolean
}

/**
 * Draw the puzzle onto ctx.
 * - Unfilled regions: light gray fill + dark outline
 * - Filled regions: palette color (flat) or original pixels (photo)
 * - Numbers at centroids for unfilled regions
 */
export function renderPuzzle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  indexMap: Uint8Array,
  regionMap: Int32ArrayLike,
  regions: Region[],
  palette: PaletteColor[],
  opts: RenderOptions
): void {
  const { playerColors, revealMode, originalImageData, colorDisplayNumbers, showOutline = true } = opts

  // Build pixel buffer
  const imageData = ctx.createImageData(width, height)
  const buf = imageData.data

  const regionById = new Map(regions.map(r => [r.id, r]))

  for (let i = 0; i < width * height; i++) {
    const regionId = regionMap[i]
    const region = regionId >= 0 ? regionById.get(regionId) : undefined

    if (!region) {
      // Unmerged tiny fragment too small to promote -- paint gray as settled background.
      buf[i * 4] = 160
      buf[i * 4 + 1] = 160
      buf[i * 4 + 2] = 160
      buf[i * 4 + 3] = 255
      continue
    }

    const filledColorIdx = playerColors[region.id]
    if (filledColorIdx !== undefined) {
      if (revealMode === 'photo' && originalImageData) {
        buf[i * 4] = originalImageData.data[i * 4]
        buf[i * 4 + 1] = originalImageData.data[i * 4 + 1]
        buf[i * 4 + 2] = originalImageData.data[i * 4 + 2]
        buf[i * 4 + 3] = 255
      } else {
        const c = palette[filledColorIdx]
        buf[i * 4] = c.r
        buf[i * 4 + 1] = c.g
        buf[i * 4 + 2] = c.b
        buf[i * 4 + 3] = 255
      }
    } else {
      // Unfilled: white
      buf[i * 4] = 255
      buf[i * 4 + 1] = 255
      buf[i * 4 + 2] = 255
      buf[i * 4 + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)

  // Draw region outlines: scan for pixel boundaries and darken edge pixels
  if (showOutline) drawOutlines(ctx, width, height, regionMap, regions, playerColors)

  // Draw numbers at centroids for unfilled regions
  drawNumbers(ctx, regions, playerColors, colorDisplayNumbers)
}

function drawOutlines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  regionMap: Int32ArrayLike,
  regions: Region[],
  _playerColors: Record<number, number>
): void {
  const keptIds = new Set(regions.map(r => r.id))

  // Draw single-pixel outlines by marking only the left/top pixel of each boundary.
  // - For A|B boundaries: the pixel whose right or bottom neighbor differs gets marked.
  //   The neighbor is NOT marked (it would mark from its left/top check, which we skip).
  // - For region|background boundaries facing left or top: explicitly mark that pixel.
  // This ensures each shared edge produces exactly 1 dark pixel instead of 2.
  ctx.fillStyle = 'rgba(0,0,0,0.75)'
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = regionMap[y * width + x]
      if (!keptIds.has(id)) continue

      const right = x < width - 1 ? regionMap[y * width + x + 1] : -2
      const down  = y < height - 1 ? regionMap[(y + 1) * width + x] : -2
      const left  = x > 0 ? regionMap[y * width + x - 1] : -2
      const top   = y > 0 ? regionMap[(y - 1) * width + x] : -2

      const isEdge =
        right !== id ||
        down  !== id ||
        (left !== id && !keptIds.has(left)) ||
        (top  !== id && !keptIds.has(top))

      if (isEdge) ctx.fillRect(x, y, 1, 1)
    }
  }
}

function drawNumbers(
  ctx: CanvasRenderingContext2D,
  regions: Region[],
  playerColors: Record<number, number>,
  colorDisplayNumbers: Record<number, number>
): void {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const region of regions) {
    if (playerColors[region.id] !== undefined) continue
    const { x, y } = region.centroid
    const label = String(colorDisplayNumbers[region.colorIndex] ?? region.colorIndex + 1)

    const fontSize = Math.max(9, Math.min(region.labelRadius - 1, 16))
    ctx.font = `${fontSize}px sans-serif`
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillText(label, x, y + 0.5)
  }
}

/** Draw a subtle "shake" flash on a region to indicate wrong color */
export function flashRegion(
  ctx: CanvasRenderingContext2D,
  regionId: number,
  regionMap: Int32ArrayLike,
  width: number,
  height: number
): void {
  const pixels: number[] = []
  for (let i = 0; i < width * height; i++) {
    if (regionMap[i] === regionId) pixels.push(i)
  }
  const imageData = ctx.getImageData(0, 0, width, height)
  const orig = new Uint8ClampedArray(imageData.data)

  let frame = 0
  const animate = () => {
    frame++
    const alpha = Math.sin((frame / 8) * Math.PI) * 0.5
    if (frame <= 8) {
      for (const i of pixels) {
        imageData.data[i * 4] = Math.min(255, orig[i * 4] + Math.round(alpha * 150))
        imageData.data[i * 4 + 1] = orig[i * 4 + 1]
        imageData.data[i * 4 + 2] = orig[i * 4 + 2]
        imageData.data[i * 4 + 3] = 255
      }
      ctx.putImageData(imageData, 0, 0)
      requestAnimationFrame(animate)
    } else {
      // Restore
      for (const i of pixels) {
        imageData.data[i * 4] = orig[i * 4]
        imageData.data[i * 4 + 1] = orig[i * 4 + 1]
        imageData.data[i * 4 + 2] = orig[i * 4 + 2]
        imageData.data[i * 4 + 3] = orig[i * 4 + 3]
      }
      ctx.putImageData(imageData, 0, 0)
    }
  }
  requestAnimationFrame(animate)
}
