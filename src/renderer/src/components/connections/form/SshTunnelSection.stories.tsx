import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { SshTunnelSection } from './SshTunnelSection'
import type { MiddlewareField } from './types'

const sshFields: MiddlewareField[] = [
  { key: 'sshHost', label: 'SSH Host', type: 'text' },
  { key: 'sshPort', label: 'SSH Port', type: 'number', default: 22 },
  { key: 'sshUsername', label: 'SSH Username', type: 'text' },
]

const meta: Meta<typeof SshTunnelSection> = {
  title: 'Components/Connections/SshTunnelSection',
  component: SshTunnelSection,
  args: {
    sshFields,
    profile: {},
    authStatus: 'idle',
    fetchableOptions: {},
    onToggle: fn(),
    onFieldChange: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 460 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

/** Collapsed: only the header and its description are shown, no fields. */
export const Collapsed: Story = {
  args: { expanded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('SSH Tunnel')).toBeVisible()
    expect(canvas.queryByText('SSH Host')).not.toBeInTheDocument()
  },
}

/** Expanded: renders one PluginFieldInput per contributed SSH field. */
export const Expanded: Story = {
  args: { expanded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByLabelText('SSH Host')).toBeVisible()
    expect(canvas.getByLabelText('SSH Port')).toBeVisible()
    expect(canvas.getByLabelText('SSH Username')).toBeVisible()
  },
}

/** Clicking the header toggles expansion via onToggle. */
export const ClickHeaderToggles: Story = {
  render: function Render(args) {
    const [expanded, setExpanded] = useState(false)
    return (
      <SshTunnelSection
        {...args}
        expanded={expanded}
        onToggle={() => {
          setExpanded((e) => !e)
          args.onToggle()
        }}
      />
    )
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.queryByLabelText('SSH Host')).not.toBeInTheDocument()

    await userEvent.click(canvas.getByText('SSH Tunnel'))
    expect(args.onToggle).toHaveBeenCalledTimes(1)
    expect(await canvas.findByLabelText('SSH Host')).toBeVisible()
  },
}
