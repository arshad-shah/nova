import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { AboutModal } from './AboutModal'
import { IPC_CHANNELS } from '@shared/ipc'

function stubElectronAPI() {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: async (channel: string) => {
      if (channel === IPC_CHANNELS.APP_ABOUT_INFO) {
        return {
          name: 'Verql',
          version: '1.4.0',
          electron: '39.0.0',
          chrome: '138.0.0',
          node: '22.0.0',
          v8: '13.0.0',
          os: 'macOS 15.0',
          arch: 'arm64',
        }
      }
      return []
    },
    on: () => () => {},
  }
}

const meta: Meta<typeof AboutModal> = {
  title: 'Components/Shell/AboutModal',
  component: AboutModal,
  beforeEach: () => {
    stubElectronAPI()
  },
  args: {
    open: true,
    onClose: fn(),
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Verql')).toBeVisible()
    // Build info loads asynchronously via electronAPI.invoke.
    expect(await canvas.findByText('1.4.0', { exact: false })).toBeVisible()
    expect(canvas.getByText('39.0.0')).toBeVisible()
  },
}

export const Closed: Story = {
  args: { open: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Verql')).not.toBeVisible()
  },
}

/** Clicking the close (×) icon button calls onClose. */
export const CloseButton: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const [iconClose] = canvas.getAllByRole('button', { name: 'Close' })
    await userEvent.click(iconClose)
    expect(args.onClose).toHaveBeenCalled()
  },
}

/** Clicking "Copy" copies the build info and flips the icon/label to "Copied". */
export const CopyBuildInfo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('39.0.0')
    await userEvent.click(canvas.getByRole('button', { name: 'Copy' }))
    await waitFor(() => {
      expect(canvas.getByRole('button', { name: 'Copied' })).toBeVisible()
    })
  },
}
