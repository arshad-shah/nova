import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/primitives'

/** Collapsible header row shared by every schema sub-category group. */
export function GroupHeader({
  label,
  count,
  expanded,
  onToggle,
  icon,
  paddingLeft
}: {
  label: string
  count: number
  expanded: boolean
  onToggle: () => void
  icon: ReactNode
  paddingLeft: number
}) {
  return (
    <Button
      variant="bare"
      size="none"
      type="button"
      onClick={onToggle}
      className="group w-full flex items-center gap-1.5 py-0.5 text-left transition-colors duration-[var(--transition-fast)] hover:bg-hover"
      style={{ paddingLeft, paddingRight: 4 }}
    >
      {expanded
        ? <ChevronDown size={10} strokeWidth={1.8} className="text-text-muted shrink-0" />
        : <ChevronRight size={10} strokeWidth={1.8} className="text-text-muted shrink-0" />}
      {icon}
      <span
        className="uppercase tracking-wider opacity-60 text-[10px] font-medium flex-1 truncate text-text-secondary"
      >
        {label}
      </span>
      <span
        className="text-[10px] opacity-50 tabular-nums text-text-muted"
      >
        {count}
      </span>
    </Button>
  )
}
