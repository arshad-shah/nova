import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTabsStore } from '../../src/renderer/src/stores/tabs'
import { initTabPersistence } from '../../src/renderer/src/lib/tab-persistence'
import type { OpenTabsSnapshot, TabOp } from '../../shared/appdata'
import type { TabPersistenceStore } from '../../src/renderer/src/lib/tab-persistence'

function resetTabs() {
  useTabsStore.setState({ tabs: [], activeTabId: null, recentlyClosed: [] })
}

/** An in-memory implementation of the durable store that actually applies ops,
 *  so `list()` round-trips — the same contract AppDataStore fulfils over IPC. */
function memoryStore(seed: OpenTabsSnapshot = { tabs: [], activeId: null }): TabPersistenceStore & {
  applied: TabOp[][]
} {
  const state: OpenTabsSnapshot = { tabs: seed.tabs.map((t) => ({ ...t })), activeId: seed.activeId }
  const applied: TabOp[][] = []
  return {
    applied,
    list: async () => ({ tabs: state.tabs.map((t) => ({ ...t })), activeId: state.activeId }),
    apply: async (ops: TabOp[]) => {
      applied.push(ops)
      for (const op of ops) {
        if (op.kind === 'delete') {
          const i = state.tabs.findIndex((t) => t.id === op.id)
          if (i >= 0) state.tabs.splice(i, 1)
        } else if (op.kind === 'active') {
          state.activeId = op.id
        } else {
          const existing = state.tabs.findIndex((t) => t.id === op.tab.id)
          if (existing >= 0) state.tabs.splice(existing, 1)
          state.tabs.splice(op.position, 0, { ...op.tab })
        }
      }
    },
  }
}

describe('restoreQueryTabs', () => {
  beforeEach(resetTabs)

  it('re-creates clean, idle query tabs from snapshots', () => {
    useTabsStore.getState().restoreQueryTabs(
      [
        { title: 'A', sql: 'SELECT 1', connectionId: 'c1', database: 'db', schema: 's', autoCommit: true },
        { title: 'B', sql: 'SELECT 2', connectionId: null, database: null, schema: null, autoCommit: false, savedQueryId: 'sq1' },
      ],
      1,
    )
    const { tabs, activeTabId } = useTabsStore.getState()
    expect(tabs).toHaveLength(2)
    const [a, b] = tabs
    expect(a.type).toBe('query')
    if (a.type === 'query') {
      expect(a.sql).toBe('SELECT 1')
      expect(a.savedSnapshot).toBe('SELECT 1')
      expect(a.isDirty).toBe(false)
      expect(a.connectionId).toBe('c1')
      expect(a.txn?.autoCommit).toBe(true)
    }
    if (b.type === 'query') {
      expect(b.savedQueryId).toBe('sq1')
      expect(b.txn?.autoCommit).toBe(false)
    }
    expect(activeTabId).toBe(tabs[1].id)
  })

  it('reuses the persisted id when one is supplied', () => {
    useTabsStore.getState().restoreQueryTabs(
      [{ id: 'query-7', title: 'A', sql: 'x', connectionId: null, database: null, schema: null, autoCommit: true }],
      0,
    )
    expect(useTabsStore.getState().tabs[0].id).toBe('query-7')
  })

  it('falls back to the first tab when activeIndex is null', () => {
    useTabsStore.getState().restoreQueryTabs(
      [{ title: 'A', sql: 'x', connectionId: null, database: null, schema: null, autoCommit: true }],
      null,
    )
    const { tabs, activeTabId } = useTabsStore.getState()
    expect(activeTabId).toBe(tabs[0].id)
  })

  it('is a no-op for an empty snapshot list', () => {
    useTabsStore.getState().restoreQueryTabs([], null)
    expect(useTabsStore.getState().tabs).toHaveLength(0)
  })
})

