import { describe, it, expect } from 'vitest'
import type { ActivityEntry } from '../../shared/activity'
import {
  groupEntries, pickParent, maxLevel, traceTotals, type StreamItem,
} from '../../src/renderer/src/lib/activity/group'

function e(over: Partial<ActivityEntry> & { id: string }): ActivityEntry {
  return { ts: 0, kind: 'query', level: 'info', title: over.id, ...over }
}

function ids(items: StreamItem[]): string[] {
  return items.map((i) => (i.type === 'group' ? `group:${i.group.traceId}` : i.entry.id))
}

describe('groupEntries', () => {
  it('passes untraced entries and lone-trace entries through as bare rows', () => {
    const entries = [
      e({ id: 'a' }),                       // untraced
      e({ id: 'b', traceId: 't-lonely' }),  // only one in its trace
    ]
    expect(ids(groupEntries(entries))).toEqual(['a', 'b'])
  })

  it('groups a trace of 2+ entries, anchored at its first entry, order-stable', () => {
    const entries = [
      e({ id: 'x', ts: 1 }),
      e({ id: 't1', ts: 2, traceId: 'T' }),
      e({ id: 'y', ts: 3 }),
      e({ id: 't2', ts: 4, traceId: 'T' }),
      e({ id: 'z', ts: 5 }),
    ]
    // The group replaces both T entries and sits where T first appeared.
    expect(ids(groupEntries(entries))).toEqual(['x', 'group:T', 'y', 'z'])
  })

  it('mixes traced and untraced without disturbing the rest', () => {
    const entries = [
      e({ id: 't1', traceId: 'A' }),
      e({ id: 't2', traceId: 'A' }),
      e({ id: 'bare' }),
      e({ id: 'u1', traceId: 'B' }),
      e({ id: 'u2', traceId: 'B' }),
    ]
    expect(ids(groupEntries(entries))).toEqual(['group:A', 'bare', 'group:B'])
  })
})

describe('pickParent', () => {
  it('prefers the longest-running entry', () => {
    const entries = [
      e({ id: 'a', ts: 1, durationMs: 5 }),
      e({ id: 'b', ts: 2, durationMs: 50 }),
      e({ id: 'c', ts: 3, durationMs: 1 }),
    ]
    expect(pickParent(entries).id).toBe('b')
  })

  it('tie-breaks equal durations to the earliest', () => {
    const entries = [
      e({ id: 'late', ts: 10, durationMs: 5 }),
      e({ id: 'early', ts: 1, durationMs: 5 }),
    ]
    expect(pickParent(entries).id).toBe('early')
  })

  it('treats a missing duration as zero', () => {
    const entries = [e({ id: 'none', ts: 1 }), e({ id: 'some', ts: 2, durationMs: 3 })]
    expect(pickParent(entries).id).toBe('some')
  })
})

describe('severity rollup', () => {
  it('rolls up to the worst level so a child error shows on a succeeded parent', () => {
    const item = groupEntries([
      e({ id: 'p', durationMs: 100, level: 'success' }),
      e({ id: 'c', durationMs: 2, level: 'error' }),
    ].map((x) => ({ ...x, traceId: 'T' })))[0]
    if (item.type !== 'group') throw new Error('expected group')
    expect(item.group.parent.id).toBe('p')       // parent still the long success
    expect(item.group.parent.level).toBe('success')
    expect(item.group.level).toBe('error')       // but the group rolls up to error
  })

  it('maxLevel ranks error > warn > success > info > debug', () => {
    expect(maxLevel([e({ id: '1', level: 'debug' }), e({ id: '2', level: 'warn' })])).toBe('warn')
    expect(maxLevel([e({ id: '1', level: 'success' }), e({ id: '2', level: 'info' })])).toBe('success')
  })
})

describe('children, span window and hidden count', () => {
  it('separates parent from children and computes the time window', () => {
    const item = groupEntries([
      e({ id: 'a', ts: 100, durationMs: 10, traceId: 'T' }),
      e({ id: 'b', ts: 105, durationMs: 40, traceId: 'T' }), // longest -> parent
    ])[0]
    if (item.type !== 'group') throw new Error('expected group')
    expect(item.group.parent.id).toBe('b')
    expect(item.group.children.map((c) => c.id)).toEqual(['a'])
    expect(item.group.start).toBe(100)
    expect(item.group.end).toBe(145) // 105 + 40
  })

  it('reports children hidden by a filter via traceTotals', () => {
    const filtered = [
      e({ id: 'a', traceId: 'T', durationMs: 10 }),
      e({ id: 'b', traceId: 'T', durationMs: 20 }),
    ]
    const totals = new Map([['T', 5]]) // 5 in the trace originally
    const item = groupEntries(filtered, totals)[0]
    if (item.type !== 'group') throw new Error('expected group')
    expect(item.group.hiddenChildren).toBe(3)
  })
})

describe('stability under append', () => {
  it('keeps earlier items in place when a new entry is appended', () => {
    const base = [e({ id: 'a' }), e({ id: 't1', traceId: 'T' }), e({ id: 't2', traceId: 'T' })]
    const before = ids(groupEntries(base))
    const after = ids(groupEntries([...base, e({ id: 'b' })]))
    expect(after.slice(0, before.length)).toEqual(before)
    expect(after).toEqual(['a', 'group:T', 'b'])
  })
})

describe('traceTotals', () => {
  it('counts entries per trace and ignores untraced ones', () => {
    const totals = traceTotals([
      e({ id: '1', traceId: 'A' }), e({ id: '2', traceId: 'A' }),
      e({ id: '3' }), e({ id: '4', traceId: 'B' }),
    ])
    expect(totals.get('A')).toBe(2)
    expect(totals.get('B')).toBe(1)
    expect(totals.has('untraced')).toBe(false)
  })
})
