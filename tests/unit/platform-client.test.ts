// Unit tests for the renderer platform client — the single chokepoint for
// backend access introduced in #165. Covers argument passthrough, error
// normalization, the optional (no-op-when-absent) invoke, and the unsubscribe
// contract of `on`. Type inference is asserted with compile-time `satisfies`
// checks; a widening to `any` would fail the type-check, not this runtime test.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  invoke,
  invokeOptional,
  on,
  isBackendAvailable,
  hostPlatform,
  ipc,
} from '@/platform/client'

type Win = typeof globalThis & { electronAPI?: unknown }

function stubBridge(over: Partial<{
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (event: string, cb: (...a: unknown[]) => void) => () => void
  platform: string
}> = {}) {
  const bridge = {
    platform: over.platform ?? 'testos',
    invoke: over.invoke ?? vi.fn(async () => undefined),
    on: over.on ?? vi.fn(() => () => {}),
  }
  ;(globalThis as Win).electronAPI = bridge
  return bridge
}

afterEach(() => {
  delete (globalThis as Win).electronAPI
  vi.restoreAllMocks()
})

describe('platform client — availability', () => {
  it('reports the bridge as absent by default', () => {
    expect(isBackendAvailable()).toBe(false)
    expect(hostPlatform()).toBe('web')
  })

  it('reports the bridge as present once stubbed, and reads it lazily', () => {
    stubBridge({ platform: 'darwin' })
    expect(isBackendAvailable()).toBe(true)
    expect(hostPlatform()).toBe('darwin')
  })
})

describe('platform client — invoke', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('passes the channel and all args through to the bridge and returns its value', async () => {
    const spy = vi.fn(async () => ['a', 'b'])
    stubBridge({ invoke: spy as never })
    const result = await invoke('connections:list' as never)
    expect(spy).toHaveBeenCalledWith('connections:list')
    expect(result).toEqual(['a', 'b'])

    await invoke('db:query' as never, 'c1' as never, 'SELECT 1' as never)
    expect(spy).toHaveBeenLastCalledWith('db:query', 'c1', 'SELECT 1')
  })

  it('rejects with an Error when the backend is unavailable', async () => {
    await expect(invoke('connections:list' as never)).rejects.toBeInstanceOf(Error)
  })

  it('normalizes a non-Error rejection into an Error', async () => {
    stubBridge({ invoke: async () => { throw 'boom' } })
    await expect(invoke('connections:list' as never)).rejects.toBeInstanceOf(Error)
    await expect(invoke('connections:list' as never)).rejects.toThrow('boom')
  })

  it('passes an Error rejection through unchanged', async () => {
    const original = new TypeError('nope')
    stubBridge({ invoke: async () => { throw original } })
    await expect(invoke('connections:list' as never)).rejects.toBe(original)
  })
})

describe('platform client — invokeOptional', () => {
  it('returns undefined (no throw) when the backend is unavailable', () => {
    expect(invokeOptional('connections:list' as never)).toBeUndefined()
  })

  it('delegates to the bridge when available', async () => {
    const spy = vi.fn(async () => 42)
    stubBridge({ invoke: spy as never })
    const p = invokeOptional('db:query' as never, 'c1' as never)
    expect(p).toBeInstanceOf(Promise)
    await expect(p as Promise<unknown>).resolves.toBe(42)
    expect(spy).toHaveBeenCalledWith('db:query', 'c1')
  })
})

describe('platform client — on', () => {
  it('subscribes through the bridge and forwards the unsubscribe', () => {
    const unsub = vi.fn()
    const onSpy = vi.fn(() => unsub)
    stubBridge({ on: onSpy as never })
    const off = on('menu:action' as never, () => {})
    expect(onSpy).toHaveBeenCalledTimes(1)
    off()
    expect(unsub).toHaveBeenCalledTimes(1)
  })

  it('returns a safe no-op unsubscribe when the backend is unavailable', () => {
    const off = on('menu:action' as never, () => {})
    expect(() => off()).not.toThrow()
  })
})

describe('platform client — ipc aggregate', () => {
  it('exposes the same functions under a namespace', () => {
    expect(ipc.invoke).toBe(invoke)
    expect(ipc.optional).toBe(invokeOptional)
    expect(ipc.on).toBe(on)
    expect(ipc.available).toBe(isBackendAvailable)
    expect(ipc.platform).toBe(hostPlatform)
  })
})
