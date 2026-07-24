import { useEffect, type ComponentType, type ReactNode } from 'react'
import { selectContributions, usePluginUIStore } from '@/stores/plugin-ui'
import { ChatPanel } from '@/components/ai/ChatPanel.lazy'
import { AIToggleButton } from '@/components/ai/AIToggleButton'
import { ExplainPanel } from '@/components/ai/ExplainPanel'
import { AIStatusSegment } from '@/components/ai/AIStatusSegment'

/**
 * Registry of host components a plugin can mount via the `host-component`
 * widget. Adding a new component here is the only thing required to expose
 * a new piece of in-tree React UI to plugins.
 *
 * Plugins reference these by id in their widget declaration:
 *   { type: 'host-component', componentId: 'ai-chat-panel' }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HOST_COMPONENTS: Record<string, ComponentType<any>> = {
  'ai-chat-panel': ChatPanel,
  'ai-toggle-button': AIToggleButton,
  'ai-explain': ExplainPanel,
  'ai-status': AIStatusSegment,
}

interface Props {
  /** Slot identifier — plugins target this with ctx.ui.registerSlot. */
  id: string
  /**
   * Optional context object forwarded as props to every mounted host component.
   * Components destructure whatever keys they need; the host doesn't have to
   * know about plugin-specific shapes.
   */
  context?: Record<string, unknown>
  /** Optional wrapper around the contribution list (e.g. a flex container). */
  wrap?: (children: ReactNode) => ReactNode
}

/**
 * Generic mount point for plugin-contributed UI. The host drops one of these
 * wherever it wants plugins to be able to add UI; plugins call
 * `ctx.ui.registerSlot('<id>', [widgets])` to fill it. Disabling the plugin
 * removes the contribution and the slot empties automatically.
 *
 * No `if (someFeature)` checks — the host renders whatever is here and
 * nothing when nothing is contributed.
 */
export function PluginSlot({ id, context, wrap }: Props) {
  const all = usePluginUIStore(selectContributions('slot'))
  const fetchContributions = usePluginUIStore((s) => s.fetchContributions)

  useEffect(() => {
    fetchContributions('slot')
  }, [fetchContributions])

  const matching = all.filter((c) => c.slotId === id)
  if (matching.length === 0) return null

  const nodes = matching.flatMap((c) =>
    c.widgets.map((w, i) => {
      if (w.type !== 'host-component') return null
      const cw = w as { componentId: string; props?: Record<string, unknown> }
      const Comp = HOST_COMPONENTS[cw.componentId]
      if (!Comp) return null
      return <Comp key={`${c.contributionId}-${i}`} {...(cw.props ?? {})} {...(context ?? {})} />
    })
  )

  return <>{wrap ? wrap(nodes) : nodes}</>
}
