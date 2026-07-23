import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ConnectionSwitcher } from './ConnectionSwitcher'
import { useConnectionsStore } from '@/stores/connections'
import type { ConnectionProfile } from '@shared/types'

function stubElectronAPI() {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: async () => [],
    on: () => () => {},
  }
}

const connections: ConnectionProfile[] = [
  { id: 'c1', name: 'prod-orders', type: 'postgresql', host: 'db.prod', port: 5432, database: 'orders', username: 'app', password: '' },
  { id: 'c2', name: 'staging-orders', type: 'postgresql', host: 'db.stage', port: 5432, database: 'orders', username: 'app', password: '' },
  { id: 'c3', name: 'local-dev.db', type: 'sqlite', database: '/tmp/local-dev.db', username: '', password: '' },
]

function seed(activeConnectionId: string | null, connectedIds: string[]) {
  return function Seeder() {
    useEffect(() => {
      stubElectronAPI()
      useConnectionsStore.setState({
        connections,
        activeConnectionId,
        connectedIds: new Set(connectedIds),
      })
    }, [])
    return null
  }
}

const meta: Meta<typeof ConnectionSwitcher> = {
  title: 'Components/Shell/ConnectionSwitcher',
  component: ConnectionSwitcher,
  args: {
    isOpen: true,
    onClose: fn(),
    onNewConnection: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', height: 320 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {
  args: { isOpen: false },
  render: (args) => {
    const Seeder = seed('c1', ['c1'])
    return (
      <>
        <Seeder />
        <ConnectionSwitcher {...args} />
      </>
    )
  },
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelector('input')).toBeNull()
  },
}

export const OpenWithGroups: Story = {
  render: (args) => {
    const Seeder = seed('c1', ['c1', 'c2'])
    return (
      <>
        <Seeder />
        <ConnectionSwitcher {...args} />
      </>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('prod-orders')).toBeVisible()
    expect(canvas.getByText('staging-orders')).toBeVisible()
    expect(canvas.getByText('local-dev.db')).toBeVisible()
    expect(canvas.getByText('Active')).toBeVisible()
    expect(canvas.getByText('Connected')).toBeVisible()
    expect(canvas.getByText('Saved')).toBeVisible()
  },
}

/** Typing in the filter narrows the list to matching connections. */
export const FilterNarrowsList: Story = {
  render: (args) => {
    const Seeder = seed('c1', ['c1', 'c2'])
    return (
      <>
        <Seeder />
        <ConnectionSwitcher {...args} />
      </>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('prod-orders')
    const input = canvas.getByPlaceholderText(/filter/i)
    await userEvent.type(input, 'staging')
    expect(canvas.getByText('staging-orders')).toBeVisible()
    expect(canvas.queryByText('local-dev.db')).not.toBeInTheDocument()
    expect(canvas.queryByText('prod-orders')).not.toBeInTheDocument()
  },
}

/** Clicking an already-connected (non-active) connection activates it and
 *  closes the switcher — no reconnect round-trip needed. */
export const SelectConnectedActivates: Story = {
  render: (args) => {
    const Seeder = seed('c1', ['c1', 'c2'])
    return (
      <>
        <Seeder />
        <ConnectionSwitcher {...args} />
      </>
    )
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByText('staging-orders'))
    expect(useConnectionsStore.getState().activeConnectionId).toBe('c2')
    expect(args.onClose).toHaveBeenCalled()
  },
}

/** The "New connection" footer action opens the new-connection flow and closes. */
export const NewConnectionAction: Story = {
  render: (args) => {
    const Seeder = seed('c1', ['c1'])
    return (
      <>
        <Seeder />
        <ConnectionSwitcher {...args} />
      </>
    )
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByText(/new connection/i))
    expect(args.onNewConnection).toHaveBeenCalled()
    expect(args.onClose).toHaveBeenCalled()
  },
}
