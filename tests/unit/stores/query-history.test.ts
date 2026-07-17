import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useQueryHistoryStore } from '../../../src/renderer/src/stores/query-history'
import { useSettingsStore } from '../../../src/renderer/src/stores/settings'
import { IPC_CHANNELS } from '@shared/ipc'
import { defaultSettings } from '@shared/settings'
import type { QueryHistoryEntry } from '@shared/appdata'

const invokeMock = vi.fn()

function setMaxHistoryItems(n: number): void {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, general: { ...s.settings.general, maxHistoryItems: n } },
  }))
}

function run(sql: string, status: QueryHistoryEntry['status'] = 'ok'): Omit<QueryHistoryEntry, 'id' | 'executedAt'> {
  return { sql, status }
}

beforeEach(() => {
  invokeMock.mockReset()
  invokeMock.mockResolvedValue(undefined)
  ;(window as unknown as { electronAPI: { invoke: typeof invokeMock; on: () => () => void } }).electronAPI = {
    invoke: invokeMock,
    on: () => () => {},
  }
  useQueryHistoryStore.setState({ entries: [], hydrated: false })
  useSettingsStore.setState({ settings: { ...defaultSettings, general: { ...defaultSettings.general } } })
})

describe('useQueryHistoryStore record() cap enforcement', () => {
  it('keeps all entries when under the cap', () => {
    setMaxHistoryItems(5)
    useQueryHistoryStore.getState().record(run('select 1'))
    useQueryHistoryStore.getState().record(run('select 2'))
    expect(useQueryHistoryStore.getState().entries).toHaveLength(2)
  })

  it('keeps exactly `cap` entries when the count lands precisely on the cap', () => {
    setMaxHistoryItems(3)
    useQueryHistoryStore.getState().record(run('a'))
    useQueryHistoryStore.getState().record(run('b'))
    useQueryHistoryStore.getState().record(run('c'))
    const entries = useQueryHistoryStore.getState().entries
    expect(entries).toHaveLength(3)
    // record() prepends, so the most recent run is at index 0.
    expect(entries.map((e) => e.sql)).toEqual(['c', 'b', 'a'])
  })

  it('drops exactly the oldest entry when one run pushes past the cap', () => {
    setMaxHistoryItems(3)
    useQueryHistoryStore.getState().record(run('a'))
    useQueryHistoryStore.getState().record(run('b'))
    useQueryHistoryStore.getState().record(run('c'))
    useQueryHistoryStore.getState().record(run('d'))
    const entries = useQueryHistoryStore.getState().entries
    expect(entries).toHaveLength(3)
    expect(entries.map((e) => e.sql)).toEqual(['d', 'c', 'b'])
  })

  it('clamps a cap of 0 up to 1 rather than disabling history', () => {
    // maxItems() computes Math.max(1, maxHistoryItems) — a misconfigured
    // cap of 0 (or a negative number) does not mean "record nothing", it
    // means "keep 1". This documents that clamp precisely at the boundary.
    setMaxHistoryItems(0)
    useQueryHistoryStore.getState().record(run('a'))
    useQueryHistoryStore.getState().record(run('b'))
    const entries = useQueryHistoryStore.getState().entries
    expect(entries).toHaveLength(1)
    expect(entries[0].sql).toBe('b')
  })

  it('clamps a negative cap up to 1', () => {
    setMaxHistoryItems(-10)
    useQueryHistoryStore.getState().record(run('a'))
    useQueryHistoryStore.getState().record(run('b'))
    expect(useQueryHistoryStore.getState().entries).toHaveLength(1)
  })
})

