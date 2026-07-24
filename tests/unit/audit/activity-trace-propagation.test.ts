// Guards Phase 0 trace propagation: the entries a single renderer-initiated
// action (or a tool call) causes must share one traceId, so grouping (Phase 5)
// has something to group. A behavioral guard rather than a static one — it
// exercises the real `handle` wrapper and the real ToolRegistry through their
// activity sink, so it fails if either seam stops threading the ambient trace.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { ipcMain } from 'electron'
import { handle } from '../../../src/main/ipc/context'
import { ActivityLog } from '../../../src/main/activity/log'
import { setActivitySink, recordActivity } from '../../../src/main/activity/recorder'
import { runWithTrace, newTraceId } from '../../../src/main/activity/trace-context'
import { ToolRegistryImpl } from '../../../src/main/plugins/sdk/tool-registry'
import { makeTraceEnvelope } from '../../../shared/trace'
import { IPC_CHANNELS } from '../../../shared/ipc'
import { ACTIVITY_KIND } from '../../../shared/activity'
import type { ToolContext, ToolResult } from '../../../src/main/plugins/sdk/types'

type RawHandler = (event: unknown, ...args: unknown[]) => unknown

function register(): Map<string, RawHandler> {
  const handlers = new Map<string, RawHandler>()
  ;(ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation((channel: string, fn: RawHandler) => {
    handlers.set(channel, fn)
  })
  return handlers
}

let log: ActivityLog

beforeEach(() => {
  vi.clearAllMocks()
  log = new ActivityLog()
  setActivitySink(log)
})

describe('trace propagation through the IPC handle wrapper', () => {
  it('correlates the ipc trace entry with the entries the handler records', async () => {
    const handlers = register()
    // A stand-in for a real handler (e.g. db:query) that records a domain entry.
    handle(IPC_CHANNELS.DB_QUERY, (async () => {
      recordActivity({ kind: ACTIVITY_KIND.QUERY, level: 'success', title: '1 row' })
      return { columns: [], rows: [], rowCount: 1, duration: 1 }
    }) as never)

    const fn = handlers.get(IPC_CHANNELS.DB_QUERY)!
    await fn({}, 'c1', 'SELECT 1', makeTraceEnvelope('trace-xyz'))

    const entries = log.list()
    const query = entries.find(e => e.kind === ACTIVITY_KIND.QUERY)!
    const ipc = entries.find(e => e.kind === ACTIVITY_KIND.IPC)!
    expect(query.traceId).toBe('trace-xyz')
    expect(ipc.traceId).toBe('trace-xyz')
  })

  it('strips the envelope so the handler sees only its declared args', async () => {
    const handlers = register()
    const seen: unknown[] = []
    handle(IPC_CHANNELS.DB_QUERY, (async (...args: unknown[]) => {
      seen.push(...args)
      return { columns: [], rows: [], rowCount: 0, duration: 0 }
    }) as never)
    await handlers.get(IPC_CHANNELS.DB_QUERY)!({}, 'c1', 'SELECT 1', makeTraceEnvelope('t'))
    expect(seen).toEqual(['c1', 'SELECT 1'])
  })

  it('records fine — and without a trace — for an untraced call', async () => {
    const handlers = register()
    handle(IPC_CHANNELS.DB_QUERY, (async () => {
      recordActivity({ kind: ACTIVITY_KIND.QUERY, title: 'untraced' })
      return { columns: [], rows: [], rowCount: 0, duration: 0 }
    }) as never)
    // No trailing envelope.
    await handlers.get(IPC_CHANNELS.DB_QUERY)!({}, 'c1', 'SELECT 1')
    for (const e of log.list()) expect(e.traceId).toBeUndefined()
  })

  it('does not set an ambient trace for excluded activity channels', async () => {
    const handlers = register()
    handle(IPC_CHANNELS.ACTIVITY_RECORD, (async (entry: Parameters<ActivityLog['record']>[0]) => {
      log.record(entry)
    }) as never)
    // A store-mutation record must keep its own (absent) traceId, not inherit.
    await handlers.get(IPC_CHANNELS.ACTIVITY_RECORD)!(
      {}, { kind: ACTIVITY_KIND.STORE, title: 'tabs' }, makeTraceEnvelope('should-not-leak'),
    )
    expect(log.list()[0].traceId).toBeUndefined()
  })
})

describe('trace propagation through the tool registry', () => {
  it('shares one trace across the tool body and its tool-call entry', async () => {
    const registry = new ToolRegistryImpl()
    registry.setTraceRunner((fn) => runWithTrace(newTraceId(), fn))
    registry.setActivityRecorder(({ toolId, success, durationMs }) => {
      log.record({ kind: ACTIVITY_KIND.TOOL_CALL, level: success ? 'success' : 'error', title: toolId, durationMs })
    })
    registry.register({
      id: 'demo', name: 'demo', description: '', inputSchema: { type: 'object' }, permission: 'read',
      execute: async (): Promise<ToolResult> => {
        // Stands in for a network request the tool triggers.
        recordActivity({ kind: ACTIVITY_KIND.NETWORK, title: 'GET x' })
        return { success: true, data: null }
      },
    } as never)

    await registry.execute('demo', {}, {} as ToolContext)

    const network = log.list().find(e => e.kind === ACTIVITY_KIND.NETWORK)!
    const toolCall = log.list().find(e => e.kind === ACTIVITY_KIND.TOOL_CALL)!
    expect(network.traceId).toBeDefined()
    expect(toolCall.traceId).toBe(network.traceId)
  })

  it('gives distinct tool calls distinct traces', async () => {
    const registry = new ToolRegistryImpl()
    registry.setTraceRunner((fn) => runWithTrace(newTraceId(), fn))
    registry.register({
      id: 'demo', name: 'demo', description: '', inputSchema: { type: 'object' }, permission: 'read',
      execute: async (): Promise<ToolResult> => {
        recordActivity({ kind: ACTIVITY_KIND.NETWORK, title: 'GET x' })
        return { success: true, data: null }
      },
    } as never)
    await registry.execute('demo', {}, {} as ToolContext)
    await registry.execute('demo', {}, {} as ToolContext)
    const ids = log.list().filter(e => e.kind === ACTIVITY_KIND.NETWORK).map(e => e.traceId)
    expect(ids[0]).toBeDefined()
    expect(ids[0]).not.toBe(ids[1])
  })
})
