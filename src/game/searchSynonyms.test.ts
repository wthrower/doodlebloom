import { describe, it, expect } from 'vitest'
import { SEARCH_CATEGORIES, makeSearchMatcher, categoriesForTerm, suggestCategories, categoryLabel, countInCategory } from './searchSynonyms'
import { prettyImageLabel } from './stockImages'

// Same enumeration StartScreen uses: the thumbnail is the registration.
const IDS = Object.keys(import.meta.glob('/public/images/thumbs/*.webp'))
  .map(p => p.replace('/public/images/thumbs/', '').replace('.webp', ''))
const ID_SET = new Set(IDS)

function search(query: string): string[] {
  const m = makeSearchMatcher(query)
  return IDS.filter(id => m(prettyImageLabel(id), id))
}

describe('search synonyms', () => {
  it('every file listed in a category still has a thumbnail', () => {
    const missing: string[] = []
    for (const [key, cat] of Object.entries(SEARCH_CATEGORIES)) {
      for (const f of cat.files ?? []) if (!ID_SET.has(f)) missing.push(`${key}: ${f}`)
    }
    expect(missing).toEqual([])
  })

  it('every include points at a real category', () => {
    for (const cat of Object.values(SEARCH_CATEGORIES)) {
      for (const k of cat.include ?? []) expect(SEARCH_CATEGORIES[k], k).toBeDefined()
    }
  })

  it('every category finds at least one image', () => {
    const empty = Object.keys(SEARCH_CATEGORIES).filter(k => search(SEARCH_CATEGORIES[k].names[0]).length === 0)
    expect(empty).toEqual([])
  })

  it('plain substring search still works', () => {
    expect(search('red fox')).toContain('red_fox')
    expect(search('')).toHaveLength(IDS.length)
  })

  it('finds works by name the filename does not contain', () => {
    const s = search('shakespeare')
    expect(s).toEqual(expect.arrayContaining(['hamlet_yorick_graveyard', 'puck_oberon_forest', 'malvolio_yellow_stockings_chibi', 'cleopatra_barge']))
    expect(s).not.toContain('cleopatra_carpet_caesar_48bc')
    expect(search('dinosaur')).toEqual(expect.arrayContaining(['trex_family_cretaceous', 'velociraptor_feathered_pack']))
  })

  it('maps year tokens to eras', () => {
    const v = search('victorian')
    expect(v).toEqual(expect.arrayContaining(['lowell_mill_girl_1840s', 'harvey_girl_1890s', 'ada_lovelace_analytical_engine']))
    expect(v).not.toContain('flapper_1925')
    expect(search('ancient')).toContain('caesar_crossing_rubicon_49bc')
  })

  it('knows styles that are not in the filename', () => {
    expect(search('art deco')).toContain('orient_express_1930s')
    expect(search('stained glass')).toContain('quasimodo_bell_tower')
  })

  it('ANDs multi-word queries', () => {
    const s = search('victorian dress')
    expect(s).toContain('victorian_lady_bustle_1870s')
    expect(s).not.toContain('steam_locomotive_art_deco')
  })

  it('needs three letters before a prefix selects a category', () => {
    expect(categoriesForTerm('da')).toEqual([])
    expect(categoriesForTerm('shak')).toContain('shakespeare')
  })
})

describe('people vs events', () => {
  it('"woman" and "people" do not match events', () => {
    for (const q of ['woman', 'people']) expect(search(q)).not.toContain('apollo_11_moon_landing_1969')
    expect(search('woman')).toContain('homestead_woman_sod_house_1880s')
    expect(search('people')).toContain('harriet_tubman_underground_railroad')
  })
})

describe('women and men', () => {
  it('finds named figures, not just labels containing the word', () => {
    const w = search('woman')
    expect(w).toEqual(expect.arrayContaining(['harriet_tubman_underground_railroad', 'joan_of_arc_orleans', 'ophelia_flowers_brook', 'harvey_girl_1890s']))
    expect(w).not.toContain('lincoln_gettysburg_address')
    const m = search('man')
    expect(m).toEqual(expect.arrayContaining(['lincoln_gettysburg_address', 'hamlet_yorick_graveyard', 'darwin_galapagos']))
    expect(m).not.toContain('joan_of_arc_orleans')
  })
})

describe('autocomplete', () => {
  it('suggests categories by label and name prefix', () => {
    const labels = suggestCategories('vic').map(categoryLabel)
    expect(labels).toContain('Victorian')
    expect(suggestCategories('v')).toEqual([])
  })

  it('a pill label, typed back as the query, finds its category', () => {
    for (const key of Object.keys(SEARCH_CATEGORIES)) {
      const label = categoryLabel(key)
      const hits = search(label)
      const inCat = IDS.filter(id => countInCategory(key, [id]) === 1)
      expect(inCat.every(id => hits.includes(id)), label).toBe(true)
    }
  })

  it('drops the pill once the query equals its label', () => {
    expect(suggestCategories('Victorian')).not.toContain('victorian')
  })
})

describe('gowns', () => {
  it('"gown" finds women\'s clothes, not men\'s', () => {
    const g = search('gown')
    expect(g).toContain('rococo_robe_a_la_francaise_1760s')
    expect(g).not.toContain('elizabethan_gentleman_1590s')
    expect(search('dress')).not.toContain('elizabethan_gentleman_1590s')
    expect(search('clothes')).toContain('elizabethan_gentleman_1590s')
  })
})

describe('dresses', () => {
  it('"dresses" is the garment, like "gown"', () => {
    expect(search('dresses')).not.toContain('elizabethan_gentleman_1590s')
    expect(search('dresses')).toContain('flapper_1925')
  })
})