describe('useQueryHistoryStore record() entry construction', () => {
  it('fills in id and executedAt, preserving the caller-supplied fields', () => {
    setMaxHistoryItems(10)
    useQueryHistoryStore.getState().record(run('select * from t', 'error'))
    const entry = useQueryHistoryStore.getState().entries[0]
    expect(entry.sql).toBe('select * from t')
    expect(entry.status).toBe('error')
    expect(typeof entry.id).toBe('string')
    expect(entry.id.length).toBeGreaterThan(0)
    expect(typeof entry.executedAt).toBe('number')
  })

  it('assigns distinct ids to back-to-back records (no id collision within the same tick)', () => {
    setMaxHistoryItems(10)
    useQueryHistoryStore.getState().record(run('a'))
    useQueryHistoryStore.getState().record(run('b'))
    const [first, second] = useQueryHistoryStore.getState().entries
    expect(first.id).not.toBe(second.id)
  })

  it('forwards the entry and the resolved cap to the IPC add channel', () => {
    setMaxHistoryItems(7)
    useQueryHistoryStore.getState().record(run('select 1'))
    expect(invokeMock).toHaveBeenCalledWith(
      IPC_CHANNELS.APPDATA_QUERY_HISTORY_ADD,
      expect.objectContaining({ sql: 'select 1', status: 'ok' }),
      7,
    )
  })

  it('still records optimistically in memory when there is no electronAPI (e.g. storybook/test host)', () => {
    // @ts-expect-error simulate a renderer host without the preload bridge
    delete window.electronAPI
    setMaxHistoryItems(10)
    useQueryHistoryStore.getState().record(run('select 1'))
    expect(useQueryHistoryStore.getState().entries).toHaveLength(1)
    expect(invokeMock).not.toHaveBeenCalled()
  })
})

describe('useQueryHistoryStore remove()', () => {
  it('removes only the matching entry, leaving the rest untouched and in order', () => {
    setMaxHistoryItems(10)
    useQueryHistoryStore.getState().record(run('a'))
    useQueryHistoryStore.getState().record(run('b'))
    useQueryHistoryStore.getState().record(run('c'))
    const [newest, , oldest] = useQueryHistoryStore.getState().entries
    useQueryHistoryStore.getState().remove(newest.id)
    const remaining = useQueryHistoryStore.getState().entries
    expect(remaining).toHaveLength(2)
    expect(remaining.find((e) => e.id === newest.id)).toBeUndefined()
    expect(remaining.find((e) => e.id === oldest.id)).toBeDefined()
    expect(invokeMock).toHaveBeenCalledWith(IPC_CHANNELS.APPDATA_QUERY_HISTORY_DELETE, newest.id)
  })

  it('is a no-op when the id does not exist', () => {
    setMaxHistoryItems(10)
    useQueryHistoryStore.getState().record(run('a'))
    const before = useQueryHistoryStore.getState().entries
    useQueryHistoryStore.getState().remove('does-not-exist')
    expect(useQueryHistoryStore.getState().entries).toEqual(before)
  })
})

describe('useQueryHistoryStore clear()', () => {
  it('empties entries regardless of how many were present and calls the clear channel', () => {
    setMaxHistoryItems(10)
    useQueryHistoryStore.getState().record(run('a'))
    useQueryHistoryStore.getState().record(run('b'))
    useQueryHistoryStore.getState().clear()
    expect(useQueryHistoryStore.getState().entries).toEqual([])
    expect(invokeMock).toHaveBeenCalledWith(IPC_CHANNELS.APPDATA_QUERY_HISTORY_CLEAR)
  })
})

describe('useQueryHistoryStore hydrate()', () => {
  it('loads entries from IPC using the resolved cap and marks itself hydrated', async () => {
    setMaxHistoryItems(50)
    const fromMain: QueryHistoryEntry[] = [
      { id: 'x1', sql: 'select 1', status: 'ok', executedAt: 1 },
    ]
    invokeMock.mockResolvedValueOnce(fromMain)
    await useQueryHistoryStore.getState().hydrate()
    expect(invokeMock).toHaveBeenCalledWith(IPC_CHANNELS.APPDATA_QUERY_HISTORY_LIST, 50)
    expect(useQueryHistoryStore.getState().entries).toEqual(fromMain)
    expect(useQueryHistoryStore.getState().hydrated).toBe(true)
  })

  it('only hydrates once — a second call does not re-invoke IPC or clobber local state', async () => {
    setMaxHistoryItems(50)
    invokeMock.mockResolvedValueOnce([{ id: 'x1', sql: 's', status: 'ok', executedAt: 1 }])
    await useQueryHistoryStore.getState().hydrate()
    invokeMock.mockClear()
    await useQueryHistoryStore.getState().hydrate()
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('no-ops without throwing when there is no electronAPI bridge', async () => {
    // @ts-expect-error simulate a renderer host without the preload bridge
    delete window.electronAPI
    await expect(useQueryHistoryStore.getState().hydrate()).resolves.toBeUndefined()
    expect(useQueryHistoryStore.getState().hydrated).toBe(false)
    expect(useQueryHistoryStore.getState().entries).toEqual([])
  })
})
