import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { Toast } from '../../../../src/renderer/src/primitives/feedback/Toast'
import { Alert } from '../../../../src/renderer/src/primitives/feedback/Alert'
import { Progress } from '../../../../src/renderer/src/primitives/feedback/Progress'
import { Spinner } from '../../../../src/renderer/src/primitives/feedback/Spinner'
import { Banner } from '../../../../src/renderer/src/primitives/feedback/Banner'

describe('Toast', () => {
  it('renders message', () => {
    render(<Toast title="Saved successfully" onDismiss={() => {}} />)
    expect(screen.getByText('Saved successfully')).toBeInTheDocument()
  })

  it('renders dismiss button with aria-label', () => {
    render(<Toast title="Hello" onDismiss={() => {}} />)
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('calls onDismiss when dismiss button clicked', () => {
    const onDismiss = vi.fn()
    render(<Toast title="Hello" onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('defaults to the neutral variant', () => {
    const { container } = render(<Toast title="Hello" onDismiss={() => {}} />)
    expect(container.firstChild).toHaveClass('[--toast-vc:var(--color-text-tertiary)]')
  })

  it('renders a description under the title when given one', () => {
    render(<Toast title="Saved" description="Your changes were kept." onDismiss={() => {}} />)
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('Your changes were kept.')).toBeInTheDocument()
  })

  it('renders an action and calls it', () => {
    const onClick = vi.fn()
    render(<Toast title="Saved" action={{ label: 'Undo', onClick }} onDismiss={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders no dismiss button when onDismiss is omitted', () => {
    render(<Toast title="Caller owns this one" />)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  // error/warning interrupt; the rest wait their turn.
  it('is an alert for error and a status otherwise', () => {
    const { container: err } = render(<Toast title="x" variant="error" />)
    expect(err.firstChild).toHaveAttribute('role', 'alert')
    const { container: ok } = render(<Toast title="x" variant="success" />)
    expect(ok.firstChild).toHaveAttribute('role', 'status')
  })

  // The variant colour now flows through a single `--toast-vc` custom property
  // (into the icon + left rail), not a flat border/bg tint of the whole toast.
  it('applies success variant classes', () => {
    const { container } = render(<Toast title="Done" onDismiss={() => {}} variant="success" />)
    expect(container.firstChild).toHaveClass('[--toast-vc:var(--color-success)]')
  })

  it('applies error variant classes', () => {
    const { container } = render(<Toast title="Error!" onDismiss={() => {}} variant="error" />)
    expect(container.firstChild).toHaveClass('[--toast-vc:var(--color-error)]')
  })

  it('applies warning variant classes', () => {
    const { container } = render(<Toast title="Warning" onDismiss={() => {}} variant="warning" />)
    expect(container.firstChild).toHaveClass('[--toast-vc:var(--color-warning)]')
  })

  it('applies info variant classes', () => {
    const { container } = render(<Toast title="Info" onDismiss={() => {}} variant="info" />)
    expect(container.firstChild).toHaveClass('[--toast-vc:var(--color-info)]')
  })

  it('has base classes', () => {
    const { container } = render(<Toast title="Hello" onDismiss={() => {}} />)
    expect(container.firstChild).toHaveClass('toast')
    expect(container.firstChild).toHaveClass('border')
    expect(container.firstChild).toHaveClass('rounded-[var(--field-r-lg)]')
  })

  it('renders the progress track only when duration is set', () => {
    const { container, rerender } = render(<Toast title="Hi" onDismiss={() => {}} />)
    expect(container.querySelector('.toast-progress')).toBeNull()
    rerender(<Toast title="Hi" onDismiss={() => {}} duration={3000} />)
    expect(container.querySelector('.toast-progress')).not.toBeNull()
  })

  it('auto-dismisses after duration elapses', () => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      render(<Toast title="Bye" onDismiss={onDismiss} duration={1000} />)
      expect(onDismiss).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1000)
      expect(onDismiss).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Alert', () => {
  it('renders title when provided', () => {
    render(<Alert title="Heads up!" />)
    expect(screen.getByText('Heads up!')).toBeInTheDocument()
  })

  it('renders children', () => {
    render(<Alert>This is an alert message.</Alert>)
    expect(screen.getByText('This is an alert message.')).toBeInTheDocument()
  })

  it('renders both title and children', () => {
    render(<Alert title="Warning">Something went wrong.</Alert>)
    expect(screen.getByText('Warning')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
  })

  it('has role="alert"', () => {
    render(<Alert title="Alert" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('applies default variant classes', () => {
    const { container } = render(<Alert title="Default" />)
    expect(container.firstChild).toHaveClass('bg-bg-elevated')
    expect(container.firstChild).toHaveClass('border-border-default')
  })

  it('applies success variant classes', () => {
    const { container } = render(<Alert variant="success" title="Success" />)
    expect(container.firstChild).toHaveClass('border-success')
  })

  it('applies error variant classes', () => {
    const { container } = render(<Alert variant="error" title="Error" />)
    expect(container.firstChild).toHaveClass('border-error')
  })

  it('has base classes', () => {
    const { container } = render(<Alert title="Test" />)
    expect(container.firstChild).toHaveClass('rounded-lg')
    expect(container.firstChild).toHaveClass('border')
    expect(container.firstChild).toHaveClass('px-4')
    expect(container.firstChild).toHaveClass('py-3')
  })
})

describe('Progress', () => {
  it('has role="progressbar"', () => {
    render(<Progress value={50} />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('sets aria-valuenow', () => {
    render(<Progress value={42} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
  })

  it('sets aria-valuemin to 0', () => {
    render(<Progress value={50} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemin', '0')
  })

  it('sets aria-valuemax to 100 by default', () => {
    render(<Progress value={50} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '100')
  })

  it('uses custom max for aria-valuemax', () => {
    render(<Progress value={5} max={10} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '10')
  })

  it('calculates width percentage correctly', () => {
    const { container } = render(<Progress value={75} />)
    const inner = container.querySelector('[style]')
    expect(inner).toHaveStyle({ width: '75%' })
  })

  it('calculates width percentage with custom max', () => {
    const { container } = render(<Progress value={5} max={10} />)
    const inner = container.querySelector('[style]')
    expect(inner).toHaveStyle({ width: '50%' })
  })

  it('applies outer container classes', () => {
    const { container } = render(<Progress value={50} />)
    expect(container.firstChild).toHaveClass('h-1.5')
    expect(container.firstChild).toHaveClass('w-full')
    expect(container.firstChild).toHaveClass('bg-bg-elevated')
    expect(container.firstChild).toHaveClass('rounded-full')
    expect(container.firstChild).toHaveClass('overflow-hidden')
  })
})

describe('Spinner', () => {
  it('has role="status"', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('has default aria-label of "Loading"', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading')
  })

  it('uses custom label for aria-label', () => {
    render(<Spinner label="Fetching data" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Fetching data')
  })

  it('renders sr-only span with label text', () => {
    render(<Spinner label="Processing" />)
    const srOnly = screen.getByText('Processing')
    expect(srOnly).toHaveClass('sr-only')
  })

  it('applies animate-spin class', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toHaveClass('animate-spin')
  })

  it('applies md size by default', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toHaveClass('h-5')
    expect(screen.getByRole('status')).toHaveClass('w-5')
  })

  it('applies xs size', () => {
    render(<Spinner size="xs" />)
    expect(screen.getByRole('status')).toHaveClass('h-3')
    expect(screen.getByRole('status')).toHaveClass('w-3')
  })

  it('applies lg size', () => {
    render(<Spinner size="lg" />)
    expect(screen.getByRole('status')).toHaveClass('h-6')
    expect(screen.getByRole('status')).toHaveClass('w-6')
  })

  it('applies xl size', () => {
    render(<Spinner size="xl" />)
    expect(screen.getByRole('status')).toHaveClass('h-8')
    expect(screen.getByRole('status')).toHaveClass('w-8')
  })
})

describe('Banner', () => {
  it('renders children', () => {
    render(<Banner>Maintenance scheduled tonight.</Banner>)
    expect(screen.getByText('Maintenance scheduled tonight.')).toBeInTheDocument()
  })

  it('applies default variant classes', () => {
    const { container } = render(<Banner>Default</Banner>)
    expect(container.firstChild).toHaveClass('bg-bg-elevated')
    expect(container.firstChild).toHaveClass('text-text-primary')
  })

  it('applies info variant classes', () => {
    const { container } = render(<Banner variant="info">Info</Banner>)
    expect(container.firstChild).toHaveClass('text-info')
  })

  it('applies warning variant classes', () => {
    const { container } = render(<Banner variant="warning">Warning</Banner>)
    expect(container.firstChild).toHaveClass('text-warning')
  })

  it('applies error variant classes', () => {
    const { container } = render(<Banner variant="error">Error</Banner>)
    expect(container.firstChild).toHaveClass('text-error')
  })

  it('has base classes', () => {
    const { container } = render(<Banner>Base</Banner>)
    expect(container.firstChild).toHaveClass('w-full')
    expect(container.firstChild).toHaveClass('px-4')
    expect(container.firstChild).toHaveClass('py-2')
  })
})
