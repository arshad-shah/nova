import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { ERDiagram } from './ERDiagram'
import { useSchemaStore } from '@/stores/schema'
import { IPC_CHANNELS } from '@shared/ipc'
import type { SchemaColumn, SchemaTable } from '@shared/types'

const tables: SchemaTable[] = [
  { name: 'customers', schema: 'public', type: 'table' },
  { name: 'orders', schema: 'public', type: 'table' },
  { name: 'order_items', schema: 'public', type: 'table' },
  { name: 'products', schema: 'public', type: 'table' },
]

const col = (name: string, dataType: string, opts: Partial<SchemaColumn> = {}): SchemaColumn => ({
  name,
  dataType,
  nullable: opts.nullable ?? true,
  defaultValue: opts.defaultValue ?? null,
  isPrimaryKey: opts.isPrimaryKey ?? false,
  isForeignKey: opts.isForeignKey ?? false,
  references: opts.references,
})

const columns: Record<string, SchemaColumn[]> = {
  customers: [
    col('id', 'uuid', { isPrimaryKey: true, nullable: false }),
    col('name', 'text', { nullable: false }),
    col('email', 'text'),
  ],
  orders: [
    col('id', 'uuid', { isPrimaryKey: true, nullable: false }),
    col('customer_id', 'uuid', { isForeignKey: true, references: { table: 'customers', column: 'id' } }),
    col('total', 'numeric'),
    col('created_at', 'timestamptz'),
  ],
  order_items: [
    col('id', 'uuid', { isPrimaryKey: true, nullable: false }),
    col('order_id', 'uuid', { isForeignKey: true, references: { table: 'orders', column: 'id' } }),
    col('product_id', 'uuid', { isForeignKey: true, references: { table: 'products', column: 'id' } }),
    col('quantity', 'integer'),
  ],
  products: [
    col('id', 'uuid', { isPrimaryKey: true, nullable: false }),
    col('sku', 'text', { nullable: false }),
    col('price', 'numeric'),
  ],
}

/** ERDiagram loads its schema on mount via fetchTables/fetchColumns, which go
 *  through window.electronAPI.invoke. We override invoke to serve the sample
 *  schema, and reset the schema-store cache so the fetch isn't short-circuited
 *  by a previous story's data. Installed from `beforeEach` (which runs *before*
 *  the story renders) rather than a child effect — the component's own load
 *  effect runs before a parent effect would, so a `useEffect` stub lands too
 *  late and the diagram reads as empty. Returns a cleanup that restores invoke. */
function stubSchemaApi(tableList: SchemaTable[]): () => void {
  const original = window.electronAPI.invoke
  useSchemaStore.setState({ tables: new Map(), columns: new Map() })
  window.electronAPI.invoke = (async (channel: string, ...args: unknown[]) => {
    if (channel === IPC_CHANNELS.DB_GET_TABLES) return tableList
    if (channel === IPC_CHANNELS.DB_GET_COLUMNS) {
      const table = args[1] as string
      return columns[table] ?? []
    }
    return original(channel as never, ...(args as never[]))
  }) as typeof window.electronAPI.invoke
  return () => {
    window.electronAPI.invoke = original
  }
}

const meta: Meta<typeof ERDiagram> = {
  title: 'Components/Er/ERDiagram',
  component: ERDiagram,
  args: { connectionId: 'conn-1', schema: 'public' },
  decorators: [
    (Story) => (
      <div style={{ width: 820, height: 520 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

/** A small schema with foreign-key relationships, laid out by the handrolled
 *  engine. The play test drives the diagram surface end to end. */
export const Schema: Story = {
  beforeEach: () => stubSchemaApi(tables),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The diagram mounts async (schema fetch); wait for the canvas surface.
    const surface = await canvas.findByRole('img', {}, { timeout: 5000 })
    // aria-label reports the resolved entity + relationship counts.
    await expect(surface).toHaveAttribute('aria-label', expect.stringContaining('4 entities'))
    await expect(surface).toHaveAttribute('aria-label', expect.stringContaining('3 relationships'))

    // Direction toggle, zoom controls, and fit are all present and clickable.
    await userEvent.click(canvas.getByRole('button', { name: /vertical/i }))
    await userEvent.click(canvas.getByRole('button', { name: /horizontal/i }))
    await userEvent.click(canvas.getByRole('button', { name: /zoom in/i }))
    await userEvent.click(canvas.getByRole('button', { name: /zoom out/i }))
    await userEvent.click(canvas.getByRole('button', { name: /fit to view/i }))
  },
}

/** A schema with no tables — renders the "no objects" empty state. */
export const NoTables: Story = {
  beforeEach: () => stubSchemaApi([]),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/No .* found/i)).toBeInTheDocument()
  },
}
