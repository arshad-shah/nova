import type { Meta, StoryObj } from '@storybook/react-vite'
import { List } from './List'
import { Table2 } from 'lucide-react'

const meta = {
  title: 'Primitives/Data Display/List',
  component: List,
} satisfies Meta<typeof List>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div style={{ width: 240, border: '1px solid var(--color-border-default)', borderRadius: 8, overflow: 'hidden' }}>
      <List>
        {['Tables', 'Views', 'Indexes', 'Functions', 'Triggers', 'Sequences'].map((item) => (
          <List.Item key={item} style={{ cursor: 'pointer', borderBottom: '1px solid var(--color-border-subtle)' }}>
            {item}
          </List.Item>
        ))}
      </List>
    </div>
  ),
}

/** `marker` decides what kind of list this is.
 *  - `stack` (default) — a flex column of rows, for the app's own lists.
 *  - `disc` / `decimal` — real prose bullets. These deliberately drop `flex`,
 *    because a flex container suppresses list markers entirely. `ordered`
 *    switches the element to `<ol>`. */
export const Markers: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 40 }}>
      <div>
        <p className="mb-2 text-xs text-text-muted">stack (default)</p>
        <List marker="stack" style={{ width: 160 }}>
          {['Tables', 'Views', 'Indexes'].map((i) => <List.Item key={i}>{i}</List.Item>)}
        </List>
      </div>
      <div>
        <p className="mb-2 text-xs text-text-muted">disc</p>
        <List marker="disc" style={{ width: 160 }}>
          {['Tables', 'Views', 'Indexes'].map((i) => <List.Item key={i} size="none">{i}</List.Item>)}
        </List>
      </div>
      <div>
        <p className="mb-2 text-xs text-text-muted">decimal + ordered</p>
        <List ordered marker="decimal" style={{ width: 160 }}>
          {['Connect', 'Query', 'Export'].map((i) => <List.Item key={i} size="none">{i}</List.Item>)}
        </List>
      </div>
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 24 }}>
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} style={{ width: 200, border: '1px solid var(--color-border-default)', borderRadius: 8, overflow: 'hidden' }}>
          <List>
            {['Tables', 'Views', 'Indexes'].map((item) => (
              <List.Item key={item} size={size} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                {item}
              </List.Item>
            ))}
          </List>
        </div>
      ))}
    </div>
  ),
}

export const WithIcons: Story = {
  render: () => (
    <div style={{ width: 240, border: '1px solid var(--color-border-default)', borderRadius: 8, overflow: 'hidden' }}>
      <List>
        {[
          { label: 'users' },
          { label: 'orders' },
          { label: 'products' },
          { label: 'categories' },
        ].map(({ label }) => (
          <List.Item key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <Table2 size={14} className="text-accent" />
            {label}
          </List.Item>
        ))}
      </List>
    </div>
  ),
}
