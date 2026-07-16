import React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../utils/cn'
import { SEVERITY_ICON, type Severity } from './severity'

export interface SeverityIconProps {
  severity: Severity
  /** Spin instead — for work still in flight. */
  loading?: boolean
  size?: number
  className?: string
}

/**
 * The feedback family's mark: a filled shape with its glyph knocked out.
 *
 * `fill` paints the shape in the tone and `stroke` cuts the glyph back out of
 * it, which is how the kit draws these and why they read at 16px where lucide's
 * default hairline outline turns to mush. Both colours come from the custom
 * properties `SEVERITY_TONE` sets on the container, so this needs no props for
 * them and can't disagree with the surface it sits on.
 */
export function SeverityIcon({ severity, loading = false, size = 16, className }: SeverityIconProps) {
  if (loading) {
    return (
      <Loader2
        size={size}
        aria-hidden
        className={cn('shrink-0 animate-spin text-[var(--fb-vc)]', className)}
      />
    )
  }

  const Icon = SEVERITY_ICON[severity]
  return (
    <Icon
      size={size}
      aria-hidden
      fill="var(--fb-vc)"
      stroke="var(--fb-glyph)"
      strokeWidth={2}
      className={cn('shrink-0', className)}
    />
  )
}
