import { describe, it, expect, beforeAll } from 'vitest'
import { parseDbError } from '../../src/renderer/src/lib/db-error'
import { useDriverCapabilitiesStore } from '../../src/renderer/src/stores/driver-capabilities'
import { postgresErrorRules } from '../../src/main/plugins/bundled/postgresql/error-rules'
import { mysqlErrorRules } from '../../src/main/plugins/bundled/mysql/error-rules'
import { sqliteErrorRules } from '../../src/main/plugins/bundled/sqlite/error-rules'

// Seed the renderer's driver-capabilities cache with each driver's real
// errorRules, mirroring what the host serializes from the factory. parseDbError
// reads these by dbType to classify query-semantic errors.
beforeAll(() => {
  useDriverCapabilitiesStore.setState({
    byType: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      postgresql: { errorRules: postgresErrorRules } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mysql: { errorRules: mysqlErrorRules } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sqlite: { errorRules: sqliteErrorRules } as any,
    },
  })
})

describe('parseDbError — Postgres (driver rules)', () => {
  const cases: [string, string][] = [
    ['column "email" does not exist', 'COLUMN_NOT_FOUND'],
    ['relation "users" does not exist', 'TABLE_NOT_FOUND'],
    ['schema "app" does not exist', 'SCHEMA_NOT_FOUND'],
    ['syntax error at or near "SELEC"', 'SYNTAX_ERROR'],
    ['duplicate key value violates unique constraint "users_pkey"', 'UNIQUE_VIOLATION'],
    ['null value in column "name" violates not-null constraint', 'NOT_NULL_VIOLATION'],
    ['insert violates foreign key constraint "fk_x"', 'FOREIGN_KEY_VIOLATION'],
    ['new row violates check constraint "c_positive"', 'CHECK_VIOLATION'],
    ['invalid input syntax for type integer: "abc"', 'TYPE_MISMATCH'],
    ['relation "users" already exists', 'DUPLICATE_TABLE'],
    ['division by zero', 'DIVISION_BY_ZERO'],
    ['deadlock detected', 'DEADLOCK'],
    ['current transaction is aborted, commands ignored', 'TRANSACTION_ABORTED'],
  ]
  it.each(cases)('classifies %s', (msg, code) => {
    expect(parseDbError(msg, 'postgresql').code).toBe(code)
  })
  it('extracts the offending name into the message', () => {
    expect(parseDbError('column "email" does not exist', 'postgresql').message).toContain('email')
  })
})

describe('parseDbError — MySQL (driver rules)', () => {
  const cases: [string, string][] = [
    ["Unknown column 'email' in 'field list'", 'COLUMN_NOT_FOUND'],
    ["Table 'shop.users' doesn't exist", 'TABLE_NOT_FOUND'],
    ["You have an error in your SQL syntax; ... near 'SELEC' at line 1", 'SYNTAX_ERROR'],
    ["Duplicate entry 'a@b.com' for key 'users.email'", 'UNIQUE_VIOLATION'],
    ["Column 'name' cannot be null", 'NOT_NULL_VIOLATION'],
    ['Cannot add or update a child row: a foreign key constraint fails', 'FOREIGN_KEY_VIOLATION'],
    ['Incorrect integer value: \'x\' for column', 'TYPE_MISMATCH'],
    ["Table 'users' already exists", 'DUPLICATE_TABLE'],
    ['Deadlock found when trying to get lock', 'DEADLOCK'],
  ]
  it.each(cases)('classifies %s', (msg, code) => {
    expect(parseDbError(msg, 'mysql').code).toBe(code)
  })
})

describe('parseDbError — SQLite (driver rules)', () => {
  const cases: [string, string][] = [
    ['no such column: email', 'COLUMN_NOT_FOUND'],
    ['no such table: users', 'TABLE_NOT_FOUND'],
    ['near "SELEC": syntax error', 'SYNTAX_ERROR'],
    ['UNIQUE constraint failed: users.email', 'UNIQUE_VIOLATION'],
    ['NOT NULL constraint failed: users.name', 'NOT_NULL_VIOLATION'],
    ['FOREIGN KEY constraint failed', 'FOREIGN_KEY_VIOLATION'],
    ['CHECK constraint failed: c_positive', 'CHECK_VIOLATION'],
    ['datatype mismatch', 'TYPE_MISMATCH'],
  ]
  it.each(cases)('classifies %s', (msg, code) => {
    expect(parseDbError(msg, 'sqlite').code).toBe(code)
  })
})

