import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SectionErrorBoundary } from '@/components/shell/SectionErrorBoundary'

function Boom({ shouldThrow }: { shouldThrow: boolean }): null {
  if (shouldThrow) throw new Error('section kaboom')
  return null
}

describe('SectionErrorBoundary', () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  afterEach(() => consoleErrorSpy.mockClear())

  it('renders children normally when nothing throws', () => {
    render(
      <SectionErrorBoundary label="Widget">
        <div>ok</div>
      </SectionErrorBoundary>
    )
    expect(screen.getByText('ok')).toBeInTheDocument()
  })

  it('shows the crashed label and error message after a child throws', () => {
    render(
      <SectionErrorBoundary label="Widget">
        <Boom shouldThrow />
      </SectionErrorBoundary>
    )
    expect(screen.getByText(/Widget crashed/)).toBeInTheDocument()
    expect(screen.getByText('section kaboom')).toBeInTheDocument()
  })

  it('logs the crash via console.error tagged with the section label', () => {
    render(
      <SectionErrorBoundary label="Sidebar">
        <Boom shouldThrow />
      </SectionErrorBoundary>
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Sidebar] crashed:',
      expect.any(Error),
      expect.anything()
    )
  })

  it('auto-resets when resetKey changes, without waiting for a manual retry click', () => {
    const { rerender } = render(
      <SectionErrorBoundary label="Widget" resetKey="tab-1">
        <Boom shouldThrow />
      </SectionErrorBoundary>
    )
    expect(screen.getByText(/crashed/)).toBeInTheDocument()

    rerender(
      <SectionErrorBoundary label="Widget" resetKey="tab-2">
        <Boom shouldThrow={false} />
      </SectionErrorBoundary>
    )
    // BUG-sensitive: without the componentDidUpdate reset, navigating to a
    // different tab (a new resetKey) would keep showing the stale crash UI.
    expect(screen.queryByText(/crashed/)).not.toBeInTheDocument()
  })

  it('does not reset when resetKey is unchanged across a re-render', () => {
    const { rerender } = render(
      <SectionErrorBoundary label="Widget" resetKey="tab-1">
        <Boom shouldThrow />
      </SectionErrorBoundary>
    )
    expect(screen.getByText(/crashed/)).toBeInTheDocument()

    rerender(
      <SectionErrorBoundary label="Widget" resetKey="tab-1">
        <Boom shouldThrow={false} />
      </SectionErrorBoundary>
    )
    expect(screen.getByText(/crashed/)).toBeInTheDocument()
  })

  it('Retry button clears the error and re-renders children', () => {
    let shouldThrow = true
    function Toggle() { return <Boom shouldThrow={shouldThrow} /> }
    const { rerender } = render(
      <SectionErrorBoundary label="Widget">
        <Toggle />
      </SectionErrorBoundary>
    )
    shouldThrow = false
    rerender(
      <SectionErrorBoundary label="Widget">
        <Toggle />
      </SectionErrorBoundary>
    )
    fireEvent.click(screen.getByText('Retry'))
    expect(screen.queryByText(/crashed/)).not.toBeInTheDocument()
  })

  it('uses a custom fallback renderer when provided, passing the error and a retry callback', () => {
    const fallback = vi.fn((error: Error, retry: () => void) => (
      <button onClick={retry}>custom fallback: {error.message}</button>
    ))
    render(
      <SectionErrorBoundary label="Widget" fallback={fallback}>
        <Boom shouldThrow />
      </SectionErrorBoundary>
    )
    expect(screen.getByText(/custom fallback: section kaboom/)).toBeInTheDocument()
    // The default "Retry" UI must not also render alongside a custom fallback.
    expect(screen.queryByText('Retry')).not.toBeInTheDocument()
  })
})
