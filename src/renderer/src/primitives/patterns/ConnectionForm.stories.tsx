import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { expect, userEvent } from 'storybook/test'
import { ConnectionFormView } from '@/components/connections/ConnectionFormView'
import { useConnectionsStore } from '@/stores/connections'
import type { ConnectionProfile } from '@shared/types'

/**
 * The connection form is rendered as a tab in the app
 * (`ConnectionFormView`). This story renders that real component so
 * Storybook documents what users actually see — no replica markup
 * assembled from primitives.
 *
 * Each story seeds the connections store via a decorator so the form has
 * something to read from / save into; the component itself is exactly the
 * one shipped.
 */
const EXISTING: ConnectionProfile = {
  id: 'edit-fixture-1',
  name: 'prod-orders',
  type: 'postgresql',
  host: 'db.prod.io',
  port: 5432,
  database: 'orders',
  username: 'app_reader',
  password: '',
  color: '#7c6ff7',
}

const meta: Meta<typeof ConnectionFormView> = {
  title: 'Patterns/ConnectionForm',
  component: ConnectionFormView,
  decorators: [
    (Story) => (
      <div className="w-160 h-175 bg-bg-primary border border-border-default rounded-md overflow-auto">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof ConnectionFormView>

export const New: Story = {
  args: { tabId: 'storybook-tab-new' },
  decorators: [
    (Story) => {
      useEffect(() => {
        useConnectionsStore.setState({ connections: [], connectedIds: new Set(), activeConnectionId: null })
      }, [])
      return <Story />
    },
  ],
  play: async ({ canvas }) => {
    // Typing into the controlled "Connection Name" field updates its value.
    const nameInput = canvas.getByLabelText('Connection Name')
    await userEvent.type(nameInput, 'staging-orders')
    await expect(nameInput).toHaveValue('staging-orders')

    // The "Auto-commit by default" checkbox defaults to checked; toggling it
    // flips the underlying draft state.
    const autoCommit = canvas.getByRole('checkbox', { name: 'Auto-commit by default' })
    await expect(autoCommit).toBeChecked()
    await userEvent.click(autoCommit)
    await expect(autoCommit).not.toBeChecked()
  },
}

export const Edit: Story = {
  args: { tabId: 'storybook-tab-edit', editingId: EXISTING.id },
  decorators: [
    (Story) => {
      useEffect(() => {
        useConnectionsStore.setState({
          connections: [EXISTING],
          connectedIds: new Set([EXISTING.id]),
          activeConnectionId: EXISTING.id,
        })
      }, [])
      return <Story />
    },
  ],
}
