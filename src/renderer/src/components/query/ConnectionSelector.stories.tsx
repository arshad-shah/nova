import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { ConnectionSelector } from './ConnectionSelector'
import { useConnectionsStore } from '@/stores/connections'
import { useSchemaStore } from '@/stores/schema'
import type { DriverCapabilities } from '@/stores/driver-capabilities'
import type { ConnectionProfile } from '@shared/types'

/** Minimal capability object for the stories — the database selector only shows
 *  when `databaseSwitch.supported` is declared, mirroring the real drivers. */
const CAPS_WITH_SWITCH: DriverCapabilities = {
  hasSampleQuery: true,
  hasGetTableData: true,
  databaseSwitch: { supported: true },
}

// ConnectionSelector reads the connections store (profiles + which ids are
// connected) and resolves the database/schema lists through the schema store's
// fetchDatabases/fetchSchemas (normally IPC-backed). We seed the connections
// store and stub those two schema-store methods to return canned lists — the
// same store-seeding approach as AutoCompactBanner.stories — so the selector
// renders its connection pill plus the database/schema pills.

const CONNS: ConnectionProfile[] = [
  { id: 'pg-prod', name: 'Prod (Postgres)', type: 'postgresql', database: 'app', color: '#3b82f6' },
  { id: 'pg-stg', name: 'Staging', type: 'postgresql', database: 'app_staging', color: '#10b981' },
  { id: 'lite', name: 'Local SQLite', type: 'sqlite', database: 'dev.db', color: '#f59e0b' },
]

interface SeedOpts {
  connectionId: string | null
  database: string | null
  schema: string | null
  connectedIds?: string[]
  databases?: string[]
  schemas?: string[]
  caps?: DriverCapabilities | null
}

function seed(opts: SeedOpts) {
  return function StoreSeeder() {
    useEffect(() => {
      useConnectionsStore.setState({
        connections: CONNS,
        connectedIds: new Set(opts.connectedIds ?? ['pg-prod', 'pg-stg']),
      })
      // Stub the IPC-backed resolvers so the effect-driven db/schema lists
      // populate deterministically in Storybook.
      useSchemaStore.setState({
        fetchDatabases: async () => opts.databases ?? [],
        fetchSchemas: async () => opts.schemas ?? [],
        switchDatabase: async () => {},
      } as Partial<ReturnType<typeof useSchemaStore.getState>> as ReturnType<typeof useSchemaStore.getState>)
    }, [])
    return (
      <ConnectionSelector
        tabId="sb-tab"
        connectionId={opts.connectionId}
        database={opts.database}
        schema={opts.schema}
        caps={opts.caps ?? null}
      />
    )
  }
}

const meta: Meta<typeof ConnectionSelector> = {
  title: 'Components/Query/ConnectionSelector',
  component: ConnectionSelector,
  decorators: [
    (Story) => (
      <div style={{ minWidth: 360 }} className="bg-bg-secondary p-3">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

/** No connection selected — shows the "No connection" placeholder pill. */
export const NoConnection: Story = {
  render: seed({ connectionId: null, database: null, schema: null }),
}

/** A connected Postgres profile with multiple schemas — connection + schema pills. */
export const ConnectedWithSchema: Story = {
  render: seed({
    connectionId: 'pg-prod',
    database: 'app',
    schema: 'public',
    schemas: ['public', 'auth', 'analytics'],
  }),
}

/** A multi-database connection — connection + database + schema pills all show. */
export const MultiDatabase: Story = {
  render: seed({
    connectionId: 'pg-prod',
    database: 'app',
    schema: 'public',
    databases: ['app', 'app_staging', 'reporting'],
    schemas: ['public', 'auth'],
    caps: CAPS_WITH_SWITCH,
  }),
}

/** SQLite — no schemas/databases resolved, so only the connection pill shows. */
export const SingleSchemaDriver: Story = {
  render: seed({
    connectionId: 'lite',
    database: 'dev.db',
    schema: null,
    connectedIds: ['lite'],
    databases: [],
    schemas: [],
  }),
}
