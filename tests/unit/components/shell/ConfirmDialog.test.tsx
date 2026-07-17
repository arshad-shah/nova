import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog } from '@/components/shell/ConfirmDialog'

describe('ConfirmDialog', () => {
  it('falls back to the generic Confirm/Cancel labels when none are supplied', () => {
    render(
      <ConfirmDialog open title="Delete row?" onConfirm={() => {}} onCancel={() => {}} />
    )
    expect(screen.getByText('Confirm')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('uses caller-supplied labels over the generic defaults', () => {
    render(
      <ConfirmDialog
        open
        title="Delete row?"
        confirmLabel="Delete"
        cancelLabel="Never mind"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('Never mind')).toBeInTheDocument()
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument()
  })

  it('does not render an optional message when none is given', () => {
    render(<ConfirmDialog open title="Delete row?" onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument()
  })

  it('gives the confirm button the neutral "solid" styling by default (not the error look)', () => {
    render(<ConfirmDialog open title="Delete row?" onConfirm={() => {}} onCancel={() => {}} />)
    // "solid" and "error" share no class token, so this also proves the two
    // variants aren't just visually indistinguishable defaults.
    expect(screen.getByText('Confirm')).toHaveClass('bg-action')
    expect(screen.getByText('Confirm')).not.toHaveClass('bg-error-emphasis')
  })

  it('variant="danger" renders the confirm button with the error/destructive styling', () => {
    render(
      <ConfirmDialog open title="Delete row?" variant="danger" onConfirm={() => {}} onCancel={() => {}} />
    )
    // BUG-sensitive: a caller passes variant="danger" specifically to warn the
    // user before a destructive action — silently falling back to the plain
    // "solid" button would remove that warning with no test failure.
    expect(screen.getByText('Confirm')).toHaveClass('bg-error-emphasis')
    expect(screen.getByText('Confirm')).not.toHaveClass('bg-action')
  })

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog open title="Delete row?" onConfirm={onConfirm} onCancel={() => {}} />)
    fireEvent.click(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog open title="Delete row?" onConfirm={() => {}} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel when the underlying dialog fires a native close (e.g. Escape)', () => {
    const onCancel = vi.fn()
    const { container } = render(
      <ConfirmDialog open title="Delete row?" onConfirm={() => {}} onCancel={onCancel} />
    )
    const dialog = container.querySelector('dialog')!
    fireEvent(dialog, new Event('close'))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
