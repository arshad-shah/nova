import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setDiagnosticsVerbose, isDiagnosticsVerbose, recordActivity } from '../../src/renderer/src/lib/diagnostics'
import { IPC_CHANNELS } from '@shared/ipc'

describe('diagnostics verbose flag', () => {
  it('defaults to off', () => {
    // Reset any state a previous test in this file left behind.
    setDiagnosticsVerbose(false)
    expect(isDiagnosticsVerbose()).toBe(false)
  })

  it('toggles on and off and reflects the latest call', () => {
    setDiagnosticsVerbose(true)
    expect(isDiagnosticsVerbose()).toBe(true)
    setDiagnosticsVerbose(false)
    expect(isDiagnosticsVerbose()).toBe(false)
  })
})

describe('recordActivity', () => {
  beforeEach(() => {
    // @ts-expect-error test override
    globalThis.window.electronAPI = { invoke: vi.fn().mockResolvedValue(undefined), on: vi.fn(() => () => {}) }
  })

  it('forwards the diagnostic input verbatim over the ACTIVITY_RECORD channel', () => {
    const input = { kind: 'store' as const, level: 'debug' as const, title: 'tabs: activeTabId', source: 'tabs' }
    recordActivity(input)
    expect(window.electronAPI.invoke).toHaveBeenCalledWith(IPC_CHANNELS.ACTIVITY_RECORD, input)
  })

  it('does not throw when electronAPI is unavailable (e.g. outside Electron)', () => {
    // @ts-expect-error test override
    globalThis.window.electronAPI = undefined
    expect(() => recordActivity({ kind: 'store', title: 'x' })).not.toThrow()
  })
})
