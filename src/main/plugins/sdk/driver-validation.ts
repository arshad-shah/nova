import type { DriverFactory } from './types'
import type { DbAdapter } from '../../db/adapter'

// ─── Driver capability agreement ─────────────────────────────────────────────
//
// A driver answers "what can I do?" in two places that must never disagree:
//
//   • DECLARATION — serializable capability data on the `DriverFactory`
//     (`session`, `explain`, …). The renderer gates features on this: it shows
//     the transaction toolbar because `session.manualTransactions` is declared,
//     and the Explain action because `explain` is declared. The renderer never
//     sees the adapter, so the declaration is all it has to go on.
//
//   • IMPLEMENTATION — the optional methods on the `DbAdapter` the factory
//     builds (`beginTransaction`, `parseQueryPlan`, …). The glue calls these.
//
// Nothing structurally links the two: a driver can declare a capability it does
// not implement (the renderer surfaces a button that crashes when clicked) or
// implement one it never declares (a feature that silently never appears). This
// module makes each declaration map to exactly one named opt-in *interface* of
// adapter methods, and validates — in BOTH directions — that a driver's
// declaration and its implementation agree.
//
// The check runs at the single adapter-construction chokepoint
// (`src/main/db/factory.ts`), against the very adapter about to be used, so it
// adds no side effect of its own and every real adapter (bundled, third-party,
// isolated) passes through it exactly once per connect. A mismatch therefore
// becomes an actionable error at connect time — before the declared feature is
// ever exercised — instead of a crash deep in a feature handler. Registration
// stays pure by design (it constructs nothing), which is why validation lives
// here and not in the registry. See issue #168.
//
// Scope: only capabilities that carry BOTH a serializable declaration AND a set
// of adapter methods can drift, so only those are linked here (`session`,
// `explain`, `databaseSwitch`). Optional methods with no declared-capability
// counterpart today (`setSchema`, `switchWarehouse`, `switchRole`,
// `cancelQuery`, `getSchemaObjects`) are invoked defensively by the glue and are
// intentionally out of scope until they gain a declaration.

/** Adapter methods the `session.manualTransactions` declaration promises: pin a
 *  dedicated connection, toggle auto-commit, and drive begin/commit/rollback.
 *  A driver that offers manual transactions offers the whole lifecycle. */
export const TRANSACTIONAL_METHODS = [
  'openSession',
  'closeSession',
  'setAutoCommit',
  'beginTransaction',
  'commit',
  'rollback',
] as const

/** Adapter method the `explain.format === 'tree'` declaration promises: the
 *  renderer draws an ExplainNode tree from the driver's parsed plan, so a
 *  tree-format driver must be able to parse its plan. Drivers whose `explain`
 *  is `format: 'text'` show raw plan text and need no parser. */
export const EXPLAIN_TREE_METHODS = ['parseQueryPlan'] as const

/** Adapter method the `databaseSwitch.supported` declaration promises: the
 *  renderer shows the database selector because switching is declared, so a
 *  declaring driver must be able to repoint the connection. Drivers that can't
 *  switch in-connection (SQLite) omit the declaration and the method both. */
export const DATABASE_SWITCH_METHODS = ['switchDatabase'] as const

/** One capability declaration ⇔ one opt-in interface of adapter methods. */
interface CapabilityInterface {
  /** Name of the opt-in interface, used verbatim in error messages. */
  readonly name: string
  /** The declaration prose that turns this capability on, for messages. */
  readonly declaredBy: string
  /** True when the factory declares this capability. */
  readonly isDeclared: (factory: DriverFactory) => boolean
  /** Adapter methods the declaration promises. */
  readonly methods: readonly string[]
}

const CAPABILITY_INTERFACES: readonly CapabilityInterface[] = [
  {
    name: 'Transactional',
    declaredBy: 'session.manualTransactions === true',
    isDeclared: (f) => f.session?.manualTransactions === true,
    methods: TRANSACTIONAL_METHODS,
  },
  {
    name: 'ExplainsTree',
    declaredBy: "explain.format === 'tree'",
    isDeclared: (f) => f.explain?.format === 'tree',
    methods: EXPLAIN_TREE_METHODS,
  },
  {
    name: 'SwitchesDatabase',
    declaredBy: 'databaseSwitch.supported === true',
    isDeclared: (f) => f.databaseSwitch?.supported === true,
    methods: DATABASE_SWITCH_METHODS,
  },
]

