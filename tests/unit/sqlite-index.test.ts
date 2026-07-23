// Behavioral tests for the SQLite plugin's activate() (src/main/plugins/bundled/sqlite/index.ts):
// the registered driver descriptor, its bespoke generateMigrationDdl (the
// rowid-alias special case), the postgresql/mysql type-mapper wiring, and the
// completion provider's static + dynamic output. Fake-ctx pattern shared with
// tests/unit/bundled-session-caps.test.ts and tests/unit/redis-index-plugin.test.ts.
import { describe, it, expect, vi } from 'vitest'
import { DriverRegistryImpl } from '../../src/main/plugins/sdk/driver-registry'
import { TypeMapperRegistryImpl } from '../../src/main/plugins/sdk/type-mapper-registry'
import { CompletionRegistryImpl } from '../../src/main/plugins/sdk/completion-registry'
import { activate } from '../../src/main/plugins/bundled/sqlite/index'
import { SqliteAdapter } from '../../src/main/plugins/bundled/sqlite/sqlite-adapter'
import type { SchemaColumn } from '@shared/types'

interface FakeSchema {
  getTables: ReturnType<typeof vi.fn>
  getColumns: ReturnType<typeof vi.fn>
}

function ctxWith(
  drivers: DriverRegistryImpl,
  typeMappers: TypeMapperRegistryImpl,
  completions: CompletionRegistryImpl,
  schema: FakeSchema,
) {
  const noop = () => ({ dispose() {} })
  return {
    drivers, typeMappers, completions, schema,
    exporters: { register: noop },
    importers: { register: noop },
    formatters: { register: noop },
  } as never
}

function setup() {
  const drivers = new DriverRegistryImpl()
  const typeMappers = new TypeMapperRegistryImpl()
  const completions = new CompletionRegistryImpl()
  const schema: FakeSchema = {
    getTables: vi.fn(async () => [{ name: 'users' }]),
    getColumns: vi.fn(async () => [{ name: 'id', dataType: 'INTEGER' }]),
  }
  completions.currentPluginName = 'verql-plugin-sqlite'
  activate(ctxWith(drivers, typeMappers, completions, schema))
  return { drivers, typeMappers, completions, schema }
}

describe('sqlite plugin — driver descriptor', () => {
  it('registers a "sqlite" driver with double-quote quoting and no EXPLAIN ANALYZE support', () => {
    const { drivers } = setup()
    const d = drivers.get('sqlite')!
    expect(d.quoteChar).toBe('"')
    expect(d.sqlDialect).toBe('sqlite')
    expect(d.explain).toEqual({ supportsAnalyze: false, format: 'text', statement: 'EXPLAIN QUERY PLAN' })
  })

  it('createAdapter produces a working SqliteAdapter instance', () => {
    const { drivers } = setup()
    const adapter = drivers.get('sqlite')!.createAdapter({ database: '/tmp/x.db' })
    expect(adapter).toBeInstanceOf(SqliteAdapter)
  })

  it('declares "main" as the only default schema candidate', () => {
    const { drivers } = setup()
    expect(drivers.get('sqlite')!.defaultSchemaCandidates).toEqual(['main'])
  })

  it('declares manual transactions with a full rollback kind', () => {
    const { drivers } = setup()
    expect(drivers.get('sqlite')!.session).toEqual({
      autoCommit: true,
      manualTransactions: true,
      transactionLabel: 'Transaction',
      rollbackKind: 'full',
    })
  })
})

