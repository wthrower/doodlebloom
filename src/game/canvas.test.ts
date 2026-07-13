import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPuzzleRenderer } from './canvas'
import type { PaletteColor, Region } from '../types'

// Node has no ImageData/canvas; a minimal stand-in is enough for the renderer.
class FakeImageData {
  data: Uint8ClampedArray
  constructor(public width: number, public height: number, data?: Uint8ClampedArray) {
    this.data = data ?? new Uint8ClampedArray(width * height * 4)
  }
}

function makeCtx() {
  const puts: unknown[][] = []
  const ctx = {
    createImageData: (w: number, h: number) => new FakeImageData(w, h),
    putImageData: (...args: unknown[]) => { puts.push(args) },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, puts }
}

function makeRegion(id: number, colorIndex: number): Region {
  return { id, colorIndex, centroid: { x: 0, y: 0 }, pixelCount: 0, labelRadius: 1, labels: [] }
}

// 4x2 canvas: region 0 = left half (color 0), region 1 = right-top pair
// (color 1), right-bottom pair unkept (-1) → gray background.
const WIDTH = 4, HEIGHT = 2
const regionMap = new Int32Array([
  0, 0, 1, 1,
  0, 0, -1, -1,
])
const regions = [makeRegion(0, 0), makeRegion(1, 1)]
const palette: PaletteColor[] = [
  { r: 10, g: 20, b: 30 },
  { r: 200, g: 100, b: 50 },
]
const original = new FakeImageData(WIDTH, HEIGHT) as unknown as ImageData
original.data.fill(77)

const px = (buf: Uint8ClampedArray, i: number) => [buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2], buf[i * 4 + 3]]

let raf: ReturnType<typeof vi.fn>
beforeEach(() => {
  raf = vi.fn((cb: FrameRequestCallback) => { cb(0); return 0 })
  vi.stubGlobal('requestAnimationFrame', raf)
})

function bufOf(ctx: CanvasRenderingContext2D, puts: unknown[][]): Uint8ClampedArray {
  return (puts[puts.length - 1][0] as FakeImageData).data
}

