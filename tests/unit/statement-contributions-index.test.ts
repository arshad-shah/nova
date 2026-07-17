// registerBuiltinStatementContributions wires the three built-in syntaxes
// into the shared statement-registry. Its own module-level logic (the
// registration call itself) isn't exercised by statement-registry.test.ts,
// which only tests the registry with hand-rolled fake contributions.
import { describe, it, expect, beforeEach } from 'vitest'
import { registerBuiltinStatementContributions } from '../../src/renderer/src/lib/statement-contributions'
import { getStatementContribution, _resetForTests } from '../../src/renderer/src/lib/statement-registry'
import { sqlStatementContribution } from '../../src/renderer/src/lib/statement-contributions/sql'
import { redisStatementContribution } from '../../src/renderer/src/lib/statement-contributions/redis'
import { mongoStatementContribution } from '../../src/renderer/src/lib/statement-contributions/mongodb'

beforeEach(() => _resetForTests())

describe('registerBuiltinStatementContributions', () => {
  it('registers sql, redis, and mongodb under their syntax ids', () => {
    registerBuiltinStatementContributions()
    expect(getStatementContribution('sql')).toBe(sqlStatementContribution)
    expect(getStatementContribution('redis')).toBe(redisStatementContribution)
    expect(getStatementContribution('mongodb')).toBe(mongoStatementContribution)
  })

  it('does not register anything under a db-type key — lookup is by syntax id only', () => {
    registerBuiltinStatementContributions()
    expect(getStatementContribution('postgresql')).toBeUndefined()
    expect(getStatementContribution('mysql')).toBeUndefined()
  })
})
