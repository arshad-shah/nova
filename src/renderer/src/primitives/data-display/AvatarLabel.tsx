import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

/**
 * AvatarLabel: an avatar, what it's called, and what it is underneath.
 *
 * The most-repeated avatar shape in the app and the one with no primitive —
 * the connection list and the plugin list each build it by hand. It owns only
 * the layout (the row, the truncation, the trailing slot); the avatar itself
 * and whatever sits in `trailing` are the caller's, so this doesn't become a
 * component that has to know about connections and plugins.
 *
 * Truncation is the whole point of it existing: a connection subtitle is
 * `user@host:port/database` and a plugin's is a version string. Both overflow a
 * narrow sidebar, and both got that wrong in slightly different ways.
 */
const rootVariants = cva('flex min-w-0 items-center', {
  variants: {
    gap: {
      sm: 'gap-1.5',
      md: 'gap-2',
      lg: 'gap-2.5',
    },
  },
  defaultVariants: { gap: 'md' },
})

export interface AvatarLabelProps extends VariantProps<typeof rootVariants> {
  /** The `<Avatar>` itself — passed in rather than built from props, so this
   *  row never has to grow a copy of Avatar's API. */
  avatar: React.ReactNode
  /** The entity's name. */
  title: React.ReactNode
  /** The line underneath — a DSN, a version. Omit for a single-line row. */
  subtitle?: React.ReactNode
  /** Render the subtitle monospaced. Connection DSNs and versions are data,
   *  not prose, and line up better for scanning. */
  mono?: boolean
  /** Pinned to the right — a status chip, an action. */
  trailing?: React.ReactNode
  className?: string
}

export function AvatarLabel({
  avatar,
  title,
  subtitle,
  mono = false,
  trailing,
  gap,
  className,
}: AvatarLabelProps) {
  return (
    <div className={cn(rootVariants({ gap }), className)}>
      {avatar}
      {/* min-w-0 is what actually lets the text truncate: without it this flex
          child takes its content's width and pushes `trailing` off the row. */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-text-primary">{title}</div>
        {subtitle && (
          <div
            className={cn(
              'truncate text-[10px] text-text-tertiary',
              mono && 'font-mono'
            )}
          >
            {subtitle}
          </div>
        )}
      </div>
      {trailing && <div className="ml-auto flex shrink-0 items-center gap-1">{trailing}</div>}
    </div>
  )
}
