import { describe, it, expect } from 'vitest'
import { SETTINGS_CATEGORY, SETTINGS_CATEGORIES, isSettingsCategory } from '../../src/renderer/src/lib/settings-categories'

describe('isSettingsCategory', () => {
  it('accepts every known category id', () => {
    for (const id of Object.values(SETTINGS_CATEGORY)) {
      expect(isSettingsCategory(id)).toBe(true)
    }
  })

  it('rejects an unknown string', () => {
    expect(isSettingsCategory('not-a-category')).toBe(false)
  })

  it('rejects non-string values (e.g. an AI tool arg of the wrong type)', () => {
    expect(isSettingsCategory(undefined)).toBe(false)
    expect(isSettingsCategory(null)).toBe(false)
    expect(isSettingsCategory(42)).toBe(false)
    expect(isSettingsCategory({})).toBe(false)
  })

  it('is case-sensitive — a differently-cased id is not recognised', () => {
    expect(isSettingsCategory('AI')).toBe(false)
  })
})

describe('SETTINGS_CATEGORIES', () => {
  it('every entry has a matching id from the SETTINGS_CATEGORY catalogue', () => {
    const ids = new Set(Object.values(SETTINGS_CATEGORY))
    for (const cat of SETTINGS_CATEGORIES) {
      expect(ids.has(cat.id)).toBe(true)
    }
  })

  it('has no duplicate ids', () => {
    const ids = SETTINGS_CATEGORIES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry has a non-empty label', () => {
    for (const cat of SETTINGS_CATEGORIES) {
      expect(cat.label.trim().length).toBeGreaterThan(0)
    }
  })
})
