// src/main/plugins/sdk/permissions.ts
//
// Plugin capability/permission model.
//
// Verql plugins are ordinary Node modules `require()`d into the **main**
// process, so a hostile plugin technically has the full Node API at its
// disposal. The permission model is therefore *defence in depth*, not an OS
// sandbox. It does three concrete things:
//
//   1. Makes a plugin's intent explicit and reviewable — every sensitive
//      capability it wants is declared up-front in its manifest.
//   2. Lets the user grant or deny those capabilities *before* the plugin
//      can use them (deny-by-default for third-party plugins).
//   3. Hard-blocks the ENFORCED capabilities at the SDK boundary: the
//      host-provided `keyring`, `connections`, and custom-`ipc` surfaces
//      throw `PermissionDeniedError` when used without a grant.
//
// What it deliberately does NOT claim: ADVISORY capabilities (`network`,
// `filesystem`, `process`) cannot be enforced for in-process code — a plugin
// can always `require('net')`. They are declared for transparency/consent
// only. The honest fix for those is process isolation; see
// docs/plugin-security.md for the threat model and roadmap.

import type { KeyringAccess, ConnectionAccess, Disposable } from './types'
import type { ConnectionProfile, QueryResult } from '@shared/types'

/** Every plugin permission id, named once so call sites stop re-typing the
 *  raw string (mirrors IPC_CHANNELS / ACTIVITY_PANEL's shape). */
export const PLUGIN_PERMISSION = {
  KEYRING: 'keyring',
  CONNECTIONS: 'connections',
  IPC: 'ipc',
  NETWORK: 'network',
  FILESYSTEM: 'filesystem',
  PROCESS: 'process',
} as const

/** Capabilities the host actually gates. Using them without a grant throws. */
export const ENFORCED_PERMISSIONS = [
  PLUGIN_PERMISSION.KEYRING,
  PLUGIN_PERMISSION.CONNECTIONS,
  PLUGIN_PERMISSION.IPC,
] as const
/** Capabilities declared for transparency but not enforceable in-process. */
export const ADVISORY_PERMISSIONS = [
  PLUGIN_PERMISSION.NETWORK,
  PLUGIN_PERMISSION.FILESYSTEM,
  PLUGIN_PERMISSION.PROCESS,
] as const
export const ALL_PERMISSIONS = [...ENFORCED_PERMISSIONS, ...ADVISORY_PERMISSIONS] as const

export type EnforcedPermission = (typeof ENFORCED_PERMISSIONS)[number]
export type AdvisoryPermission = (typeof ADVISORY_PERMISSIONS)[number]
export type PluginPermission = (typeof ALL_PERMISSIONS)[number]

export interface PermissionInfo {
  /** Short human label for the consent UI. */
  title: string
  /** One-sentence, user-facing explanation of what the plugin can do. */
  description: string
  /** True if the host blocks the matching surface when ungranted. */
  enforced: boolean
  /** True if granting this materially increases the plugin's blast radius. */
  sensitive: boolean
}

export const PERMISSION_INFO: Record<PluginPermission, PermissionInfo> = {
  keyring: {
    title: 'Stored secrets',
    description:
      'Read and write your saved database passwords and API keys in the OS keychain.',
    enforced: true,
    sensitive: true,
  },
  connections: {
    title: 'Database connections',
    description:
      'Read your connection profiles and run queries against connected databases.',
    enforced: true,
    sensitive: true,
  },
  ipc: {
    title: 'App messaging',
    description:
      'Register custom main-process channels that the app UI can call into.',
    enforced: true,
    sensitive: true,
  },
  network: {
    title: 'Network access',
    description: 'Make outbound network requests (for example, to a cloud API).',
    enforced: false,
    sensitive: true,
  },
  filesystem: {
    title: 'File system',
    description: 'Read and write files outside the plugin’s own folder.',
    enforced: false,
    sensitive: true,
  },
  process: {
    title: 'Run programs',
    description: 'Launch external programs or child processes.',
    enforced: false,
    sensitive: true,
  },
}

