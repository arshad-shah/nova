// Architecture guard — pins the load-bearing invariant documented in CLAUDE.md
// and at the enforcement point (`src/main/db/factory.ts`):
//
//   Every driver — INCLUDING the native sqlite/postgresql/mysql ones — is a
//   bundled plugin that registers a factory with the SDK DriverRegistry. There
//   are NO special-cased built-ins in `src/main/db/`; `createAdapter` resolves
//   a profile's adapter purely through a registry lookup, with zero driver
//   knowledge.
//
// Why this matters (the reason, so it survives the rule): because first-party
// drivers travel exactly the same path as third-party ones, the plugin SDK
// cannot quietly become inadequate — any gap in the SDK breaks Postgres, so it
// gets fixed. The moment a built-in is special-cased, the SDK stops being
// dogfooded and third-party drivers become second-class citizens.
//
// This file guards that property two ways:
//   1. Behaviourally — `createAdapter` constructs whatever the registry holds
//      for `profile.type` (register a fake driver → it is built; unregister it
//      → a clean, actionable error), proving the resolve path carries no
//      compiled-in driver knowledge.
//   2. Statically — no file under `src/main/db/` branches on a known driver
//      name or imports a bundled-driver implementation directly.
//
// Deliberately-planted regression that must turn this red:
//   `if (profile.type === 'postgresql') return new PostgresAdapter(profile)`
// trips both the static literal scan and the bundled-import scan.
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createAdapter, setDriverRegistry } from '../../../src/main/db/factory'
import { DriverRegistryImpl } from '../../../src/main/plugins/sdk/driver-registry'
import type { DriverFactory } from '../../../src/main/plugins/sdk/types'
import type { DbAdapter } from '../../../src/main/db/adapter'
import type { ConnectionProfile } from '@shared/types'

function makeProfile(type: string): ConnectionProfile {
  return {
    id: 'p1',
    name: 'Test',
    type: type as ConnectionProfile['type'],
    database: 'testdb',
  }
}

describe('createAdapter resolves purely through the DriverRegistry', () => {
  beforeEach(() => {
    // Fresh registry per test — the factory holds a module-level singleton.
    setDriverRegistry(new DriverRegistryImpl())
  })

  it('constructs whatever the registry holds for the profile type — no built-in knowledge', () => {
    const registry = new DriverRegistryImpl()
    const built = { __marker: 'fake-adapter' } as unknown as DbAdapter
    let receivedProfile: unknown
    const factory: DriverFactory = {
      createAdapter: (p) => {
        receivedProfile = p
        return built
      },
    }
    // A driver type the core has never heard of. If the factory carried any
    // compiled-in driver knowledge it could not build this.
    registry.register('totally-made-up-driver', factory)
    setDriverRegistry(registry)

    const profile = makeProfile('totally-made-up-driver')
    const adapter = createAdapter(profile)

    expect(adapter).toBe(built)
    expect(receivedProfile).toBe(profile)
  })

  it('gives a clean, actionable error once the driver is unregistered', () => {
    const registry = new DriverRegistryImpl()
    const disposable = registry.register('totally-made-up-driver', {
      createAdapter: () => ({}) as DbAdapter,
    })
    setDriverRegistry(registry)

    // Present while registered…
    expect(() => createAdapter(makeProfile('totally-made-up-driver'))).not.toThrow()

    // …gone after unregister, with a message that names the missing type.
    disposable.dispose()
    expect(() => createAdapter(makeProfile('totally-made-up-driver'))).toThrow(
      /No driver registered for type: totally-made-up-driver/,
    )
  })

  it('errors clearly when no registry has been wired at all', () => {
    setDriverRegistry(null as unknown as DriverRegistryImpl)
    expect(() => createAdapter(makeProfile('sqlite'))).toThrow(/registry not initialized/i)
  })
})

// ---------------------------------------------------------------------------
// Static guard: nothing in src/main/db/ may special-case a driver.
// ---------------------------------------------------------------------------

const DB_DIR = path.join(__dirname, '..', '..', '..', 'src', 'main', 'db')

// Known first-party + bundled driver identities. Branching on any of these by
// name inside src/main/db/ is exactly the special-casing this guard forbids.
const KNOWN_DRIVER_NAMES = [
  'postgresql',
  'postgres',
  'mysql',
  'sqlite',
  'mongodb',
  'mongo',
  'redis',
  'snowflake',
]

function dbSourceFiles(): string[] {
  return fs
    .readdirSync(DB_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx')))
    .map((e) => path.join(DB_DIR, e.name))
}

function stripComments(source: string): string {
  // Scan code, not documentation: the invariant rationale comment in
  // factory.ts legitimately names drivers.
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('src/main/db/ contains no special-cased built-in drivers', () => {
  const files = dbSourceFiles()

  it('finds the db source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s references no known driver by name', (file) => {
    const source = stripComments(fs.readFileSync(file, 'utf-8'))
    const offenders = KNOWN_DRIVER_NAMES.filter((name) =>
      new RegExp(`(["'\`])${name}\\1`).test(source),
    )
    expect(
      offenders,
      `src/main/db/ must stay driver-agnostic — resolve adapters through the ` +
        `DriverRegistry, never branch on a driver name. Offending literal(s): ` +
        `${offenders.join(', ')}. Put dialect knowledge inside the driver plugin ` +
        `under src/main/plugins/bundled/<driver>/.`,
    ).toEqual([])
  })

  it.each(files)('%s does not import a bundled-driver implementation', (file) => {
    const source = stripComments(fs.readFileSync(file, 'utf-8'))
    const match = source.match(/from\s+['"][^'"]*plugins\/bundled\/[^'"]+['"]/)
    expect(
      match?.[0],
      `src/main/db/ must not import a bundled driver directly (${match?.[0]}). ` +
        `Adapters are constructed only via the DriverRegistry factory, so core ` +
        `never depends on a concrete driver.`,
    ).toBeUndefined()
  })
})
