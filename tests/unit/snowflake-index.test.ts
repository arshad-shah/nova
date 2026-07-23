// Behavioral tests for the Snowflake plugin's activate() (src/main/plugins/bundled/snowflake/index.ts):
// the registered driver descriptor, the Snowsight-style toolbar + resolvers +
// commands wiring (role/warehouse selectors), and the completion provider.
// Follows the fake-ctx pattern from tests/unit/redis-index-plugin.test.ts.
import { describe, it, expect, vi } from 'vitest'
import { DriverRegistryImpl } from '../../src/main/plugins/sdk/driver-registry'
import { UIRegistryImpl } from '../../src/main/plugins/sdk/ui-registry'
import { CommandRegistryImpl } from '../../src/main/plugins/sdk/command-registry'
import { CompletionRegistryImpl } from '../../src/main/plugins/sdk/completion-registry'
import { activate } from '../../src/main/plugins/bundled/snowflake/index'
import { SnowflakeAdapter } from '../../src/main/plugins/bundled/snowflake/snowflake-adapter'

interface FakeConnections { query: ReturnType<typeof vi.fn> }
interface FakeSchema { getTables: ReturnType<typeof vi.fn>; getColumns: ReturnType<typeof vi.fn> }

function ctxWith(
  drivers: DriverRegistryImpl,
  ui: UIRegistryImpl,
  commands: CommandRegistryImpl,
  completions: CompletionRegistryImpl,
  connections: FakeConnections,
  schema: FakeSchema,
) {
  const noop = () => ({ dispose() {} })
  return {
    drivers, ui, commands, completions, connections, schema,
    exporters: { register: noop },
    importers: { register: noop },
    formatters: { register: noop },
  } as never
}

function setup() {
  const drivers = new DriverRegistryImpl()
  const ui = new UIRegistryImpl()
  const commands = new CommandRegistryImpl()
  const completions = new CompletionRegistryImpl()
  const connections: FakeConnections = { query: vi.fn(async () => ({ rows: [] })) }
  const schema: FakeSchema = {
    getTables: vi.fn(async () => [{ name: 'USERS' }]),
    getColumns: vi.fn(async () => [{ name: 'ID', dataType: 'NUMBER' }]),
  }
  completions.currentPluginName = 'verql-plugin-snowflake'
  activate(ctxWith(drivers, ui, commands, completions, connections, schema))
  return { drivers, ui, commands, completions, connections, schema }
}

describe('snowflake plugin — driver descriptor', () => {
  it('registers a "snowflake" driver with double-quote quoting and no supportsAnalyze', () => {
    const { drivers } = setup()
    const d = drivers.get('snowflake')!
    expect(d.quoteChar).toBe('"')
    expect(d.sqlDialect).toBe('snowflake')
    expect(d.explain).toEqual({ supportsAnalyze: false, format: 'text', statement: 'EXPLAIN' })
  })

  it('createAdapter produces a working SnowflakeAdapter instance', () => {
    const { drivers } = setup()
    const adapter = drivers.get('snowflake')!.createAdapter({ account: 'acct' })
    expect(adapter).toBeInstanceOf(SnowflakeAdapter)
  })

  it('offers PUBLIC (and lowercase public) as default schema candidates', () => {
    const { drivers } = setup()
    expect(drivers.get('snowflake')!.defaultSchemaCandidates).toEqual(['PUBLIC', 'public'])
  })

  it('declares table/column/row nouns', () => {
    const { drivers } = setup()
    expect(drivers.get('snowflake')!.nouns).toEqual({
      object: { one: 'table', many: 'tables' },
      field: { one: 'column', many: 'columns' },
      record: { one: 'row', many: 'rows' },
    })
  })
})

describe('snowflake plugin — Snowsight toolbar', () => {
  it('registers a right-hand toolbar zone with role and warehouse selectors', () => {
    const { ui } = setup()
    const widgets = ui.getToolbar('snowflake-context')!
    expect(widgets).toHaveLength(2)
    expect(widgets.map((w) => (w as { id: string }).id)).toEqual(['sf-role', 'sf-warehouse'])
  })
})

