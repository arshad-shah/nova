import { describe, it, expect, vi } from 'vitest'
import { SchemaAccessImpl } from '../../src/main/plugins/sdk/schema-access'
import type { DbAdapter } from '../../src/main/db/adapter'
import type { SchemaTable, SchemaColumn, SchemaIndex } from '@shared/types'

function makeAdapter(overrides: Partial<DbAdapter> = {}): DbAdapter {
  return {
    query: vi.fn(),
    getTables: vi.fn(async () => [] as SchemaTable[]),
    getColumns: vi.fn(async () => [] as SchemaColumn[]),
    getIndexes: vi.fn(async () => [] as SchemaIndex[]),
    getSchemas: vi.fn(async () => [] as string[]),
    getDatabases: vi.fn(async () => [] as string[]),
    ...overrides,
  } as unknown as DbAdapter
}

describe('SchemaAccessImpl', () => {
  it('getTables delegates to the resolved adapter with schema arg', async () => {
    const tables: SchemaTable[] = [{ name: 'users', schema: 'public' } as SchemaTable]
    const adapter = makeAdapter({ getTables: vi.fn(async () => tables) })
    const access = new SchemaAccessImpl(id => (id === 'c1' ? adapter : undefined))

    const result = await access.getTables('c1', 'public')

    expect(result).toBe(tables)
    expect(adapter.getTables).toHaveBeenCalledWith('public')
  })

  it('getColumns delegates to the resolved adapter', async () => {
    const columns: SchemaColumn[] = [{ name: 'id', dataType: 'int' } as SchemaColumn]
    const adapter = makeAdapter({ getColumns: vi.fn(async () => columns) })
    const access = new SchemaAccessImpl(() => adapter)

    const result = await access.getColumns('c1', 'users', 'public')

    expect(result).toBe(columns)
    expect(adapter.getColumns).toHaveBeenCalledWith('users', 'public')
  })

  it('getIndexes delegates to the resolved adapter', async () => {
    const indexes: SchemaIndex[] = [{ name: 'idx_1' } as SchemaIndex]
    const adapter = makeAdapter({ getIndexes: vi.fn(async () => indexes) })
    const access = new SchemaAccessImpl(() => adapter)

    const result = await access.getIndexes('c1', 'users')

    expect(result).toBe(indexes)
    expect(adapter.getIndexes).toHaveBeenCalledWith('users', undefined)
  })

  it('getSchemas delegates to the resolved adapter', async () => {
    const adapter = makeAdapter({ getSchemas: vi.fn(async () => ['public', 'internal']) })
    const access = new SchemaAccessImpl(() => adapter)

    expect(await access.getSchemas('c1')).toEqual(['public', 'internal'])
  })

  it('getDatabases delegates to the resolved adapter', async () => {
    const adapter = makeAdapter({ getDatabases: vi.fn(async () => ['db1']) })
    const access = new SchemaAccessImpl(() => adapter)

    expect(await access.getDatabases('c1')).toEqual(['db1'])
  })

  it('throws a descriptive error when no adapter is active for the connection', async () => {
    const access = new SchemaAccessImpl(() => undefined)

    await expect(access.getTables('missing-conn')).rejects.toThrow(
      'No active connection: missing-conn',
    )
  })

  it('getSchemaSummary builds a table/column summary from the adapter', async () => {
    const tables: SchemaTable[] = [{ name: 'users' } as SchemaTable, { name: 'orders' } as SchemaTable]
    const usersColumns: SchemaColumn[] = [
      { name: 'id', dataType: 'int', isPrimaryKey: true, isForeignKey: false } as SchemaColumn,
      { name: 'name', dataType: 'text', isPrimaryKey: false, isForeignKey: false } as SchemaColumn,
    ]
    const ordersColumns: SchemaColumn[] = [
      {
        name: 'user_id',
        dataType: 'int',
        isPrimaryKey: false,
        isForeignKey: true,
        references: { table: 'users', column: 'id' },
      } as SchemaColumn,
    ]
    const getColumns = vi.fn(async (table: string) =>
      table === 'users' ? usersColumns : ordersColumns,
    )
    const adapter = makeAdapter({ getTables: vi.fn(async () => tables), getColumns })
    const access = new SchemaAccessImpl(() => adapter)

    const summary = await access.getSchemaSummary('c1', 'public')

    expect(summary).toEqual({
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', dataType: 'int', isPrimaryKey: true, isForeignKey: false, references: undefined },
            { name: 'name', dataType: 'text', isPrimaryKey: false, isForeignKey: false, references: undefined },
          ],
        },
        {
          name: 'orders',
          columns: [
            {
              name: 'user_id',
              dataType: 'int',
              isPrimaryKey: false,
              isForeignKey: true,
              references: { table: 'users', column: 'id' },
            },
          ],
        },
      ],
    })
    expect(getColumns).toHaveBeenCalledWith('users', 'public')
    expect(getColumns).toHaveBeenCalledWith('orders', 'public')
  })

  it('getSchemaSummary returns an empty tables array when there are no tables', async () => {
    const adapter = makeAdapter()
    const access = new SchemaAccessImpl(() => adapter)

    expect(await access.getSchemaSummary('c1')).toEqual({ tables: [] })
  })
})
