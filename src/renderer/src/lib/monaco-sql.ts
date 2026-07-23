import type { Monaco } from '@monaco-editor/react'
import type { editor, Position } from 'monaco-editor'
import type { CompletionItem, CompletionItemKind } from '@shared/plugin-ui-types'
import { IPC_CHANNELS } from '@shared/ipc'
import { editorRegistry } from '@/stores/editor'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionsStore } from '@/stores/connections'
import { ipc } from '@/platform/client'

let cachedItems: CompletionItem[] = []

export function updateCompletionItems(items: CompletionItem[]): void {
  cachedItems = items
}

const kindMap: Record<CompletionItemKind, number> = {
  keyword: 17,    // Monaco CompletionItemKind.Keyword
  table: 6,       // Struct (was previously used for tables)
  column: 4,      // Field
  function: 1,    // Function
  collection: 6,  // Struct
  command: 17,    // Keyword
  field: 4,       // Field
  operator: 11,   // Operator
  snippet: 27,    // Snippet
}

export function registerCompletionProvider(monaco: Monaco, language: string): void {
  monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters: ['.', ' ', '$', '"'],
    provideCompletionItems: (model: editor.ITextModel, position: Position) => {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }

      const suggestions = cachedItems.map(item => ({
        label: item.label,
        kind: kindMap[item.kind] ?? 17,
        insertText: item.insertText ?? item.label,
        detail: item.detail,
        range,
        sortText: item.sortText ?? item.label
      }))

      return { suggestions }
    }
  })
}

/** Dialect of the connection backing a given editor model, for formatting. */
function connectionTypeForModel(model: editor.ITextModel): string {
  const reg = editorRegistry.getByModelUri(model.uri.toString())
  const tab = reg ? useTabsStore.getState().tabs.find(t => t.id === reg.tabId) : undefined
  const { activeConnectionId, connections } = useConnectionsStore.getState()
  const connId = (tab && tab.type === 'query' ? tab.connectionId : null) ?? activeConnectionId
  return connections.find(c => c.id === connId)?.type ?? ''
}

/**
 * Registers a document-formatting provider so "Format Document" (Shift+Alt+F /
 * right-click) pretty-prints the buffer. Language-agnostic: the formatting is
 * plugin-owned, so this just calls the `db:format-query` glue with the model's
 * language + connection type. If no formatter matches (changed === false) it's
 * a clean no-op, so it's safe to register for any editor language.
 */
export function registerQueryFormattingProvider(monaco: Monaco, language: string): void {
  monaco.languages.registerDocumentFormattingEditProvider(language, {
    async provideDocumentFormattingEdits(model: editor.ITextModel) {
      const text = model.getValue()
      if (!text.trim()) return []
      try {
        const { formatted, changed } = await ipc.invoke(
          IPC_CHANNELS.DB_FORMAT_QUERY,
          model.getLanguageId(),
          connectionTypeForModel(model),
          text
        )
        if (!changed) return []
        return [{ range: model.getFullModelRange(), text: formatted }]
      } catch {
        return []
      }
    }
  })
}
