import type { ReactNode } from 'react'
import { useSchemaStore } from '@/stores/schema'
import { Box } from '@/primitives'
import { useGroupExpanded } from './useGroupExpanded'
import { GroupHeader } from './GroupHeader'

/** Generic collapsible group; children are the rendered rows. Used for Tables/Views. */
export function SchemaGroup({
  storageKey,
  label,
  count,
  icon,
  headerPaddingLeft,
  defaultExpanded = false,
  children
}: {
  storageKey: string
  label: string
  count: number
  icon: ReactNode
  headerPaddingLeft: number
  defaultExpanded?: boolean
  children: ReactNode
}) {
  const [expanded, setExpanded] = useGroupExpanded(storageKey, defaultExpanded)
  const filterText = useSchemaStore((s) => s.filterText)
  if (count === 0) return null
  const showExpanded = expanded || Boolean(filterText)
  return (
    <Box>
      <GroupHeader
        label={label}
        count={count}
        expanded={showExpanded}
        onToggle={() => setExpanded(!expanded)}
        icon={icon}
        paddingLeft={headerPaddingLeft}
      />
      {showExpanded && children}
    </Box>
  )
}
