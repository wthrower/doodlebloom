import { describe, it, expect } from 'vitest'
import { isOffIdentity } from './usePanZoom'

describe('isOffIdentity', () => {
  it('is false at identity and within the dead zone', () => {
    expect(isOffIdentity({ scale: 1, tx: 0, ty: 0 })).toBe(false)
    expect(isOffIdentity({ scale: 1.04, tx: 0.5, ty: -0.9 })).toBe(false)
  })

  it('is true once scale or pan leaves the dead zone', () => {
    expect(isOffIdentity({ scale: 1.06, tx: 0, ty: 0 })).toBe(true)
    expect(isOffIdentity({ scale: 0.9, tx: 0, ty: 0 })).toBe(true)
    expect(isOffIdentity({ scale: 1, tx: 1.5, ty: 0 })).toBe(true)
    expect(isOffIdentity({ scale: 1, tx: 0, ty: -2 })).toBe(true)
  })
})
