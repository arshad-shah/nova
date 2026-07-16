import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React, { createRef } from 'react'
import { Button, IconButton } from '../../../../src/renderer/src/primitives/forms/Button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('applies solid variant by default', () => {
    const { container } = render(<Button>Solid</Button>)
    // Repeated actions are the functional action colour, not the theme accent.
    expect(container.firstChild).toHaveClass('bg-action')
    expect(container.firstChild).toHaveClass('text-action-fg')
  })

  it('applies ghost variant', () => {
    const { container } = render(<Button variant="ghost">Ghost</Button>)
    expect(container.firstChild).toHaveClass('bg-transparent')
    expect(container.firstChild).not.toHaveClass('bg-accent')
  })

  it('applies outline variant', () => {
    const { container } = render(<Button variant="outline">Outline</Button>)
    expect(container.firstChild).toHaveClass('border')
    expect(container.firstChild).toHaveClass('border-border-default')
  })

  it('applies error variant', () => {
    const { container } = render(<Button variant="error">Delete</Button>)
    expect(container.firstChild).toHaveClass('bg-error-emphasis')
  })

  it('applies md size by default', () => {
    const { container } = render(<Button>Default size</Button>)
    expect(container.firstChild).toHaveClass('h-9')
    expect(container.firstChild).toHaveClass('px-3')
  })

  it('applies xs size', () => {
    const { container } = render(<Button size="xs">XS</Button>)
    expect(container.firstChild).toHaveClass('h-7')
    expect(container.firstChild).toHaveClass('px-2')
  })

  it('applies sm size', () => {
    const { container } = render(<Button size="sm">SM</Button>)
    expect(container.firstChild).toHaveClass('h-8')
    expect(container.firstChild).toHaveClass('px-2.5')
  })

  it('applies lg size', () => {
    const { container } = render(<Button size="lg">LG</Button>)
    expect(container.firstChild).toHaveClass('h-10')
    expect(container.firstChild).toHaveClass('px-4')
  })

  it('applies xl size', () => {
    const { container } = render(<Button size="xl">XL</Button>)
    expect(container.firstChild).toHaveClass('h-12')
    expect(container.firstChild).toHaveClass('px-5')
  })

  it('calls onClick handler', () => {
    const handler = vi.fn()
    render(<Button onClick={handler}>Click</Button>)
    fireEvent.click(screen.getByText('Click'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByText('Disabled')).toBeDisabled()
  })

  it('forwards ref', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Ref</Button>)
    expect(ref.current).not.toBeNull()
    expect(ref.current?.nodeName).toBe('BUTTON')
  })

  it('merges custom className', () => {
    const { container } = render(<Button className="custom-class">Custom</Button>)
    expect(container.firstChild).toHaveClass('custom-class')
  })
})

describe('IconButton', () => {
  it('renders with aria-label from label prop', () => {
    render(<IconButton label="Close">X</IconButton>)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('applies ghost variant by default', () => {
    const { container } = render(<IconButton label="Icon">X</IconButton>)
    expect(container.firstChild).toHaveClass('bg-transparent')
  })

  it('applies md size by default', () => {
    const { container } = render(<IconButton label="Icon">X</IconButton>)
    expect(container.firstChild).toHaveClass('h-9')
    expect(container.firstChild).toHaveClass('w-9')
  })

  it('applies xs size', () => {
    const { container } = render(<IconButton label="Icon" size="xs">X</IconButton>)
    expect(container.firstChild).toHaveClass('h-7')
    expect(container.firstChild).toHaveClass('w-7')
  })

  it('applies solid variant', () => {
    const { container } = render(<IconButton label="Icon" variant="solid">X</IconButton>)
    expect(container.firstChild).toHaveClass('bg-action')
  })

  it('forwards ref', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<IconButton label="Icon" ref={ref}>X</IconButton>)
    expect(ref.current).not.toBeNull()
  })
})
