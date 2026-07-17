import { useEffect } from 'react'
import { usePluginUIStore, selectContributions } from '@/stores/plugin-ui'
import type { ContextMenuTarget } from '@shared/plugin-ui-types'
import type { MenuNode } from '@/primitives/surfaces/menu/types'

export function usePluginContextMenuItems(target: ContextMenuTarget) {
  const contributions = usePluginUIStore(selectContributions('contextMenu'))
  const executeAction = usePluginUIStore((s) => s.executeAction)

  useEffect(() => {
    usePluginUIStore.getState().fetchContributions('contextMenu')
  }, [])

  const items: MenuNode[] = contributions
    .filter((c) => c.meta.target === target)
    .map((c) => ({
      kind: 'item',
      // Stable across re-renders and across plugins appearing/disappearing —
      // a plugin id plus its command uniquely identifies a contribution.
      id: `plugin:${c.pluginId}:${c.meta.command as string}`,
      label: `${c.pluginName}: ${c.meta.label}`,
      onSelect: () => executeAction(c.pluginId, c.meta.command as string, {}),
    }))

  return items
}
