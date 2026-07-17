import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { editor as MonacoEditorNs } from 'monaco-editor'

// editorRegistry is a module-level singleton (not a zustand store) — its
// Maps persist across tests unless we reset the module between them.
async function freshRegistry() {
  vi.resetModules()
  const mod = await import('../../../src/renderer/src/stores/editor')
  return mod.editorRegistry
}

// Minimal fake standing in for monaco-editor's IStandaloneCodeEditor, with
// just the surface editorRegistry actually calls.
function fakeEditor(opts?: {
  modelUri?: string
  selection?: { isEmpty: boolean; range: string }
  actions?: { id: string; label: string }[]
}) {
  const modelUri = opts?.modelUri
  const selection = opts?.selection
  const actions = opts?.actions ?? []
  const runSpies: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const a of actions) runSpies[a.id] = vi.fn().mockResolvedValue(undefined)

  const model = modelUri
    ? { uri: { toString: () => modelUri }, getValueInRange: () => selection?.range ?? '' }
    : null

  return {
    getModel: () => model,
    getSelection: () => (selection ? { isEmpty: () => selection.isEmpty } : null),
    getSupportedActions: () => actions,
    getAction: (id: string) => (runSpies[id] ? { id, run: runSpies[id] } : null),
    __runSpies: runSpies,
  } as unknown as MonacoEditorNs.IStandaloneCodeEditor & { __runSpies: Record<string, ReturnType<typeof vi.fn>> }
}

const fakeMonaco = {} as never

describe('editorRegistry — register/unregister/lookup', () => {
  it('get() returns null when nothing has ever been registered', async () => {
    const registry = await freshRegistry()
    expect(registry.get()).toBeNull()
  })

  it('register() makes the editor the "most recent" and get() returns it', async () => {
    const registry = await freshRegistry()
    const ed = fakeEditor()
    registry.register({ editor: ed, monaco: fakeMonaco, tabId: 'tab-1' })
    expect(registry.get()?.tabId).toBe('tab-1')
  })

  it('registering a second tab shifts "most recent" to the new one', async () => {
    const registry = await freshRegistry()
    registry.register({ editor: fakeEditor(), monaco: fakeMonaco, tabId: 'tab-1' })
    registry.register({ editor: fakeEditor(), monaco: fakeMonaco, tabId: 'tab-2' })
    expect(registry.get()?.tabId).toBe('tab-2')
  })

  it('double-registering the same tabId overwrites the entry but keeps it current', async () => {
    const registry = await freshRegistry()
    const first = fakeEditor({ modelUri: 'model://a' })
    const second = fakeEditor({ modelUri: 'model://b' })
    registry.register({ editor: first, monaco: fakeMonaco, tabId: 'tab-1' })
    registry.register({ editor: second, monaco: fakeMonaco, tabId: 'tab-1' })
    expect(registry.get()?.editor).toBe(second)
    expect(registry.getByModelUri('model://a')).toBeNull()
    expect(registry.getByModelUri('model://b')?.tabId).toBe('tab-1')
  })

  it('unregister() of the current tab falls back to a remaining editor, not null', async () => {
    const registry = await freshRegistry()
    registry.register({ editor: fakeEditor(), monaco: fakeMonaco, tabId: 'tab-1' })
    registry.register({ editor: fakeEditor(), monaco: fakeMonaco, tabId: 'tab-2' })
    registry.unregister('tab-2') // tab-2 was "most recent"
    expect(registry.get()?.tabId).toBe('tab-1')
  })

  it('unregister() of the last remaining tab clears "most recent" back to null', async () => {
    const registry = await freshRegistry()
    registry.register({ editor: fakeEditor(), monaco: fakeMonaco, tabId: 'tab-1' })
    registry.unregister('tab-1')
    expect(registry.get()).toBeNull()
  })

  it('unregister() of a tab that was never registered is a no-op (does not throw, does not touch current)', async () => {
    const registry = await freshRegistry()
    registry.register({ editor: fakeEditor(), monaco: fakeMonaco, tabId: 'tab-1' })
    expect(() => registry.unregister('never-registered')).not.toThrow()
    expect(registry.get()?.tabId).toBe('tab-1')
  })

  it('unregister() of a non-current tab leaves "most recent" untouched', async () => {
    const registry = await freshRegistry()
    registry.register({ editor: fakeEditor(), monaco: fakeMonaco, tabId: 'tab-1' })
    registry.register({ editor: fakeEditor(), monaco: fakeMonaco, tabId: 'tab-2' })
    registry.unregister('tab-1')
    expect(registry.get()?.tabId).toBe('tab-2')
  })

  it('getByModelUri() finds the owning tab by the model URI Monaco hands back', async () => {
    const registry = await freshRegistry()
    registry.register({ editor: fakeEditor({ modelUri: 'inmemory://model/1' }), monaco: fakeMonaco, tabId: 'tab-1' })
    registry.register({ editor: fakeEditor({ modelUri: 'inmemory://model/2' }), monaco: fakeMonaco, tabId: 'tab-2' })
    expect(registry.getByModelUri('inmemory://model/2')?.tabId).toBe('tab-2')
  })

  it('getByModelUri() returns null for an unknown URI', async () => {
    const registry = await freshRegistry()
    registry.register({ editor: fakeEditor({ modelUri: 'inmemory://model/1' }), monaco: fakeMonaco, tabId: 'tab-1' })
    expect(registry.getByModelUri('inmemory://model/does-not-exist')).toBeNull()
  })

  it('getByModelUri() returns null when the owning editor has no model at all', async () => {
    const registry = await freshRegistry()
    registry.register({ editor: fakeEditor(), monaco: fakeMonaco, tabId: 'tab-1' })
    expect(registry.getByModelUri('anything')).toBeNull()
  })
})

