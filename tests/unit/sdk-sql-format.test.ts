import { describe, it, expect } from 'vitest'
import {
  formatSql,
  formatSqlValue,
  generateCreateTable,
  generateInsertStatements,
  createSqlExporter,
  createMigrationDdl,
  createSampleQuery,
  createSqlImporter,
  renderPageClause,
} from '../../src/main/plugins/sdk/sql-format'
import type { SchemaColumn } from '@shared/types'
import type { DbAdapter } from '../../src/main/db/adapter'

function col(overrides: Partial<SchemaColumn> = {}): SchemaColumn {
  return {
    name: 'col',
    dataType: 'text',
    nullable: true,
    isPrimaryKey: false,
    isForeignKey: false,
    ...overrides,
  } as SchemaColumn
}

describe('formatSql', () => {
  it('pretty-prints a simple select onto multiple lines', () => {
    const result = formatSql('select a,b from t where a=1')
    expect(result).toBe('select\n  a,\n  b\nfrom\n  t\nwhere\n  a = 1')
    expect(result.split('\n').length).toBeGreaterThan(1)
  })

  it('returns the input unchanged when sql-formatter cannot parse it', () => {
    // An unclosed parenthesis is a genuine parse error for sql-formatter.
    const bad = 'SELECT * FROM ('
    expect(formatSql(bad)).toBe(bad)
  })

  it('defaults to the generic sql dialect when none is given', () => {
    const result = formatSql('select 1')
    expect(result).toBe('select\n  1')
  })
})

describe('formatSqlValue', () => {
  it('renders null and undefined as NULL', () => {
    expect(formatSqlValue(null)).toBe('NULL')
    expect(formatSqlValue(undefined)).toBe('NULL')
  })

  it('renders numbers unquoted', () => {
    expect(formatSqlValue(42)).toBe('42')
    expect(formatSqlValue(3.14)).toBe('3.14')
  })

  it('renders booleans as TRUE/FALSE', () => {
    expect(formatSqlValue(true)).toBe('TRUE')
    expect(formatSqlValue(false)).toBe('FALSE')
  })

  it('renders strings single-quoted with embedded quotes doubled', () => {
    expect(formatSqlValue("it's fine")).toBe("'it''s fine'")
  })

  it('renders objects as JSON-encoded, quote-escaped string literals', () => {
    expect(formatSqlValue({ a: "b'c" })).toBe(`'{"a":"b''c"}'`)
  })
})

describe('generateCreateTable', () => {
  it('emits PRIMARY KEY for pk columns and NOT NULL for required non-pk columns', () => {
    const columns = [
      col({ name: 'id', dataType: 'INTEGER', isPrimaryKey: true, nullable: false }),
      col({ name: 'name', dataType: 'TEXT', nullable: false }),
      col({ name: 'bio', dataType: 'TEXT', nullable: true }),
    ]
    const ddl = generateCreateTable('users', columns, '"')
    expect(ddl).toBe(
      'CREATE TABLE "users" (\n' +
        '  "id" INTEGER PRIMARY KEY,\n' +
        '  "name" TEXT NOT NULL,\n' +
        '  "bio" TEXT\n' +
        ');\n',
    )
  })

  it('includes a DEFAULT clause when a column has a default value', () => {
    const columns = [col({ name: 'active', dataType: 'BOOLEAN', nullable: false, defaultValue: 'true' })]
    const ddl = generateCreateTable('t', columns, '`')
    expect(ddl).toContain('DEFAULT true')
    expect(ddl).toContain('`active`')
  })

  it('does not add NOT NULL for a nullable primary key', () => {
    const columns = [col({ name: 'id', isPrimaryKey: true, nullable: true })]
    const ddl = generateCreateTable('t', columns, '"')
    expect(ddl).toContain('"id" text PRIMARY KEY')
    expect(ddl).not.toContain('NOT NULL')
  })
})

describe('generateInsertStatements', () => {
  it('emits a "-- No data" marker for an empty row set', () => {
    expect(generateInsertStatements('users', [col({ name: 'id' })], [], '"')).toBe(
      '-- No data in users\n',
    )
  })

  it('emits one INSERT per row with quoted table/column names', () => {
    const columns = [col({ name: 'id', dataType: 'int' }), col({ name: 'name', dataType: 'text' })]
    const rows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: null },
    ]
    const sql = generateInsertStatements('users', columns, rows, '"')
    expect(sql).toBe(
      'INSERT INTO "users" ("id", "name") VALUES (1, \'Alice\');\n' +
        'INSERT INTO "users" ("id", "name") VALUES (2, NULL);\n',
    )
  })
})

describe('createSqlExporter', () => {
  it('includes CREATE TABLE + INSERTs when includeSchema is true', () => {
    const exporter = createSqlExporter({ quoteChar: '"', displayName: 'SQL', appliesToTypes: ['table'] })
    const columns = [col({ name: 'id', dataType: 'int', isPrimaryKey: true, nullable: false })]
    const result = exporter.execute([{ id: 1 }], columns, { tableName: 'users', includeSchema: true } as any)
    expect(result).toContain('CREATE TABLE "users"')
    expect(result).toContain('INSERT INTO "users"')
  })

  it('omits CREATE TABLE when includeSchema is false', () => {
    const exporter = createSqlExporter({ quoteChar: '"', displayName: 'SQL', appliesToTypes: ['table'] })
    const columns = [col({ name: 'id', dataType: 'int' })]
    const result = exporter.execute([{ id: 1 }], columns, { tableName: 'users', includeSchema: false } as any)
    expect(result).not.toContain('CREATE TABLE')
    expect(result).toContain('INSERT INTO "users"')
  })

  it('carries the format/extension/displayName/appliesToTypes descriptor through', () => {
    const exporter = createSqlExporter({ quoteChar: '`', displayName: 'MySQL', appliesToTypes: ['table', 'view'] })
    expect(exporter.format).toBe('sql')
    expect(exporter.extension).toBe('sql')
    expect(exporter.displayName).toBe('MySQL')
    expect(exporter.appliesToTypes).toEqual(['table', 'view'])
    expect(exporter.supportsSchema).toBe(true)
  })
})

