import { FileText, GitFork, Plug, Table2, Puzzle, Package, Settings, Sparkles, PartyPopper, type LucideIcon } from 'lucide-react'
import type { Tab } from '@shared/types'

interface TabIconConfig {
  icon: LucideIcon
  className: string
}

/* Semantic tokens only — a raw palette class (text-blue-400) renders the same
   on all 11 bundled themes, which is exactly what the theme system exists to
   prevent. Tab['type'] is a closed, app-owned union, so this map is glue, not
   driver knowledge. */
const tabIconMap: Record<Tab['type'], TabIconConfig> = {
  query: { icon: FileText, className: 'text-data-accent' },
  'er-diagram': { icon: GitFork, className: 'text-accent' },
  'connection-form': { icon: Plug, className: 'text-warning' },
  table: { icon: Table2, className: 'text-key-fk' },
  'plugin-detail': { icon: Puzzle, className: 'text-success' },
  'install-plugin': { icon: Package, className: 'text-info' },
  settings: { icon: Settings, className: 'text-text-tertiary' },
  welcome: { icon: Sparkles, className: 'text-accent' },
  'release-notes': { icon: PartyPopper, className: 'text-agent-accent' },
}

export function getTabIcon(type: Tab['type']): TabIconConfig {
  return tabIconMap[type]
}
