import { useEffect, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent } from 'storybook/test'
import { Checkbox } from './Checkbox'

const meta: Meta<typeof Checkbox> = {
  title: 'Primitives/Forms/Checkbox',
  component: Checkbox,
  argTypes: {
    disabled: { control: 'boolean' },
    defaultChecked: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof Checkbox>

export const Default: Story = {
  args: { 'aria-label': 'Toggle option', onChange: fn() },
  play: async ({ args, canvas }) => {
    const checkbox = canvas.getByRole('checkbox')
    await userEvent.click(checkbox)
    await expect(args.onChange).toHaveBeenCalledOnce()
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <label key={size} className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
          <Checkbox size={size} defaultChecked aria-label={`size ${size}`} />
          {size}
        </label>
      ))}
    </div>
  ),
}

/** Indeterminate is a DOM property, not an attribute — it can only be set via a
 *  ref. It represents "some but not all children selected" and takes precedence
 *  over `checked`, so the dash shows even on a checked box. */
export const Indeterminate: Story = {
  render: () => {
    function Tri({ checked, label }: { checked: boolean; label: string }) {
      const ref = useRef<HTMLInputElement>(null)
      useEffect(() => {
        if (ref.current) ref.current.indeterminate = true
      }, [])
      return (
        <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
          <Checkbox ref={ref} defaultChecked={checked} aria-label={label} />
          {label}
        </label>
      )
    }
    return (
      <div className="flex flex-col gap-3">
        <Tri checked={false} label="Indeterminate" />
        <Tri checked label="Indeterminate wins over checked" />
      </div>
    )
  },
}

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {[
        { label: 'Unchecked', defaultChecked: false },
        { label: 'Checked', defaultChecked: true },
        { label: 'Disabled', disabled: true },
        { label: 'Disabled + checked', defaultChecked: true, disabled: true },
      ].map(({ label, ...props }) => (
        <label key={label} className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
          <Checkbox {...props} />
          {label}
        </label>
      ))}
    </div>
  ),
}
