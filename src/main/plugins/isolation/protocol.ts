// Wire protocol for the plugin-isolation bridge.
//
// An untrusted plugin runs in a separate OS process (an Electron
// `utilityProcess`). The host and the worker talk over a single duplex channel
// using the small JSON message protocol below. Everything that crosses the
// boundary MUST be structured-clone/JSON serializable — that constraint is the
// whole point (a plugin in another process can only reach Verql capabilities by
// asking the host, and the host enforces permissions before answering).

/** A correlated request expecting a response. */
export interface RpcRequest {
  kind: 'req'
  id: number
  method: string
  params: unknown
}

/** The response to a request, success or failure. */
export type RpcResponse =
  | { kind: 'res'; id: number; ok: true; result: unknown }
  | { kind: 'res'; id: number; ok: false; error: SerializedError }

/** A fire-and-forget notification (no response expected). */
export interface RpcEvent {
  kind: 'evt'
  method: string
  params: unknown
}

export type RpcMessage = RpcRequest | RpcResponse | RpcEvent

/** Errors don't survive structured clone with their prototype; we ship the
 *  fields we care about and rebuild a plain Error on the other side. The
 *  optional `permission` field lets the host's PermissionDeniedError round-trip
 *  so a plugin author still gets the actionable message. */
export interface SerializedError {
  name: string
  message: string
  stack?: string
  permission?: string
}

export function serializeError(err: unknown): SerializedError {
  if (err && typeof err === 'object') {
    const e = err as { name?: string; message?: string; stack?: string; permission?: string }
    return {
      name: typeof e.name === 'string' ? e.name : 'Error',
      message: typeof e.message === 'string' ? e.message : String(err),
      stack: typeof e.stack === 'string' ? e.stack : undefined,
      permission: typeof e.permission === 'string' ? e.permission : undefined,
    }
  }
  return { name: 'Error', message: String(err) }
}

export function deserializeError(e: SerializedError): Error & { permission?: string } {
  const err = new Error(e.message) as Error & { permission?: string }
  err.name = e.name
  if (e.stack) err.stack = e.stack
  if (e.permission) err.permission = e.permission
  return err
}

// ─── Host → Worker methods ───────────────────────────────────────────────────
export const H2W = {
  /** Load the plugin module and run activate(ctx). Returns the contributions
   *  it registered (declarative data + handle ids for live callables). */
  ACTIVATE: 'host:activate',
  /** Invoke a method on a live handle the worker registered (e.g. a command). */
  INVOKE: 'host:invoke',
  /** Run the plugin's deactivate() and tear down its context. */
  DEACTIVATE: 'host:deactivate',
} as const

/** The `ctx[surface]` names the isolation bridge forwards over `W2H.CAPABILITY`.
 *  Named once so `worker-context.ts` (producer) and `isolated-plugin.ts`'s
 *  `CAPABILITY_METHODS` allowlist (consumer) can't drift from each other across
 *  the process boundary. */
export const CAPABILITY_SURFACE = {
  CONNECTIONS: 'connections',
  KEYRING: 'keyring',
  SCHEMA: 'schema',
  SETTINGS: 'settings',
} as const
export type CapabilitySurface = (typeof CAPABILITY_SURFACE)[keyof typeof CAPABILITY_SURFACE]

// ─── Worker → Host methods ───────────────────────────────────────────────────
export const W2H = {
  /** A gated capability call: ctx[surface][method](...args). The host applies
   *  the plugin's permission grant before executing. */
  CAPABILITY: 'worker:capability',
} as const

// ─── Worker → Host events (fire-and-forget) ───────────────────────────────────
export const W2H_EVENT = {
  /** ctx.notifications.show(...) */
  NOTIFY: 'worker:notify',
  /** ctx.broadcast(...) */
  BROADCAST: 'worker:broadcast',
} as const

/** Describes one contribution the worker registered during activate. Live
 *  callables (commands) carry a `handleId` the host invokes via H2W.INVOKE;
 *  declarative ones (themes) carry serialized `data` the host registers
 *  directly. */
export interface ContributionDescriptor {
  kind: 'command' | 'theme'
  id: string
  handleId?: string
  data?: unknown
}

export interface ActivateParams {
  pluginName: string
  /** Absolute path to the plugin's compiled main entry. */
  mainPath: string
  /** The capabilities the user granted this plugin. The worker uses the
   *  advisory ones (network/filesystem/process) to decide which Node builtins
   *  to leave un-sandboxed; everything else is blocked. */
  grantedPermissions: string[]
}

export interface ActivateResult {
  contributions: ContributionDescriptor[]
}

export interface InvokeParams {
  handleId: string
  args: unknown[]
}

export interface CapabilityParams {
  surface: string
  method: string
  args: unknown[]
}