describe('editorRegistry — subscribe()', () => {
  it('notifies subscribers on register and unregister', async () => {
    const registry = await freshRegistry()
    const listener = vi.fn()
    registry.subscribe(listener)
    registry.register({ editor: fakeEditor(), monaco: fakeMonaco, tabId: 'tab-1' })
    registry.unregister('tab-1')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('the unsubscribe function returned by subscribe() stops further notifications', async () => {
    const registry = await freshRegistry()
    const listener = vi.fn()
    const unsubscribe = registry.subscribe(listener)
    unsubscribe()
    registry.register({ editor: fakeEditor(), monaco: fakeMonaco, tabId: 'tab-1' })
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('editorRegistry — getSelectedSql()', () => {
  it('returns empty string when there is no registered editor', async () => {
    const registry = await freshRegistry()
    expect(registry.getSelectedSql()).toBe('')
  })

  it('returns empty string when the selection is empty (cursor, no range)', async () => {
    const registry = await freshRegistry()
    registry.register({
      editor: fakeEditor({ modelUri: 'm', selection: { isEmpty: true, range: 'select 1' } }),
      monaco: fakeMonaco,
      tabId: 'tab-1',
    })
    expect(registry.getSelectedSql()).toBe('')
  })

  it('returns the trimmed selected text when there is a real range', async () => {
    const registry = await freshRegistry()
    registry.register({
      editor: fakeEditor({ modelUri: 'm', selection: { isEmpty: false, range: '  select 1  \n' } }),
      monaco: fakeMonaco,
      tabId: 'tab-1',
    })
    expect(registry.getSelectedSql()).toBe('select 1')
  })
})

describe('editorRegistry — listActions() / runAction()', () => {
  it('listActions() returns [] when there is no registered editor', async () => {
    const registry = await freshRegistry()
    expect(registry.listActions()).toEqual([])
  })

  it('listActions() maps Monaco actions down to id + label', async () => {
    const registry = await freshRegistry()
    registry.register({
      editor: fakeEditor({ actions: [{ id: 'a1', label: 'Format' }, { id: 'a2', label: 'Find' }] }),
      monaco: fakeMonaco,
      tabId: 'tab-1',
    })
    expect(registry.listActions()).toEqual([{ id: 'a1', label: 'Format' }, { id: 'a2', label: 'Find' }])
  })

  it('runAction() invokes the action.run() for a known id', async () => {
    const registry = await freshRegistry()
    const ed = fakeEditor({ actions: [{ id: 'a1', label: 'Format' }] })
    registry.register({ editor: ed, monaco: fakeMonaco, tabId: 'tab-1' })
    registry.runAction('a1')
    expect(ed.__runSpies['a1']).toHaveBeenCalledTimes(1)
  })

  it('runAction() is a silent no-op for an unknown action id', async () => {
    const registry = await freshRegistry()
    const ed = fakeEditor({ actions: [{ id: 'a1', label: 'Format' }] })
    registry.register({ editor: ed, monaco: fakeMonaco, tabId: 'tab-1' })
    expect(() => registry.runAction('does-not-exist')).not.toThrow()
    expect(ed.__runSpies['a1']).not.toHaveBeenCalled()
  })

  it('runAction() is a silent no-op when there is no registered editor at all', async () => {
    const registry = await freshRegistry()
    expect(() => registry.runAction('a1')).not.toThrow()
  })
})
