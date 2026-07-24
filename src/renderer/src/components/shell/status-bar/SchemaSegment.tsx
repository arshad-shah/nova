import { useTabsStore } from '@/stores/tabs'
import type { QueryTab } from '@shared/types'
import { StatusBarSegment } from './StatusBarSegment'

interface Props {
  onClick: () => void
}

export function SchemaSegment({ onClick }: Props) {
  const tabs = useTabsStore(s => s.tabs)
  const activeTabId = useTabsStore(s => s.activeTabId)
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const queryTab = activeTab?.type === 'query' ? (activeTab as QueryTab) : null
  if (!queryTab?.schema) return null
  return (
    <StatusBarSegment
      as="button"
      tone="schema"
      side="left"
      interactive
      onClick={onClick}
      aria-label={`Switch schema (current: ${queryTab.schema})`}
    >
      / {queryTab.schema}
    </StatusBarSegment>
  )
}
