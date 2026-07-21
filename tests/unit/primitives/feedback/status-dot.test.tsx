import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { StatusDot } from '../../../../src/renderer/src/primitives/feedback/StatusDot'

describe('StatusDot', () => {
  it('is aria-hidden by default (decorative)', () => {
    const { container } = render(<StatusDot tone="success" />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstChild).not.toHaveAttribute('role')
  })

  it('exposes an accessible name and role="status" when given a label', () => {
    render(<StatusDot tone="error" label="Disconnected" />)
    const dot = screen.getByRole('status', { name: 'Disconnected' })
    expect(dot).toBeInTheDocument()
    expect(dot).not.toHaveAttribute('aria-hidden')
  })

  it.each([
    ['success', 'bg-success'],
    ['warning', 'bg-warning'],
    ['error', 'bg-error'],
    ['muted', 'bg-text-muted'],
    ['accent', 'bg-accent'],
    ['info', 'bg-info'],
  ] as const)('resolves the %s tone to its own background class', (tone, bgClass) => {
    const { container } = render(<StatusDot tone={tone} />)
    expect(container.firstChild).toHaveClass(bgClass)
  })

  it('gives each tone a distinct background class from the others', () => {
    const tones = ['success', 'warning', 'error', 'muted', 'accent', 'info'] as const
    const classNames = tones.map(
      (tone) => (render(<StatusDot tone={tone} />).container.firstChild as HTMLElement).className
    )
    expect(new Set(classNames).size).toBe(tones.length)
  })

  it.each([
    ['xs', 'h-1.5', 'w-1.5'],
    ['sm', 'h-2', 'w-2'],
    ['md', 'h-2.5', 'w-2.5'],
  ] as const)('applies the %s size classes', (size, h, w) => {
    const { container } = render(<StatusDot size={size} />)
    expect(container.firstChild).toHaveClass(h)
    expect(container.firstChild).toHaveClass(w)
  })

  it('defaults to size sm and tone muted', () => {
    const { container } = render(<StatusDot />)
    expect(container.firstChild).toHaveClass('h-2')
    expect(container.firstChild).toHaveClass('w-2')
    expect(container.firstChild).toHaveClass('bg-text-muted')
  })

  it('does not animate by default', () => {
    const { container } = render(<StatusDot tone="success" />)
    expect(container.firstChild).not.toHaveClass('animate-pulse')
  })

  it('applies animate-pulse when pulse is set', () => {
    const { container } = render(<StatusDot tone="success" pulse />)
    expect(container.firstChild).toHaveClass('animate-pulse')
  })

  it('has no glow shadow by default', () => {
    const { container } = render(<StatusDot tone="success" />)
    expect((container.firstChild as HTMLElement).className).not.toMatch(/shadow-\[/)
  })

  it('applies a glow shadow mixed from the tone colour when glow is set', () => {
    const { container } = render(<StatusDot tone="success" glow />)
    const className = (container.firstChild as HTMLElement).className
    expect(className).toMatch(/shadow-\[/)
    expect(className).toContain('var(--sd-c)')
  })

  it('supports pulse and glow together', () => {
    const { container } = render(<StatusDot tone="error" pulse glow />)
    expect(container.firstChild).toHaveClass('animate-pulse')
    expect((container.firstChild as HTMLElement).className).toMatch(/shadow-\[/)
  })

  it('renders as an inline span element', () => {
    const { container } = render(<StatusDot tone="success" />)
    expect((container.firstChild as HTMLElement).tagName).toBe('SPAN')
  })

  it('forwards a custom className alongside variant classes', () => {
    const { container } = render(<StatusDot tone="success" className="ml-2" />)
    expect(container.firstChild).toHaveClass('ml-2')
    expect(container.firstChild).toHaveClass('bg-success')
  })
})
