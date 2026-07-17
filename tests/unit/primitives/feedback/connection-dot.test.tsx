import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { ConnectionDot } from '../../../../src/renderer/src/primitives/feedback/ConnectionDot'

describe('ConnectionDot', () => {
  describe('fallback colour resolution', () => {
    it('falls back to accent for the neutral state', () => {
      const { container } = render(<ConnectionDot state="neutral" />)
      const dot = container.firstChild as HTMLElement
      expect(dot.style.backgroundColor).toBe('var(--color-accent)')
    })

    it('falls back to success for the connected state', () => {
      const { container } = render(<ConnectionDot state="connected" />)
      const dot = container.firstChild as HTMLElement
      expect(dot.style.backgroundColor).toBe('var(--color-success)')
    })

    it('falls back to the disabled text color for the disconnected state', () => {
      const { container } = render(<ConnectionDot state="disconnected" />)
      const dot = container.firstChild as HTMLElement
      expect(dot.style.backgroundColor).toBe('var(--color-text-disabled)')
    })

    it('defaults to the neutral state when none is given', () => {
      const { container } = render(<ConnectionDot />)
      const dot = container.firstChild as HTMLElement
      expect(dot.style.backgroundColor).toBe('var(--color-accent)')
    })

    it.each(['neutral', 'connected', 'disconnected'] as const)(
      'a custom color always wins over the %s state fallback',
      (state) => {
        const { container } = render(<ConnectionDot state={state} color="#ff7a45" />)
        const dot = container.firstChild as HTMLElement
        expect(dot.style.backgroundColor).toBe('rgb(255, 122, 69)')
      }
    )
  })

  describe('the connected glow', () => {
    it('applies a colour-matched halo only for the connected state', () => {
      const { container } = render(<ConnectionDot state="connected" color="#ff7a45" />)
      const dot = container.firstChild as HTMLElement
      expect(dot.style.boxShadow).toContain('color-mix(in srgb, #ff7a45 35%, transparent)')
      expect(dot.style.boxShadow).toContain('color-mix(in srgb, #ff7a45 50%, transparent)')
    })

    it('does not apply a glow for the neutral state', () => {
      const { container } = render(<ConnectionDot state="neutral" color="#ff7a45" />)
      const dot = container.firstChild as HTMLElement
      expect(dot.style.boxShadow).toBe('')
    })

    it('does not apply the connected glow for the disconnected state (uses an inset ring instead)', () => {
      const { container } = render(<ConnectionDot state="disconnected" color="#ff7a45" />)
      const dot = container.firstChild as HTMLElement
      expect(dot.style.boxShadow).not.toContain('color-mix(in srgb, #ff7a45 35%, transparent)')
      expect(dot.style.boxShadow).toContain('inset')
    })
  })

  describe('the disconnected dimming', () => {
    it('renders at 45% opacity only for the disconnected state', () => {
      const { container } = render(<ConnectionDot state="disconnected" />)
      const dot = container.firstChild as HTMLElement
      expect(dot.style.opacity).toBe('0.45')
    })

    it('is fully opaque for the neutral and connected states', () => {
      for (const state of ['neutral', 'connected'] as const) {
        const { container } = render(<ConnectionDot state={state} />)
        const dot = container.firstChild as HTMLElement
        expect(dot.style.opacity).toBe('')
      }
    })
  })

  describe('size', () => {
    it('renders 8px (w-2 h-2) for size sm', () => {
      const { container } = render(<ConnectionDot size="sm" />)
      const dot = container.firstChild as HTMLElement
      expect(dot).toHaveClass('w-2')
      expect(dot).toHaveClass('h-2')
    })

    it('renders 10px (w-2.5 h-2.5) for size md', () => {
      const { container } = render(<ConnectionDot size="md" />)
      const dot = container.firstChild as HTMLElement
      expect(dot).toHaveClass('w-2.5')
      expect(dot).toHaveClass('h-2.5')
    })
  })

  describe('accessibility', () => {
    it('is decorative (aria-hidden) by default', () => {
      const { container } = render(<ConnectionDot state="connected" />)
      expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    })

    it('exposes an accessible name and role="status" when given a label', () => {
      render(<ConnectionDot state="disconnected" label="Disconnected" />)
      expect(screen.getByRole('status', { name: 'Disconnected' })).toBeInTheDocument()
    })
  })
})
