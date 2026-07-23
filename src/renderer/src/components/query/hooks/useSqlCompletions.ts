import { useEffect } from 'react'
import { updateCompletionItems } from '@/lib/monaco-sql'
import { setAICompletionContext } from '@/lib/monaco-ai-completion'
import { IPC_CHANNELS } from '@shared/ipc'
import { ipc } from '@/platform/client'

/** Keeps the SQL editor's completion sources in sync with the active
 *  connection: it points the AI inline-completion at the live connection and
 *  fetches plugin-contributed completion items for the current schema. */
export function useSqlCompletions(
  connectionId: string | null,
  schema: string | null,
  connectedIds: Set<string>,
  databaseType: string | undefined
): void {
  useEffect(() => {
    setAICompletionContext(connectionId && connectedIds.has(connectionId) ? connectionId : null)
  }, [connectionId, connectedIds])

  useEffect(() => {
    if (!connectionId || !connectedIds.has(connectionId) || !databaseType) {
      updateCompletionItems([])
      return
    }
    ipc.invoke(IPC_CHANNELS.PLUGINS_COMPLETIONS, databaseType, connectionId, {
      connectionId,
      schema: schema ?? undefined
    })
      .then(items => updateCompletionItems(items))
      .catch(() => updateCompletionItems([]))
  }, [connectionId, schema, connectedIds, databaseType])
}
