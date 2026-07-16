import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
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

const col = (
  name: string,
  dataType: string,
  opts: Partial<SchemaColumn> = {},
): SchemaColumn => ({
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
    col('customer_id', 'uuid', {
      isForeignKey: true,
      references: { table: 'customers', column: 'id' },
    }),
    col('total', 'numeric'),
    col('created_at', 'timestamptz'),
  ],
  order_items: [
    col('id', 'uuid', { isPrimaryKey: true, nullable: false }),
    col('order_id', 'uuid', {
      isForeignKey: true,
      references: { table: 'orders', column: 'id' },
    }),
    col('product_id', 'uuid', {
      isForeignKey: true,
      references: { table: 'products', column: 'id' },
    }),
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
 *  schema (and reset the schema-store cache so the fetch isn't short-circuited
 *  by a previous story's data). */
function stubSchemaApi(tableList: SchemaTable[]) {
  const original = window.electronAPI.invoke
  window.electronAPI.invoke = (async (channel: string, ...args: unknown[]) => {
    if (channel === IPC_CHANNELS.DB_GET_TABLES) return tableList
    if (channel === IPC_CHANNELS.DB_GET_COLUMNS) {
      const table = args[1] as string
      return columns[table] ?? []
    }
    return original(channel as never, ...(args as never[]))
  }) as typeof window.electronAPI.invoke
}

function seed(tableList: SchemaTable[]) {
  return function Seeder() {
    useEffect(() => {
      useSchemaStore.setState({ tables: new Map(), columns: new Map() })
      stubSchemaApi(tableList)
    }, [])
    return <ERDiagram connectionId="conn-1" schema="public" />
  }
}

const meta: Meta<typeof ERDiagram> = {
  title: 'Components/Er/ERDiagram',
  component: ERDiagram,
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

/** A small schema with foreign-key relationships, laid out with dagre. */
export const Schema: Story = {
  render: seed(tables),
}

/** A schema with no tables — renders the "no tables" empty state. */
export const NoTables: Story = {
  render: seed([]),
}
