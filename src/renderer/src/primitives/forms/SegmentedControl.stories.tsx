import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent } from 'storybook/test'
import { Eye, Shield, Zap, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { SegmentedControl, type SegmentedTone } from './SegmentedControl'

const SIZES = ['xs', 'sm', 'md', 'lg'] as const
const TONES: SegmentedTone[] = ['default', 'accent', 'success', 'warning', 'error']

const VIEW = [
  { value: 'table', label: 'Table' },
  { value: 'json', label: 'JSON' },
  { value: 'chart', label: 'Chart' },
]

const meta: Meta<typeof SegmentedControl> = {
  title: 'Primitives/Forms/SegmentedControl',
  component: SegmentedControl,
  argTypes: {
    size: { control: 'select', options: SIZES },
    tone: { control: 'select', options: TONES },
    stretch: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof SegmentedControl>

/** Controlled, like every caller uses it. */
function Demo(props: Partial<React.ComponentProps<typeof SegmentedControl>>) {
  const [value, setValue] = useState('table')
  return (
    <SegmentedControl
      label="Result view"
      options={VIEW}
      value={value}
      onChange={setValue}
      {...props}
    />
  )
}

export const Default: Story = {
  render: () => <Demo />,
  play: async ({ canvas }) => {
    const json = canvas.getByRole('radio', { name: 'JSON' })
    await userEvent.click(json)
    await expect(json).toBeChecked()
    // One tab stop for the whole group: only the selected segment is reachable
    // by Tab, the rest by arrows.
    await expect(json).toHaveAttribute('tabindex', '0')
    await expect(canvas.getByRole('radio', { name: 'Table' })).toHaveAttribute('tabindex', '-1')
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-4">
      {SIZES.map((size) => (
        <div key={size} className="flex items-center gap-3">
          <span className="w-8 text-xs text-text-muted">{size}</span>
          <Demo size={size} />
        </div>
      ))}
    </div>
  ),
}

/** `tone` colours the selected label only — the chip stays neutral on every
 *  tone, so a row of segments never becomes a row of coloured blocks. */
export const Tones: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-4">
      {TONES.map((tone) => (
        <div key={tone} className="flex items-center gap-3">
          <span className="w-14 text-xs text-text-muted">{tone}</span>
          <Demo tone={tone} />
        </div>
      ))}
    </div>
  ),
}

/** An option may override the group's tone. This is the AI permission-mode
 *  picker, where each mode means something different — read-only is safe,
 *  auto is not — and the colour carries that. */
export const PerOptionTone: Story = {
  render: () => {
    const [mode, setMode] = useState('ask-write')
    return (
      <SegmentedControl
        label="Permission mode"
        size="xs"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'read-only', label: 'Read only', icon: <Eye size={11} />, tone: 'success' },
          { value: 'ask-write', label: 'Ask to write', icon: <Shield size={11} />, tone: 'accent' },
          { value: 'auto', label: 'Auto', icon: <Zap size={11} />, tone: 'error' },
        ]}
      />
    )
  },
}

/** Icon-only segments need `ariaLabel` — there's no text to name them. */
export const IconOnly: Story = {
  render: () => {
    const [align, setAlign] = useState('left')
    return (
      <SegmentedControl
        label="Align"
        value={align}
        onChange={setAlign}
        options={[
          { value: 'left', icon: <AlignLeft size={14} />, ariaLabel: 'Align left' },
          { value: 'center', icon: <AlignCenter size={14} />, ariaLabel: 'Align centre' },
          { value: 'right', icon: <AlignRight size={14} />, ariaLabel: 'Align right' },
        ]}
      />
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio', { name: 'Align centre' })).toBeInTheDocument()
  },
}

/** `stretch` shares the width evenly — for a modal footer or a full-width row,
 *  where segments hugging their labels look ragged. */
export const Stretch: Story = {
  render: () => (
    <div className="w-80">
      <Demo stretch />
    </div>
  ),
}

export const States: Story = {
  render: () => {
    const [v, setV] = useState('table')
    return (
      <div className="flex flex-col items-start gap-4">
        <div className="flex items-center gap-3">
          <span className="w-28 text-xs text-text-muted">default</span>
          <Demo />
        </div>
        <div className="flex items-center gap-3">
          <span className="w-28 text-xs text-text-muted">group disabled</span>
          <Demo disabled />
        </div>
        <div className="flex items-center gap-3">
          <span className="w-28 text-xs text-text-muted">one disabled</span>
          <SegmentedControl
            label="Result view"
            value={v}
            onChange={setV}
            options={[
              { value: 'table', label: 'Table' },
              { value: 'json', label: 'JSON' },
              { value: 'chart', label: 'Chart', disabled: true },
            ]}
          />
        </div>
        <p className="text-xs text-text-muted">
          A single disabled option dims only itself, not the whole track. Focus rings are
          keyboard-only — tab to the control, then use arrows.
        </p>
      </div>
    )
  },
}

/** Arrows move the selection, Home/End jump to the ends — the radiogroup
 *  contract. A segmented control is selected by arrowing, not by arrowing and
 *  then confirming. */
export const Keyboard: Story = {
  render: () => <Demo />,
  play: async ({ canvas }) => {
    const table = canvas.getByRole('radio', { name: 'Table' })
    table.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(canvas.getByRole('radio', { name: 'JSON' })).toBeChecked()
    await userEvent.keyboard('{End}')
    await expect(canvas.getByRole('radio', { name: 'Chart' })).toBeChecked()
    await userEvent.keyboard('{Home}')
    await expect(canvas.getByRole('radio', { name: 'Table' })).toBeChecked()
    // Wraps, so both ends stay one keystroke away.
    await userEvent.keyboard('{ArrowLeft}')
    await expect(canvas.getByRole('radio', { name: 'Chart' })).toBeChecked()
  },
}
