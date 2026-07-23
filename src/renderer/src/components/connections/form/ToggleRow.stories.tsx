import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ToggleRow } from './ToggleRow'

const meta: Meta<typeof ToggleRow> = {
  title: 'Components/Connections/ToggleRow',
  component: ToggleRow,
  args: {
    label: 'Auto-commit each statement',
    checked: false,
    onChange: fn(),
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Unchecked: Story = {}

export const Checked: Story = {
  args: { checked: true },
}

/** Clicking the label toggles the checkbox via the native <label> association,
 *  and clicking the checkbox itself calls onChange with the new value. */
export const ClickToToggle: Story = {
  render: function Render(args) {
    const [checked, setChecked] = useState(args.checked)
    return (
      <ToggleRow
        {...args}
        checked={checked}
        onChange={(next) => {
          setChecked(next)
          args.onChange(next)
        }}
      />
    )
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const checkbox = canvas.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()

    // Click the text label — the native <label> forwards the click to the input.
    await userEvent.click(canvas.getByText(args.label as string))
    expect(checkbox).toBeChecked()
    expect(args.onChange).toHaveBeenLastCalledWith(true)

    await userEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
    expect(args.onChange).toHaveBeenLastCalledWith(false)
  },
}
