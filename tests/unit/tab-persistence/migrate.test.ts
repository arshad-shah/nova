import { describe, it, expect, beforeEach } from 'vitest'
import { readAndClearLegacyTabs } from '../../../src/renderer/src/lib/tab-persistence/migrate'

const LEGACY_KEY = 'verql:open-tabs'

describe('readAndClearLegacyTabs', () => {
  beforeEach(() => localStorage.clear())

  it('returns null when there is no legacy payload', () => {
    expect(readAndClearLegacyTabs()).toBeNull()
  })

  it('converts legacy snapshots, assigning ids and resolving the active id', () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        tabs: [
          { title: 'A', sql: 'SELECT 1', connectionId: 'c1', database: 'db', schema: 's', autoCommit: true },
          { title: 'B', sql: 'SELECT 2', connectionId: null, database: null, schema: null, autoCommit: false, savedQueryId: 'sq1' },
        ],
        activeIndex: 1,
      }),
    )
    const snap = readAndClearLegacyTabs()
    expect(snap).not.toBeNull()
    expect(snap!.tabs).toHaveLength(2)
    expect(snap!.tabs[0]).toMatchObject({ title: 'A', sql: 'SELECT 1', connectionId: 'c1', autoCommit: true })
    expect(snap!.tabs[1]).toMatchObject({ savedQueryId: 'sq1', autoCommit: false })
    expect(snap!.tabs.every((t) => typeof t.id === 'string' && t.id.length > 0)).toBe(true)
    // activeIndex 1 → the second migrated tab's id.
    expect(snap!.activeId).toBe(snap!.tabs[1].id)
  })

  it('clears the legacy key so migration runs at most once', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ tabs: [{ title: 'A', sql: '', connectionId: null, database: null, schema: null, autoCommit: true }], activeIndex: null }))
    expect(readAndClearLegacyTabs()).not.toBeNull()
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    expect(readAndClearLegacyTabs()).toBeNull()
  })

  it('drops (and clears) a corrupt payload without throwing', () => {
    localStorage.setItem(LEGACY_KEY, '{not valid json')
    expect(readAndClearLegacyTabs()).toBeNull()
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('returns null for an empty tab list', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ tabs: [], activeIndex: null }))
    expect(readAndClearLegacyTabs()).toBeNull()
  })

  it('returns null instead of throwing when localStorage.getItem itself throws', () => {
    const original = localStorage.getItem.bind(localStorage)
    localStorage.getItem = () => { throw new Error('access denied') }
    try {
      expect(readAndClearLegacyTabs()).toBeNull()
    } finally {
      localStorage.getItem = original
    }
  })
})
