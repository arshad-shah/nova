import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent } from 'storybook/test'
import { Switch } from './Switch'

const meta: Meta<typeof Switch> = {
  title: 'Primitives/Forms/Switch',
  component: Switch,
  argTypes: {
    disabled: { control: 'boolean' },
    defaultChecked: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof Switch>

export const Default: Story = {
  args: {
    label: 'Enable feature',
    onChange: fn(),
  },
  play: async ({ args, canvas }) => {
    const switchEl = canvas.getByRole('switch')
    await userEvent.click(switchEl)
    await expect(args.onChange).toHaveBeenCalledOnce()
  },
}

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {[
        { label: 'Off', defaultChecked: false },
        { label: 'On', defaultChecked: true },
        { label: 'Disabled off', disabled: true },
        { label: 'Disabled on', defaultChecked: true, disabled: true },
      ].map(({ label, ...props }) => (
        // The Switch renders its own <label>, so pair it with text in a plain row.
        <div key={label} className="flex items-center gap-2 text-sm text-text-primary">
          <Switch label={label} {...props} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} className="flex items-center gap-2 text-sm text-text-primary">
          <Switch label={`${size} off`} size={size} />
          <Switch label={`${size} on`} size={size} defaultChecked />
          <span className="text-text-secondary">{size}</span>
        </div>
      ))}
    </div>
  ),
}

/** Verifies the toggle reads cleanly on every bundled theme. */
export const Themes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {['ion', 'nightshift', 'dark', 'light', 'midnight', 'dracula', 'nord', 'solarized', 'catppuccin', 'lab', 'inkpaper'].map(
        (theme) => (
          <div
            key={theme}
            data-theme={theme}
            className="flex items-center gap-4 rounded-lg border border-border-default bg-bg-primary p-3"
          >
            <span className="w-24 text-xs text-text-secondary">{theme}</span>
            <Switch label={`${theme} off`} />
            <Switch label={`${theme} on`} defaultChecked />
            <Switch label={`${theme} disabled`} defaultChecked disabled />
          </div>
        )
      )}
    </div>
  ),
}
