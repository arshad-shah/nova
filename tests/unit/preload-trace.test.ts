// The preload bridge is the wire boundary where renderer→main traces are born:
// every invoke carries a freshly-minted trace envelope as its trailing argument
// (Phase 0 trace propagation). This guards that the envelope is appended, that
// each invoke gets a distinct id, and that the real channel + args pass through
// unchanged so app-level call sites (and their tests) never see the envelope.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isTraceEnvelope } from '@shared/trace'

const { invokeMock, exposeMock, onMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async () => undefined),
  exposeMock: vi.fn(),
  onMock: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: exposeMock },
  ipcRenderer: { invoke: invokeMock, on: onMock, removeListener: vi.fn() },
}))

type Bridge = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

async function loadBridge(): Promise<Bridge> {
  await import('../../src/preload/index')
  const call = exposeMock.mock.calls.find(c => c[0] === 'electronAPI')!
  return call[1] as Bridge
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('preload trace envelope', () => {
  it('appends a trace envelope after the real channel args', async () => {
    const bridge = await loadBridge()
    await bridge.invoke('db:query', 'c1', 'SELECT 1')
    const call = invokeMock.mock.calls.at(-1)!
    expect(call.slice(0, 3)).toEqual(['db:query', 'c1', 'SELECT 1'])
    expect(call).toHaveLength(4)
    expect(isTraceEnvelope(call[3])).toBe(true)
  })

  it('mints a distinct id per invoke', async () => {
    const bridge = await loadBridge()
    await bridge.invoke('connections:list')
    await bridge.invoke('connections:list')
    const first = invokeMock.mock.calls[0].at(-1) as { __verqlTrace: string }
    const second = invokeMock.mock.calls[1].at(-1) as { __verqlTrace: string }
    expect(first.__verqlTrace).not.toBe(second.__verqlTrace)
  })
})
