import { describe, it, expect } from 'vitest'
import { colorDist, paletteDist } from './colorDistance'
import type { PaletteColor } from '../types'

const palette: PaletteColor[] = [
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 250, g: 5, b: 5 },
]

describe('paletteDist', () => {
  it('is zero for the same index', () => {
    expect(paletteDist(palette, 1, 1)).toBe(0)
  })

  it('matches colorDist of the two palette entries', () => {
    expect(paletteDist(palette, 0, 1)).toBe(colorDist(255, 0, 0, 0, 0, 255))
  })

  it('is symmetric', () => {
    expect(paletteDist(palette, 0, 2)).toBe(paletteDist(palette, 2, 0))
  })

  it('ranks perceptually close colors below distant ones', () => {
    expect(paletteDist(palette, 0, 2)).toBeLessThan(paletteDist(palette, 0, 1))
  })

  it('falls back to a small nonzero distance for an empty palette', () => {
    expect(paletteDist([], 0, 1)).toBe(1)
    expect(paletteDist([], 3, 3)).toBe(0)
  })
})
