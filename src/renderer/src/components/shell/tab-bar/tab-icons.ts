import { FileText, GitFork, Plug, Table2, Puzzle, Package, Settings, Sparkles, PartyPopper, type LucideIcon } from 'lucide-react'
import type { Tab } from '@shared/types'

interface TabIconConfig {
  icon: LucideIcon
  color: string
}

const tabIconMap: Record<Tab['type'], TabIconConfig> = {
  query: { icon: FileText, color: 'var(--color-decorative-2)' },
  'er-diagram': { icon: GitFork, color: 'var(--color-decorative-3)' },
  'connection-form': { icon: Plug, color: 'var(--color-decorative-4)' },
  table: { icon: Table2, color: 'var(--color-decorative-5)' },
  'plugin-detail': { icon: Puzzle, color: 'var(--color-decorative-6)' },
  'install-plugin': { icon: Package, color: 'var(--color-decorative-7)' },
  settings: { icon: Settings, color: 'var(--color-text-tertiary)' },
  welcome: { icon: Sparkles, color: 'var(--color-accent)' },
  'release-notes': { icon: PartyPopper, color: 'var(--color-decorative-8)' },
}

export function getTabIcon(type: Tab['type']): TabIconConfig {
  return tabIconMap[type]
}
