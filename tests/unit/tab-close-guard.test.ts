import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tabActions, usePendingClose, requestCloseTab, requestCloseTabs } from '@/stores/tab-actions'
import { useSettingsStore } from '@/stores/settings'

/** Registers a tab whose dirty/txn state we control. */
function seedTab(id: string, opts: { dirty?: boolean; txn?: boolean } = {}) {
  tabActions.register(id, {
    isDirty: () => Boolean(opts.dirty),
    txnStatus: () => (opts.txn ? 'active' : 'none'),
    label: id,
  })
}

function setConfirmUnsaved(on: boolean) {
  const s = useSettingsStore.getState()
  useSettingsStore.setState({
    settings: { ...s.settings, general: { ...s.settings.general, confirmOnUnsavedClose: on } },
  })
}

describe('requestCloseTabs', () => {
  beforeEach(() => {
    ;['a', 'b', 'c', 'd'].forEach(id => tabActions.unregister(id))
    usePendingClose.getState().clear()
    setConfirmUnsaved(true)
  })

  it('closes clean tabs immediately and raises no dialog', () => {
    seedTab('a'); seedTab('b')
    const close = vi.fn()
    requestCloseTabs(['a', 'b'], close)

    expect(close.mock.calls.map(c => c[0])).toEqual(['a', 'b'])
    expect(usePendingClose.getState().dirtyBatch).toEqual([])
    expect(usePendingClose.getState().txnQueue).toEqual([])
  })

  it('partitions clean, dirty and transactional tabs', () => {
    seedTab('a')
    seedTab('b', { dirty: true })
    seedTab('c', { txn: true })
    const close = vi.fn()
    requestCloseTabs(['a', 'b', 'c'], close)

    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith('a')
    expect(usePendingClose.getState().dirtyBatch).toEqual(['b'])
    expect(usePendingClose.getState().txnQueue).toEqual(['c'])
  })

  it('a dirty AND transactional tab queues as transactional only', () => {
    seedTab('a', { dirty: true, txn: true })
    requestCloseTabs(['a'], vi.fn())

    expect(usePendingClose.getState().txnQueue).toEqual(['a'])
    expect(usePendingClose.getState().dirtyBatch).toEqual([])
  })

  it('confirmOnUnsavedClose=false closes dirty tabs but still queues transactions', () => {
    setConfirmUnsaved(false)
    seedTab('a', { dirty: true })
    seedTab('b', { txn: true })
    const close = vi.fn()
    requestCloseTabs(['a', 'b'], close)

    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith('a')
    expect(usePendingClose.getState().dirtyBatch).toEqual([])
    expect(usePendingClose.getState().txnQueue).toEqual(['b'])
  })

  it('resolveHead pops the transaction queue', () => {
    seedTab('a', { txn: true }); seedTab('b', { txn: true })
    requestCloseTabs(['a', 'b'], vi.fn())
    expect(usePendingClose.getState().txnQueue).toEqual(['a', 'b'])

    usePendingClose.getState().resolveHead()
    expect(usePendingClose.getState().txnQueue).toEqual(['b'])
  })
})

describe('requestCloseTab (regression — single-tab behavior is unchanged)', () => {
  beforeEach(() => {
    ;['a'].forEach(id => tabActions.unregister(id))
    usePendingClose.getState().clear()
    setConfirmUnsaved(true)
  })

  it('closes a clean tab directly', () => {
    seedTab('a')
    const close = vi.fn()
    requestCloseTab('a', close)
    expect(close).toHaveBeenCalledWith('a')
    expect(usePendingClose.getState().dirtyBatch).toEqual([])
  })

  it('blocks a dirty tab', () => {
    seedTab('a', { dirty: true })
    const close = vi.fn()
    requestCloseTab('a', close)
    expect(close).not.toHaveBeenCalled()
    expect(usePendingClose.getState().dirtyBatch).toEqual(['a'])
  })

  it('blocks a transactional tab regardless of the confirm setting', () => {
    setConfirmUnsaved(false)
    seedTab('a', { txn: true })
    const close = vi.fn()
    requestCloseTab('a', close)
    expect(close).not.toHaveBeenCalled()
    expect(usePendingClose.getState().txnQueue).toEqual(['a'])
  })
})
