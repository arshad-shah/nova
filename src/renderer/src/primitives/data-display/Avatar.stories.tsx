import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { Sparkles, AlertTriangle, Database } from 'lucide-react'
import { Avatar, type AvatarStatus } from './Avatar'
import { AvatarLabel } from './AvatarLabel'
import { Badge } from './Badge'
import { Button } from '../forms/Button'

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const
const TONES = ['identity', 'accent', 'neutral', 'success', 'warning', 'error'] as const
const STATUSES: AvatarStatus[] = ['connected', 'disconnected', 'active', 'degraded', 'error']

const meta = {
  title: 'Primitives/Data Display/Avatar',
  component: Avatar,
  argTypes: {
    size: { control: 'select', options: SIZES },
    shape: { control: 'inline-radio', options: ['circle', 'squircle'] },
    tone: { control: 'select', options: TONES },
    status: { control: 'select', options: [undefined, ...STATUSES] },
    selected: { control: 'boolean' },
    disabled: { control: 'boolean' },
    name: { control: 'text' },
  },
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { name: 'db-tools', size: 'md', tone: 'identity', shape: 'squircle' },
}

/** 16 / 24 / 32 / 48 / 64. */
export const Sizes: Story = {
  args: { name: 'db-tools' },
  render: () => (
    <div className="flex items-end gap-4">
      {SIZES.map((size) => (
        <div key={size} className="text-center">
          <Avatar name="db-tools" size={size} tone="identity" shape="squircle" />
          <div className="mt-2 text-[10px] text-text-muted">{size}</div>
        </div>
      ))}
    </div>
  ),
}

/** What fills the tile, in precedence order: an image beats an icon, an icon
 *  beats the letter. The letter is a *single* letter — a two-word split is a
 *  person-name algorithm, and `prod-replica` has no surname. */
export const Content: Story = {
  args: { name: 'db-tools' },
  render: () => (
    <div className="flex items-center gap-6">
      <div className="text-center">
        <Avatar
          name="Snowflake"
          size="lg"
          shape="squircle"
          tone="identity"
          src="https://www.snowflake.com/wp-content/themes/snowflake/assets/img/brand-guidelines/logo-sno-blue.svg"
        />
        <div className="mt-2 text-[10px] text-text-muted">image — a plugin logo</div>
      </div>
      <div className="text-center">
        <Avatar name="db-tools" size="lg" shape="squircle" tone="identity" />
        <div className="mt-2 text-[10px] text-text-muted">letter + identity hue</div>
      </div>
      <div className="text-center">
        <Avatar name="Assistant" size="lg" icon={<Sparkles className="h-5 w-5" />} />
        <div className="mt-2 text-[10px] text-text-muted">icon</div>
      </div>
    </div>
  ),
}

/** `shape` is why this redesign happened. Avatar hardcoded `rounded-full`, so
 *  the plugin list forked its own icon component to get a squircle. Circle for
 *  agents; squircle for software. */
export const Shapes: Story = {
  args: { name: 'db-tools' },
  render: () => (
    <div className="flex items-center gap-6">
      {(['circle', 'squircle'] as const).map((shape) => (
        <div key={shape} className="text-center">
          <div className="flex gap-2">
            <Avatar name="Assistant" size="lg" shape={shape} icon={<Sparkles className="h-5 w-5" />} />
            <Avatar name="db-tools" size="lg" shape={shape} tone="identity" />
          </div>
          <div className="mt-2 text-[10px] text-text-muted">{shape}</div>
        </div>
      ))}
    </div>
  ),
}

/** `identity` is a name-derived hue for an entity with no icon of its own. It
 *  has its own palette rather than hashing across the semantic tokens — that
 *  would paint a perfectly healthy plugin red. The other tones are a wash of a
 *  semantic colour, which is what the AI assistant uses. */
export const Tones: Story = {
  args: { name: 'db-tools' },
  render: () => (
    <div className="flex items-center gap-4">
      {TONES.map((tone) => (
        <div key={tone} className="text-center">
          <Avatar
            name="Verql"
            size="lg"
            tone={tone}
            shape={tone === 'identity' ? 'squircle' : 'circle'}
            icon={tone === 'identity' ? undefined : <Database className="h-5 w-5" />}
          />
          <div className="mt-2 text-[10px] text-text-muted">{tone}</div>
        </div>
      ))}
    </div>
  ),
}

/** Eight identity hues, seeded on the name — the same entity is the same colour
 *  on every run, and the palette is theme-controlled. */
export const IdentityPalette: Story = {
  args: { name: 'db-tools' },
  render: () => (
    <div className="flex gap-2">
      {['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'snowflake', 'db-tools', 'core-themes'].map(
        (n) => (
          <Avatar key={n} name={n} size="lg" shape="squircle" tone="identity" />
        )
      )}
    </div>
  ),
}

