import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent, within } from 'storybook/test'
import { useState } from 'react'
import { Database, Search } from 'lucide-react'
import { Select } from './Select'
import type { SelectItem } from './Select'

const dbOptions: SelectItem[] = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'mongodb', label: 'MongoDB' },
]

const groupedOptions: SelectItem[] = [
  {
    label: 'Relational',
    options: [
      { value: 'postgresql', label: 'PostgreSQL' },
      { value: 'mysql', label: 'MySQL' },
      { value: 'sqlite', label: 'SQLite' },
    ],
  },
  {
    label: 'NoSQL',
    options: [
      { value: 'mongodb', label: 'MongoDB' },
      { value: 'redis', label: 'Redis' },
    ],
  },
]

const meta: Meta<typeof Select> = {
  title: 'Primitives/Forms/Select',
  component: Select,
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    disabled: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof Select>

export const Default: Story = {
  args: {
    size: 'md',
    value: '',
    options: dbOptions,
    placeholder: 'Choose a database\u2026',
    onChange: fn(),
    'aria-label': 'Database type',
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('combobox')

    await userEvent.click(trigger)

    const option = await within(document.body).findByText('PostgreSQL')
    await userEvent.click(option)
    await expect(args.onChange).toHaveBeenCalledWith('postgresql')
  },
}

export const WithValue: Story = {
  render: function Render() {
    const [value, setValue] = useState('mysql')
    return (
      <div style={{ width: 320 }}>
        <Select
          options={dbOptions}
          value={value}
          onChange={setValue}
          aria-label="Database type"
        />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('combobox')

    await expect(trigger).toHaveTextContent('MySQL')

    await userEvent.click(trigger)
    const option = await within(document.body).findByText('SQLite')
    await userEvent.click(option)

    await expect(trigger).toHaveTextContent('SQLite')
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-2" style={{ width: 320 }}>
      {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
        <Select
          key={size}
          size={size}
          options={dbOptions}
          value="postgresql"
          onChange={() => {}}
          aria-label={`Database type ${size}`}
        />
      ))}
    </div>
  ),
}

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-2" style={{ width: 320 }}>
      <Select
        size="md"
        options={dbOptions}
        value=""
        placeholder="Placeholder state"
        onChange={() => {}}
        aria-label="Placeholder select"
      />
      <Select
        size="md"
        options={dbOptions}
        value="postgresql"
        onChange={() => {}}
        aria-label="Selected select"
      />
      <Select
        size="md"
        options={dbOptions}
        value="postgresql"
        disabled
        onChange={() => {}}
        aria-label="Disabled select"
      />
    </div>
  ),
}

export const DisabledOptions: Story = {
  args: {
    size: 'md',
    options: [
      { value: 'postgresql', label: 'PostgreSQL' },
      { value: 'mysql', label: 'MySQL' },
      { value: 'sqlite', label: 'SQLite', disabled: true },
      { value: 'mongodb', label: 'MongoDB' },
    ],
    value: '',
    placeholder: 'Choose a database\u2026',
    onChange: fn(),
    'aria-label': 'Database type with disabled options',
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('combobox')
    await userEvent.click(trigger)

    const disabledOption = await within(document.body).findByText('SQLite')
    await expect(disabledOption.closest('[role="option"]')).toHaveAttribute('aria-disabled', 'true')
  },
}

export const Grouped: Story = {
  args: {
    size: 'md',
    value: '',
    options: groupedOptions,
    placeholder: 'Choose a database\u2026',
    onChange: fn(),
    'aria-label': 'Grouped database type',
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('combobox')
    await userEvent.click(trigger)

    const body = within(document.body)
    await expect(body.getByText('Relational')).toBeInTheDocument()
    await expect(body.getByText('NoSQL')).toBeInTheDocument()

    await userEvent.click(body.getByText('Redis'))
    await expect(args.onChange).toHaveBeenCalledWith('redis')
  },
}

export const KeyboardNavigation: Story = {
  args: {
    size: 'md',
    value: '',
    options: dbOptions,
    onChange: fn(),
    'aria-label': 'Keyboard navigation test',
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('combobox')

    // Open dropdown with click
    await userEvent.click(trigger)

    // Navigate down twice (starts at first option) and select with Enter
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')

    await expect(args.onChange).toHaveBeenCalledWith('sqlite')
  },
}

export const CustomRenderOption: Story = {
  render: function Render() {
    const [value, setValue] = useState('')
    const colorMap: Record<string, string> = {
      postgresql: '#336791',
      mysql: '#4479A1',
      sqlite: '#003B57',
      mongodb: '#47A248',
    }

    return (
      <div style={{ width: 320 }}>
        <Select
          size="md"
          value={value}
          onChange={setValue}
          options={dbOptions}
          placeholder="Choose a database\u2026"
          aria-label="Custom render database type"
          renderOption={(opt, { selected }) => (
            <>
              <span
                className="shrink-0 rounded-full"
                style={{ width: 8, height: 8, backgroundColor: colorMap[opt.value] ?? '#888' }}
              />
              <span className="truncate flex-1">{opt.label}</span>
              {selected && <span className="text-text-accent text-xs">&#10003;</span>}
            </>
          )}
          renderValue={(opt) =>
            opt ? (
              <span className="flex items-center gap-2 truncate">
                <span
                  className="shrink-0 rounded-full"
                  style={{ width: 8, height: 8, backgroundColor: colorMap[opt.value] ?? '#888' }}
                />
                {opt.label}
              </span>
            ) : undefined
          }
        />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('combobox')

    await userEvent.click(trigger)
    const option = await within(document.body).findByText('PostgreSQL')
    await userEvent.click(option)

    await expect(trigger).toHaveTextContent('PostgreSQL')
  },
}

/** Validity, mirroring Input's `state` exactly — the two are siblings, and
 *  before this Select had no error prop at all, so no form could mark a select
 *  invalid. Only the border and ring; the message belongs to FormField. */
export const ValidityStates: Story = {
  render: () => (
    <div className="flex w-60 flex-col gap-3">
      <Select aria-label="Default" value="postgresql" onChange={fn()} options={dbOptions} />
      <Select aria-label="Error" state="error" value="postgresql" onChange={fn()} options={dbOptions} />
      <Select aria-label="Success" state="success" value="postgresql" onChange={fn()} options={dbOptions} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('combobox', { name: 'Error' })).toHaveAttribute('aria-invalid', 'true')
    await expect(canvas.getByRole('combobox', { name: 'Default' })).not.toHaveAttribute('aria-invalid')
  },
}

/** A leading icon that says what's being chosen. */
export const WithPrefix: Story = {
  render: () => (
    <div className="flex w-60 flex-col gap-3">
      <Select
        aria-label="Database"
        prefix={<Database size={13} />}
        value="postgresql"
        onChange={fn()}
        options={dbOptions}
      />
      <Select
        aria-label="Searchable with icon"
        searchable
        prefix={<Search size={13} />}
        value="mysql"
        onChange={fn()}
        options={dbOptions}
      />
    </div>
  ),
}

/** `clearable` offers to unset the value once something is chosen. */
export const Clearable: Story = {
  render: () => {
    const [value, setValue] = useState('postgresql')
    return (
      <div className="w-60">
        <Select
          aria-label="Clearable"
          clearable
          value={value}
          onChange={setValue}
          onClear={() => setValue('')}
          options={dbOptions}
          placeholder="Select a driver…"
        />
      </div>
    )
  },
}
