// installRendererDiagnostics wires verbose store-mutation logging. The
// verbose gate is checked live inside the subscriber callback (not baked in
// at subscribe time), so toggling it on/off after install must immediately
// change whether a store change gets recorded.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installRendererDiagnostics } from '../../src/renderer/src/lib/store-diagnostics'
import { setDiagnosticsVerbose } from '../../src/renderer/src/lib/diagnostics'
import { useUiStore, ACTIVITY_PANEL } from '../../src/renderer/src/stores/ui'
import { IPC_CHANNELS } from '@shared/ipc'

beforeEach(() => {
  const invoke = vi.fn().mockResolvedValue(undefined)
  // @ts-expect-error test override
  globalThis.window.electronAPI = { invoke, on: vi.fn(() => () => {}) }
  setDiagnosticsVerbose(false)
  useUiStore.setState({ activePanel: ACTIVITY_PANEL.EXPLORER })
  // installRendererDiagnostics is idempotent (module-level `installed` flag),
  // so this only truly wires listeners on the very first call across the
  // whole file — which is exactly the behaviour under test.
  installRendererDiagnostics()
})

function invokeCalls() {
  return (window.electronAPI.invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
    (c) => c[0] === IPC_CHANNELS.ACTIVITY_RECORD
  )
}

describe('installRendererDiagnostics — store watchers', () => {
  it('does not record a store mutation while verbose is off', () => {
    useUiStore.getState().setActivePanel(ACTIVITY_PANEL.EXPLORER)
    useUiStore.setState({ activePanel: ACTIVITY_PANEL.QUERY })
    expect(invokeCalls()).toHaveLength(0)
  })

  it('records the changed top-level keys once verbose is turned on', () => {
    setDiagnosticsVerbose(true)
    useUiStore.setState({ activePanel: ACTIVITY_PANEL.QUERY })
    const calls = invokeCalls()
    expect(calls.length).toBeGreaterThan(0)
    const payload = calls[calls.length - 1][1] as { kind: string; source: string; metadata: { changed: string[] } }
    expect(payload.kind).toBe('store')
    expect(payload.source).toBe('ui')
    expect(payload.metadata.changed).toContain('activePanel')
  })

  it('stops recording again as soon as verbose is turned back off', () => {
    setDiagnosticsVerbose(true)
    useUiStore.setState({ activePanel: ACTIVITY_PANEL.PLUGINS })
    const before = invokeCalls().length
    setDiagnosticsVerbose(false)
    useUiStore.setState({ activePanel: ACTIVITY_PANEL.EXPLORER })
    expect(invokeCalls()).toHaveLength(before)
  })

  it('does not record when the resulting state is reference-equal on every watched key (no-op set)', () => {
    setDiagnosticsVerbose(true)
    const { activePanel } = useUiStore.getState()
    useUiStore.setState({ activePanel }) // identical value, not a real change
    expect(invokeCalls()).toHaveLength(0)
  })
})
