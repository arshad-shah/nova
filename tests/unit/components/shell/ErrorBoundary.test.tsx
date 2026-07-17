import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from '@/components/shell/ErrorBoundary'

function Boom({ shouldThrow }: { shouldThrow: boolean }): null {
  if (shouldThrow) throw new Error('kaboom')
  return null
}

describe('ErrorBoundary', () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  afterEach(() => consoleErrorSpy.mockClear())

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>fine</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('fine')).toBeInTheDocument()
  })

  it('renders the fallback with the thrown error message after a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>
    )
    expect(screen.getByText('kaboom')).toBeInTheDocument()
    expect(screen.getByText('Try Again')).toBeInTheDocument()
  })

  it('Try Again resets the boundary, re-rendering children (which may throw again)', () => {
    let shouldThrow = true
    function Toggle() {
      return <Boom shouldThrow={shouldThrow} />
    }
    const { rerender } = render(
      <ErrorBoundary>
        <Toggle />
      </ErrorBoundary>
    )
    expect(screen.getByText('kaboom')).toBeInTheDocument()

    // Fix the underlying condition, then click retry: the boundary clears its
    // error state and mounts children fresh instead of staying stuck.
    shouldThrow = false
    rerender(
      <ErrorBoundary>
        <Toggle />
      </ErrorBoundary>
    )
    fireEvent.click(screen.getByText('Try Again'))
    expect(screen.queryByText('kaboom')).not.toBeInTheDocument()
  })
})
