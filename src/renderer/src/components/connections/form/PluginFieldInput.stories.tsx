import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PluginFieldInput } from './PluginFieldInput'
import type { PluginField } from './types'

const meta: Meta<typeof PluginFieldInput> = {
  title: 'Components/Connections/PluginFieldInput',
  component: PluginFieldInput,
  args: {
    authStatus: 'idle',
    fetchableOptions: {},
    onChange: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

const textField: PluginField = { key: 'host', label: 'Host', type: 'text' }
const numberField: PluginField = { key: 'port', label: 'Port', type: 'number', default: 5432 }
const passwordField: PluginField = { key: 'password', label: 'Password', type: 'password' }
const staticSelectField: PluginField = {
  key: 'sslmode',
  label: 'SSL Mode',
  type: 'select',
  options: [
    { value: 'disable', label: 'Disable' },
    { value: 'require', label: 'Require' },
  ],
}
const fetchableSelectField: PluginField = { key: 'warehouse', label: 'Warehouse', type: 'select', fetchable: true }

export const TextInput: Story = {
  args: { field: textField, value: 'db.internal' },
}

export const NumberInput: Story = {
  args: { field: numberField, value: 5432 },
}

export const PasswordInput: Story = {
  args: { field: passwordField, value: 'secret' },
}

export const StaticSelect: Story = {
  args: { field: staticSelectField, value: 'require' },
}

/** A fetchable select before authentication: locked to a text input with a
 *  prompt to authenticate first, since there is nothing to pick from yet. */
export const FetchableSelectBeforeAuth: Story = {
  args: { field: fetchableSelectField, value: '', authStatus: 'idle' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByPlaceholderText('Authenticate first')
    expect(input).toBeDisabled()
  },
}

/** Once authenticated with fetched options, the field renders as a searchable
 *  select populated from `fetchableOptions`. */
export const FetchableSelectAfterAuth: Story = {
  args: {
    field: fetchableSelectField,
    value: 'ANALYTICS_WH',
    authStatus: 'authenticated',
    fetchableOptions: { warehouse: ['ANALYTICS_WH', 'REPORTING_WH'] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.findByText('ANALYTICS_WH')).resolves.toBeVisible()
  },
}

/** Typing into a plain text field calls onChange with each keystroke's value. */
export const TypingCallsOnChange: Story = {
  args: { field: textField, value: '' },
  render: function Render(args) {
    const [value, setValue] = useState(args.value)
    return (
      <PluginFieldInput
        {...args}
        value={value}
        onChange={(v) => {
          setValue(v)
          args.onChange(v)
        }}
      />
    )
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Host') as HTMLInputElement
    await userEvent.type(input, 'db.prod')
    expect(input.value).toBe('db.prod')
    expect(args.onChange).toHaveBeenCalled()
  },
}