describe('snowflake plugin — role/warehouse resolvers', () => {
  it('sf-roles issues SHOW ROLES and extracts + filters names via extractSnowflakeName', async () => {
    const { ui, connections } = setup()
    connections.query.mockResolvedValueOnce({ rows: [{ '"name"': 'SYSADMIN' }, { '"name"': '' }] })
    const result = await ui.resolve('sf-roles', { connectionId: 'c1' } as never)
    expect(connections.query).toHaveBeenCalledWith('c1', 'SHOW ROLES')
    expect(result).toEqual([{ value: 'SYSADMIN', label: 'SYSADMIN' }])
  })

  it('sf-warehouses issues SHOW WAREHOUSES and drops blank names', async () => {
    const { ui, connections } = setup()
    connections.query.mockResolvedValueOnce({ rows: [{ '"name"': '' }, { '"name"': 'WH_XS' }] })
    const result = await ui.resolve('sf-warehouses', { connectionId: 'c1' } as never)
    expect(connections.query).toHaveBeenCalledWith('c1', 'SHOW WAREHOUSES')
    expect(result).toEqual([{ value: 'WH_XS', label: 'WH_XS' }])
  })
})

describe('snowflake plugin — use-role / use-warehouse commands', () => {
  it('use-role issues USE ROLE with the value quoted and invalidates the warehouse resolver', async () => {
    const { commands, connections, ui } = setup()
    const invalidateSpy = vi.spyOn(ui, 'invalidate')
    await commands.execute('use-role', undefined, { value: 'SYSADMIN', connectionId: 'c1' })
    expect(connections.query).toHaveBeenCalledWith('c1', 'USE ROLE "SYSADMIN"')
    expect(invalidateSpy).toHaveBeenCalledWith('sf-warehouses')
  })

  it('use-warehouse issues USE WAREHOUSE with the value quoted', async () => {
    const { commands, connections } = setup()
    await commands.execute('use-warehouse', undefined, { value: 'WH_XS', connectionId: 'c1' })
    expect(connections.query).toHaveBeenCalledWith('c1', 'USE WAREHOUSE "WH_XS"')
  })

  it('use-role/use-warehouse are no-ops when payload is missing value or connectionId', async () => {
    const { commands, connections } = setup()
    await commands.execute('use-role', undefined, {})
    await commands.execute('use-warehouse', undefined, { value: 'WH_XS' })
    expect(connections.query).not.toHaveBeenCalled()
  })
})

describe('snowflake plugin — completion provider', () => {
  it('includes static SQL keywords and Snowflake-specific keywords/functions', async () => {
    const { completions } = setup()
    const items = await completions.getCompletions('verql-plugin-snowflake', 'c1', { schema: undefined } as never)
    const labels = items.map((i) => i.label)
    expect(labels).toContain('SELECT')
    expect(labels).toContain('QUALIFY')
    expect(labels).toContain('FLATTEN')
  })

  it('appends live tables and columns fetched via ctx.schema', async () => {
    const { completions, schema } = setup()
    const items = await completions.getCompletions('verql-plugin-snowflake', 'c1', { schema: 'ANALYTICS' } as never)
    expect(schema.getTables).toHaveBeenCalledWith('c1', 'ANALYTICS')
    expect(schema.getColumns).toHaveBeenCalledWith('c1', 'USERS', 'ANALYTICS')
    expect(items.some((i) => i.kind === 'table' && i.label === 'USERS')).toBe(true)
    expect(items.some((i) => i.kind === 'column' && i.label === 'ID')).toBe(true)
  })

  it('falls back to static completions only when getTables throws', async () => {
    const { completions, schema } = setup()
    schema.getTables.mockRejectedValueOnce(new Error('boom'))
    const items = await completions.getCompletions('verql-plugin-snowflake', 'c1', { schema: undefined } as never)
    expect(items.some((i) => i.kind === 'table')).toBe(false)
    expect(items.some((i) => i.label === 'SELECT')).toBe(true)
  })

  it('keeps the table entry but skips its columns when getColumns throws for that table', async () => {
    const { completions, schema } = setup()
    schema.getColumns.mockRejectedValueOnce(new Error('boom'))
    const items = await completions.getCompletions('verql-plugin-snowflake', 'c1', { schema: undefined } as never)
    expect(items.some((i) => i.kind === 'table' && i.label === 'USERS')).toBe(true)
    expect(items.some((i) => i.kind === 'column')).toBe(false)
  })
})