export function isPluginPermission(value: unknown): value is PluginPermission {
  return typeof value === 'string' && (ALL_PERMISSIONS as readonly string[]).includes(value)
}

/**
 * Thrown when a plugin uses an enforced capability it hasn't declared, or that
 * the user hasn't granted. The message is intentionally actionable so plugin
 * authors see exactly what to add to their manifest.
 */
export class PermissionDeniedError extends Error {
  constructor(
    public readonly pluginName: string,
    public readonly permission: PluginPermission,
  ) {
    super(
      `Plugin '${pluginName}' tried to use the '${permission}' capability, ` +
        `which it has not declared or been granted. Add "${permission}" to the ` +
        `plugin manifest's "permissions" array, then grant it under ` +
        `Settings → Plugins.`,
    )
    this.name = 'PermissionDeniedError'
  }
}

export interface PermissionGrant {
  /** Trusted plugins (bundled with the app) bypass every check. */
  trusted: boolean
  /** Permissions the user has granted. Ignored when `trusted` is true. */
  granted: ReadonlySet<PluginPermission>
}

export function hasPermission(grant: PermissionGrant, permission: PluginPermission): boolean {
  return grant.trusted || grant.granted.has(permission)
}

/**
 * Effective grants = what the user approved ∩ what the manifest declared.
 * A plugin can never receive a capability it didn't ask for, even if a stale
 * grant record lists it.
 */
export function effectiveGrants(
  declared: readonly PluginPermission[] | undefined,
  userGranted: readonly PluginPermission[] | undefined,
): Set<PluginPermission> {
  const declaredSet = new Set(declared ?? [])
  return new Set((userGranted ?? []).filter((p) => declaredSet.has(p)))
}

// ─── Guarded surface wrappers ───────────────────────────────────────────────
// These wrap the real host-provided objects so that every sensitive method
// checks the grant before delegating. Trusted plugins get the raw object back
// (zero overhead, no behaviour change).

export function guardKeyring(
  keyring: KeyringAccess,
  grant: PermissionGrant,
  pluginName: string,
): KeyringAccess {
  if (grant.trusted) return keyring
  const need = (): void => {
    if (!hasPermission(grant, PLUGIN_PERMISSION.KEYRING)) {
      throw new PermissionDeniedError(pluginName, PLUGIN_PERMISSION.KEYRING)
    }
  }
  // Async methods are `async` so a denied call rejects (rather than throwing
  // synchronously before the caller can `.catch`). Sync methods throw directly.
  return {
    store: async (p, k, v) => (need(), keyring.store(p, k, v)),
    retrieve: async (p, k) => (need(), keyring.retrieve(p, k)),
    delete: async (p, k) => (need(), keyring.delete(p, k)),
    retrieveSync: (p, k) => (need(), keyring.retrieveSync(p, k)),
    storeSync: (p, k, v) => (need(), keyring.storeSync(p, k, v)),
    has: (p, k) => (need(), keyring.has(p, k)),
    listKeys: (p) => (need(), keyring.listKeys(p)),
  }
}

export function guardConnections(
  connections: ConnectionAccess,
  grant: PermissionGrant,
  pluginName: string,
): ConnectionAccess {
  if (grant.trusted) return connections
  const need = (): void => {
    if (!hasPermission(grant, PLUGIN_PERMISSION.CONNECTIONS)) {
      throw new PermissionDeniedError(pluginName, PLUGIN_PERMISSION.CONNECTIONS)
    }
  }
  return {
    getActiveConnectionId: (): string | null => (need(), connections.getActiveConnectionId()),
    getProfile: (id): ConnectionProfile | null => (need(), connections.getProfile(id)),
    query: async (id, sql, params): Promise<QueryResult> => (need(), connections.query(id, sql, params)),
    cancelQuery: (id): void => (need(), connections.cancelQuery(id)),
    onActiveConnectionChanged: (listener): Disposable => (need(), connections.onActiveConnectionChanged(listener)),
  }
}
