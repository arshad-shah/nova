import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { Label } from './Label'

const meta: Meta<typeof Label> = {
  title: 'Primitives/Forms/Label',
  component: Label,
}
export default meta
type Story = StoryObj<typeof Label>

export const Default: Story = {
  args: {
    children: 'Database host',
  },
  play: async ({ canvas }) => {
    const label = canvas.getByText('Database host')
    await expect(label).toBeInTheDocument()
    await expect(label.tagName.toLowerCase()).toBe('label')
  },
}

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(['3xs', '2xs', 'sm', 'md', 'lg'] as const).map((size) => (
        <Label key={size} size={size}>
          {`Label size="${size}"`}
        </Label>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Label size="md"')).toBeInTheDocument()
  },
}

export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Default label */}
      <div>
        <Label>Default label</Label>
      </div>

      {/* Label linked to an input via htmlFor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Label htmlFor="host-input">Database host</Label>
        <input
          id="host-input"
          type="text"
          placeholder="localhost"
          style={{
            padding: '4px 8px',
            borderRadius: 4,
            border: '1px solid var(--color-border-default)',
            background: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)',
            fontSize: 13,
          }}
        />
      </div>

      {/* Label with custom className override */}
      <div>
        <Label className="text-xs uppercase tracking-widest opacity-60">
          Section header label
        </Label>
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    const defaultLabel = canvas.getByText('Default label')
    await expect(defaultLabel).toBeInTheDocument()

    const linkedLabel = canvas.getByText('Database host')
    await expect(linkedLabel).toHaveAttribute('for', 'host-input')

    const customLabel = canvas.getByText('Section header label')
    await expect(customLabel).toBeInTheDocument()
  },
}
