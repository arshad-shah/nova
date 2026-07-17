import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TabCloseGuard } from '@/components/shell/TabCloseGuard'
import { tabActions } from '@/stores/tab-actions'
import { notifyError } from '@/lib/notify-error'

vi.mock('@/lib/notify-error', () => ({ notifyError: vi.fn() }))

describe('TabCloseGuard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('leaves the modal un-opened when there is no pending close', () => {
    const { container } = render(
      <TabCloseGuard pendingCloseId={null} clearPendingClose={() => {}} closeTab={() => {}} />
    )
    // ConfirmDialog(open=false) still mounts a <dialog>, but the dialog itself
    // must not carry the `open` attribute that makes it visible/modal.
    expect(container.querySelector('dialog')).toHaveProperty('open', false)
  })

  it('shows the plain unsaved-changes confirm when the tab has no open transaction', () => {
    vi.spyOn(tabActions, 'hasOpenTransaction').mockReturnValue(false)
    vi.spyOn(tabActions, 'get').mockReturnValue({ label: 'My Query' })
    render(
      <TabCloseGuard pendingCloseId="t1" clearPendingClose={() => {}} closeTab={() => {}} />
    )
    expect(screen.getByText('My Query has unsaved changes. Close anyway?')).toBeInTheDocument()
    expect(screen.getByText('Discard changes')).toBeInTheDocument()
  })

  it('discarding via the plain confirm closes the tab and clears the pending state', () => {
    vi.spyOn(tabActions, 'hasOpenTransaction').mockReturnValue(false)
    vi.spyOn(tabActions, 'get').mockReturnValue({ label: 'My Query' })
    const clearPendingClose = vi.fn()
    const closeTab = vi.fn()
    render(
      <TabCloseGuard pendingCloseId="t1" clearPendingClose={clearPendingClose} closeTab={closeTab} />
    )
    fireEvent.click(screen.getByText('Discard changes'))
    expect(clearPendingClose).toHaveBeenCalledOnce()
    expect(closeTab).toHaveBeenCalledWith('t1')
  })

  it('cancelling the plain confirm clears pending state without closing the tab', () => {
    vi.spyOn(tabActions, 'hasOpenTransaction').mockReturnValue(false)
    vi.spyOn(tabActions, 'get').mockReturnValue({ label: 'My Query' })
    const clearPendingClose = vi.fn()
    const closeTab = vi.fn()
    render(
      <TabCloseGuard pendingCloseId="t1" clearPendingClose={clearPendingClose} closeTab={closeTab} />
    )
    fireEvent.click(screen.getByText('Keep editing'))
    expect(clearPendingClose).toHaveBeenCalledOnce()
    expect(closeTab).not.toHaveBeenCalled()
  })

  it('shows the transaction guard instead of the plain confirm when a transaction is open', () => {
    vi.spyOn(tabActions, 'hasOpenTransaction').mockReturnValue(true)
    vi.spyOn(tabActions, 'get').mockReturnValue({ label: 'My Query' })
    render(
      <TabCloseGuard pendingCloseId="t1" clearPendingClose={() => {}} closeTab={() => {}} />
    )
    expect(screen.getByText('Commit & close')).toBeInTheDocument()
    expect(screen.getByText('Rollback & close')).toBeInTheDocument()
    expect(screen.queryByText('Discard changes')).not.toBeInTheDocument()
  })

  it('rollback success rolls back, clears pending state, and closes the tab', async () => {
    vi.spyOn(tabActions, 'hasOpenTransaction').mockReturnValue(true)
    vi.spyOn(tabActions, 'get').mockReturnValue({ label: 'My Query' })
    const rollback = vi.spyOn(tabActions, 'rollbackTransaction').mockResolvedValue(undefined)
    const clearPendingClose = vi.fn()
    const closeTab = vi.fn()
    render(
      <TabCloseGuard pendingCloseId="t1" clearPendingClose={clearPendingClose} closeTab={closeTab} />
    )
    fireEvent.click(screen.getByText('Rollback & close'))
    await waitFor(() => expect(closeTab).toHaveBeenCalledWith('t1'))
    expect(rollback).toHaveBeenCalledWith('t1')
    expect(clearPendingClose).toHaveBeenCalledOnce()
    expect(notifyError).not.toHaveBeenCalled()
  })

  it('a failed rollback notifies the error and leaves the dialog open (does not close the tab)', async () => {
    vi.spyOn(tabActions, 'hasOpenTransaction').mockReturnValue(true)
    vi.spyOn(tabActions, 'get').mockReturnValue({ label: 'My Query' })
    vi.spyOn(tabActions, 'rollbackTransaction').mockRejectedValue(new Error('server unreachable'))
    const clearPendingClose = vi.fn()
    const closeTab = vi.fn()
    render(
      <TabCloseGuard pendingCloseId="t1" clearPendingClose={clearPendingClose} closeTab={closeTab} />
    )
    fireEvent.click(screen.getByText('Rollback & close'))
    await waitFor(() => expect(notifyError).toHaveBeenCalledOnce())
    expect(closeTab).not.toHaveBeenCalled()
    expect(clearPendingClose).not.toHaveBeenCalled()
  })

  it('a failed commit notifies the error and leaves the dialog open (does not close the tab)', async () => {
    vi.spyOn(tabActions, 'hasOpenTransaction').mockReturnValue(true)
    vi.spyOn(tabActions, 'get').mockReturnValue({ label: 'My Query' })
    vi.spyOn(tabActions, 'commitTransaction').mockRejectedValue(new Error('conflict'))
    const clearPendingClose = vi.fn()
    const closeTab = vi.fn()
    render(
      <TabCloseGuard pendingCloseId="t1" clearPendingClose={clearPendingClose} closeTab={closeTab} />
    )
    fireEvent.click(screen.getByText('Commit & close'))
    await waitFor(() => expect(notifyError).toHaveBeenCalledOnce())
    expect(closeTab).not.toHaveBeenCalled()
    expect(clearPendingClose).not.toHaveBeenCalled()
  })
})
