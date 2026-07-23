import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { AvatarLabel } from './AvatarLabel'
import { Avatar } from './Avatar'
import { Badge } from './Badge'

const GAPS = ['sm', 'md', 'lg'] as const

const meta = {
  title: 'Primitives/Data Display/AvatarLabel',
  component: AvatarLabel,
  argTypes: {
    gap: { control: 'inline-radio', options: GAPS },
    mono: { control: 'boolean' },
    title: { control: 'text' },
    subtitle: { control: 'text' },
    // avatar / trailing are ReactNode slots — set per-story, not via controls.
    avatar: { control: false },
    trailing: { control: false },
  },
  args: {
    avatar: <Avatar name="prod-replica" size="md" tone="identity" status="connected" />,
    title: 'prod-replica',
    subtitle: 'app@10.2.0.4:5432/orders',
    mono: true,
  },
} satisfies Meta<typeof AvatarLabel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Single-line: omit the subtitle and the row is just the avatar and a name. */
export const TitleOnly: Story = {
  args: { subtitle: undefined, mono: false, title: 'db-tools' },
}

/** The reason this primitive exists: a connection subtitle is a full DSN and a
 *  plugin's is a version string, both of which overflow a narrow sidebar. With
 *  `min-w-0` truncation, the long row clips instead of shoving `trailing` off
 *  the end. */
export const Truncation: Story = {
  render: (args) => (
    <div className="w-72 space-y-2 rounded-lg border border-border-default bg-bg-secondary p-3">
      <AvatarLabel
        {...args}
        avatar={<Avatar name="prod-replica" size="md" tone="identity" status="connected" />}
        title="prod-replica"
        subtitle="app@10.2.0.4:5432/orders"
        trailing={<Badge tone="success">Live</Badge>}
      />
      <AvatarLabel
        {...args}
        avatar={<Avatar name="analytics-warehouse-eu-west" size="md" tone="identity" status="disconnected" />}
        title="analytics-warehouse-eu-west-1-primary"
        subtitle="readonly@analytics.internal.example.com:5432/warehouse"
        trailing={<Badge>Idle</Badge>}
      />
      <p className="pt-1 text-[10px] text-text-muted">
        The second row overflows on both lines — it truncates rather than pushing the badge off.
      </p>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('prod-replica')).toBeVisible()
  },
}

/** `mono` renders the subtitle monospaced — DSNs and version strings are data,
 *  not prose, and line up better for scanning. */
export const MonoSubtitle: Story = {
  render: (args) => (
    <div className="w-72 space-y-3">
      <AvatarLabel {...args} mono={false} title="Readable prose subtitle" subtitle="Last synced 2 minutes ago" />
      <AvatarLabel {...args} mono title="db-tools" subtitle="v1.4.1 · built-in" />
    </div>
  ),
}

/** `trailing` pins content to the right of the row — a status chip, a version
 *  badge, an action. */
export const Trailing: Story = {
  args: {
    title: 'db-tools',
    subtitle: 'v1.4.1 · built-in',
    trailing: <Badge tone="accent">Active</Badge>,
    avatar: <Avatar name="db-tools" size="md" shape="squircle" tone="identity" status="active" />,
  },
}

/** `gap` tunes the space between the avatar and the text for the row's density. */
export const Gaps: Story = {
  render: (args) => (
    <div className="w-72 space-y-3">
      {GAPS.map((gap) => (
        <div key={gap}>
          <div className="mb-1 text-[10px] text-text-muted">gap={gap}</div>
          <AvatarLabel {...args} gap={gap} title="db-tools" subtitle="v1.4.1 · built-in" />
        </div>
      ))}
    </div>
  ),
}
