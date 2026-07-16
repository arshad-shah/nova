import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent } from 'storybook/test'
import { Database, Terminal, Bell, Wifi, Bot } from 'lucide-react'
import { ToggleGroup, type ToggleTone } from './ToggleGroup'

const SIZES = ['xs', 'sm', 'md'] as const
const TONES: ToggleTone[] = ['default', 'accent', 'success', 'warning', 'error']

const KINDS = [
  { value: 'query', label: 'Query', icon: <Database size={12} /> },
  { value: 'log', label: 'Log', icon: <Terminal size={12} /> },
  { value: 'notification', label: 'Notification', icon: <Bell size={12} /> },
  { value: 'network', label: 'Network', icon: <Wifi size={12} /> },
  { value: 'tool', label: 'Tool', icon: <Bot size={12} /> },
]

const meta: Meta<typeof ToggleGroup> = {
  title: 'Primitives/Forms/ToggleGroup',
  component: ToggleGroup,
  argTypes: {
    size: { control: 'select', options: SIZES },
    tone: { control: 'select', options: TONES },
    wrap: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof ToggleGroup>

function Demo(props: Partial<React.ComponentProps<typeof ToggleGroup>>) {
  const [value, setValue] = useState<string[]>(['query'])
  return (
    <ToggleGroup
      label="Activity kinds"
      options={KINDS}
      value={value}
      onChange={setValue}
      {...props}
    />
  )
}

export const Default: Story = {
  render: () => <Demo />,
  play: async ({ canvas }) => {
    const log = canvas.getByRole('button', { name: 'Log' })
    await expect(log).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(log)
    await expect(log).toHaveAttribute('aria-pressed', 'true')
    // Independent, not exclusive: turning one on leaves the other on.
    await expect(canvas.getByRole('button', { name: 'Query' })).toHaveAttribute('aria-pressed', 'true')
    // And none-selected is a real state, unlike a radio group.
    await userEvent.click(log)
    await userEvent.click(canvas.getByRole('button', { name: 'Query' }))
    await expect(canvas.getByRole('button', { name: 'Query' })).toHaveAttribute('aria-pressed', 'false')
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

/** A pressed filter is a wash of its own meaning, not a solid fill — a row of
 *  solid chips would shout louder than the data it filters. */
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

/** Per-option tone. This is the activity level filter, where each level already
 *  has a colour and the filter should use it rather than invent one. */
export const PerOptionTone: Story = {
  render: () => {
    const [levels, setLevels] = useState<string[]>(['error', 'warn'])
    return (
      <ToggleGroup
        label="Levels"
        value={levels}
        onChange={setLevels}
        options={[
          { value: 'error', label: 'Error', tone: 'error' },
          { value: 'warn', label: 'Warn', tone: 'warning' },
          { value: 'info', label: 'Info', tone: 'accent' },
          { value: 'debug', label: 'Debug', tone: 'default' },
        ]}
      />
    )
  },
}

/** `wrap` lets a long filter row flow onto a second line rather than overflow.
 *  This is why ToggleGroup has no track: a recessed track can't wrap. */
export const Wrapping: Story = {
  render: () => (
    <div className="w-56 border border-dashed border-border-default p-2">
      <Demo wrap />
    </div>
  ),
}

export const States: Story = {
  render: () => (
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
        <ToggleGroup
          label="Activity kinds"
          value={['query']}
          onChange={() => {}}
          options={[
            { value: 'query', label: 'Query', icon: <Database size={12} /> },
            { value: 'log', label: 'Log', icon: <Terminal size={12} /> },
            { value: 'network', label: 'Network', icon: <Wifi size={12} />, disabled: true },
          ]}
        />
      </div>
      <p className="text-xs text-text-muted">
        Every toggle is its own tab stop — independent controls are reached by Tab, not arrows.
      </p>
    </div>
  ),
}
