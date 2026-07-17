import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TabCloseGuard } from '@/components/shell/TabCloseGuard'
import { tabActions } from '@/stores/tab-actions'
import { notifyError } from '@/lib/notify-error'

vi.mock('@/lib/notify-error', () => ({ notifyError: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
  ;['a', 'b'].forEach(id => tabActions.unregister(id))
})

describe('TabCloseGuard (dirty batch copy)', () => {
  it('renders the singular unsaved-changes copy for exactly one dirty tab', () => {
    tabActions.register('a', { label: 'Query 1', isDirty: () => true })

    render(
      <TabCloseGuard
        txnQueue={[]}
        dirtyBatch={['a']}
        resolveHead={() => {}}
        clearBatch={() => {}}
        closeTab={() => {}}
      />
    )

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByText('Query 1 has unsaved changes. Close anyway?')).toBeInTheDocument()
    expect(screen.getByText('Discard changes')).toBeInTheDocument()
    // Plural copy must not appear on the singular path.
    expect(screen.queryByText(/Discard all/)).not.toBeInTheDocument()
  })

  it('renders the plural unsaved-changes copy and names both tabs for two dirty tabs', () => {
    tabActions.register('a', { label: 'Query 1', isDirty: () => true })
    tabActions.register('b', { label: 'Query 2', isDirty: () => true })

    render(
      <TabCloseGuard
        txnQueue={[]}
        dirtyBatch={['a', 'b']}
        resolveHead={() => {}}
        clearBatch={() => {}}
        closeTab={() => {}}
      />
    )

    expect(screen.getByText('Unsaved changes in 2 tabs')).toBeInTheDocument()
    expect(
      screen.getByText('Query 1, Query 2 have unsaved changes. Close anyway?')
    ).toBeInTheDocument()
    expect(screen.getByText('Discard all')).toBeInTheDocument()
    // Singular copy must not appear on the plural path.
    expect(screen.queryByText('Discard changes')).not.toBeInTheDocument()
  })

  it('discarding closes every tab in the batch and clears it', () => {
    tabActions.register('a', { label: 'Query 1', isDirty: () => true })
    tabActions.register('b', { label: 'Query 2', isDirty: () => true })
    const clearBatch = vi.fn()
    const closeTab = vi.fn()

    render(
      <TabCloseGuard
        txnQueue={[]}
        dirtyBatch={['a', 'b']}
        resolveHead={() => {}}
        clearBatch={clearBatch}
        closeTab={closeTab}
      />
    )

    fireEvent.click(screen.getByText('Discard all'))
    expect(clearBatch).toHaveBeenCalledOnce()
    // `forEach(closeTab)` also hands the callback the index and the array, so
    // assert on the tab id alone rather than the whole argument list.
    expect(closeTab.mock.calls.map(call => call[0])).toEqual(['a', 'b'])
  })

  it('renders nothing when no close is awaiting confirmation', () => {
    const { container } = render(
      <TabCloseGuard
        txnQueue={[]}
        dirtyBatch={[]}
        resolveHead={() => {}}
        clearBatch={() => {}}
        closeTab={() => {}}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('TabCloseGuard (transaction queue)', () => {
  it('resolves the transaction queue head first, ahead of any dirty batch', () => {
    tabActions.register('a', { label: 'Query 1', txnStatus: () => 'active' })
    tabActions.register('b', { label: 'Query 2', isDirty: () => true })

    render(
      <TabCloseGuard
        txnQueue={['a']}
        dirtyBatch={['b']}
        resolveHead={() => {}}
        clearBatch={() => {}}
        closeTab={() => {}}
      />
    )

    expect(screen.getByText('Commit & close')).toBeInTheDocument()
    // The dirty confirm must wait its turn.
    expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument()
  })

  it('a successful commit pops the head and closes that tab', async () => {
    const commitTransaction = vi.fn().mockResolvedValue(undefined)
    tabActions.register('a', { label: 'Query 1', txnStatus: () => 'active', commitTransaction })
    const resolveHead = vi.fn()
    const closeTab = vi.fn()

    render(
      <TabCloseGuard
        txnQueue={['a']}
        dirtyBatch={[]}
        resolveHead={resolveHead}
        clearBatch={() => {}}
        closeTab={closeTab}
      />
    )

    fireEvent.click(screen.getByText('Commit & close'))
    await waitFor(() => expect(closeTab).toHaveBeenCalledWith('a'))
    expect(resolveHead).toHaveBeenCalledOnce()
    expect(notifyError).not.toHaveBeenCalled()
  })

  // A failed commit must not close the tab: doing so would strand an open
  // transaction on the server with no UI left to resolve it.
  it('a failed commit notifies the error and leaves the tab open', async () => {
    const commitTransaction = vi.fn().mockRejectedValue(new Error('conflict'))
    tabActions.register('a', { label: 'Query 1', txnStatus: () => 'active', commitTransaction })
    const resolveHead = vi.fn()
    const closeTab = vi.fn()

    render(
      <TabCloseGuard
        txnQueue={['a']}
        dirtyBatch={[]}
        resolveHead={resolveHead}
        clearBatch={() => {}}
        closeTab={closeTab}
      />
    )

    fireEvent.click(screen.getByText('Commit & close'))
    await waitFor(() => expect(notifyError).toHaveBeenCalledOnce())
    expect(closeTab).not.toHaveBeenCalled()
    expect(resolveHead).not.toHaveBeenCalled()
  })

  it('a failed rollback notifies the error and leaves the tab open', async () => {
    const rollbackTransaction = vi.fn().mockRejectedValue(new Error('connection lost'))
    tabActions.register('a', { label: 'Query 1', txnStatus: () => 'active', rollbackTransaction })
    const resolveHead = vi.fn()
    const closeTab = vi.fn()

    render(
      <TabCloseGuard
        txnQueue={['a']}
        dirtyBatch={[]}
        resolveHead={resolveHead}
        clearBatch={() => {}}
        closeTab={closeTab}
      />
    )

    fireEvent.click(screen.getByText('Rollback & close'))
    await waitFor(() => expect(notifyError).toHaveBeenCalledOnce())
    expect(closeTab).not.toHaveBeenCalled()
    expect(resolveHead).not.toHaveBeenCalled()
  })

  it('cancelling a transaction confirm pops the head without closing the tab', () => {
    tabActions.register('a', { label: 'Query 1', txnStatus: () => 'active' })
    const resolveHead = vi.fn()
    const closeTab = vi.fn()

    render(
      <TabCloseGuard
        txnQueue={['a']}
        dirtyBatch={[]}
        resolveHead={resolveHead}
        clearBatch={() => {}}
        closeTab={closeTab}
      />
    )

    fireEvent.click(screen.getByText('Cancel'))
    expect(resolveHead).toHaveBeenCalledOnce()
    expect(closeTab).not.toHaveBeenCalled()
  })
})