describe('parseDbError — driver nouns in messages', () => {
  // A non-SQL driver that maps a couple of codes and declares its own nouns;
  // the friendly copy must read in those terms, not SQL "table/column/row".
  beforeAll(() => {
    useDriverCapabilitiesStore.setState((s) => ({
      byType: {
        ...s.byType,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        docstore: {
          errorRules: [
            { code: 'TABLE_NOT_FOUND', pattern: 'collection ([^ ]+) not found' },
            { code: 'COLUMN_NOT_FOUND', pattern: 'field ([^ ]+) missing' },
          ],
          nouns: {
            object: { one: 'collection', many: 'collections' },
            field: { one: 'field', many: 'fields' },
            record: { one: 'document', many: 'documents' },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
    }))
  })

  it('uses the driver object noun for TABLE_NOT_FOUND', () => {
    const r = parseDbError('collection orders not found', 'docstore')
    expect(r.code).toBe('TABLE_NOT_FOUND')
    expect(r.title).toBe('Collection not found')
    expect(r.message).toContain('collection')
    expect(r.message).not.toContain('table')
  })

  it('uses the driver field noun for COLUMN_NOT_FOUND', () => {
    const r = parseDbError('field email missing', 'docstore')
    expect(r.code).toBe('COLUMN_NOT_FOUND')
    expect(r.title).toBe('Field not found')
    expect(r.message).not.toContain('column')
  })

  it('falls back to generic nouns when the driver declares none', () => {
    useDriverCapabilitiesStore.setState((s) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      byType: { ...s.byType, plainstore: { errorRules: [{ code: 'TABLE_NOT_FOUND', pattern: 'object ([^ ]+) gone' }] } as any },
    }))
    const r = parseDbError('object foo gone', 'plainstore')
    expect(r.title).toBe('Object not found')
  })
})

describe('parseDbError — host rules (no dbType needed)', () => {
  const cases: [string, string][] = [
    ['password authentication failed for user "x"', 'AUTH_FAILED'],
    ['connect ECONNREFUSED 127.0.0.1:5432', 'CONNECTION_REFUSED'],
    ['server closed the connection unexpectedly', 'CONNECTION_LOST'],
    ['canceling statement due to statement timeout', 'TIMEOUT'],
    ['fetch failed', 'NETWORK_ERROR'],
    ['Error while decrypting the ciphertext', 'KEYRING_DECRYPT_FAILED'],
    ['429 too many requests', 'AI_RATE_LIMITED'],
    ['ENOENT: no such file or directory', 'FILE_NOT_FOUND'],
    ['permission denied for table users', 'PERMISSION_DENIED'],
    ['query was cancelled', 'QUERY_CANCELLED'],
    ['No OpenAI API key configured', 'AI_KEY_MISSING'],
    ['You have exceeded your current quota', 'AI_QUOTA_EXCEEDED'],
    ['OpenAI provider error: 503 Service Unavailable', 'AI_PROVIDER_ERROR'],
  ]
  it.each(cases)('classifies %s without a dbType', (msg, code) => {
    expect(parseDbError(msg).code).toBe(code)
  })
})

describe('parseDbError — driver rule edge cases', () => {
  it('skips a rule whose code has no DRIVER_RENDERERS entry and falls through to UNKNOWN', () => {
    useDriverCapabilitiesStore.setState((s) => ({
      byType: {
        ...s.byType,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        weird: { errorRules: [{ code: 'SOME_UNRENDERED_CODE', pattern: 'boom' }] } as any,
      },
    }))
    const r = parseDbError('boom happened', 'weird')
    expect(r.code).toBe('UNKNOWN')
  })

  it('skips a rule with an invalid regex pattern instead of throwing', () => {
    useDriverCapabilitiesStore.setState((s) => ({
      byType: {
        ...s.byType,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        broken: {
          errorRules: [
            { code: 'TABLE_NOT_FOUND', pattern: '(unterminated[' }, // invalid regex — must not throw
            { code: 'COLUMN_NOT_FOUND', pattern: 'field ([^ ]+) missing' },
          ],
        } as any,
      },
    }))
    expect(() => parseDbError('field email missing', 'broken')).not.toThrow()
    const r = parseDbError('field email missing', 'broken')
    expect(r.code).toBe('COLUMN_NOT_FOUND')
  })
})

describe('parseDbError — envelope + fallback', () => {
  it('strips the Electron IPC envelope before matching', () => {
    const wrapped = `Error invoking remote method 'db:query': column "x" does not exist`
    expect(parseDbError(wrapped, 'postgresql').code).toBe('COLUMN_NOT_FOUND')
  })
  it('falls back to UNKNOWN with the cleaned message', () => {
    const r = parseDbError('something totally unrecognised', 'postgresql')
    expect(r.code).toBe('UNKNOWN')
    expect(r.message).toBe('something totally unrecognised')
  })
  it('does not classify query-semantic errors without a dbType', () => {
    expect(parseDbError('column "x" does not exist').code).toBe('UNKNOWN')
  })
})