/** Every adapter method any interface refers to, for presence probing. */
const ALL_LINKED_METHODS: readonly string[] = [
  ...new Set(CAPABILITY_INTERFACES.flatMap((i) => i.methods)),
]

/** A permissive, connection-free config for constructing a probe adapter. The
 *  bundled adapters' constructors only stash config; I/O happens in `connect()`,
 *  never at construction, so building one to read its method table is safe. */
const PROBE_CONFIG: Record<string, unknown> = { database: ':memory:', host: 'localhost' }

/** The subset of linked methods an adapter instance actually implements. */
function linkedMethodsOf(adapter: DbAdapter): Set<string> {
  const implemented = new Set<string>()
  for (const method of ALL_LINKED_METHODS) {
    if (typeof (adapter as unknown as Record<string, unknown>)[method] === 'function') {
      implemented.add(method)
    }
  }
  return implemented
}

/**
 * The optional linked methods a factory's adapter implements, or `null` when
 * the adapter cannot be constructed for introspection (a third-party driver
 * whose constructor demands real config). A `null` result means "cannot
 * verify", not "nothing implemented" — the caller skips implementation checks
 * rather than reporting false mismatches. Prefer passing an already-constructed
 * adapter to `validateDriverCapabilities` so no probe adapter is built.
 */
export function getImplementedLinkedMethods(factory: DriverFactory): Set<string> | null {
  let adapter: DbAdapter
  try {
    adapter = factory.createAdapter(PROBE_CONFIG)
  } catch {
    return null
  }
  return linkedMethodsOf(adapter)
}

export interface DriverCapabilityReport {
  ok: boolean
  errors: string[]
}

/**
 * Check that a driver's capability declarations and its adapter's implemented
 * methods agree in both directions. Returns an actionable error per mismatch:
 * a declared-but-unimplemented capability names the missing methods; an
 * implemented-but-undeclared interface names the declaration to add.
 *
 * Pass the adapter that is about to be used (the caller already built it) to
 * introspect its methods without side effects. Omit it to build a throwaway
 * probe adapter for introspection — convenient in tests, but avoided on the hot
 * path so registration and connect stay free of extra constructions. When the
 * probe cannot be built the result is `{ ok: true }` ("cannot verify"), never a
 * false mismatch.
 */
export function validateDriverCapabilities(
  id: string,
  factory: DriverFactory,
  adapter?: DbAdapter,
): DriverCapabilityReport {
  const implemented = adapter ? linkedMethodsOf(adapter) : getImplementedLinkedMethods(factory)
  if (implemented === null) return { ok: true, errors: [] }

  const errors: string[] = []
  for (const iface of CAPABILITY_INTERFACES) {
    const declared = iface.isDeclared(factory)
    const missing = iface.methods.filter((m) => !implemented.has(m))
    const present = iface.methods.filter((m) => implemented.has(m))

    if (declared && missing.length > 0) {
      errors.push(
        `Driver '${id}' declares the ${iface.name} capability (${iface.declaredBy}) ` +
          `but its adapter does not implement: ${missing.join(', ')}. ` +
          `Implement the missing method(s), or drop the declaration.`,
      )
    }
    if (!declared && present.length > 0) {
      errors.push(
        `Driver '${id}' implements ${iface.name} method(s) ${present.join(', ')} ` +
          `but does not declare the capability (${iface.declaredBy}). ` +
          `Declare it so the app surfaces the feature, or remove the method(s).`,
      )
    }
  }
  return { ok: errors.length === 0, errors }
}

/** Format a report's errors into a single throwable message. */
export function formatDriverCapabilityError(id: string, report: DriverCapabilityReport): string {
  return (
    `Driver '${id}' capability declaration and implementation disagree:\n` +
    report.errors.map((e) => `  • ${e}`).join('\n')
  )
}

/**
 * Throw an actionable error if the constructed adapter's implemented methods
 * disagree with the driver's capability declarations. Called from the adapter
 * factory with the adapter it just built, so a mismatched driver fails at
 * connect time with a message naming the capability, the method, and the fix —
 * rather than crashing later when the declared feature is used.
 */
export function assertDriverCapabilities(id: string, factory: DriverFactory, adapter: DbAdapter): void {
  const report = validateDriverCapabilities(id, factory, adapter)
  if (!report.ok) {
    throw new Error(formatDriverCapabilityError(id, report))
  }
}
