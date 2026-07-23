import { describe, it, expect } from 'vitest'
import { serializeStaticCapabilities } from '../../src/main/plugins/sdk/capabilities'
import type { DriverFactory } from '../../src/main/plugins/sdk/types'
import type { DbAdapter } from '../../src/main/db/adapter'

function factory(overrides: Partial<DriverFactory>): DriverFactory {
  return {
    createAdapter: () => ({} as DbAdapter),
    connectionFields: [],
    ...overrides,
  }
}

describe('serializeStaticCapabilities', () => {
  it('strips functions and reports their presence as flags', () => {
    const caps = serializeStaticCapabilities(factory({ sampleQuery: () => 'x', getTableData: async () => ({ rows: [], columns: [] }) }))
    expect(caps.hasSampleQuery).toBe(true)
    expect(caps.hasGetTableData).toBe(true)
    expect((caps as Record<string, unknown>).sampleQuery).toBeUndefined()
  })

  it('passes session/explain/sessionInspection blocks through verbatim', () => {
    const caps = serializeStaticCapabilities(factory({
      session: { autoCommit: true, manualTransactions: true, isolationLevels: ['READ COMMITTED'] },
      explain: { supportsAnalyze: true, format: 'tree' },
      sessionInspection: { canKill: true },
    }))
    expect(caps.session?.manualTransactions).toBe(true)
    expect(caps.explain?.format).toBe('tree')
    expect(caps.sessionInspection?.canKill).toBe(true)
  })

  it('omits capability blocks the driver did not declare', () => {
    const caps = serializeStaticCapabilities(factory({}))
    expect(caps.session).toBeUndefined()
    expect(caps.explain).toBeUndefined()
  })

  it('passes the supportsDollarQuoting flag through for the renderer splitter', () => {
    expect(serializeStaticCapabilities(factory({ supportsDollarQuoting: true })).supportsDollarQuoting).toBe(true)
    expect(serializeStaticCapabilities(factory({})).supportsDollarQuoting).toBeUndefined()
  })
})
