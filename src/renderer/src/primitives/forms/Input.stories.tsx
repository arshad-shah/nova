import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { fn, expect, userEvent } from 'storybook/test'
import { Search, Mail, Calendar, User } from 'lucide-react'
import { Input } from './Input'
import { FormField } from './FormField'

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const
const STATES = ['default', 'error', 'success'] as const

const meta: Meta<typeof Input> = {
  title: 'Primitives/Forms/Input',
  component: Input,
  argTypes: {
    size: { control: 'select', options: SIZES },
    state: { control: 'inline-radio', options: STATES },
    clearable: { control: 'boolean' },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    limit: { control: 'number' },
    placeholder: { control: 'text' },
  },
}
export default meta
type Story = StoryObj<typeof Input>

export const Default: Story = {
  args: {
    size: 'md',
    placeholder: 'Enter value…',
    className: 'w-70',
    onChange: fn(),
  },
  play: async ({ args, canvas }) => {
    const input = canvas.getByRole('textbox')
    await userEvent.type(input, 'hello')
    await expect(args.onChange).toHaveBeenCalled()
  },
}

/** Five tiers, not the kit's three. They're wired to the `--field-*` density
 *  tokens, so one `[data-density]` flip on `<html>` rescales every field at
 *  once — hardcoding three heights would opt Input out of compact/comfortable
 *  mode. The kit's 32/40/48 are three of these rungs. */
export const Sizes: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-3">
      {SIZES.map((size) => (
        <div key={size} className="flex items-center gap-3">
          <span className="w-6 text-xs text-text-muted">{size}</span>
          <Input size={size} placeholder="Enter text…" aria-label={size} />
        </div>
      ))}
    </div>
  ),
}

/** Every state the field can be in. The focus ring is the theme's accent, not
 *  the kit's blue — focus follows `--color-focus-ring`, so on another theme
 *  it's that theme's colour. */
export const States: Story = {
  render: () => (
    <div className="grid w-[560px] grid-cols-2 gap-4">
      <Input placeholder="Enter text…" aria-label="Default" />
      <Input defaultValue="Entered text" aria-label="Filled" />
      <Input placeholder="Enter text…" disabled aria-label="Disabled" />
      <Input placeholder="Enter text…" loading aria-label="Loading" />
      <Input defaultValue="Bad value" state="error" aria-label="Error" />
      <Input defaultValue="Good value" state="success" aria-label="Success" />
      <p className="col-span-2 text-xs text-text-muted">
        Hover and focus are live — click into a field to see the ring.
      </p>
    </div>
  ),
}

/** `prefix` and `suffix` take any node. They're decorative: clicking one lands
 *  in the field rather than doing nothing. */
export const Affixes: Story = {
  render: () => (
    <div className="grid w-[560px] grid-cols-2 gap-4">
      <Input prefix={<Search size={14} />} placeholder="Search…" aria-label="Search prefix" />
      <Input suffix={<Search size={14} />} placeholder="Search…" aria-label="Search suffix" />
      <Input prefix={<Mail size={14} />} placeholder="Email address" aria-label="Email" />
      <Input suffix={<span className="text-xs">$</span>} placeholder="Enter amount…" aria-label="Amount" />
      <Input prefix={<Calendar size={14} />} placeholder="Select date…" aria-label="Date" />
      <Input
        prefix={<User size={14} />}
        suffix={<span className="text-xs">@verql.dev</span>}
        placeholder="username"
        aria-label="Both ends"
      />
    </div>
  ),
}

/** The clear button appears once there's a value, and puts the caret back in
 *  the field — clearing is a step in typing, not the end of it. */
export const Clearable: Story = {
  render: () => {
    const [value, setValue] = useState('orders')
    return (
      <div className="w-80">
        <Input
          clearable
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onClear={() => setValue('')}
          prefix={<Search size={14} />}
          placeholder="Search…"
          aria-label="Clearable"
        />
      </div>
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Clear' }))
    await expect(canvas.getByLabelText('Clearable')).toHaveValue('')
  },
}

/** The counter lives inside the field. Past `limit` the field flips itself to
 *  error — it is invalid by its own rule at that point, whether or not the
 *  caller noticed. */
export const CharacterCounter: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-3">
      <Input limit={100} placeholder="Enter text…" aria-label="Empty" />
      <Input limit={100} defaultValue="This is a sample text input" aria-label="Partial" />
      <Input limit={20} defaultValue="This one is definitely past the limit" aria-label="Over" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Over')).toHaveAttribute('aria-invalid', 'true')
    await expect(canvas.getByLabelText('Partial')).not.toHaveAttribute('aria-invalid')
  },
}

/** The label and the line underneath belong to `FormField`, not to Input — a
 *  field with its own `label` prop would mean two ways to write the same form.
 *  One message shows at a time, in order of urgency: error, then success, then
 *  hint. The fourth field passes all three and shows only the error. */
export const WithLabelAndMessage: Story = {
  render: () => (
    <div className="grid w-[560px] grid-cols-2 gap-4">
      <FormField label="Label" hint="Helper text goes here">
        <Input placeholder="Enter text…" />
      </FormField>
      <FormField label="Label" error="Error message">
        <Input state="error" placeholder="Enter text…" />
      </FormField>
      <FormField label="Label" success="Success message">
        <Input state="success" placeholder="Enter text…" />
      </FormField>
      <FormField label="Label" error="Error message" success="not shown" hint="not shown">
        <Input state="error" placeholder="Enter text…" />
      </FormField>
    </div>
  ),
}
