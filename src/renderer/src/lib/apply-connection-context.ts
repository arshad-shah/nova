import { IPC_CHANNELS } from '@shared/ipc'
import { ipc } from '@/platform/client'
import type { DriverCapabilities } from '@/stores/driver-capabilities'

/**
 * Align a live connection with a tab's selected database (and optionally schema)
 * before the connection is used.
 *
 * This is the single place the two query call sites — the `ConnectionSelector`
 * dropdown and `useQueryExecution`'s pre-query prelude — reach for. Previously
 * each wrapped `switchDatabase` in its own `try/catch {}` that swallowed every
 * failure, so "the adapter can't switch", "that database doesn't exist" and
 * "permission denied" were all indistinguishable, and the UI would claim a tab
 * had moved to a database the connection was never actually on.
 *
 * Instead the database switch is *gated on the driver's declared `databaseSwitch`
 * capability*: a driver that never advertised switching is skipped silently
 * (there is no error to swallow), while a driver that *did* advertise it lets a
 * genuine failure propagate so the caller can surface it and avoid mislabelling
 * the tab. Setting the schema stays best-effort — no capability models it yet.
 */
export async function applyConnectionContext(
  connectionId: string,
  ctx: { database?: string | null; schema?: string | null },
  caps: DriverCapabilities | null,
): Promise<void> {
  if (ctx.database && caps?.databaseSwitch?.supported) {
    await ipc.invoke(IPC_CHANNELS.DB_SWITCH_DATABASE, connectionId, ctx.database)
  }
  if (ctx.schema) {
    try {
      await ipc.invoke(IPC_CHANNELS.DB_SET_SCHEMA, connectionId, ctx.schema)
    } catch {
      // setSchema is best-effort — no driver capability declares it yet, so a
      // driver that doesn't implement it is a no-op on the main side.
    }
  }
}
