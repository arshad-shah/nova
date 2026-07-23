// Architecture guard — pins the invariant documented in CLAUDE.md and beside
// the enforcement point (`src/main/plugins/sdk/driver-validation.ts`):
//
//   A driver declares its capabilities as serializable data on the
//   DriverFactory (`session`, `explain`, …) AND implements the matching
//   optional methods on its DbAdapter. The renderer gates features on the
//   declaration; the glue calls the methods. Nothing structurally linked the
//   two, so a driver could declare a capability it never implemented (a button
//   that crashes on click) or implement one it never declared (a feature that
//   silently never appears). The DriverRegistry now validates the two agree —
//   in BOTH directions — at registration.
//
// Deliberately-planted regressions that must turn this red:
//   • declare `session.manualTransactions: true` but omit `rollback` on the
//     adapter → "declares Transactional … does not implement: rollback".
//   • implement `beginTransaction` but omit the `session` declaration →
//     "implements Transactional method(s) … but does not declare".
//
// Enforcement runs at the adapter-construction chokepoint
// (`src/main/db/factory.ts`), not at registration, so registration stays pure
// (it builds no probe adapter). See issue #168.
import { describe, it, expect, beforeEach } from 'vitest'
import { DriverRegistryImpl } from '../../../src/main/plugins/sdk/driver-registry'
import { createAdapter, setDriverRegistry } from '../../../src/main/db/factory'
import {
  validateDriverCapabilities,
  TRANSACTIONAL_METHODS,
  EXPLAIN_TREE_METHODS,
  DATABASE_SWITCH_METHODS,
} from '../../../src/main/plugins/sdk/driver-validation'
import type { DriverFactory } from '../../../src/main/plugins/sdk/types'
import type { DbAdapter } from '../../../src/main/db/adapter'
import type { ConnectionProfile } from '@shared/types'

import * as postgresqlPlugin from '../../../src/main/plugins/bundled/postgresql/index'
import * as mysqlPlugin from '../../../src/main/plugins/bundled/mysql/index'
import * as sqlitePlugin from '../../../src/main/plugins/bundled/sqlite/index'
import * as mongoPlugin from '../../../src/main/plugins/bundled/mongodb/index'
import * as redisPlugin from '../../../src/main/plugins/bundled/redis/index'
import * as snowflakePlugin from '../../../src/main/plugins/bundled/snowflake/index'

/** A DbAdapter stub exposing only the named optional methods, so a factory can
 *  advertise (or withhold) exactly the implementation half of a capability. */
function adapterWith(methods: string[]): DbAdapter {
  const adapter: Record<string, unknown> = {}
  for (const m of methods) adapter[m] = async () => {}
  return adapter as unknown as DbAdapter
}

function factory(overrides: Partial<DriverFactory>, methods: string[] = []): DriverFactory {
  return {
    createAdapter: () => adapterWith(methods),
    connectionFields: [],
    ...overrides,
  }
}