describe('sqlite plugin — generateMigrationDdl', () => {
  async function ddlFor(columns: SchemaColumn[]): Promise<string> {
    const { drivers } = setup()
    return drivers.get('sqlite')!.generateMigrationDdl!('t1', columns)
  }

  it('emits a bare "INTEGER PRIMARY KEY" for the PK column (no type/NOT NULL/default carried over)', async () => {
    const ddl = await ddlFor([
      { name: 'id', dataType: 'BIGINT', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false },
    ])
    expect(ddl).toBe('CREATE TABLE "t1" (\n  "id" INTEGER PRIMARY KEY\n);\n')
  })

  it('adds NOT NULL for a non-nullable non-PK column and carries the declared type', async () => {
    const ddl = await ddlFor([
      { name: 'email', dataType: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
    ])
    expect(ddl).toContain('"email" TEXT NOT NULL')
    expect(ddl).not.toContain('NOT NULL,\n')
  })

  it('omits NOT NULL for a nullable column and appends DEFAULT when present', async () => {
    const ddl = await ddlFor([
      { name: 'nickname', dataType: 'TEXT', nullable: true, defaultValue: "'anon'", isPrimaryKey: false, isForeignKey: false },
    ])
    expect(ddl).toContain('"nickname" TEXT DEFAULT \'anon\'')
    expect(ddl).not.toContain('nickname" TEXT NOT NULL')
  })

  it('joins multiple column definitions with commas', async () => {
    const ddl = await ddlFor([
      { name: 'id', dataType: 'INTEGER', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false },
      { name: 'name', dataType: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
    ])
    expect(ddl).toBe('CREATE TABLE "t1" (\n  "id" INTEGER PRIMARY KEY,\n  "name" TEXT NOT NULL\n);\n')
  })
})

describe('sqlite plugin — type mapper registration', () => {
  it('registers postgresql -> sqlite and mysql -> sqlite mappings that resolve', () => {
    const { typeMappers } = setup()
    expect(typeMappers.resolve('postgresql', 'sqlite', 'boolean')).toBeDefined()
    expect(typeMappers.resolve('mysql', 'sqlite', 'tinyint')).toBeDefined()
  })

  it('registers a sqlite -> mysql mapping using only the fallback (empty table)', () => {
    const { typeMappers } = setup()
    // sqlite -> mysql is registered with an empty table + a fallback function;
    // any input must therefore be resolved by the fallback, not a table hit.
    const resolved = typeMappers.resolve('sqlite', 'mysql', 'TEXT')
    expect(resolved).toBeDefined()
  })
})

describe('sqlite plugin — completion provider', () => {
  it('includes generic SQL keywords and SQLite-specific keywords/types/functions', async () => {
    const { completions } = setup()
    const items = await completions.getCompletions('verql-plugin-sqlite', 'conn1', { schema: undefined } as never)
    const labels = items.map((i) => i.label)
    expect(labels).toContain('SELECT')
    expect(labels).toContain('AUTOINCREMENT')
    expect(labels).toContain('WITHOUT ROWID')
    expect(labels.some((l) => l === 'json_extract()')).toBe(true)
  })

  it('appends live tables and columns from the schema access object', async () => {
    const { completions, schema } = setup()
    const items = await completions.getCompletions('verql-plugin-sqlite', 'conn1', { schema: 'main' } as never)
    expect(schema.getTables).toHaveBeenCalledWith('conn1', 'main')
    expect(schema.getColumns).toHaveBeenCalledWith('conn1', 'users', 'main')
    expect(items.some((i) => i.kind === 'table' && i.label === 'users')).toBe(true)
    expect(items.some((i) => i.kind === 'column' && i.label === 'id')).toBe(true)
  })

  it('degrades to static-only completions when getTables throws', async () => {
    const { completions, schema } = setup()
    schema.getTables.mockRejectedValueOnce(new Error('boom'))
    const items = await completions.getCompletions('verql-plugin-sqlite', 'conn1', { schema: undefined } as never)
    expect(items.some((i) => i.kind === 'table')).toBe(false)
    expect(items.some((i) => i.label === 'SELECT')).toBe(true)
  })

  it('keeps the table but skips its columns when getColumns throws for that table', async () => {
    const { completions, schema } = setup()
    schema.getColumns.mockRejectedValueOnce(new Error('boom'))
    const items = await completions.getCompletions('verql-plugin-sqlite', 'conn1', { schema: undefined } as never)
    expect(items.some((i) => i.kind === 'table' && i.label === 'users')).toBe(true)
    expect(items.some((i) => i.kind === 'column')).toBe(false)
  })
})
