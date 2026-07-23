import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ConnectionFormView } from './ConnectionFormView'
import { useConnectionsStore } from '@/stores/connections'
import { useTabsStore } from '@/stores/tabs'
import type { ConnectionProfile } from '@shared/types'

function stubElectronAPI() {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: async () => [],
    on: () => () => {},
  }
}

const existing: ConnectionProfile = {
  id: 'c1',
  name: 'prod-orders',
  type: 'postgresql',
  host: 'db.prod',
  port: 5432,
  database: 'orders',
  username: 'app',
  password: '',
}

function seed(connections: ConnectionProfile[]) {
  stubElectronAPI()
  useConnectionsStore.setState({ connections, saveConnection: fn() as never })
  useTabsStore.setState({ closeTab: fn() as never })
}

const meta: Meta<typeof ConnectionFormView> = {
  title: 'Components/Connections/ConnectionFormView',
  component: ConnectionFormView,
  args: { tabId: 'tab-1' },
  decorators: [
    (Story) => (
      <div style={{ height: 640 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const NewConnection: Story = {
  beforeEach: () => {
    seed([])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('New Connection')).toBeVisible()
    expect(canvas.getByRole('button', { name: 'Add Connection' })).toBeVisible()
  },
}

export const EditingExisting: Story = {
  args: { editingId: 'c1' },
  beforeEach: () => {
    seed([existing])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Edit Connection')).toBeVisible()
    expect(canvas.getByDisplayValue('prod-orders')).toBeVisible()
    expect(canvas.getByRole('button', { name: 'Save Changes' })).toBeVisible()
  },
}

/** Typing a name and submitting calls saveConnection with the updated profile,
 *  then closes the tab. */
export const SubmitSavesAndCloses: Story = {
  beforeEach: () => {
    seed([])
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const nameInput = canvas.getByPlaceholderText('My Database')
    await userEvent.type(nameInput, 'My New DB')

    await userEvent.click(canvas.getByRole('button', { name: 'Add Connection' }))

    expect(useConnectionsStore.getState().saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My New DB' })
    )
    expect(useTabsStore.getState().closeTab).toHaveBeenCalledWith(args.tabId)
  },
}

/** Cancel closes the tab without saving. */
export const CancelClosesWithoutSaving: Story = {
  beforeEach: () => {
    seed([])
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Cancel' }))
    expect(useTabsStore.getState().closeTab).toHaveBeenCalledWith(args.tabId)
    expect(useConnectionsStore.getState().saveConnection).not.toHaveBeenCalled()
  },
}
