import type { ConnectionProfile } from '@shared/types'
import type { DbAdapter } from './adapter'
import type { DriverRegistryImpl } from '../plugins/sdk/driver-registry'
import { assertDriverCapabilities } from '../plugins/sdk/driver-validation'

// INVARIANT: no special-cased built-in drivers live here.
//
// Every driver — including the native sqlite/postgresql/mysql ones — is a
// bundled plugin that registers a factory with the SDK DriverRegistry.
// `createAdapter` resolves a profile's adapter purely through a registry
// lookup and carries zero driver knowledge: no branching on `profile.type`
// against a known driver name, no import of a concrete driver implementation.
//
// Why it's load-bearing (not incidental): because first-party drivers travel
// exactly the same path as third-party ones, the plugin SDK cannot quietly
// become inadequate — any gap in the SDK would break Postgres, so it gets
// fixed. The moment a built-in is special-cased here, the SDK stops being
// dogfooded and third-party drivers become second-class citizens. Dialect
// knowledge belongs inside the relevant plugin under
// `src/main/plugins/bundled/<driver>/`, never in this file.
//
// Guarded by tests/unit/audit/db-factory-registry-purity.test.ts — both
// behaviourally (registry-only resolution) and statically (no driver names or
// bundled-driver imports in src/main/db/). Do not weaken those tests to land a
// change; they are the counter-argument to "just special-case it here".

let pluginDriverRegistry: DriverRegistryImpl | null = null

export function setDriverRegistry(registry: DriverRegistryImpl): void {
  pluginDriverRegistry = registry
}

export function createAdapter(profile: ConnectionProfile): DbAdapter {
  if (!pluginDriverRegistry) {
    throw new Error('Driver registry not initialized')
  }
  const factory = pluginDriverRegistry.get(profile.type)
  if (!factory) {
    throw new Error(`No driver registered for type: ${profile.type}`)
  }
  const adapter = factory.createAdapter(profile as unknown as Record<string, unknown>)
  // A driver's capability *declaration* (serializable data the renderer gates
  // features on) and its adapter *implementation* (the optional methods the glue
  // calls) must agree, or a declared feature crashes on use and an undeclared
  // one never appears. This is the single chokepoint every real adapter passes
  // through, so validate the freshly-built instance here: a mismatch fails the
  // connect with an actionable message instead of crashing later. See
  // ../plugins/sdk/driver-validation.ts and issue #168.
  assertDriverCapabilities(profile.type, factory, adapter)
  return adapter
}
