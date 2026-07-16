import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge } from './Badge'

const meta = {
  title: 'Primitives/Data Display/Badge',
  component: Badge,
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'accent', 'success', 'warning', 'error', 'info', 'pk', 'fk', 'unique'],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
  },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    variant: 'accent',
    size: 'md',
    children: 'New',
  },
}

export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['default', 'accent', 'success', 'warning', 'error', 'info'] as const).map((variant) => (
            <Badge key={variant} tone={variant} size={size}>{variant}</Badge>
          ))}
        </div>
      ))}
    </div>
  ),
}

/** Key kinds — the constraint badges rendered beside a column. PK reads
 *  violet, FK follows the data accent (cyan), and UNIQUE stays a neutral
 *  outline so it never competes with the two key kinds. */
export const KeyKinds: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(['xs', 'sm', 'md'] as const).map((size) => (
        <div key={size} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge tone="pk" size={size}>PK</Badge>
          <Badge tone="fk" size={size}>FK</Badge>
          <Badge tone="unique" size={size}>UNIQUE</Badge>
        </div>
      ))}
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
        <Badge key={size} tone="accent" size={size}>{size}</Badge>
      ))}
    </div>
  ),
}