describe('initTabPersistence (engine integration)', () => {
  beforeEach(() => {
    resetTabs()
    localStorage.clear()
  })

  it('persists query tabs incrementally and round-trips them on restore', async () => {
    const store = memoryStore()
    const stop = await initTabPersistence({ restoreOnStartup: true, store, debounceMs: 0 })

    const id = useTabsStore.getState().addQueryTab('c1', 's1')
    useTabsStore.getState().updateTabSql(id, 'SELECT 42')
    // A non-query tab must never enter the persisted set.
    useTabsStore.getState().openSettings()

    await stop() // flushes pending writes

    const persisted = await store.list()
    expect(persisted.tabs).toHaveLength(1)
    expect(persisted.tabs[0]).toMatchObject({ id, sql: 'SELECT 42', connectionId: 'c1', schema: 's1' })

    // Restore into a fresh store from the same backend.
    resetTabs()
    await initTabPersistence({ restoreOnStartup: true, store })
    const restored = useTabsStore.getState().tabs
    expect(restored).toHaveLength(1)
    expect(restored[0].id).toBe(id) // identity preserved for future incremental writes
    if (restored[0].type === 'query') expect(restored[0].sql).toBe('SELECT 42')
  })

  it('does not re-open tabs when restoreOnStartup is false, but still tracks them', async () => {
    const store = memoryStore({
      tabs: [{ id: 'query-9', title: 'A', sql: 'SELECT 1', connectionId: null, database: null, schema: null, autoCommit: true }],
      activeId: 'query-9',
    })
    const stop = await initTabPersistence({ restoreOnStartup: false, store, debounceMs: 0 })
    expect(useTabsStore.getState().tabs).toHaveLength(0) // nothing re-opened

    // New live tabs are mirrored into the durable set (replacing the old ones).
    const id = useTabsStore.getState().addQueryTab(null)
    await stop()
    const persisted = await store.list()
    expect(persisted.tabs.map((t) => t.id)).toEqual([id])
  })

  it('migrates a legacy localStorage payload on first run and clears it', async () => {
    localStorage.setItem(
      'verql:open-tabs',
      JSON.stringify({
        tabs: [{ title: 'Legacy', sql: 'SELECT legacy', connectionId: 'c1', database: null, schema: null, autoCommit: true }],
        activeIndex: 0,
      }),
    )
    const store = memoryStore()
    await initTabPersistence({ restoreOnStartup: true, store })

    // Seeded into the durable store…
    const persisted = await store.list()
    expect(persisted.tabs).toHaveLength(1)
    expect(persisted.tabs[0].sql).toBe('SELECT legacy')
    // …re-opened into the live store…
    const restored = useTabsStore.getState().tabs
    expect(restored).toHaveLength(1)
    if (restored[0].type === 'query') expect(restored[0].sql).toBe('SELECT legacy')
    // …and the legacy key is gone.
    expect(localStorage.getItem('verql:open-tabs')).toBeNull()
  })

  it('falls back to an empty snapshot when the store\'s initial list() call rejects', async () => {
    const store: TabPersistenceStore = {
      list: async () => { throw new Error('IPC down') },
      apply: async () => {},
    }
    const stop = await initTabPersistence({ restoreOnStartup: true, store, debounceMs: 0 })
    expect(useTabsStore.getState().tabs).toHaveLength(0)
    await stop()
  })

  it('reports a failed write through onError instead of throwing (best-effort durability)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store: TabPersistenceStore = {
      list: async () => ({ tabs: [], activeId: null }),
      apply: async () => { throw new Error('write failed') },
    }
    const stop = await initTabPersistence({ restoreOnStartup: true, store, debounceMs: 0 })
    useTabsStore.getState().addQueryTab('c1')
    await stop()
    expect(warn).toHaveBeenCalledWith('[tab-persistence] write failed', expect.any(Error))
    warn.mockRestore()
  })

  it('flushes any pending write on pagehide (best-effort durability on quit)', async () => {
    const store = memoryStore()
    const stop = await initTabPersistence({ restoreOnStartup: true, store, debounceMs: 50_000 })
    const id = useTabsStore.getState().addQueryTab('c1')
    // Debounce hasn't fired yet — nothing durable written so far.
    expect((await store.list()).tabs).toHaveLength(0)
    window.dispatchEvent(new Event('pagehide'))
    await new Promise((r) => setTimeout(r, 0)) // let the fire-and-forget flush() land
    const persisted = await store.list()
    expect(persisted.tabs.map((t) => t.id)).toEqual([id])
    await stop()
  })

  it('writes a single op batch for a one-tab edit among many', async () => {
    const seedTabs = ['a', 'b', 'c', 'd'].map((id) => ({
      id, title: id, sql: '', connectionId: null, database: null, schema: null, autoCommit: true,
    }))
    const store = memoryStore({ tabs: seedTabs, activeId: 'a' })
    const stop = await initTabPersistence({ restoreOnStartup: true, store, debounceMs: 0 })
    store.applied.length = 0 // ignore any startup writes

    useTabsStore.getState().updateTabSql('c', 'edited')
    await stop()

    expect(store.applied).toHaveLength(1)
    expect(store.applied[0]).toEqual([
      { kind: 'upsert', tab: { id: 'c', title: 'c', sql: 'edited', connectionId: null, database: null, schema: null, autoCommit: true }, position: 2 },
    ])
  })
})
