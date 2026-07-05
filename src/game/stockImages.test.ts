import { describe, it, expect } from 'vitest'
import { stockIdFromUrl, prettyImageLabel, prettyStockLabel } from './stockImages'

describe('stock image conventions', () => {
  it('extracts the file id from a stock URL', () => {
    expect(stockIdFromUrl('/games/doodlebloom/images/autumn_forest_cel.png')).toBe('autumn_forest_cel')
  })

  it('returns null for non-stock URLs and null input', () => {
    expect(stockIdFromUrl('blob:http://localhost/abc-123')).toBeNull()
    expect(stockIdFromUrl(null)).toBeNull()
  })

  it('prettifies file ids into title-case labels', () => {
    expect(prettyImageLabel('autumn_forest_cel')).toBe('Autumn Forest Cel')
    expect(prettyImageLabel('fox')).toBe('Fox')
  })

  it('prettyStockLabel composes both', () => {
    expect(prettyStockLabel('/games/doodlebloom/images/koi_pond.png')).toBe('Koi Pond')
    expect(prettyStockLabel(null)).toBeNull()
  })
})
