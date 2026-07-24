import { ipcMain } from 'electron'
import { errorMessage } from '@shared/errors'
import { IPC_CHANNELS, type IpcChannelMap } from '@shared/ipc'
import { recordActivity } from '../activity/recorder'
import { runWithTrace } from '../activity/trace-context'
import { extractTraceEnvelope } from '@shared/trace'
import { ACTIVITY_KIND } from '@shared/activity'
import type { DbAdapter } from '../db/adapter'
import type { ConfigStore } from '../config/store'
import type { KeyringService } from '../keyring'
import type { AppDataStore } from '../appdata/store'
import type { DriverRegistryImpl } from '../plugins/sdk/driver-registry'

export interface IpcContext {
  configStore: ConfigStore
  keyring: KeyringService
  appData: AppDataStore
  driverRegistry: DriverRegistryImpl
  activeAdapters: Map<string, DbAdapter>
}

export type Handle = <K extends keyof IpcChannelMap>(
  channel: K,
  handler: (...args: IpcChannelMap[K]['args']) => IpcChannelMap[K]['return'] | Promise<IpcChannelMap[K]['return']>
) => void

// Activity-stream channels are excluded from IPC tracing to avoid a feedback
// loop (recording an entry would itself record an entry).
const TRACE_EXCLUDED = new Set<string>([IPC_CHANNELS.ACTIVITY_LIST, IPC_CHANNELS.ACTIVITY_CLEAR, IPC_CHANNELS.ACTIVITY_RECORD])

/** Trace every typed IPC call into the activity stream (kind `ipc`, debug level)
 *  so devs can see exactly what crosses the bridge and how long it took. We
 *  record only channel + timing + ok/err — never argument values, which may
 *  carry secrets. */
export const handle: Handle = (channel, handler) => {
  ipcMain.handle(channel, async (_event, ...rawArgs) => {
    // The platform client appends a trace envelope to every invoke; strip it so
    // handlers only ever see the arguments they declared.
    const { args, traceId } = extractTraceEnvelope(rawArgs)
    const call = (): unknown => handler(...(args as Parameters<typeof handler>))
    if (TRACE_EXCLUDED.has(channel as string)) {
      // Activity channels are excluded from *both* IPC tracing and the ambient
      // trace: a renderer-diagnostic record (a store mutation) must keep the
      // traceId it carries (usually none), not inherit this call's.
      return call()
    }
    return runWithTrace(traceId, async () => {
      const start = Date.now()
      try {
        const result = await call()
        recordActivity({
          kind: ACTIVITY_KIND.IPC,
          level: 'debug',
          title: `${channel} · ${Date.now() - start}ms`,
          source: String(channel),
          durationMs: Date.now() - start,
          metadata: { channel, args: args.length },
        })
        return result
      } catch (err) {
        recordActivity({
          kind: ACTIVITY_KIND.IPC,
          level: 'error',
          title: `${channel} failed`,
          source: String(channel),
          durationMs: Date.now() - start,
          detail: errorMessage(err),
          stack: err instanceof Error ? err.stack : undefined,
          metadata: { channel },
        })
        throw err
      }
    })
  })
}
