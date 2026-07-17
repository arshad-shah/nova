import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { TabCloseGuard } from '../../../../src/renderer/src/components/shell/TabCloseGuard'
import { tabActions } from '../../../../src/renderer/src/stores/tab-actions'

beforeEach(() => {
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
})
