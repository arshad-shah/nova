// Builds the proxy `PluginContext` handed to an isolated plugin's `activate()`.
//
// Inside the worker, the plugin can't touch Verql's real registries or the
// keyring/connections — those live in the host process. So every capability
// method here forwards to the host over RPC (where the permission grant is
// enforced), and every contribution registration is captured locally as a
// descriptor the host turns into a proxy on its side.
//
// Constraint: only async, serializable surfaces can cross the boundary. Sync
// accessors (e.g. settings.get, connections.getActiveConnectionId) and the
// rich function-valued surfaces (drivers, exporters, tools, …) are not
// available under isolation; their methods throw an explanatory error. The
// host only isolates plugins whose contributions are compatible (see
// `canIsolate` in isolated-plugin.ts), so a real plugin never trips these.

import { RpcEndpoint } from './rpc'
import { W2H, W2H_EVENT, CAPABILITY_SURFACE, type ContributionDescriptor } from './protocol'

const NOT_SUPPORTED = (surface: string): never => {
  throw new Error(
    `ctx.${surface} is not available to a process-isolated plugin. ` +
      `Only commands, themes, and async capability calls (connections.query, ` +
      `keyring.store/retrieve/delete, schema.*) cross the isolation boundary.`,
  )
}

export interface WorkerContextResult {
  /** The object passed to the plugin's activate(); typed loosely on purpose. */
  context: unknown
  /** Contribution descriptors collected during activate(), sent to the host. */
  contributions: ContributionDescriptor[]
  /** Live handles (command handlers) the host invokes via H2W.INVOKE. */
  handles: Map<string, (...args: unknown[]) => unknown>
}

export function buildWorkerContext(endpoint: RpcEndpoint): WorkerContextResult {
  const contributions: ContributionDescriptor[] = []
  const handles = new Map<string, (...args: unknown[]) => unknown>()
  let handleSeq = 0

  const forward = (surface: string, method: string) =>
    (...args: unknown[]): Promise<unknown> =>
      endpoint.request(W2H.CAPABILITY, { surface, method, args })

  const disposable = { dispose: () => {} }

  const commands = {
    register(id: string, handler: (...args: unknown[]) => unknown) {
      const handleId = `command:${id}:${handleSeq++}`
      handles.set(handleId, handler)
      contributions.push({ kind: 'command', id, handleId })
      return disposable
    },
  }

  const themes = {
    register(theme: unknown) {
      // Themes are pure data (colours + monaco token defs); ship them verbatim.
      const id = (theme as { id?: string }).id ?? `theme-${handleSeq++}`
      contributions.push({ kind: 'theme', id, data: theme })
      return disposable
    },
  }

  const connections = {
    query: forward(CAPABILITY_SURFACE.CONNECTIONS, 'query'),
    cancelQuery: forward(CAPABILITY_SURFACE.CONNECTIONS, 'cancelQuery'),
    getActiveConnectionId: () => NOT_SUPPORTED('connections.getActiveConnectionId (sync)'),
    getProfile: () => NOT_SUPPORTED('connections.getProfile (sync)'),
    onActiveConnectionChanged: () => NOT_SUPPORTED('connections.onActiveConnectionChanged'),
  }

  const keyring = {
    store: forward(CAPABILITY_SURFACE.KEYRING, 'store'),
    retrieve: forward(CAPABILITY_SURFACE.KEYRING, 'retrieve'),
    delete: forward(CAPABILITY_SURFACE.KEYRING, 'delete'),
    retrieveSync: () => NOT_SUPPORTED('keyring.retrieveSync (sync)'),
    storeSync: () => NOT_SUPPORTED('keyring.storeSync (sync)'),
    has: () => NOT_SUPPORTED('keyring.has (sync)'),
    listKeys: () => NOT_SUPPORTED('keyring.listKeys (sync)'),
  }

  const schema = {
    getTables: forward(CAPABILITY_SURFACE.SCHEMA, 'getTables'),
    getColumns: forward(CAPABILITY_SURFACE.SCHEMA, 'getColumns'),
    getIndexes: forward(CAPABILITY_SURFACE.SCHEMA, 'getIndexes'),
    getSchemas: forward(CAPABILITY_SURFACE.SCHEMA, 'getSchemas'),
    getDatabases: forward(CAPABILITY_SURFACE.SCHEMA, 'getDatabases'),
    getSchemaSummary: forward(CAPABILITY_SURFACE.SCHEMA, 'getSchemaSummary'),
  }

  const settings = {
    get: () => NOT_SUPPORTED('settings.get (sync); read via your own activate-time logic'),
    set: (key: string, value: unknown) => {
      // set returns void; forward as a request but don't make callers await.
      void endpoint.request(W2H.CAPABILITY, { surface: CAPABILITY_SURFACE.SETTINGS, method: 'set', args: [key, value] })
    },
    onChanged: () => NOT_SUPPORTED('settings.onChanged'),
  }

  const notifications = {
    show(notification: unknown) {
      endpoint.emit(W2H_EVENT.NOTIFY, notification)
    },
  }

  const broadcast = (channel: string, ...args: unknown[]) => {
    endpoint.emit(W2H_EVENT.BROADCAST, { channel, args })
  }

  // Surfaces that cannot be marshalled. Stubbed so accessing them is a clear
  // error rather than `undefined is not a function`.
  const unsupported = (name: string) => new Proxy({}, { get: () => () => NOT_SUPPORTED(name) })

  const context = {
    commands,
    themes,
    connections,
    keyring,
    schema,
    settings,
    notifications,
    broadcast,
    drivers: unsupported('drivers'),
    tools: unsupported('tools'),
    panels: unsupported('panels'),
    ui: unsupported('ui'),
    completions: unsupported('completions'),
    exporters: unsupported('exporters'),
    importers: unsupported('importers'),
    formatters: unsupported('formatters'),
    typeMappers: unsupported('typeMappers'),
    dragDrop: unsupported('dragDrop'),
    ai: unsupported('ai'),
    services: unsupported('services'),
    ipc: unsupported('ipc'),
    rootSettings: unsupported('rootSettings'),
    subscriptions: [] as unknown[],
  }

  return { context, contributions, handles }
}
