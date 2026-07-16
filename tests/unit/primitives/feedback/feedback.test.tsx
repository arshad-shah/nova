import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { Toast } from '../../../../src/renderer/src/primitives/feedback/Toast'
import { Alert } from '../../../../src/renderer/src/primitives/feedback/Alert'
import { Progress } from '../../../../src/renderer/src/primitives/feedback/Progress'
import { Spinner } from '../../../../src/renderer/src/primitives/feedback/Spinner'

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
    expect(container.firstChild).toHaveClass('[--fb-vc:var(--color-text-tertiary)]')
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
    const { container: err } = render(<Toast title="x" tone="error" />)
    expect(err.firstChild).toHaveAttribute('role', 'alert')
    const { container: ok } = render(<Toast title="x" tone="success" />)
    expect(ok.firstChild).toHaveAttribute('role', 'status')
  })

  // The variant colour now flows through a single `--fb-vc` custom property
  // (into the icon + left rail), not a flat border/bg tint of the whole toast.
  it('resolves the success tone', () => {
    const { container } = render(<Toast title="Done" onDismiss={() => {}} tone="success" />)
    expect(container.firstChild).toHaveClass('[--fb-vc:var(--color-success)]')
  })

  it('resolves the error tone', () => {
    const { container } = render(<Toast title="Error!" onDismiss={() => {}} tone="error" />)
    expect(container.firstChild).toHaveClass('[--fb-vc:var(--color-error)]')
  })

  it('resolves the warning tone', () => {
    const { container } = render(<Toast title="Warning" onDismiss={() => {}} tone="warning" />)
    expect(container.firstChild).toHaveClass('[--fb-vc:var(--color-warning)]')
  })

  it('resolves the info tone', () => {
    const { container } = render(<Toast title="Info" onDismiss={() => {}} tone="info" />)
    expect(container.firstChild).toHaveClass('[--fb-vc:var(--color-info)]')
  })

  it('has base classes', () => {
    const { container } = render(<Toast title="Hello" onDismiss={() => {}} />)
    expect(container.firstChild).toHaveClass('toast')
    expect(container.firstChild).toHaveClass('border')
    expect(container.firstChild).toHaveClass('rounded-xl')
  })

  // Unlike Alert, a toast is NOT tinted: one neutral surface for every
  // severity, and only the mark carries the colour. Five stacked toasts in five
  // colours is a fruit salad.
  it('keeps a neutral surface on every variant', () => {
    const border = (v: 'success' | 'error') =>
      (render(<Toast title="x" tone={v} />).container.firstChild as HTMLElement).className
    expect(border('success')).toContain('border-border-default')
    expect(border('error')).toContain('border-border-default')
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

  // `alert` interrupts a screen reader mid-sentence; `status` waits its turn.
  // An error or a warning has earned that; a success or an announcement hasn't.
  // The component is named Alert, but not every alert is an emergency.
  it('is an alert for error/warning and a status otherwise', () => {
    render(<Alert tone="error" title="Boom" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    cleanup()
    render(<Alert tone="warning" title="Careful" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    cleanup()
    render(<Alert tone="success" title="Saved" />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  // The tone resolves through the family-wide `--fb-vc`, shared with Toast and
  // Banner via feedback/severity.ts, rather than a per-variant border colour.
  it('defaults to the neutral variant', () => {
    const { container } = render(<Alert title="Default" />)
    expect(container.firstChild).toHaveClass('[--fb-vc:var(--color-text-tertiary)]')
  })

  it.each([
    ['success', 'var(--color-success)'],
    ['error', 'var(--color-error)'],
    ['warning', 'var(--color-warning)'],
    // info is cyan, NOT the accent. Alert used to tint its text with the accent
    // while its border used --color-info; the shared table makes that
    // impossible to say two ways.
    ['info', 'var(--color-info)'],
  ] as const)('resolves the %s tone from the shared table', (tone, token) => {
    const { container } = render(<Alert tone={tone} title="x" />)
    expect(container.firstChild).toHaveClass(`[--fb-vc:${token}]`)
  })

  it('has base classes', () => {
    const { container } = render(<Alert title="Test" />)
    expect(container.firstChild).toHaveClass('rounded-lg')
    expect(container.firstChild).toHaveClass('border')
  })

  // The body is a slot, not a <Text>: QueryErrorView puts a whole subtree in
  // here — paragraphs, a badge, a disclosure button, a code block — and a
  // <Text> would nest block elements and buttons inside a span.
  it('renders a rich subtree in the body without wrapping it in a span', () => {
    const { container } = render(
      <Alert tone="error" title="Query failed">
        <div>
          <p>message</p>
          <button type="button">Show details</button>
        </div>
      </Alert>
    )
    expect(screen.getByRole('button', { name: 'Show details' })).toBeInTheDocument()
    expect(container.querySelector('span p')).toBeNull()
  })

  // Title and description are the same colour. The title only summarises; the
  // body is what actually says what happened, and it's what you're being asked
  // to read. Stepping it down to `secondary` halved its contrast (12.4:1 ->
  // 6.1:1) to buy a hierarchy that weight and size already provide.
  it('renders the body at the same colour as the title', () => {
    render(<Alert tone="error" title="Boom">the details</Alert>)
    const titleEl = screen.getByText('Boom')
    const bodyEl = screen.getByText('the details')
    expect(titleEl).toHaveClass('text-text-primary')
    expect(bodyEl).toHaveClass('text-text-primary')
    // The separation is weight, not colour.
    expect(titleEl).toHaveClass('font-semibold')
    expect(bodyEl).not.toHaveClass('font-semibold')
  })

  it('renders an untitled body at the same colour too', () => {
    render(<Alert tone="error">just a body</Alert>)
    expect(screen.getByText('just a body')).toHaveClass('text-text-primary')
  })

  it('renders an action and calls it', () => {
    const onClick = vi.fn()
    render(<Alert tone="error" title="Failed" action={{ label: 'Try again', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onClick).toHaveBeenCalledTimes(1)
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

// Banner is gone — it was Alert with different padding and no title, had zero
// app usages, and disagreed with Alert about `info`. Its job is `variant="filled"`,
// so its coverage moves here rather than being deleted with it.
describe('Alert variant="filled" (was Banner)', () => {
  it('renders children', () => {
    render(<Alert variant="filled">Maintenance scheduled tonight.</Alert>)
    expect(screen.getByText('Maintenance scheduled tonight.')).toBeInTheDocument()
  })

  it('is solid and railed, unlike the default type', () => {
    const { container } = render(<Alert variant="filled">x</Alert>)
    expect(container.firstChild).toHaveClass('border-l-4')
    const { container: def } = render(<Alert>x</Alert>)
    expect(def.firstChild).not.toHaveClass('border-l-4')
  })

  // Banner's own variant, carried across: a product announcement is the one
  // message about Verql rather than the user's data, so it wears the accent.
  it('keeps the update variant', () => {
    const { container } = render(<Alert tone="update" type="filled">Shipped</Alert>)
    expect(container.firstChild).toHaveClass('[--fb-vc:var(--color-accent)]')
  })

  it('renders an action from the {label, onClick} form and calls it', () => {
    const onClick = vi.fn()
    render(<Alert variant="filled" action={{ label: 'Learn more', onClick }}>Shipped</Alert>)
    fireEvent.click(screen.getByRole('button', { name: /learn more/i }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  // Some callers genuinely need two buttons (Run / Decline), so a node is still
  // accepted alongside the preferred object form.
  it('still accepts an action node', () => {
    render(<Alert variant="filled" action={<button type="button">Custom</button>}>x</Alert>)
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument()
  })

  it('dismisses', () => {
    const onClose = vi.fn()
    render(<Alert variant="filled" onClose={onClose}>x</Alert>)
    fireEvent.click(screen.getByRole('button', { name: 'Close alert' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
