import { describe, it, expect } from 'vitest'
import { createDSU, fuseSameColorRegions } from './regions'
import type { Region } from '../types'

describe('createDSU', () => {
  it('treats unknown ids as their own root', () => {
    const { find } = createDSU()
    expect(find(7)).toBe(7)
  })

  it('resolves chains to the canonical root', () => {
    const { find, union } = createDSU()
    union(2, 1)
    union(3, 2)
    union(1, 0)
    expect(find(3)).toBe(0)
    expect(find(2)).toBe(0)
    expect(find(1)).toBe(0)
    expect(find(0)).toBe(0)
  })

  it('keeps disjoint sets separate', () => {
    const { find, union } = createDSU()
    union(1, 0)
    union(3, 2)
    expect(find(1)).toBe(0)
    expect(find(3)).toBe(2)
    expect(find(0)).not.toBe(find(2))
  })
})

function makeRegion(id: number, colorIndex: number, pixelCount: number, labelRadius = 1): Region {
  return {
    id,
    colorIndex,
    centroid: { x: id, y: 0 },
    pixelCount,
    labelRadius,
    labels: [],
  }
}

describe('fuseSameColorRegions', () => {
  it('merges adjacent regions of the same color and rewrites the map', () => {
    // 4x2: region 0 on the left half, region 1 on the right, same color.
    const regionMap = new Int32Array([0, 0, 1, 1, 0, 0, 1, 1])
    const regions = [makeRegion(0, 0, 4, 2), makeRegion(1, 0, 4, 1)]

    const fused = fuseSameColorRegions(regions, regionMap, 4)

    expect(fused).toHaveLength(1)
    expect(fused[0].pixelCount).toBe(8)
    // Larger labelRadius (and its centroid) survives the merge.
    expect(fused[0].labelRadius).toBe(2)
    expect(new Set(regionMap)).toEqual(new Set([fused[0].id]))
  })

  it('leaves adjacent regions of different colors alone', () => {
    const regionMap = new Int32Array([0, 0, 1, 1, 0, 0, 1, 1])
    const regions = [makeRegion(0, 0, 4), makeRegion(1, 1, 4)]

    const fused = fuseSameColorRegions(regions, regionMap, 4)

    expect(fused).toHaveLength(2)
    expect(new Set(regionMap)).toEqual(new Set([0, 1]))
  })
})
