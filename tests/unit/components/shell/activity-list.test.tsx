import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ActivityList } from '../../../../src/renderer/src/components/shell/ActivityPanel'
import type { ActivityEntry } from '../../../../shared/activity'

const now = Date.now()
const ENTRIES: ActivityEntry[] = [
  { id: '1', ts: now, kind: 'query', level: 'success', title: 'q-one', detail: 'SELECT 1', source: 'Prod' },
  { id: '2', ts: now - 1, kind: 'connection', level: 'success', title: 'connected-row' },
  { id: '3', ts: now - 2, kind: 'query', level: 'error', title: 'q-two' },
  { id: '4', ts: now - 3, kind: 'log', level: 'debug', title: 'debug-line', source: 'app' },
]

function setup() {
  const onClear = vi.fn()
  render(<ActivityList entries={ENTRIES} onClear={onClear} />)
  return { onClear }
}

/** The kind/level chips now live behind the filter popover. */
function openFilterPopover() {
  fireEvent.click(screen.getByTitle('Filter by kind and level'))
}

describe('ActivityList', () => {
  it('renders all entries when no filter is active', () => {
    setup()
    expect(screen.getByText('q-one')).toBeInTheDocument()
    expect(screen.getByText('connected-row')).toBeInTheDocument()
    expect(screen.getByText('q-two')).toBeInTheDocument()
    expect(screen.getByText('debug-line')).toBeInTheDocument()
  })

  it('filters by kind when a chip in the popover is clicked', () => {
    setup()
    openFilterPopover()
    fireEvent.click(screen.getByRole('button', { name: 'Connections' }))
    expect(screen.getByText('connected-row')).toBeInTheDocument()
    expect(screen.queryByText('q-one')).not.toBeInTheDocument()
    expect(screen.queryByText('debug-line')).not.toBeInTheDocument()
  })

  it('filters by level when a level chip in the popover is clicked', () => {
    setup()
    openFilterPopover()
    fireEvent.click(screen.getByRole('button', { name: 'Errors' }))
    expect(screen.getByText('q-two')).toBeInTheDocument()
    expect(screen.queryByText('q-one')).not.toBeInTheDocument()
    expect(screen.queryByText('debug-line')).not.toBeInTheDocument()
  })

  it('filters by a free-text term typed into the expression field', () => {
    setup()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'select 1' } })
    // Matches the detail of q-one only.
    expect(screen.getByText('q-one')).toBeInTheDocument()
    expect(screen.queryByText('connected-row')).not.toBeInTheDocument()
    expect(screen.queryByText('q-two')).not.toBeInTheDocument()
  })

  it('filters by a typed level:kind expression', () => {
    setup()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'level:error kind:query' } })
    expect(screen.getByText('q-two')).toBeInTheDocument()
    expect(screen.queryByText('q-one')).not.toBeInTheDocument()
    expect(screen.queryByText('connected-row')).not.toBeInTheDocument()
  })

  it('invokes onClear from the clear button', () => {
    const { onClear } = setup()
    fireEvent.click(screen.getByTitle('Clear activity'))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('toggles the pause control', () => {
    setup()
    expect(screen.getByTitle('Pause live updates')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Pause live updates'))
    expect(screen.getByTitle('Resume live updates')).toBeInTheDocument()
  })

  it('shows an empty state when there are no entries', () => {
    render(<ActivityList entries={[]} onClear={() => {}} />)
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument()
  })

  it('shows a no-match state when filters exclude everything', () => {
    setup()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz-nothing' } })
    expect(screen.getByText(/no matching activity/i)).toBeInTheDocument()
  })

  it('expands an entry detail on click', () => {
    setup()
    expect(screen.queryByText('SELECT 1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('q-one'))
    expect(screen.getByText('SELECT 1')).toBeInTheDocument()
  })
})
