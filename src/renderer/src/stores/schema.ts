import { create } from 'zustand'
import type { SchemaTable, SchemaColumn, SchemaIndex, SchemaObject } from '@shared/types'
import { IPC_CHANNELS } from '@shared/ipc'
import { ACTIVITY_KIND } from '@shared/activity'
import { ipc } from '@/platform/client'
import { recordActivity } from '@/lib/diagnostics'

/**
 * The fetchers in this store all talk to the same live connection over IPC and
 * all fail the same way. `SchemaFetchKind` names the seven fetch paths so their
 * error markers share one namespace (see `errored` / `schemaErrorTag`).
 */
export type SchemaFetchKind =
  | 'databases'
  | 'schemas'
  | 'tables'
  | 'columns'
  | 'indexes'
  | 'objects'
  | 'rowCounts'

/**
 * The error marker for a `(kind, cacheKey)` pair. Errors live in a single
 * `errored` set rather than one set per fetcher; the kind prefix keeps the key
 * spaces from colliding (e.g. `fetchDatabases` and a no-database `fetchSchemas`
 * both key on the bare connectionId). Consumers subscribe with a primitive
 * selector — `useSchemaStore((s) => s.errored.has(schemaErrorTag('columns', key)))`
 * — so they re-render only when *their* node flips between errored and not.
 */
export function schemaErrorTag(kind: SchemaFetchKind, key: string): string {
  return `${kind}:${key}`
}

interface SchemaState {
  tables: Map<string, SchemaTable[]>
  columns: Map<string, SchemaColumn[]>
  indexes: Map<string, SchemaIndex[]>
  schemas: Map<string, string[]>
  databases: Map<string, string[]>
  objects: Map<string, SchemaObject[]>
  expandedTables: Set<string>
  filterText: string
  rowCounts: Map<string, number>
  loading: boolean
  /** Incremented on clearCache — lets components know to re-fetch */
  cacheVersion: number

  // Fetch failures, keyed by `schemaErrorTag(kind, cacheKey)`. This is the
  // "errored" third state that lets the explorer tell a *failed* load apart
  // from a load that legitimately returned nothing (an empty schema, a
  // schema-less driver). A failed fetch caches no result — the key stays absent
  // from its result map — so the errored marker, not a poisoned empty array, is
  // what a retry keys off. Entries clear the moment the same fetch succeeds.
  errored: Set<string>

  // In-flight request de-duplication. Each fetcher caches its *promise* keyed
  // identically to its result cache, so N concurrent callers for the same key
  // (e.g. the explorer, the inspector, and an ER diagram all asking for the
  // same table's columns) share one round trip instead of firing N. These are
  // internal bookkeeping, not reactive UI state — they are mutated in place and
  // never trigger a re-render; entries are evicted the moment the request
  // settles so a later call re-fetches. See #206.
  databasesPending: Map<string, Promise<string[]>>
  schemasPending: Map<string, Promise<string[]>>
  tablesPending: Map<string, Promise<SchemaTable[]>>
  columnsPending: Map<string, Promise<SchemaColumn[]>>
  indexesPending: Map<string, Promise<SchemaIndex[]>>
  objectsPending: Map<string, Promise<SchemaObject[]>>
  rowCountsPending: Map<string, Promise<void>>

  fetchDatabases: (connectionId: string) => Promise<string[]>
  switchDatabase: (connectionId: string, database: string) => Promise<void>
  fetchSchemas: (connectionId: string, database?: string) => Promise<string[]>
  fetchTables: (connectionId: string, schema: string, database?: string) => Promise<SchemaTable[]>
  fetchColumns: (connectionId: string, table: string, schema: string) => Promise<SchemaColumn[]>
  fetchIndexes: (connectionId: string, table: string, schema: string) => Promise<SchemaIndex[]>
  fetchSchemaObjects: (connectionId: string, schema: string, database?: string) => Promise<SchemaObject[]>
  toggleTable: (key: string) => void
  clearCache: (connectionId?: string) => void
  setFilterText: (text: string) => void
  fetchRowCount: (connectionId: string, table: string, schema: string) => Promise<void>
}

