import { describe, it, expect } from 'vitest'
import { createDSU, fuseSameColorRegions, neighbors4, rebuildRegions } from './regions'
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

describe('neighbors4', () => {
  // 3x3 grid, indexes 0..8
  const W = 3, PX = 9

  it('returns left, right, up, down for an interior pixel', () => {
    expect(neighbors4(4, W, PX)).toEqual([3, 5, 1, 7])
  })

  it('marks off-image neighbors with -1 at corners', () => {
    expect(neighbors4(0, W, PX)).toEqual([-1, 1, -1, 3])
    expect(neighbors4(8, W, PX)).toEqual([7, -1, 5, -1])
  })

  it('marks off-image neighbors with -1 on edges', () => {
    expect(neighbors4(3, W, PX)).toEqual([-1, 4, 0, 6])
    expect(neighbors4(5, W, PX)).toEqual([4, -1, 2, 8])
  })
})

describe('rebuildRegions', () => {
  it('folds absorbed regions into their canonical survivor', () => {
    const { find, union } = createDSU()
    union(1, 0)
    union(2, 0)
    const regions = [
      makeRegion(0, 0, 10, 3),
      makeRegion(1, 0, 5, 8),
      makeRegion(2, 1, 2, 1),
      makeRegion(3, 2, 7, 4),
    ]

    const rebuilt = rebuildRegions(regions, find)

    expect(rebuilt).toHaveLength(2)
    const canon = rebuilt.find(r => r.id === 0)!
    expect(canon.pixelCount).toBe(17)
    // Largest labelRadius among the merged partners wins, with its centroid.
    expect(canon.labelRadius).toBe(8)
    expect(canon.centroid).toEqual({ x: 1, y: 0 })
    expect(rebuilt.find(r => r.id === 3)).toMatchObject({ pixelCount: 7 })
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