describe('createPuzzleRenderer', () => {
  it('initial render paints everything: white unfilled, gray unkept', () => {
    const { ctx, puts } = makeCtx()
    const renderer = createPuzzleRenderer(ctx, WIDTH, HEIGHT, regionMap, regions, palette)
    renderer.render({ playerColors: {}, activeColorIndex: null, originalImageData: null })

    expect(puts).toHaveLength(1)
    expect(puts[0].length).toBe(3) // full-canvas put, no dirty rect
    const buf = bufOf(ctx, puts)
    expect(px(buf, 0)).toEqual([255, 255, 255, 255]) // region 0: unfilled white
    expect(px(buf, 2)).toEqual([255, 255, 255, 255]) // region 1: unfilled white
    expect(px(buf, 6)).toEqual([160, 160, 160, 255]) // unkept: gray
  })

  it('a fill repaints only that region, via its dirty rect', () => {
    const { ctx, puts } = makeCtx()
    const renderer = createPuzzleRenderer(ctx, WIDTH, HEIGHT, regionMap, regions, palette)
    renderer.render({ playerColors: {}, activeColorIndex: 0, originalImageData: null })
    puts.length = 0

    renderer.render({ playerColors: { 0: 0 }, activeColorIndex: 0, originalImageData: null })

    expect(puts).toHaveLength(1)
    // Region 0 bbox: x 0-1, y 0-1 → dirty rect (0, 0, 2, 2)
    expect(puts[0].slice(3)).toEqual([0, 0, 2, 2])
    const buf = bufOf(ctx, puts)
    expect(px(buf, 0)).toEqual([10, 20, 30, 255])   // flat palette fill
    expect(px(buf, 2)).toEqual([255, 255, 255, 255]) // region 1 untouched
  })

  it('completing a color reveals original pixels for the whole group', () => {
    const { ctx, puts } = makeCtx()
    const renderer = createPuzzleRenderer(ctx, WIDTH, HEIGHT, regionMap, regions, palette)
    renderer.render({ playerColors: {}, activeColorIndex: null, originalImageData: original })

    renderer.render({ playerColors: { 0: 0 }, activeColorIndex: null, originalImageData: original })
    const buf = bufOf(ctx, puts)
    expect(px(buf, 0)).toEqual([77, 77, 77, 255]) // color 0 complete → original
  })

  it('renders are no-ops when nothing visible changed', () => {
    const { ctx, puts } = makeCtx()
    const renderer = createPuzzleRenderer(ctx, WIDTH, HEIGHT, regionMap, regions, palette)
    const opts = { playerColors: {}, activeColorIndex: 0, originalImageData: null }
    renderer.render(opts)
    puts.length = 0

    // active color changes with hint off → no pixels change
    renderer.render({ ...opts, activeColorIndex: 1 })
    expect(puts).toHaveLength(0)
  })

  it('hint toggle stripes unfilled active-color regions and restores them', () => {
    const { ctx, puts } = makeCtx()
    const renderer = createPuzzleRenderer(ctx, WIDTH, HEIGHT, regionMap, regions, palette)
    renderer.render({ playerColors: {}, activeColorIndex: 0, originalImageData: null })
    puts.length = 0

    renderer.render({ playerColors: {}, activeColorIndex: 0, originalImageData: null, showHint: true })
    expect(puts).toHaveLength(1)
    let buf = bufOf(ctx, puts)
    expect(px(buf, 0)).toEqual([210, 185, 240, 255]) // stripe at (0,0): (0+0)>>2 & 1 = 0
    expect(px(buf, 2)).toEqual([255, 255, 255, 255]) // other color untouched

    renderer.render({ playerColors: {}, activeColorIndex: 0, originalImageData: null, showHint: false })
    buf = bufOf(ctx, puts)
    expect(px(buf, 0)).toEqual([255, 255, 255, 255]) // back to white
  })

  it('fading a completed color blends flat → midpoint → original, repainting per frame', () => {
    const { ctx, puts } = makeCtx()
    const renderer = createPuzzleRenderer(ctx, WIDTH, HEIGHT, regionMap, regions, palette)
    const fades = new Map<number, number>()
    const opts = { playerColors: { 0: 0 }, activeColorIndex: null, originalImageData: original, fadingColors: fades }

    // Fill completes color 0; fade starts at t=0 → still the flat palette color.
    fades.set(0, 0)
    renderer.render(opts)
    let buf = bufOf(ctx, puts)
    expect(px(buf, 0)).toEqual([10, 20, 30, 255])

    // t=0.3 → the color/white midpoint. The map is mutated in place, so this
    // also proves the differ tracks fade values, not object identity.
    puts.length = 0
    fades.set(0, 0.3)
    renderer.render(opts)
    expect(puts).toHaveLength(1)
    expect(puts[0].slice(3)).toEqual([0, 0, 2, 2]) // color 0 group bbox only
    buf = bufOf(ctx, puts)
    expect(px(buf, 0)).toEqual([133, 138, 143, 255])

    // t=1 → fully revealed original; clearing the map afterward is a no-op visually.
    fades.set(0, 1)
    renderer.render(opts)
    buf = bufOf(ctx, puts)
    expect(px(buf, 0)).toEqual([77, 77, 77, 255])

    puts.length = 0
    fades.clear()
    renderer.render(opts)
    buf = bufOf(ctx, puts)
    expect(px(buf, 0)).toEqual([77, 77, 77, 255])
  })

  it('flashRegion pulses the red channel inside the bbox and restores it', () => {
    const { ctx, puts } = makeCtx()
    const renderer = createPuzzleRenderer(ctx, WIDTH, HEIGHT, regionMap, regions, palette)
    renderer.render({ playerColors: {}, activeColorIndex: null, originalImageData: null })
    puts.length = 0

    renderer.flashRegion(1)

    // 8 animation frames + 1 restore, all dirty-rect puts on region 1's bbox (2,0)-(3,0)
    expect(puts).toHaveLength(9)
    for (const call of puts) expect(call.slice(3)).toEqual([2, 0, 2, 1])
    const buf = bufOf(ctx, puts)
    expect(px(buf, 2)).toEqual([255, 255, 255, 255]) // restored
  })
})
