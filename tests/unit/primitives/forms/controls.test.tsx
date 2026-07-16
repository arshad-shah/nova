import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React, { createRef } from 'react'
import { Select } from '../../../../src/renderer/src/primitives/forms/Select'
import { Checkbox } from '../../../../src/renderer/src/primitives/forms/Checkbox'
import { Radio } from '../../../../src/renderer/src/primitives/forms/Radio'
import { Switch } from '../../../../src/renderer/src/primitives/forms/Switch'
import { Slider } from '../../../../src/renderer/src/primitives/forms/Slider'

const testOptions = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
]

const noop = () => {}

describe('Select', () => {
  it('renders a combobox trigger', () => {
    render(<Select options={testOptions} value="" onChange={noop} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('shows placeholder when no value selected', () => {
    const { container } = render(<Select options={testOptions} value="" onChange={noop} />)
    expect(container.textContent).toContain('Select')
  })

  it('shows selected option label', () => {
    render(<Select options={testOptions} value="a" onChange={noop} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Option A')
  })

  it('shows custom placeholder when no value', () => {
    render(<Select options={testOptions} value="" onChange={noop} placeholder="Pick one" />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Pick one')
  })

  // The trigger is sized by the shared `--field-*` density tokens now, not by
  // its own hardcoded heights. That's the point of the change: with h-9 baked
  // in, Select was the one field that ignored compact/comfortable mode.
  it('applies md size by default', () => {
    render(<Select options={testOptions} value="" onChange={noop} />)
    expect(screen.getByRole('combobox')).toHaveClass('[--field-ctl-h:var(--field-h-md)]')
  })

  it.each(['xs', 'sm', 'lg', 'xl'] as const)('applies %s size from the density scale', (size) => {
    render(<Select options={testOptions} value="" onChange={noop} size={size} />)
    expect(screen.getByRole('combobox')).toHaveClass(`[--field-ctl-h:var(--field-h-${size})]`)
  })

  it('marks the trigger invalid when state is error', () => {
    render(<Select options={testOptions} value="" onChange={noop} state="error" />)
    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveClass('border-error')
    expect(trigger).toHaveAttribute('aria-invalid', 'true')
  })

  it('does not mark the trigger invalid by default', () => {
    render(<Select options={testOptions} value="" onChange={noop} />)
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-invalid')
  })

  it('is disabled when disabled prop is true', () => {
    render(<Select options={testOptions} value="" onChange={noop} disabled />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})

describe('Checkbox', () => {
  it('renders a checkbox input', () => {
    render(<Checkbox />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('can be checked', () => {
    render(<Checkbox defaultChecked />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('calls onChange when clicked', () => {
    const handler = vi.fn()
    render(<Checkbox onChange={handler} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('applies styling classes to the visual companion', () => {
    // The input is transparent and only carries behaviour; the looks live on
    // the aria-hidden companion beside it. Box size is density-token driven:
    // every size shares the same width/height class (`*-[var(--cb-size)]`) and
    // differs only by the `--cb-size` var it sets. md maps to `--check-md`.
    const { container } = render(<Checkbox />)
    const companion = container.querySelector('[aria-hidden="true"]')
    expect(companion).toHaveClass('h-[var(--cb-size)]')
    expect(companion).toHaveClass('w-[var(--cb-size)]')
    expect(companion).toHaveClass('[--cb-size:var(--check-md)]')
  })

  it('keeps the input as the hit target over the companion', () => {
    // If the input stops covering the box, clicking the box stops toggling it.
    const { container } = render(<Checkbox />)
    const input = container.querySelector('input')
    expect(input).toHaveClass('absolute')
    expect(input).toHaveClass('inset-0')
    expect(input).toHaveClass('opacity-0')
  })

  it('renders both marks so toggling cannot shift layout', () => {
    const { container } = render(<Checkbox />)
    expect(container.querySelector('[data-mark="tick"]')).toBeInTheDocument()
    expect(container.querySelector('[data-mark="dash"]')).toBeInTheDocument()
  })

  it('supports indeterminate via ref', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Checkbox ref={ref} />)
    ref.current!.indeterminate = true
    expect(ref.current!.indeterminate).toBe(true)
  })

  it('forwards ref', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Checkbox ref={ref} />)
    expect(ref.current).not.toBeNull()
    expect(ref.current?.type).toBe('checkbox')
  })
})

describe('Radio', () => {
  it('renders a radio input', () => {
    render(<Radio />)
    expect(screen.getByRole('radio')).toBeInTheDocument()
  })

  it('can be checked', () => {
    render(<Radio defaultChecked />)
    expect(screen.getByRole('radio')).toBeChecked()
  })

  it('applies styling classes', () => {
    const { container } = render(<Radio />)
    const input = container.querySelector('input')
    expect(input).toHaveClass('h-4')
    expect(input).toHaveClass('w-4')
    expect(input).toHaveClass('rounded-full')
  })

  it('forwards ref', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Radio ref={ref} />)
    expect(ref.current).not.toBeNull()
    expect(ref.current?.type).toBe('radio')
  })
})

describe('Switch', () => {
  it('renders with switch role', () => {
    render(<Switch label="Enable feature" />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('sets aria-label from label prop', () => {
    render(<Switch label="Dark mode" />)
    expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeInTheDocument()
  })

  it('can be toggled', () => {
    render(<Switch label="Toggle" />)
    const switchEl = screen.getByRole('switch')
    expect(switchEl).not.toBeChecked()
    fireEvent.click(switchEl)
    expect(switchEl).toBeChecked()
  })

  it('applies sizing classes', () => {
    // The visual track is a <span> (the input is sr-only); md size = h-5 w-9.
    const { container } = render(<Switch label="Toggle" />)
    const track = container.querySelector('span')
    expect(track).toHaveClass('h-5')
    expect(track).toHaveClass('w-9')
  })

  it('forwards ref', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Switch label="Toggle" ref={ref} />)
    expect(ref.current).not.toBeNull()
    expect(ref.current?.type).toBe('checkbox')
  })
})

describe('Slider', () => {
  it('renders a range input', () => {
    render(<Slider />)
    expect(screen.getByRole('slider')).toBeInTheDocument()
  })

  it('is a range input type', () => {
    const { container } = render(<Slider />)
    const input = container.querySelector('input')
    expect(input?.type).toBe('range')
  })

  it('applies sizing classes', () => {
    const { container } = render(<Slider />)
    const input = container.querySelector('input')
    expect(input).toHaveClass('h-1.5')
    expect(input).toHaveClass('rounded-full')
  })

  it('accepts min, max, and value props', () => {
    render(<Slider min={0} max={100} defaultValue={50} />)
    const slider = screen.getByRole('slider') as HTMLInputElement
    expect(slider.min).toBe('0')
    expect(slider.max).toBe('100')
    expect(slider.value).toBe('50')
  })

  it('forwards ref', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Slider ref={ref} />)
    expect(ref.current).not.toBeNull()
    expect(ref.current?.type).toBe('range')
  })
})
