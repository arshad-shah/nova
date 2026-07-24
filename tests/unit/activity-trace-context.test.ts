import { describe, it, expect } from 'vitest'
import { runWithTrace, getCurrentTraceId, newTraceId } from '../../src/main/activity/trace-context'
import { ActivityLog } from '../../src/main/activity/log'

describe('trace context', () => {
  it('exposes the ambient id only inside a runWithTrace scope', () => {
    expect(getCurrentTraceId()).toBeUndefined()
    const seen = runWithTrace('t1', () => getCurrentTraceId())
    expect(seen).toBe('t1')
    expect(getCurrentTraceId()).toBeUndefined()
  })

  it('runs unwrapped (no ambient id) when the id is undefined', () => {
    expect(runWithTrace(undefined, () => getCurrentTraceId())).toBeUndefined()
  })

  it('propagates the ambient id across awaits', async () => {
    const seen = await runWithTrace('t2', async () => {
      await Promise.resolve()
      return getCurrentTraceId()
    })
    expect(seen).toBe('t2')
  })

  it('mints unique ids', () => {
    expect(newTraceId()).not.toBe(newTraceId())
  })
})

describe('ActivityLog trace inheritance', () => {
  it('inherits the ambient trace id when a call site sets none', () => {
    const log = new ActivityLog()
    runWithTrace('run-1', () => {
      log.record({ kind: 'ipc', title: 'a' })
      log.record({ kind: 'query', title: 'b' })
    })
    const ids = log.list().map(e => e.traceId)
    expect(ids).toEqual(['run-1', 'run-1'])
  })

  it('lets an explicit traceId win over the ambient one', () => {
    const log = new ActivityLog()
    runWithTrace('ambient', () => {
      log.record({ kind: 'query', title: 'explicit', traceId: 'chosen' })
    })
    expect(log.list()[0].traceId).toBe('chosen')
  })

  it('records fine with no trace at all', () => {
    const log = new ActivityLog()
    log.record({ kind: 'log', title: 'standalone' })
    expect(log.list()[0].traceId).toBeUndefined()
  })

  it('gives unrelated runs distinct ids', () => {
    const log = new ActivityLog()
    runWithTrace('run-a', () => log.record({ kind: 'query', title: 'a' }))
    runWithTrace('run-b', () => log.record({ kind: 'query', title: 'b' }))
    const ids = log.list().map(e => e.traceId)
    // list() is newest-first.
    expect(ids).toEqual(['run-b', 'run-a'])
  })
})