function cacheKey(connectionId: string, ...parts: string[]): string {
  return [connectionId, ...parts].join(':')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * De-duplicate concurrent identical requests by caching the in-flight promise.
 * The first caller for `key` runs `request()` and stores its promise; callers
 * arriving before it settles await the same promise. The entry is evicted on
 * settle (resolve *or* reject) so a subsequent call re-fetches — a failed
 * request never poisons the key. `pending` is mutated in place and is not
 * reactive state, so this never causes a render.
 */
function dedupe<T>(
  pending: Map<string, Promise<T>>,
  key: string,
  request: () => Promise<T>
): Promise<T> {
  const inflight = pending.get(key)
  if (inflight) return inflight
  const promise = request().finally(() => {
    pending.delete(key)
  })
  pending.set(key, promise)
  return promise
}

export const useSchemaStore = create<SchemaState>((set, get) => {
  /**
   * Record a fetch failure to the activity seam and mark `(kind, key)` errored.
   * Called from every fetcher's catch block so the policy — surface it, don't
   * swallow it, and never cache an empty result in its place — lives in exactly
   * one place.
   */
  function markErrored(kind: SchemaFetchKind, key: string, error: unknown): void {
    recordActivity({
      kind: ACTIVITY_KIND.STORE,
      level: 'error',
      title: 'Schema fetch failed',
      detail: `${kind} (${key}): ${errorMessage(error)}`,
      source: 'schema-store',
    })
    const tag = schemaErrorTag(kind, key)
    set((s) => {
      const errored = new Set(s.errored)
      errored.add(tag)
      return { errored }
    })
  }

  /** Clear the errored marker for `(kind, key)` — a later fetch succeeded. */
  function clearErrored(kind: SchemaFetchKind, key: string): void {
    const tag = schemaErrorTag(kind, key)
    if (!get().errored.has(tag)) return
    set((s) => {
      const errored = new Set(s.errored)
      errored.delete(tag)
      return { errored }
    })
  }

  return {
    tables: new Map(),
    columns: new Map(),
    indexes: new Map(),
    schemas: new Map(),
    databases: new Map(),
    objects: new Map(),
    expandedTables: new Set(),
    filterText: '',
    rowCounts: new Map(),
    loading: false,
    cacheVersion: 0,
    errored: new Set(),

    databasesPending: new Map(),
    schemasPending: new Map(),
    tablesPending: new Map(),
    columnsPending: new Map(),
    indexesPending: new Map(),
    objectsPending: new Map(),
    rowCountsPending: new Map(),

    fetchDatabases: async (connectionId) => {
      const key = connectionId
      const cached = get().databases.get(key)
      if (cached && cached.every(Boolean)) return cached
      return dedupe(get().databasesPending, key, async () => {
        try {
          const result = (await ipc.invoke(IPC_CHANNELS.DB_GET_DATABASES, connectionId)).filter(Boolean)
          set((s) => {
            const next = new Map(s.databases)
            next.set(key, result)
            return { databases: next }
          })
          clearErrored('databases', key)
          return result
        } catch (error) {
          // Mark errored rather than caching []: an errored hierarchy must be
          // distinguishable from a connection that genuinely has no databases,
          // so the explorer can offer a retry instead of a silent empty tree.
          markErrored('databases', key, error)
          return []
        }
      })
    },

    switchDatabase: async (connectionId, database) => {
      if (!database) throw new Error('Database name is required')
      try {
        await ipc.invoke(IPC_CHANNELS.DB_SWITCH_DATABASE, connectionId, database)
      } catch (error) {
        // switchDatabase may fail for databases user can't access (e.g. rdsadmin)
        recordActivity({
          kind: ACTIVITY_KIND.STORE,
          level: 'error',
          title: 'Switch database failed',
          detail: `${database} (${connectionId}): ${errorMessage(error)}`,
          source: 'schema-store',
        })
        throw new Error(`Cannot switch to database "${database}"`)
      }
    },

    fetchSchemas: async (connectionId, database) => {
      // Key includes database so each DB gets its own cached schema list
      const key = database ? cacheKey(connectionId, database) : connectionId
      const cached = get().schemas.get(key)
      if (cached) return cached
      return dedupe(get().schemasPending, key, async () => {
        set({ loading: true })
        try {
          const result = await ipc.invoke(IPC_CHANNELS.DB_GET_SCHEMAS, connectionId)
          set((s) => {
            const next = new Map(s.schemas)
            next.set(key, result)
            return { schemas: next, loading: false }
          })
          clearErrored('schemas', key)
          return result
        } catch (error) {
          set({ loading: false })
          markErrored('schemas', key, error)
          return []
        }
      })
    },

    fetchTables: async (connectionId, schema, database) => {
      // Include database in cache key so each DB's tables are cached separately
      const key = database ? cacheKey(connectionId, database, schema) : cacheKey(connectionId, schema)
      const cached = get().tables.get(key)
      if (cached) return cached
      return dedupe(get().tablesPending, key, async () => {
        set({ loading: true })
        try {
          const result = await ipc.invoke(IPC_CHANNELS.DB_GET_TABLES, connectionId, schema)
          set((s) => {
            const next = new Map(s.tables)
            next.set(key, result)
            return { tables: next, loading: false }
          })
          clearErrored('tables', key)
          return result
        } catch (error) {
          set({ loading: false })
          markErrored('tables', key, error)
          return []
        }
      })
    },

    fetchColumns: async (connectionId, table, schema) => {
      const key = cacheKey(connectionId, schema, table)
      const cached = get().columns.get(key)
      if (cached) return cached
      return dedupe(get().columnsPending, key, async () => {
        try {
          const result = await ipc.invoke(IPC_CHANNELS.DB_GET_COLUMNS, connectionId, table, schema)
          set((s) => {
            const next = new Map(s.columns)
            next.set(key, result)
            return { columns: next }
          })
          clearErrored('columns', key)
          return result
        } catch (error) {
          markErrored('columns', key, error)
          return []
        }
      })
    },

    fetchIndexes: async (connectionId, table, schema) => {
      const key = cacheKey(connectionId, schema, table)
      const cached = get().indexes.get(key)
      if (cached) return cached
      return dedupe(get().indexesPending, key, async () => {
        try {
          const result = await ipc.invoke(IPC_CHANNELS.DB_GET_INDEXES, connectionId, table, schema)
          set((s) => {
            const next = new Map(s.indexes)
            next.set(key, result)
            return { indexes: next }
          })
          clearErrored('indexes', key)
          return result
        } catch (error) {
          // Previously uncaught — a failed index fetch became an unhandled
          // promise rejection. Now it follows the same policy as every sibling.
          markErrored('indexes', key, error)
          return []
        }
      })
    },

    fetchSchemaObjects: async (connectionId, schema, database) => {
      const key = database ? cacheKey(connectionId, database, schema) : cacheKey(connectionId, schema)
      const cached = get().objects.get(key)
      if (cached) return cached
      return dedupe(get().objectsPending, key, async () => {
        try {
          const result = await ipc.invoke(IPC_CHANNELS.DB_GET_SCHEMA_OBJECTS, connectionId, schema)
          set((s) => {
            const next = new Map(s.objects)
            next.set(key, result)
            return { objects: next }
          })
          clearErrored('objects', key)
          return result
        } catch (error) {
          markErrored('objects', key, error)
          return []
        }
      })
    },

    toggleTable: (key) => {
      set((s) => {
        const next = new Set(s.expandedTables)
        if (next.has(key)) next.delete(key); else next.add(key)
        return { expandedTables: next }
      })
    },

    setFilterText: (text) => set({ filterText: text }),

    fetchRowCount: async (connectionId, table, schema) => {
      const key = cacheKey(connectionId, schema, table)
      if (get().rowCounts.has(key)) return
      return dedupe(get().rowCountsPending, key, async () => {
        try {
          const count = await ipc.invoke(IPC_CHANNELS.DB_GET_ROW_COUNT, connectionId, table, schema)
          set((s) => {
            const next = new Map(s.rowCounts)
            next.set(key, count)
            return { rowCounts: next }
          })
          clearErrored('rowCounts', key)
        } catch (error) {
          // The row-count badge is non-essential, but an uncaught rejection
          // here is not — record it and mark errored like the rest.
          markErrored('rowCounts', key, error)
        }
      })
    },

    clearCache: (connectionId) => {
      if (!connectionId) {
        set((s) => ({
          tables: new Map(), columns: new Map(), indexes: new Map(), schemas: new Map(),
          databases: new Map(), objects: new Map(), rowCounts: new Map(),
          errored: new Set(),
          // Drop in-flight promises too, so a request that was mid-flight when the
          // cache was invalidated cannot be served to a caller that arrives after
          // the clear — the next call starts a fresh fetch.
          databasesPending: new Map(), schemasPending: new Map(), tablesPending: new Map(),
          columnsPending: new Map(), indexesPending: new Map(), objectsPending: new Map(),
          rowCountsPending: new Map(),
          filterText: '', cacheVersion: s.cacheVersion + 1
        }))
        return
      }
      set((s) => {
        // Cache keys are built as `${connectionId}:${...}` OR — for top-level
        // schema/database lookups — as the bare connectionId. Either form
        // belongs to this connection and must be dropped on invalidate.
        const belongsTo = (k: string) =>
          k === connectionId || k.startsWith(`${connectionId}:`)
        const filterMap = <T,>(m: Map<string, T>) => {
          const next = new Map<string, T>()
          for (const [k, v] of m) if (!belongsTo(k)) next.set(k, v)
          return next
        }
        // Errored keys carry a `${kind}:` prefix; strip it before matching the
        // connection so a dropped connection's errors clear alongside its data.
        const filterErrored = (s2: Set<string>) => {
          const next = new Set<string>()
          for (const tag of s2) {
            const rest = tag.slice(tag.indexOf(':') + 1)
            if (!belongsTo(rest)) next.add(tag)
          }
          return next
        }
        return {
          tables: filterMap(s.tables),
          columns: filterMap(s.columns),
          indexes: filterMap(s.indexes),
          objects: filterMap(s.objects),
          schemas: filterMap(s.schemas),
          databases: filterMap(s.databases),
          rowCounts: filterMap(s.rowCounts),
          errored: filterErrored(s.errored),
          // In-flight promises for this connection are dropped alongside the
          // results they would populate.
          tablesPending: filterMap(s.tablesPending),
          columnsPending: filterMap(s.columnsPending),
          indexesPending: filterMap(s.indexesPending),
          objectsPending: filterMap(s.objectsPending),
          schemasPending: filterMap(s.schemasPending),
          databasesPending: filterMap(s.databasesPending),
          rowCountsPending: filterMap(s.rowCountsPending),
          cacheVersion: s.cacheVersion + 1
        }
      })
    }
  }
})
