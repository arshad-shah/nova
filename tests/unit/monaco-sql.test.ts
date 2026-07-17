import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  updateCompletionItems,
  registerCompletionProvider,
  registerQueryFormattingProvider,
} from '../../src/renderer/src/lib/monaco-sql'
import { editorRegistry } from '../../src/renderer/src/stores/editor'
import { useTabsStore } from '../../src/renderer/src/stores/tabs'
import { useConnectionsStore } from '../../src/renderer/src/stores/connections'
import { IPC_CHANNELS } from '@shared/ipc'
import type { CompletionItem } from '@shared/plugin-ui-types'

function fakeMonaco() {
  const completionProviders: Record<string, unknown> = {}
  const formattingProviders: Record<string, unknown> = {}
  return {
    languages: {
      registerCompletionItemProvider: vi.fn((lang: string, p: unknown) => { completionProviders[lang] = p }),
      registerDocumentFormattingEditProvider: vi.fn((lang: string, p: unknown) => { formattingProviders[lang] = p }),
    },
    getCompletionProvider: (lang: string) => completionProviders[lang] as {
      triggerCharacters: string[]
      provideCompletionItems: (model: unknown, position: unknown) => { suggestions: unknown[] }
    },
    getFormattingProvider: (lang: string) => formattingProviders[lang] as {
      provideDocumentFormattingEdits: (model: unknown) => Promise<unknown[]>
    },
  }
}

function fakeModel(overrides: Partial<{ getWordUntilPosition: () => { startColumn: number; endColumn: number } }> = {}) {
  return {
    getWordUntilPosition: overrides.getWordUntilPosition ?? (() => ({ startColumn: 5, endColumn: 8 })),
  }
}

describe('registerCompletionProvider', () => {
  beforeEach(() => {
    updateCompletionItems([])
  })

  it('registers with the dot/space/$/quote trigger characters', () => {
    const monaco = fakeMonaco()
    registerCompletionProvider(monaco as never, 'sql')
    expect(monaco.getCompletionProvider('sql').triggerCharacters).toEqual(['.', ' ', '$', '"'])
  })

  it('maps cached completion items to Monaco suggestions with the word range and correct kind codes', () => {
    const monaco = fakeMonaco()
    registerCompletionProvider(monaco as never, 'sql')
    const items: CompletionItem[] = [
      { label: 'users', kind: 'table', detail: 'table' },
      { label: 'id', kind: 'column' },
    ]
    updateCompletionItems(items)
    const { suggestions } = monaco.getCompletionProvider('sql').provideCompletionItems(
      fakeModel(), { lineNumber: 3, column: 8 }
    )
    expect(suggestions).toEqual([
      { label: 'users', kind: 6, insertText: 'users', detail: 'table', range: { startLineNumber: 3, endLineNumber: 3, startColumn: 5, endColumn: 8 }, sortText: 'users' },
      { label: 'id', kind: 4, insertText: 'id', detail: undefined, range: { startLineNumber: 3, endLineNumber: 3, startColumn: 5, endColumn: 8 }, sortText: 'id' },
    ])
  })

  it('falls back to the label for insertText/sortText when the item omits them', () => {
    const monaco = fakeMonaco()
    registerCompletionProvider(monaco as never, 'sql')
    updateCompletionItems([{ label: 'SELECT', kind: 'keyword', insertText: 'SELECT ', sortText: '0' }])
    const { suggestions } = monaco.getCompletionProvider('sql').provideCompletionItems(fakeModel(), { lineNumber: 1, column: 1 })
    expect(suggestions[0]).toMatchObject({ insertText: 'SELECT ', sortText: '0' })
  })

  it('defaults to Monaco Keyword kind (17) for an item whose kind is not in the map', () => {
    const monaco = fakeMonaco()
    registerCompletionProvider(monaco as never, 'sql')
    updateCompletionItems([{ label: 'weird', kind: 'nonsense' as never }])
    const { suggestions } = monaco.getCompletionProvider('sql').provideCompletionItems(fakeModel(), { lineNumber: 1, column: 1 })
    expect((suggestions[0] as { kind: number }).kind).toBe(17)
  })

  it('later calls overwrite the cached items rather than accumulate them', () => {
    const monaco = fakeMonaco()
    registerCompletionProvider(monaco as never, 'sql')
    updateCompletionItems([{ label: 'a', kind: 'keyword' }])
    updateCompletionItems([{ label: 'b', kind: 'keyword' }])
    const { suggestions } = monaco.getCompletionProvider('sql').provideCompletionItems(fakeModel(), { lineNumber: 1, column: 1 })
    expect(suggestions).toHaveLength(1)
    expect((suggestions[0] as { label: string }).label).toBe('b')
  })
})

