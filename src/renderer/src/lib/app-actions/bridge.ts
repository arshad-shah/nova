import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
import { errorMessage } from '@shared/errors'
import { appActions } from './registry'
import { useToastStore } from '@/stores/toast'
import { ipc } from '@/platform/client'

let initialized = false

/**
 * Bridges agentic `perform_app_action` tool calls (main process) to the
 * renderer's App-Action registry. Only `navigation` actions run agentically;
 * `mutating` actions must be confirmed by the user via a chip, never auto-run
 * from a tool. Call once at startup.
 */
export function initAppActionBridge(): void {
  if (initialized) return
  if (!ipc.available()) return
  initialized = true

  ipc.on(IPC_EVENTS.APP_ACTION_PERFORM, async (payload: unknown) => {
    const p = payload as { requestId?: string; actionId?: string; params?: Record<string, unknown> } | undefined
    if (!p?.requestId || !p.actionId) return

    const report = (success: boolean, error?: string) => {
      void ipc.invoke(IPC_CHANNELS.APP_ACTION_RESULT, {
        requestId: p.requestId!, success, ...(error ? { error } : {})
      })
    }

    const action = appActions.get(p.actionId)
    if (!action) {
      report(false, `Unknown action: ${p.actionId}`)
      return
    }
    // Only safe navigation actions run agentically; mutating actions must be
    // user-confirmed via a chip, never auto-run from a tool.
    if (action.kind !== 'navigation') {
      report(false, `"${action.title}" changes data and needs the user to confirm it.`)
      return
    }

    try {
      await appActions.run(p.actionId, p.params ?? {})
      report(true)
    } catch (err) {
      const message = errorMessage(err)
      report(false, message)
      useToastStore.getState().addToast({
        type: 'error',
        title: `Couldn't ${action.title.toLowerCase()}`,
        message
      })
    }
  })
}
