import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { FetchableFieldsWizard } from './FetchableFieldsWizard'
import type { AuthStatus, PluginField } from './types'

const fetchableFields: PluginField[] = [
  { key: 'role', label: 'Role', type: 'select', step: 1, fetchable: true },
  { key: 'warehouse', label: 'Warehouse', type: 'select', step: 1, fetchable: true },
  { key: 'database', label: 'Database', type: 'select', step: 2, fetchable: true },
]

const meta: Meta<typeof FetchableFieldsWizard> = {
  title: 'Components/Connections/FetchableFieldsWizard',
  component: FetchableFieldsWizard,
  args: {
    fetchableFields,
    profile: {},
    fetchableOptions: {},
    authStatus: 'idle',
    authError: '',
    completedSteps: new Set<number>(),
    onAuthenticate: fn(),
    onStepComplete: fn(),
    onFieldChange: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const NotAuthenticated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('button', { name: 'Authenticate' })).toBeVisible()
    expect(canvas.queryByLabelText('Role')).not.toBeInTheDocument()
  },
}

export const Authenticating: Story = {
  args: { authStatus: 'authenticating' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('button', { name: /Authenticating/ })).toBeDisabled()
  },
}

export const AuthError: Story = {
  args: { authStatus: 'error', authError: 'Invalid credentials' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Invalid credentials')).toBeVisible()
  },
}

/** Authenticated: step 1's fields become active and fetchable options are
 *  rendered as selects. */
export const AuthenticatedStepOneActive: Story = {
  args: {
    authStatus: 'authenticated',
    fetchableOptions: { role: ['SYSADMIN'], warehouse: ['ANALYTICS_WH'] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByLabelText('Role')).toBeVisible()
    expect(canvas.getByLabelText('Warehouse')).toBeVisible()
    // Step 2 hasn't opened yet.
    expect(canvas.queryByLabelText('Database')).not.toBeInTheDocument()
  },
}

/** Completing step 1 reveals step 2's fields. */
export const CompletingStepAdvances: Story = {
  args: {
    authStatus: 'authenticated',
    fetchableOptions: { role: ['SYSADMIN'], warehouse: ['ANALYTICS_WH'], database: ['ANALYTICS'] },
  },
  render: function Render(args) {
    const [completed, setCompleted] = useState<Set<number>>(new Set())
    return (
      <FetchableFieldsWizard
        {...args}
        completedSteps={completed}
        onStepComplete={(step) => {
          setCompleted((prev) => new Set([...prev, step]))
          args.onStepComplete(step)
        }}
      />
    )
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.queryByLabelText('Database')).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'Continue' }))
    expect(args.onStepComplete).toHaveBeenCalledWith(1)
    expect(await canvas.findByLabelText('Database')).toBeVisible()
  },
}
