import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { ColorInput } from '@/primitives/forms/ColorInput'

/**
 * Behavioural tests for ColorInput's hex validation, controlled/uncontrolled
 * value handling, and the floating-ui-backed ColorPicker popover it drives.
 * Only color-utils.ts (the pure conversion helpers) had coverage before this;
 * the component wiring around it — including the blur-revert and the
 * cross-component onChange chain into ColorPicker — was untested.
 */

function getValueInput() {
  return screen.getByLabelText('Color value') as HTMLInputElement
}

describe('ColorInput — uncontrolled text entry', () => {
  it('defaults to the given defaultValue', () => {
    render(<ColorInput defaultValue="#123456" />)
    expect(getValueInput()).toHaveValue('#123456')
  })

  it('calls onChange as soon as a valid hex is typed', () => {
    const onChange = vi.fn()
    render(<ColorInput onChange={onChange} />)
    fireEvent.change(getValueInput(), { target: { value: '#00ff00' } })
    expect(onChange).toHaveBeenCalledWith('#00ff00')
  })

  it('updates the displayed value while typing an incomplete hex, without calling onChange', () => {
    const onChange = vi.fn()
    render(<ColorInput onChange={onChange} />)
    fireEvent.change(getValueInput(), { target: { value: '#0f' } })
    expect(getValueInput()).toHaveValue('#0f')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reverts to defaultValue and reports it on blur when left invalid', () => {
    const onChange = vi.fn()
    render(<ColorInput defaultValue="#7a5cff" onChange={onChange} />)
    fireEvent.change(getValueInput(), { target: { value: 'not-a-color' } })
    fireEvent.blur(getValueInput())
    expect(getValueInput()).toHaveValue('#7a5cff')
    expect(onChange).toHaveBeenCalledWith('#7a5cff')
  })

  it('leaves a valid hex untouched on blur', () => {
    const onChange = vi.fn()
    render(<ColorInput defaultValue="#7a5cff" onChange={onChange} />)
    fireEvent.change(getValueInput(), { target: { value: '#00ff00' } })
    onChange.mockClear()
    fireEvent.blur(getValueInput())
    expect(getValueInput()).toHaveValue('#00ff00')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('accepts a 3-digit hex as valid and keeps it on blur', () => {
    render(<ColorInput defaultValue="#000000" />)
    fireEvent.change(getValueInput(), { target: { value: '#0f0' } })
    fireEvent.blur(getValueInput())
    expect(getValueInput()).toHaveValue('#0f0')
  })
})

describe('ColorInput — controlled value', () => {
  it('displays the controlled value rather than internal state', () => {
    render(<ColorInput value="#111111" onChange={() => {}} />)
    expect(getValueInput()).toHaveValue('#111111')
  })

  it('reports a valid typed hex via onChange without changing the displayed value itself', () => {
    // Controlled mode: the component never mutates its own display — the
    // parent must feed the new value back through the `value` prop.
    const onChange = vi.fn()
    render(<ColorInput value="#111111" onChange={onChange} />)
    fireEvent.change(getValueInput(), { target: { value: '#222222' } })
    expect(onChange).toHaveBeenCalledWith('#222222')
    expect(getValueInput()).toHaveValue('#111111')
  })

  it('reflects an updated controlled value after rerender', () => {
    const { rerender } = render(<ColorInput value="#111111" onChange={() => {}} />)
    rerender(<ColorInput value="#abcdef" onChange={() => {}} />)
    expect(getValueInput()).toHaveValue('#abcdef')
  })
})

describe('ColorInput — picker popover', () => {
  it('opens the ColorPicker when the swatch button is clicked', async () => {
    const user = userEvent.setup()
    render(<ColorInput defaultValue="#ff0000" />)
    await user.click(screen.getByLabelText('Pick color'))
    expect(screen.getByLabelText('HEX color value')).toBeInTheDocument()
  })

  it('does not open the ColorPicker when showPicker is false', async () => {
    const user = userEvent.setup()
    render(<ColorInput defaultValue="#ff0000" showPicker={false} />)
    await user.click(screen.getByLabelText('Pick color'))
    expect(screen.queryByLabelText('HEX color value')).not.toBeInTheDocument()
  })

  it('propagates a color picked in the ColorPicker back out through onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorInput defaultValue="#ff0000" onChange={onChange} />)
    await user.click(screen.getByLabelText('Pick color'))
    fireEvent.change(screen.getByLabelText('HEX color value'), { target: { value: '#00ff00' } })
    expect(onChange).toHaveBeenCalledWith('#00ff00')
    // Uncontrolled, so the outer text field reflects the pick too.
    expect(getValueInput()).toHaveValue('#00ff00')
  })

  it('passes custom presets through to the ColorPicker', async () => {
    const user = userEvent.setup()
    render(<ColorInput defaultValue="#ff0000" presets={['#123456']} />)
    await user.click(screen.getByLabelText('Pick color'))
    expect(screen.getByTitle('#123456')).toBeInTheDocument()
  })
})

describe('ColorInput — disabled', () => {
  it('disables the text input', () => {
    render(<ColorInput disabled />)
    expect(getValueInput()).toBeDisabled()
  })

  // BUG: the swatch button has no `disabled` attribute of its own — only a
  // `pointer-events-none` class on an ancestor wrapper. A CSS-blind dispatch
  // (as any programmatic click, and this test) still opens the picker on a
  // field the caller marked disabled.
  it('BUG: clicking the swatch still opens the picker while disabled (no disabled guard on the button itself)', () => {
    render(<ColorInput defaultValue="#ff0000" disabled />)
    fireEvent.click(screen.getByLabelText('Pick color'))
    expect(screen.getByLabelText('HEX color value')).toBeInTheDocument()
  })
})
