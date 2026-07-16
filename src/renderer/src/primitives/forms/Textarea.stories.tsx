import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent } from 'storybook/test'
import { Textarea } from './Textarea'

const meta: Meta<typeof Textarea> = {
  title: 'Primitives/Forms/Textarea',
  component: Textarea,
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    error: { control: 'boolean' },
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' },
    rows: { control: 'number' },
  },
}
export default meta
type Story = StoryObj<typeof Textarea>

export const Default: Story = {
  args: {
    size: 'md',
    placeholder: 'Enter your message\u2026',
    rows: 4,
    style: { width: 320 },
    onChange: fn(),
  },
  play: async ({ args, canvas }) => {
    const textarea = canvas.getByRole('textbox')
    await userEvent.type(textarea, 'hello')
    await expect(args.onChange).toHaveBeenCalled()
  },
}

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-2" style={{ width: 320 }}>
      {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
        <Textarea key={size} size={size} rows={3} placeholder={`size="${size}"`} />
      ))}
    </div>
  ),
}

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-2" style={{ width: 320 }}>
      <Textarea size="md" rows={3} placeholder="Default" aria-label="Default" />
      <Textarea size="md" rows={3} error defaultValue="Error state" aria-label="Error" />
      <Textarea size="md" rows={3} disabled defaultValue="Disabled" aria-label="Disabled" />
    </div>
  ),
}

/** `surface` decides whether the field paints its own chrome.
 *  - `field` (default) — the standard bordered input surface.
 *  - `bare` — no border, fill or focus ring, for a field inside a surface that
 *    already owns the frame (e.g. the AI composer inside its Card). The
 *    surrounding box below stands in for that Card. */
export const Surface: Story = {
  render: () => (
    <div className="flex flex-col gap-4" style={{ width: 320 }}>
      <div>
        <p className="mb-1 text-xs text-text-muted">surface=&quot;field&quot; (default)</p>
        <Textarea size="md" rows={2} surface="field" placeholder="Bordered" aria-label="Field surface" />
      </div>
      <div>
        <p className="mb-1 text-xs text-text-muted">surface=&quot;bare&quot;, inside an owning surface</p>
        <div className="rounded-md border border-border-default bg-bg-tertiary">
          <Textarea size="md" rows={2} surface="bare" resize="none" placeholder="Chrome-less" aria-label="Bare surface" />
        </div>
      </div>
    </div>
  ),
}