/** Lifecycle, not presence. Nothing in Verql is online, busy or away — there's
 *  nobody here to be away. Connections are connected or not; plugins are
 *  active, degraded or errored. The dot composes `BadgeIndicator` rather than
 *  becoming the app's tenth hand-rolled status dot. */
export const Status: Story = {
  args: { name: 'db-tools' },
  render: () => (
    <div className="flex items-center gap-5">
      {STATUSES.map((status) => (
        <div key={status} className="text-center">
          <Avatar name="prod-replica" size="lg" tone="identity" shape="squircle" status={status} />
          <div className="mt-2 text-[10px] text-text-muted">{status}</div>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('img', { name: 'prod-replica' })).toHaveLength(STATUSES.length)
  },
}

/** The dot stays proportionate across the size scale. */
export const StatusAcrossSizes: Story = {
  args: { name: 'db-tools' },
  render: () => (
    <div className="flex items-end gap-4">
      {SIZES.map((size) => (
        <Avatar key={size} name="prod-replica" size={size} tone="identity" status="connected" />
      ))}
    </div>
  ),
}

/** The most-repeated avatar shape in the app — the connection list and the
 *  plugin list each build this by hand today. Truncation is the point: a
 *  connection subtitle is a full DSN and overflows a narrow sidebar. */
export const WithLabel: Story = {
  args: { name: 'db-tools' },
  render: () => (
    <div className="w-72 space-y-2 rounded-lg border border-border-default bg-bg-secondary p-3">
      <AvatarLabel
        avatar={<Avatar name="prod-replica" size="md" tone="identity" status="connected" />}
        title="prod-replica"
        subtitle="app@10.2.0.4:5432/orders"
        mono
        trailing={<Badge tone="success">Live</Badge>}
      />
      <AvatarLabel
        avatar={<Avatar name="db-tools" size="md" shape="squircle" tone="identity" status="active" />}
        title="db-tools"
        subtitle="v1.4.1 · built-in"
        mono
        trailing={<Badge tone="accent">Active</Badge>}
      />
      <AvatarLabel
        avatar={<Avatar name="analytics-warehouse-eu-west" size="md" tone="identity" status="disconnected" />}
        title="analytics-warehouse-eu-west-1-primary"
        subtitle="readonly@analytics.internal.example.com:5432/warehouse"
        mono
        trailing={<Badge>Idle</Badge>}
      />
      <p className="pt-1 text-[10px] text-text-muted">
        The last row overflows on both lines — it truncates instead of pushing the badge off.
      </p>
    </div>
  ),
}

/** The AI assistant, which is the only thing using Avatar today. It's always
 *  icon-mode; `name` exists purely as the accessible name. The error case used
 *  to be a hand-written className on the caller — it's a tone now. */
export const AssistantIdentity: Story = {
  args: { name: 'db-tools' },
  render: () => (
    <div className="flex items-center gap-6">
      <div className="text-center">
        <Avatar name="Assistant" size="sm" icon={<Sparkles className="h-3.5 w-3.5" />} />
        <div className="mt-2 text-[10px] text-text-muted">assistant</div>
      </div>
      <div className="text-center">
        <Avatar
          name="Assistant"
          size="sm"
          tone="error"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
        />
        <div className="mt-2 text-[10px] text-text-muted">assistant — failed</div>
      </div>
    </div>
  ),
}

/** `selected` rings the tile so it reads on an image as well as a letter.
 *  `disabled` greys a deactivated plugin.
 *
 *  There's no `interactive` prop: a clickable avatar is a button, and the design
 *  system already has one. `Button variant="bare" size="none"` brings real focus,
 *  keyboard and disabled handling — a span with `role="button"` would fake half
 *  of it. */
export const States: Story = {
  args: { name: 'db-tools' },
  render: () => (
    <div className="flex items-center gap-6">
      <div className="text-center">
        <Avatar name="db-tools" size="lg" shape="squircle" tone="identity" />
        <div className="mt-2 text-[10px] text-text-muted">default</div>
      </div>
      <div className="text-center">
        <Avatar name="db-tools" size="lg" shape="squircle" tone="identity" selected />
        <div className="mt-2 text-[10px] text-text-muted">selected</div>
      </div>
      <div className="text-center">
        <Avatar name="db-tools" size="lg" shape="squircle" tone="identity" disabled />
        <div className="mt-2 text-[10px] text-text-muted">disabled</div>
      </div>
      <div className="text-center">
        <Button variant="bare" size="none" className="rounded-[26%] hover:opacity-80">
          <Avatar name="db-tools" size="lg" shape="squircle" tone="identity" />
        </Button>
        <div className="mt-2 text-[10px] text-text-muted">clickable — wrapped in Button</div>
      </div>
    </div>
  ),
}