describe('registerQueryFormattingProvider', () => {
  const invoke = vi.fn()
  beforeEach(() => {
    invoke.mockReset()
    // @ts-expect-error test override
    globalThis.window.electronAPI = { invoke, on: vi.fn(() => () => {}) }
    useTabsStore.setState({ tabs: [], activeTabId: null })
    useConnectionsStore.setState({ connections: [], activeConnectionId: null, connectedIds: new Set(), loading: false })
  })

  function fakeFormattingModel(text: string, languageId = 'sql', uri = 'inmemory://model/1') {
    return {
      getValue: () => text,
      getLanguageId: () => languageId,
      getFullModelRange: () => ({ startLineNumber: 1, startColumn: 1, endLineNumber: 99, endColumn: 1 }),
      uri: { toString: () => uri },
    }
  }

  it('is a no-op for an empty/whitespace-only buffer — never calls IPC', async () => {
    const monaco = fakeMonaco()
    registerQueryFormattingProvider(monaco as never, 'sql')
    const edits = await monaco.getFormattingProvider('sql').provideDocumentFormattingEdits(fakeFormattingModel('   \n\t '))
    expect(edits).toEqual([])
    expect(invoke).not.toHaveBeenCalled()
  })

  it('returns a full-range edit with the formatted text when the formatter reports a change', async () => {
    invoke.mockResolvedValueOnce({ formatted: 'SELECT\n  1', changed: true })
    const monaco = fakeMonaco()
    registerQueryFormattingProvider(monaco as never, 'sql')
    const edits = await monaco.getFormattingProvider('sql').provideDocumentFormattingEdits(fakeFormattingModel('select 1'))
    expect(edits).toEqual([{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 99, endColumn: 1 }, text: 'SELECT\n  1' }])
  })

  it('returns no edits when the formatter reports no change', async () => {
    invoke.mockResolvedValueOnce({ formatted: 'select 1', changed: false })
    const monaco = fakeMonaco()
    registerQueryFormattingProvider(monaco as never, 'sql')
    const edits = await monaco.getFormattingProvider('sql').provideDocumentFormattingEdits(fakeFormattingModel('select 1'))
    expect(edits).toEqual([])
  })

  it('swallows a rejected format IPC call and returns no edits instead of throwing', async () => {
    invoke.mockRejectedValueOnce(new Error('formatter crashed'))
    const monaco = fakeMonaco()
    registerQueryFormattingProvider(monaco as never, 'sql')
    const edits = await monaco.getFormattingProvider('sql').provideDocumentFormattingEdits(fakeFormattingModel('select 1'))
    expect(edits).toEqual([])
  })

  it("resolves the connection type from the model's owning query tab, not just the globally active connection", async () => {
    useConnectionsStore.setState({
      connections: [
        { id: 'active-conn', name: 'Active', type: 'postgresql', database: 'd' },
        { id: 'tab-conn', name: 'TabConn', type: 'mysql', database: 'd' },
      ] as never,
      activeConnectionId: 'active-conn',
    })
    useTabsStore.setState({
      tabs: [{ id: 'tab-1', type: 'query', connectionId: 'tab-conn' }] as never,
      activeTabId: 'tab-1',
    })
    const modelUri = 'inmemory://model/query-tab'
    // getByModelUri walks registered editors' getModel(); stub it to report our model URI.
    editorRegistry.register({
      editor: { getModel: () => ({ uri: { toString: () => modelUri } }) } as never,
      monaco: {} as never,
      tabId: 'tab-1',
    })
    invoke.mockResolvedValueOnce({ formatted: 'x', changed: true })
    const monaco = fakeMonaco()
    registerQueryFormattingProvider(monaco as never, 'sql')
    await monaco.getFormattingProvider('sql').provideDocumentFormattingEdits(fakeFormattingModel('select 1', 'sql', modelUri))
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_FORMAT_QUERY, 'sql', 'mysql', 'select 1')
    editorRegistry.unregister('tab-1')
  })

  it('falls back to the globally active connection type when the model belongs to no registered editor', async () => {
    useConnectionsStore.setState({
      connections: [{ id: 'active-conn', name: 'Active', type: 'postgresql', database: 'd' }] as never,
      activeConnectionId: 'active-conn',
    })
    invoke.mockResolvedValueOnce({ formatted: 'x', changed: true })
    const monaco = fakeMonaco()
    registerQueryFormattingProvider(monaco as never, 'sql')
    await monaco.getFormattingProvider('sql').provideDocumentFormattingEdits(fakeFormattingModel('select 1'))
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_FORMAT_QUERY, 'sql', 'postgresql', 'select 1')
  })

  it('passes an empty connection type when nothing resolves', async () => {
    invoke.mockResolvedValueOnce({ formatted: 'x', changed: true })
    const monaco = fakeMonaco()
    registerQueryFormattingProvider(monaco as never, 'sql')
    await monaco.getFormattingProvider('sql').provideDocumentFormattingEdits(fakeFormattingModel('select 1'))
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_FORMAT_QUERY, 'sql', '', 'select 1')
  })
})
