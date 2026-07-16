import type { AppSettings } from '@shared/settings'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
import type { IpcContext, Handle } from './context'
import { broadcast } from './broadcast'
import { redactAi, redactSettings } from './secrets'
import { buildAppMenu } from '../app-menu'

/** The native menu's accelerators come from the user's keybindings, so it has
 *  to be rebuilt when they change — otherwise a rebound command keeps firing
 *  on its old key (the native accelerator swallows it before the renderer's
 *  handler ever sees it). */
function rebuildMenuIfKeybindings(ctx: IpcContext, keyPath: string): void {
  if (keyPath !== 'keybindings' && !keyPath.startsWith('keybindings.')) return
  buildAppMenu(ctx.configStore.getSettingsCategory('keybindings'))
}

export function registerSettingsHandlers(ctx: IpcContext, handle: Handle): void {
  handle(IPC_CHANNELS.SETTINGS_GET_ALL, async () => {
    return redactSettings(ctx.configStore.getAllSettings())
  })

  handle(IPC_CHANNELS.SETTINGS_GET, async (category) => {
    const value = ctx.configStore.getSettingsCategory(category as keyof AppSettings)
    return category === 'ai' ? redactAi(value as Record<string, unknown>) : value
  })

  handle(IPC_CHANNELS.SETTINGS_SET, async (keyPath, value) => {
    // Legacy callers writing AI keys via settings:set route into the keyring.
    if (keyPath === 'ai.openaiKey' || keyPath === 'ai.anthropicKey') {
      const provider = keyPath === 'ai.openaiKey' ? 'openai' : 'anthropic'
      ctx.keyring.storeSync('__ai__', provider, String(value ?? ''))
      return
    }
    ctx.configStore.setSetting(keyPath as string, value)
    broadcast(IPC_EVENTS.SETTINGS_CHANGED, keyPath as string, value)
    rebuildMenuIfKeybindings(ctx, keyPath as string)
  })

  handle(IPC_CHANNELS.SETTINGS_RESET, async (category) => {
    ctx.configStore.resetCategory(category as keyof AppSettings)
    const updated = ctx.configStore.getSettingsCategory(category as keyof AppSettings)
    broadcast(IPC_EVENTS.SETTINGS_CHANGED, category, updated)
    rebuildMenuIfKeybindings(ctx, category as string)
    return updated
  })
}
