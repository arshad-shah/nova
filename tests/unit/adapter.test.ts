import { describe, it, expect, beforeEach } from 'vitest'
import { createAdapter, setDriverRegistry } from '../../src/main/db/factory'
import { DriverRegistryImpl } from '../../src/main/plugins/sdk/driver-registry'
import type { DbAdapter } from '../../src/main/db/adapter'
import type { ConnectionProfile } from '../../shared/types'

function makeStubAdapter(): DbAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
    testConnection: async () => ({ version: '1.0' }),
    query: async () => ({ rows: [], fields: [], rowCount: 0, duration: 0, affectedRows: 0 }),
    getTables: async () => [],
    getColumns: async () => [],
    getIndexes: async () => [],
    getRowCount: async () => 0,
    getSchemas: async () => [],
    getDatabases: async () => [],
    isConnected: () => true
  }
}

describe('createAdapter factory', () => {
  let registry: DriverRegistryImpl

  beforeEach(() => {
    registry = new DriverRegistryImpl()
    setDriverRegistry(registry)
  })

  it('creates adapter from registered driver', () => {
    registry.register('postgresql', {
      createAdapter: () => makeStubAdapter(),
      connectionFields: []
    })
    const profile: ConnectionProfile = { id: '1', name: 'test', type: 'postgresql', database: 'testdb' }
    const adapter = createAdapter(profile)
    expect(adapter.isConnected()).toBe(true)
  })

  it('throws on unregistered type', () => {
    const profile: ConnectionProfile = { id: '2', name: 'test', type: 'oracle' as any, database: 'test' }
    expect(() => createAdapter(profile)).toThrow('No driver registered for type: oracle')
  })

  it('throws if registry not initialized', () => {
    setDriverRegistry(null as any)
    const profile: ConnectionProfile = { id: '3', name: 'test', type: 'postgresql', database: 'test' }
    expect(() => createAdapter(profile)).toThrow('Driver registry not initialized')
  })
})
