import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadJSON, saveJSON } from './localStore'

const store = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)) },
  removeItem: (key: string) => { store.delete(key) },
  clear: () => { store.clear() },
})

beforeEach(() => store.clear())

describe('loadJSON', () => {
  it('returns the fallback when the key is missing', () => {
    expect(loadJSON('missing', 'fb')).toBe('fb')
    expect(loadJSON<string[] | null>('missing', null)).toBeNull()
  })

  it('returns the fallback when the stored value is corrupt', () => {
    store.set('bad', '{not json')
    expect(loadJSON('bad', 42)).toBe(42)
  })

  it('round-trips values written by saveJSON', () => {
    saveJSON('obj', { a: 1, b: [true, 'x'] })
    expect(loadJSON('obj', null)).toEqual({ a: 1, b: [true, 'x'] })
  })

  it('preserves falsy stored values instead of using the fallback', () => {
    saveJSON('zero', 0)
    saveJSON('false', false)
    saveJSON('null', null)
    expect(loadJSON('zero', 99)).toBe(0)
    expect(loadJSON('false', true)).toBe(false)
    expect(loadJSON<number | null>('null', 7)).toBeNull()
  })
})

describe('saveJSON', () => {
  it('swallows write failures (quota exceeded / private mode)', () => {
    const throwing = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => saveJSON('key', { big: 'value' })).not.toThrow()
    throwing.mockRestore()
  })
})