describe('driver capability declaration ↔ implementation agreement (#168)', () => {
  describe('validateDriverCapabilities — Transactional', () => {
    it('accepts a driver that declares session and implements the whole lifecycle', () => {
      const f = factory({ session: { autoCommit: true, manualTransactions: true } }, [...TRANSACTIONAL_METHODS])
      expect(validateDriverCapabilities('good', f).ok).toBe(true)
    })

    it('rejects a declaration with a missing method, naming the gap and the fix', () => {
      const partial = TRANSACTIONAL_METHODS.filter((m) => m !== 'rollback')
      const f = factory({ session: { autoCommit: true, manualTransactions: true } }, [...partial])
      const report = validateDriverCapabilities('leaky', f)
      expect(report.ok).toBe(false)
      expect(report.errors.join('\n')).toMatch(/Transactional/)
      expect(report.errors.join('\n')).toMatch(/rollback/)
      expect(report.errors.join('\n')).toMatch(/drop the declaration/)
    })

    it('rejects an implementation with no declaration, naming the declaration to add', () => {
      const f = factory({}, ['beginTransaction', 'commit', 'rollback'])
      const report = validateDriverCapabilities('undeclared', f)
      expect(report.ok).toBe(false)
      expect(report.errors.join('\n')).toMatch(/does not declare/)
      expect(report.errors.join('\n')).toMatch(/session\.manualTransactions/)
    })

    it('ignores autoCommit-only session declarations (manualTransactions not set)', () => {
      const f = factory({ session: { autoCommit: true, manualTransactions: false } }, [])
      expect(validateDriverCapabilities('autoonly', f).ok).toBe(true)
    })
  })

  describe('validateDriverCapabilities — ExplainsTree', () => {
    it('accepts explain: tree with parseQueryPlan', () => {
      const f = factory(
        { explain: { supportsAnalyze: true, format: 'tree', statement: 'EXPLAIN' } },
        [...EXPLAIN_TREE_METHODS],
      )
      expect(validateDriverCapabilities('pg-like', f).ok).toBe(true)
    })

    it('accepts explain: text with no parser (raw plan text needs no tree)', () => {
      const f = factory({ explain: { supportsAnalyze: false, format: 'text', statement: 'EXPLAIN' } }, [])
      expect(validateDriverCapabilities('text-explain', f).ok).toBe(true)
    })

    it('rejects explain: tree without parseQueryPlan', () => {
      const f = factory({ explain: { supportsAnalyze: true, format: 'tree', statement: 'EXPLAIN' } }, [])
      const report = validateDriverCapabilities('no-parser', f)
      expect(report.ok).toBe(false)
      expect(report.errors.join('\n')).toMatch(/parseQueryPlan/)
    })

    it('rejects parseQueryPlan without an explain: tree declaration', () => {
      const f = factory({ explain: { supportsAnalyze: false, format: 'text', statement: 'EXPLAIN' } }, [
        'parseQueryPlan',
      ])
      const report = validateDriverCapabilities('stray-parser', f)
      expect(report.ok).toBe(false)
      expect(report.errors.join('\n')).toMatch(/ExplainsTree/)
    })
  })

  describe('validateDriverCapabilities — SwitchesDatabase', () => {
    it('accepts databaseSwitch declared with a switchDatabase method', () => {
      const f = factory({ databaseSwitch: { supported: true } }, [...DATABASE_SWITCH_METHODS])
      expect(validateDriverCapabilities('switcher', f).ok).toBe(true)
    })

    it('accepts a driver that neither declares nor implements switching (SQLite-shaped)', () => {
      const f = factory({}, [])
      expect(validateDriverCapabilities('no-switch', f).ok).toBe(true)
    })

    it('rejects databaseSwitch declared without a switchDatabase method', () => {
      const f = factory({ databaseSwitch: { supported: true } }, [])
      const report = validateDriverCapabilities('claims-switch', f)
      expect(report.ok).toBe(false)
      expect(report.errors.join('\n')).toMatch(/SwitchesDatabase/)
      expect(report.errors.join('\n')).toMatch(/switchDatabase/)
    })

    it('rejects a switchDatabase method with no databaseSwitch declaration', () => {
      const f = factory({}, ['switchDatabase'])
      const report = validateDriverCapabilities('stray-switch', f)
      expect(report.ok).toBe(false)
      expect(report.errors.join('\n')).toMatch(/does not declare/)
      expect(report.errors.join('\n')).toMatch(/databaseSwitch/)
    })

    it('treats databaseSwitch: { supported: false } as not declared', () => {
      // A driver that says it can't switch must not implement the method either.
      const f = factory({ databaseSwitch: { supported: false } }, [])
      expect(validateDriverCapabilities('opted-out', f).ok).toBe(true)
    })
  })

  it('cannot verify → does not report a mismatch (constructor needs real config)', () => {
    const f: DriverFactory = {
      createAdapter: () => {
        throw new Error('needs real config')
      },
      connectionFields: [],
      session: { autoCommit: true, manualTransactions: true },
    }
    expect(validateDriverCapabilities('opaque', f).ok).toBe(true)
  })

  describe('adapter construction (factory.createAdapter) enforces agreement', () => {
    // Registration stays pure — it constructs nothing — so a mismatch surfaces
    // when the adapter is built for a connect, from the single chokepoint every
    // real adapter passes through. Registering never throws; constructing does.
    function profileFor(type: string): ConnectionProfile {
      return { id: 'p1', name: 'Test', type: type as ConnectionProfile['type'] }
    }
    function wire(id: string, f: DriverFactory): void {
      const registry = new DriverRegistryImpl()
      registry.register(id, f) // pure — must not throw regardless of agreement
      setDriverRegistry(registry)
    }

    beforeEach(() => setDriverRegistry(new DriverRegistryImpl()))

    it('builds an adapter whose declaration and implementation agree', () => {
      const f = factory({ session: { autoCommit: true, manualTransactions: true } }, [...TRANSACTIONAL_METHODS])
      wire('ok', f)
      expect(() => createAdapter(profileFor('ok'))).not.toThrow()
    })

    it('registration itself never throws, even for a mismatched driver', () => {
      const registry = new DriverRegistryImpl()
      const partial = TRANSACTIONAL_METHODS.filter((m) => m !== 'rollback')
      const f = factory({ session: { autoCommit: true, manualTransactions: true } }, [...partial])
      expect(() => registry.register('broken', f)).not.toThrow()
      expect(registry.has('broken')).toBe(true)
    })

    it('throws an actionable error when building a declared-but-unimplemented driver', () => {
      const partial = TRANSACTIONAL_METHODS.filter((m) => m !== 'rollback')
      const f = factory({ session: { autoCommit: true, manualTransactions: true } }, [...partial])
      wire('broken', f)
      expect(() => createAdapter(profileFor('broken'))).toThrow(/rollback/)
    })

    it('throws when a driver implements a capability it never declares', () => {
      const f = factory({}, ['beginTransaction', 'commit', 'rollback'])
      wire('sneaky', f)
      expect(() => createAdapter(profileFor('sneaky'))).toThrow(/does not declare/)
    })
  })

  describe('every bundled driver already agrees', () => {
    // Activate each bundled driver plugin against a capturing registry and
    // assert the registered factory passes validation. This is the table-driven
    // parity oracle: add a bundled driver and it must satisfy the same contract.
    const noop = () => ({ dispose() {} })
    // A stub PluginContext that answers every surface the bundled drivers touch
    // at activation. They only *register* contributions here — the callbacks
    // (completion providers, context providers) never run during activate — so
    // benign noops suffice to reach `ctx.drivers.register`, where validation runs.
    function ctxWith(registry: DriverRegistryImpl): never {
      return {
        drivers: registry,
        completions: { register: noop },
        exporters: { register: noop },
        importers: { register: noop },
        formatters: { register: noop },
        typeMappers: { register: noop },
        commands: { register: noop },
        ai: { registerContextProvider: noop },
        connections: { getProfile: () => undefined, query: async () => ({ rows: [], fields: [], rowCount: 0 }) },
        schema: { getTables: async () => [], getColumns: async () => [] },
        ui: { invalidate: noop, registerResolver: noop, registerToolbar: noop },
      } as never
    }

    const plugins: [string, string, (ctx: never) => void][] = [
      ['postgresql', 'postgresql', postgresqlPlugin.activate],
      ['mysql', 'mysql', mysqlPlugin.activate],
      ['sqlite', 'sqlite', sqlitePlugin.activate],
      ['mongodb', 'mongodb', mongoPlugin.activate],
      ['redis', 'redis', redisPlugin.activate],
      ['snowflake', 'snowflake', snowflakePlugin.activate],
    ]

    for (const [name, driverId, activate] of plugins) {
      it(`${name} declaration matches its adapter implementation`, () => {
        const registry = new DriverRegistryImpl()
        // Registration itself validates; reaching the assertion proves agreement.
        expect(() => activate(ctxWith(registry))).not.toThrow()
        const f = registry.get(driverId)
        expect(f).toBeDefined()
        expect(validateDriverCapabilities(driverId, f!).ok).toBe(true)
      })
    }
  })
})
