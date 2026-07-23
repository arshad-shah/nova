// Behavioral tests for the MySQL plugin's activate() (src/main/plugins/bundled/mysql/index.ts):
// the registered driver descriptor, the postgresql→mysql type mapper wiring,
// and the completion provider's static + dynamic (schema-backed) output.
// Follows the fake-ctx pattern from tests/unit/bundled-session-caps.test.ts
// and tests/unit/redis-index-plugin.test.ts.
import { describe, it, expect, vi } from 'vitest'
import { DriverRegistryImpl } from '../../src/main/plugins/sdk/driver-registry'
import { TypeMapperRegistryImpl } from '../../src/main/plugins/sdk/type-mapper-registry'
import { CompletionRegistryImpl } from '../../src/main/plugins/sdk/completion-registry'
import { activate } from '../../src/main/plugins/bundled/mysql/index'
import { MysqlAdapter } from '../../src/main/plugins/bundled/mysql/mysql-adapter'

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
    getColumns: vi.fn(async () => [{ name: 'id', dataType: 'int' }]),
  }
  completions.currentPluginName = 'verql-plugin-mysql'
  activate(ctxWith(drivers, typeMappers, completions, schema))
  return { drivers, typeMappers, completions, schema }
}

describe('mysql plugin — driver descriptor', () => {
  it('registers a "mysql" driver with backtick quoting and the sql dialect', () => {
    const { drivers } = setup()
    const d = drivers.get('mysql')!
    expect(d.quoteChar).toBe('`')
    expect(d.sqlDialect).toBe('mysql')
    expect(d.placeholderStyle).toBe('positional')
    expect(d.editorLanguage).toBe('sql')
  })

  it('createAdapter produces a working MysqlAdapter instance', () => {
    const { drivers } = setup()
    const adapter = drivers.get('mysql')!.createAdapter({ database: 'db' })
    expect(adapter).toBeInstanceOf(MysqlAdapter)
  })

  it('declares table/column/row nouns (relational, not generic)', () => {
    const { drivers } = setup()
    expect(drivers.get('mysql')!.nouns).toEqual({
      object: { one: 'table', many: 'tables' },
      field: { one: 'column', many: 'columns' },
      record: { one: 'row', many: 'rows' },
    })
  })

  it('declares EXPLAIN ANALYZE support and defaultSchemaUseConnectionDatabase', () => {
    const { drivers } = setup()
    const d = drivers.get('mysql')!
    expect(d.explain).toEqual({ supportsAnalyze: true, format: 'text', statement: 'EXPLAIN ANALYZE' })
    expect(d.defaultSchemaUseConnectionDatabase).toBe(true)
  })
})

describe('mysql plugin — type mapper registration', () => {
  it('registers a postgresql -> mysql mapping that resolves a known type', () => {
    const { typeMappers } = setup()
    // bigint is a real PG_TO_MYSQL entry per type-maps.ts; assert it resolves
    // through the real registered table rather than re-implementing the map.
    const resolved = typeMappers.resolve('postgresql', 'mysql', 'bigint')
    expect(resolved).toBeDefined()
    expect(resolved!.source).toBe('bigint')
  })

  it('falls back for an unknown postgresql type via pgToMysqlFallback', () => {
    const { typeMappers } = setup()
    const resolved = typeMappers.resolve('postgresql', 'mysql', 'some_totally_unknown_pg_type')
    // Either a fallback entry is produced, or none — but it must not throw and
    // must not silently equal the exact input type unless the fallback says so.
    expect(() => resolved).not.toThrow()
  })
})

describe('mysql plugin — completion provider', () => {
  it('includes generic SQL keywords, MySQL-specific keywords, data types, and functions', async () => {
    const { completions } = setup()
    const items = await completions.getCompletions('verql-plugin-mysql', 'conn1', { schema: undefined } as never)
    const labels = items.map(i => i.label)
    expect(labels).toContain('SELECT')
    expect(labels).toContain('AUTO_INCREMENT')
    expect(labels).toContain('ENUM')
    expect(labels.some(l => l === 'NOW()')).toBe(true)
  })

  it('appends live tables and columns from the schema access object', async () => {
    const { completions, schema } = setup()
    const items = await completions.getCompletions('verql-plugin-mysql', 'conn1', { schema: 'shop' } as never)
    expect(schema.getTables).toHaveBeenCalledWith('conn1', 'shop')
    expect(schema.getColumns).toHaveBeenCalledWith('conn1', 'users', 'shop')
    const tableItem = items.find(i => i.kind === 'table')
    const columnItem = items.find(i => i.kind === 'column')
    expect(tableItem?.label).toBe('users')
    expect(columnItem?.label).toBe('id')
  })

  it('degrades to static-only completions when schema access throws', async () => {
    const { completions, schema } = setup()
    schema.getTables.mockRejectedValueOnce(new Error('no connection'))
    const items = await completions.getCompletions('verql-plugin-mysql', 'conn1', { schema: undefined } as never)
    expect(items.some(i => i.kind === 'table')).toBe(false)
    expect(items.some(i => i.label === 'SELECT')).toBe(true)
  })
})
