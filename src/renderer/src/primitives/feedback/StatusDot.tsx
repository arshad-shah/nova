import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

/**
 * StatusDot: a small inline dot that carries a status meaning — connected,
 * degraded, unread, disabled, … — inline with text or a label, not anchored
 * to the corner of another element.
 *
 * This is NOT `BadgeIndicator`: that primitive is a *corner-anchor wrapper*
 * that positions a badge on top of children it wraps (an avatar, an icon).
 * `StatusDot` renders in place, wherever you put it — a status bar segment, a
 * list row, a tab title — which is what every hand-rolled
 * `<span className="h-1.5 w-1.5 rounded-full bg-…" />` in the app was really
 * reaching for.
 *
 * `tone` is what it MEANS (see `Badge`/`Alert` for the same axis); `size`
 * is scale only. `pulse` and `glow` are independent decorations: `pulse`
 * says "this is live/changing right now", `glow` says "this is the one that
 * matters" (a halo, not an animation) — either, both, or neither.
 *
 * Decorative by default (`aria-hidden`): a dot rarely carries information a
 * screen reader user doesn't already get from the text next to it. Pass
 * `label` when the dot IS the information (no adjacent text) and it becomes
 * an `role="status"` element with that accessible name instead.
 */
const statusDotVariants = cva('inline-block shrink-0 rounded-full', {
  variants: {
    size: {
      xs: 'h-1.5 w-1.5',
      sm: 'h-2 w-2',
      md: 'h-2.5 w-2.5',
    },
    tone: {
      success: '[--sd-c:var(--color-success)] bg-success',
      warning: '[--sd-c:var(--color-warning)] bg-warning',
      error: '[--sd-c:var(--color-error)] bg-error',
      muted: '[--sd-c:var(--color-text-tertiary)] bg-text-muted',
      accent: '[--sd-c:var(--color-accent)] bg-accent',
      info: '[--sd-c:var(--color-info)] bg-info',
    },
    pulse: {
      true: 'animate-pulse',
      false: '',
    },
    glow: {
      // A halo mixed from the tone's own colour, same `color-mix` idiom the
      // rest of the feedback family uses (see `severity.ts`) rather than a
      // hardcoded rgba glow that would disagree with the tone.
      true: 'shadow-[0_0_0_3px_color-mix(in_srgb,var(--sd-c)_35%,transparent)]',
      false: '',
    },
  },
  defaultVariants: {
    size: 'sm',
    tone: 'muted',
    pulse: false,
    glow: false,
  },
})

export type StatusDotSize = NonNullable<VariantProps<typeof statusDotVariants>['size']>
export type StatusDotTone = NonNullable<VariantProps<typeof statusDotVariants>['tone']>

export interface StatusDotProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'aria-hidden' | 'aria-label' | 'role'>,
    VariantProps<typeof statusDotVariants> {
  /**
   * The accessible name. When provided, the dot exposes itself as
   * `role="status"` with this label instead of being hidden from assistive
   * tech — use it only when the dot is the sole carrier of the information
   * (no adjacent text already says "connected"/"unread"/etc).
   */
  label?: string
}

export function StatusDot({
  className,
  size,
  tone,
  pulse,
  glow,
  label,
  ...props
}: StatusDotProps) {
  return (
    <span
      className={cn(statusDotVariants({ size, tone, pulse, glow }), className)}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...props}
    />
  )
}
