import { useEffect, type ComponentType } from 'react'
import { selectContributions, usePluginUIStore } from '@/stores/plugin-ui'
import { ChatPanel } from '@/components/ai/ChatPanel.lazy'

/**
 * Mounts host-side React components contributed by plugins.
 *
 * A plugin registers a panel containing a `host-component` widget whose
 * `componentId` maps to a known renderer component (e.g. the AI chat UI).
 * Disabling/uninstalling the plugin removes the contribution and this
 * component renders nothing — the UI disappears with no extra wiring.
 *
 * Contribution refresh on plugin lifecycle changes is owned by the plugin-ui
 * store (it subscribes to `plugins:ui:contributions-changed` once at module
 * load and debounces refetches). This component only triggers the initial
 * fetch on mount.
 *
 * To add a new host-component, add an entry to `RENDERERS` below.
 */
const RENDERERS: Record<string, ComponentType> = {
  'ai-chat-panel': ChatPanel
}

interface Props {
  /** Which contribution surface to watch (e.g. 'panels'). */
  surface: 'panels' | 'tabs'
  /** Which host-component id to mount. */
  componentId: string
}

export function PluginPanelMount({ surface, componentId }: Props) {
  // Stable selector — returns the SAME EMPTY array reference when no data,
  // so zustand's Object.is check doesn't spuriously re-render us.
  const contributions = usePluginUIStore(selectContributions(surface))
  const fetchContributions = usePluginUIStore((s) => s.fetchContributions)

  useEffect(() => {
    fetchContributions(surface)
  }, [surface, fetchContributions])

  const present = contributions.some((c) =>
    c.widgets.some(
      (w) => w.type === 'host-component' && (w as { componentId: string }).componentId === componentId
    )
  )

  if (!present) return null
  const Comp = RENDERERS[componentId]
  if (!Comp) return null
  return <Comp />
}
