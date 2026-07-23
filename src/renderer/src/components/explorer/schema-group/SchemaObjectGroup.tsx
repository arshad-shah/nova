import type { ReactNode } from 'react'
import { useSchemaStore } from '@/stores/schema'
import { Box } from '@/primitives'
import { HighlightedText } from '../HighlightedText'
import { useGroupExpanded } from './useGroupExpanded'
import { GroupHeader } from './GroupHeader'

export interface SchemaObjectGroupItem {
  key: string
  label: string
  sub?: string
}

/** Collapsible group for flat lists of objects (functions, indexes, etc.). */
export function SchemaObjectGroup({
  storageKey,
  label,
  items,
  icon,
  headerPaddingLeft,
  itemPaddingLeft,
}: {
  storageKey: string
  label: string
  items: SchemaObjectGroupItem[]
  icon: ReactNode
  headerPaddingLeft: number
  itemPaddingLeft: number
}) {
  const [expanded, setExpanded] = useGroupExpanded(storageKey, false)
  const filterText = useSchemaStore((s) => s.filterText)
  if (items.length === 0) return null
  // Auto-expand when actively searching, so matches are visible without manual clicks.
  const showExpanded = expanded || Boolean(filterText)
  return (
    <Box>
      <GroupHeader
        label={label}
        count={items.length}
        expanded={showExpanded}
        onToggle={() => setExpanded(!expanded)}
        icon={icon}
        paddingLeft={headerPaddingLeft}
      />
      {showExpanded && items.map((it) => (
        <Box
          key={it.key}
          className="flex items-center gap-1.5 text-xs py-0.5 min-w-0 text-text-secondary"
          style={{ paddingLeft: itemPaddingLeft }}
          title={it.sub ? `${it.label} ${it.sub}` : it.label}
        >
          <Box as="span" className="truncate min-w-0">
            <HighlightedText text={it.label} query={filterText} />
          </Box>
          {it.sub && (
            <Box as="span" className="opacity-50 truncate text-3xs shrink min-w-0 italic">
              {it.sub}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}
