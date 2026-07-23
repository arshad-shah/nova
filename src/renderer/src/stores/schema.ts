import { create } from 'zustand'
import type { SchemaTable, SchemaColumn, SchemaIndex, SchemaObject } from '@shared/types'
import { IPC_CHANNELS } from '@shared/ipc'
import { ipc } from '@/platform/client'

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

export const useSchemaStore = create<SchemaState>((set, get) => ({
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

  fetchDatabases: async (connectionId) => {
    const key = connectionId
    const cached = get().databases.get(key)
    if (cached && cached.every(Boolean)) return cached
    try {
      const result = (await ipc.invoke(IPC_CHANNELS.DB_GET_DATABASES, connectionId)).filter(Boolean)
      set((s) => {
        const next = new Map(s.databases)
        next.set(key, result)
        return { databases: next }
      })
      return result
    } catch {
      // Store empty array so hierarchyLoaded can become true
      set((s) => {
        const next = new Map(s.databases)
        next.set(key, [])
        return { databases: next }
      })
      return []
    }
  },

  switchDatabase: async (connectionId, database) => {
    if (!database) throw new Error('Database name is required')
    try {
      await ipc.invoke(IPC_CHANNELS.DB_SWITCH_DATABASE, connectionId, database)
    } catch {
      // switchDatabase may fail for databases user can't access (e.g. rdsadmin)
      throw new Error(`Cannot switch to database "${database}"`)
    }
  },

  fetchSchemas: async (connectionId, database) => {
    // Key includes database so each DB gets its own cached schema list
    const key = database ? cacheKey(connectionId, database) : connectionId
    const cached = get().schemas.get(key)
    if (cached) return cached
    set({ loading: true })
    try {
      const result = await ipc.invoke(IPC_CHANNELS.DB_GET_SCHEMAS, connectionId)
      set((s) => {
        const next = new Map(s.schemas)
        next.set(key, result)
        return { schemas: next, loading: false }
      })
      return result
    } catch {
      set((s) => {
        const next = new Map(s.schemas)
        next.set(key, [])
        return { schemas: next, loading: false }
      })
      return []
    }
  },

  fetchTables: async (connectionId, schema, database) => {
    // Include database in cache key so each DB's tables are cached separately
    const key = database ? cacheKey(connectionId, database, schema) : cacheKey(connectionId, schema)
    const cached = get().tables.get(key)
    if (cached) return cached
    set({ loading: true })
    try {
      const result = await ipc.invoke(IPC_CHANNELS.DB_GET_TABLES, connectionId, schema)
      set((s) => {
        const next = new Map(s.tables)
        next.set(key, result)
        return { tables: next, loading: false }
      })
      return result
    } catch {
      set({ loading: false })
      return []
    }
  },

  fetchColumns: async (connectionId, table, schema) => {
    const key = cacheKey(connectionId, schema, table)
    const cached = get().columns.get(key)
    if (cached) return cached
    try {
      const result = await ipc.invoke(IPC_CHANNELS.DB_GET_COLUMNS, connectionId, table, schema)
      set((s) => {
        const next = new Map(s.columns)
        next.set(key, result)
        return { columns: next }
      })
      return result
    } catch {
      return []
    }
  },

  fetchIndexes: async (connectionId, table, schema) => {
    const key = cacheKey(connectionId, schema, table)
    const cached = get().indexes.get(key)
    if (cached) return cached
    const result = await ipc.invoke(IPC_CHANNELS.DB_GET_INDEXES, connectionId, table, schema)
    set((s) => {
      const next = new Map(s.indexes)
      next.set(key, result)
      return { indexes: next }
    })
    return result
  },

  fetchSchemaObjects: async (connectionId, schema, database) => {
    const key = database ? cacheKey(connectionId, database, schema) : cacheKey(connectionId, schema)
    const cached = get().objects.get(key)
    if (cached) return cached
    try {
      const result = await ipc.invoke(IPC_CHANNELS.DB_GET_SCHEMA_OBJECTS, connectionId, schema)
      set((s) => {
        const next = new Map(s.objects)
        next.set(key, result)
        return { objects: next }
      })
      return result
    } catch {
      set((s) => {
        const next = new Map(s.objects)
        next.set(key, [])
        return { objects: next }
      })
      return []
    }
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
    const count = await ipc.invoke(IPC_CHANNELS.DB_GET_ROW_COUNT, connectionId, table, schema)
    set((s) => {
      const next = new Map(s.rowCounts)
      next.set(key, count)
      return { rowCounts: next }
    })
  },

  clearCache: (connectionId) => {
    if (!connectionId) {
      set((s) => ({ tables: new Map(), columns: new Map(), indexes: new Map(), schemas: new Map(), databases: new Map(), objects: new Map(), rowCounts: new Map(), filterText: '', cacheVersion: s.cacheVersion + 1 }))
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
      return {
        tables: filterMap(s.tables),
        columns: filterMap(s.columns),
        indexes: filterMap(s.indexes),
        objects: filterMap(s.objects),
        schemas: filterMap(s.schemas),
        databases: filterMap(s.databases),
        rowCounts: filterMap(s.rowCounts),
        cacheVersion: s.cacheVersion + 1
      }
    })
  }
}))