describe('createMigrationDdl', () => {
  it('drops FK metadata from generated columns', async () => {
    const gen = createMigrationDdl('"')
    const columns = [
      {
        name: 'user_id',
        dataType: 'int',
        nullable: false,
        isPrimaryKey: false,
        defaultValue: null,
        isForeignKey: true,
        references: { table: 'users', column: 'id' },
      } as unknown as SchemaColumn,
    ]
    const ddl = await gen('orders', columns)
    expect(ddl).toContain('CREATE TABLE "orders"')
    expect(ddl).toContain('"user_id" int NOT NULL')
    // No trace of FK-specific syntax since references/isForeignKey are stripped
    expect(ddl).not.toContain('REFERENCES')
  })
})

describe('createSampleQuery', () => {
  it('qualifies with schema by default and applies the default limit', async () => {
    const sample = createSampleQuery('"')
    expect(await sample('users', 'public')).toBe('SELECT * FROM "public"."users" LIMIT 100;')
  })

  it('omits the schema when there is none', async () => {
    const sample = createSampleQuery('"')
    expect(await sample('users')).toBe('SELECT * FROM "users" LIMIT 100;')
  })

  it('honours a custom limit', async () => {
    const sample = createSampleQuery('"', { limit: 5 })
    expect(await sample('users')).toBe('SELECT * FROM "users" LIMIT 5;')
  })

  it('skips qualification when qualifySchema rejects the schema (e.g. sqlite "main")', async () => {
    const sample = createSampleQuery('"', { qualifySchema: s => s !== 'main' })
    expect(await sample('users', 'main')).toBe('SELECT * FROM "users" LIMIT 100;')
    expect(await sample('users', 'other')).toBe('SELECT * FROM "other"."users" LIMIT 100;')
  })
})

describe('renderPageClause', () => {
  it('renders LIMIT for the limit-offset style with no offset', () => {
    expect(renderPageClause('limit-offset', 100)).toBe('LIMIT 100')
  })

  it('renders LIMIT … OFFSET when an offset is given', () => {
    expect(renderPageClause('limit-offset', 100, 200)).toBe('LIMIT 100 OFFSET 200')
  })

  it('renders OFFSET … FETCH NEXT for the offset-fetch style', () => {
    expect(renderPageClause('offset-fetch', 100, 200)).toBe('OFFSET 200 ROWS FETCH NEXT 100 ROWS ONLY')
  })

  it('coerces limit/offset to non-negative integers so nothing can be injected', () => {
    // A caller can never smuggle SQL through the numeric arguments.
    expect(renderPageClause('limit-offset', 10.9, -5)).toBe('LIMIT 10')
    expect(renderPageClause('limit-offset', -1)).toBe('LIMIT 0')
  })
})

describe('createSqlImporter', () => {
  function makeAdapter(behavior: (sql: string) => void) {
    return {
      query: async (sql: string) => {
        behavior(sql)
        return {} as any
      },
    } as unknown as DbAdapter
  }

  it('executes every split statement against the adapter and counts successes', async () => {
    const executed: string[] = []
    const importer = createSqlImporter({ displayName: 'SQL', appliesToTypes: ['table'] })
    const adapter = makeAdapter(sql => executed.push(sql))

    const result = await importer.parse('INSERT INTO t VALUES (1); INSERT INTO t VALUES (2);', {
      adapter,
    } as any)

    expect(executed).toEqual(['INSERT INTO t VALUES (1)', 'INSERT INTO t VALUES (2)'])
    expect(result).toEqual({ rows: [], executed: 2, errors: [] })
  })

  it('collects a per-statement error without aborting the remaining statements', async () => {
    const importer = createSqlImporter({ displayName: 'SQL', appliesToTypes: ['table'] })
    let call = 0
    const adapter = {
      query: async () => {
        call++
        if (call === 1) throw new Error('boom')
        return {} as any
      },
    } as unknown as DbAdapter

    const result = await importer.parse('BAD SQL; SELECT 1;', { adapter } as any)

    expect(result.executed).toBe(1)
    expect(result.errors).toEqual(['Statement 1: boom'])
  })

  it('throws when no adapter is supplied', async () => {
    const importer = createSqlImporter({ displayName: 'SQL', appliesToTypes: ['table'] })
    await expect(importer.parse('SELECT 1;', {} as any)).rejects.toThrow(
      'SQL importer requires an active adapter',
    )
  })

  it('accepts Buffer content and decodes it as utf-8', async () => {
    const executed: string[] = []
    const importer = createSqlImporter({ displayName: 'SQL', appliesToTypes: ['table'] })
    const adapter = makeAdapter(sql => executed.push(sql))

    await importer.parse(Buffer.from('SELECT 1;', 'utf-8'), { adapter } as any)

    expect(executed).toEqual(['SELECT 1'])
  })

  it('declares the sql format descriptor with driverExecutes true', () => {
    const importer = createSqlImporter({ displayName: 'SQL', appliesToTypes: ['table'] })
    expect(importer.format).toBe('sql')
    expect(importer.extensions).toEqual(['sql'])
    expect(importer.driverExecutes).toBe(true)
  })
})
