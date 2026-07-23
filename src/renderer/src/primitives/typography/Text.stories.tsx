import type { Meta, StoryObj } from '@storybook/react-vite'
import { Text } from './Text'

const meta = {
  title: 'Primitives/Typography/Text',
  component: Text,
  argTypes: {
    size: {
      control: 'select',
      options: ['3xs', '2xs', 'xs', 'sm', 'base', 'lg', 'xl'],
    },
    color: {
      control: 'select',
      options: ['primary', 'secondary', 'muted', 'disabled', 'accent', 'success', 'warning', 'error'],
    },
    weight: {
      control: 'select',
      options: ['normal', 'medium', 'semibold', 'bold'],
    },
    truncate: { control: 'boolean' },
  },
} satisfies Meta<typeof Text>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    size: 'sm',
    color: 'primary',
    weight: 'normal',
    children: 'The quick brown fox jumps over the lazy dog',
  },
}

export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Sizes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['3xs', '2xs', 'xs', 'sm', 'base', 'lg', 'xl'] as const).map((size) => (
            <Text key={size} size={size}>
              size="{size}" — The quick brown fox
            </Text>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Colors</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['primary', 'secondary', 'muted', 'disabled', 'accent', 'success', 'warning', 'error'] as const).map((color) => (
            <Text key={color} color={color}>
              color="{color}" — The quick brown fox
            </Text>
          ))}
        </div>
      </div>
    </div>
  ),
}

/**
 * The two sub-`xs` steps (`3xs` = 10px, `2xs` = 11px) exist for the app's
 * densest chrome, where 12px reads too large. Shown here in the surfaces that
 * actually use them — a tree row, a status-bar segment, an uppercase section
 * label — rather than as isolated lorem, so the tight per-step line-heights are
 * visible in context. See issue #173 and the `renderer-no-arbitrary-font-size`
 * guard.
 */
export const DenseChrome: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 320 }}>
      {/* Explorer tree row: name + trailing type meta at 3xs */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
          Tree row — <code>3xs</code> type meta
        </div>
        <div className="flex items-center gap-2 rounded px-2 py-1 bg-bg-secondary">
          <Text size="sm" truncate>
            users_account_settings
          </Text>
          <Text size="3xs" color="muted" className="ml-auto shrink-0 tabular-nums">
            varchar(255)
          </Text>
        </div>
      </div>

      {/* Status-bar segment strip at 2xs */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
          Status bar — <code>2xs</code> segments
        </div>
        <div className="inline-flex items-center gap-3 rounded bg-bg-secondary px-2 py-1">
          <Text size="2xs" color="muted">
            postgres · public
          </Text>
          <Text size="2xs" color="muted" className="tabular-nums">
            42 rows · 8ms
          </Text>
        </div>
      </div>

      {/* Uppercase section header at 3xs — the shell/explorer group-header idiom */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
          Section label — <code>3xs</code> uppercase
        </div>
        <Text size="3xs" color="muted" weight="medium" className="uppercase tracking-wider">
          Tables
        </Text>
      </div>
    </div>
  ),
}
