import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { NotificationsSidebar } from './NotificationsSidebar'
import { useNotificationsStore, type Notification } from '@/stores/notifications'

function seed(notifications: Notification[]) {
  return function Seeder() {
    useEffect(() => {
      useNotificationsStore.setState({ notifications })
    }, [])
    return <NotificationsSidebar />
  }
}

const sample: Notification[] = [
  {
    id: 'n1',
    type: 'error',
    title: 'Query failed',
    message: 'relation "orders" does not exist',
    source: { type: 'connection', id: 'c1', label: 'prod-orders' },
    timestamp: Date.now() - 1000,
    read: false,
  },
  {
    id: 'n2',
    type: 'info',
    title: 'Plugin installed',
    source: { type: 'plugin', id: 'p1', label: 'Snowflake' },
    timestamp: Date.now() - 60_000,
    read: true,
  },
]

const meta: Meta<typeof NotificationsSidebar> = {
  title: 'Components/Shell/NotificationsSidebar',
  component: NotificationsSidebar,
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 480 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  render: seed([]),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('All caught up')).toBeVisible()
  },
}

export const WithNotifications: Story = {
  render: seed(sample),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Query failed')).toBeVisible()
    expect(canvas.getByText('Plugin installed')).toBeVisible()
  },
}

/** Clicking an unread notification marks it read: its unread accent bar and
 *  emphasis go away, and once no unread remain "Mark all read" disappears. */
export const ClickMarksRead: Story = {
  render: seed([sample[0]]),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('button', { name: /mark all read/i })).toBeVisible()

    await userEvent.click(canvas.getByText('Query failed'))

    await waitFor(() => {
      expect(canvas.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument()
    })
  },
}

/** "Clear" empties the list and shows the empty state. */
export const ClearRemovesAll: Story = {
  render: seed(sample),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^clear$/i }))
    expect(await canvas.findByText('All caught up')).toBeVisible()
  },
}
