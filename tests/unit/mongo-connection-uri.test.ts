// The mongodb plugin's `createAdapter` builds a mongodb:// connection string
// from a connection-profile config. This is the one place that decides
// protocol (mongodb vs mongodb+srv), whether auth/tls query params are
// present, and whether credentials are URI-encoded. Getting any of these
// wrong either breaks the connection or leaks unescaped special characters
// into the URI (e.g. a password containing '@' terminating the userinfo
// section early).
import { describe, it, expect } from 'vitest'
import { DriverRegistryImpl } from '../../src/main/plugins/sdk/driver-registry'
import { activate } from '../../src/main/plugins/bundled/mongodb/index'
import { MongoAdapter } from '../../src/main/plugins/bundled/mongodb/mongo-adapter'

function ctxWith(registry: DriverRegistryImpl) {
  const noop = () => ({ dispose() {} })
  return {
    drivers: registry,
    completions: { register: noop },
    exporters: { register: noop },
    importers: { register: noop },
    formatters: { register: noop },
    ai: { registerContextProvider: noop },
  } as never
}

function uriFor(config: Record<string, unknown>): string {
  const registry = new DriverRegistryImpl()
  activate(ctxWith(registry))
  const adapter = registry.get('mongodb')!.createAdapter(config) as MongoAdapter
  return (adapter as unknown as { uri: string }).uri
}

describe('mongodb createAdapter — connection URI', () => {
  it('builds a plain default URI with no auth/tls when nothing is configured', () => {
    expect(uriFor({})).toBe('mongodb://localhost:27017/test')
  })

  it('uses the configured host/port/database', () => {
    expect(uriFor({ host: 'cluster.example.com', port: 27018, database: 'app' }))
      .toBe('mongodb://cluster.example.com:27018/app')
  })

  it('switches to mongodb+srv and omits the port when srv is set', () => {
    const uri = uriFor({ host: 'cluster.mongodb.net', srv: true, database: 'app' })
    expect(uri).toBe('mongodb+srv://cluster.mongodb.net/app')
    expect(uri).not.toContain(':27017')
  })

  it('URI-encodes username and password so special characters cannot break the userinfo section', () => {
    const uri = uriFor({ username: 'user@corp', password: 'p@ss:word/!' })
    expect(uri).toContain(`${encodeURIComponent('user@corp')}:${encodeURIComponent('p@ss:word/!')}@`)
    // The raw (unencoded) credentials must not appear anywhere in the URI —
    // an unescaped '@' or ':' in them would otherwise be parsed as extra
    // userinfo/host separators.
    expect(uri).not.toContain('user@corp')
    expect(uri).not.toContain('p@ss:word/!')
  })

  it('adds authSource only when a username is present, defaulting to "admin"', () => {
    expect(uriFor({ username: 'u', password: 'p' })).toContain('authSource=admin')
    expect(uriFor({})).not.toContain('authSource')
  })

  it('uses a custom authSource when provided alongside a username', () => {
    expect(uriFor({ username: 'u', password: 'p', authSource: 'myapp' })).toContain('authSource=myapp')
  })

  it('omits authSource when ssl/auth params would otherwise be empty', () => {
    const uri = uriFor({ ssl: false })
    expect(uri).not.toContain('?')
  })

  it('adds tls=true when ssl is enabled, independent of auth', () => {
    expect(uriFor({ ssl: true })).toContain('tls=true')
  })

  it('joins multiple query params with & when both auth and ssl are set', () => {
    const uri = uriFor({ username: 'u', password: 'p', ssl: true })
    const query = uri.split('?')[1]
    expect(query).toBe('authSource=admin&tls=true')
  })

  it('constructs the adapter with the configured database as the default db', () => {
    const registry = new DriverRegistryImpl()
    activate(ctxWith(registry))
    const adapter = registry.get('mongodb')!.createAdapter({ database: 'reporting' }) as MongoAdapter
    expect((adapter as unknown as { currentDatabase: string }).currentDatabase).toBe('reporting')
  })
})
