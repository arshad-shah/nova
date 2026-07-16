import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronRight, X } from 'lucide-react'
import { cn } from '../utils/cn'
import { Button, IconButton } from '../forms/Button'
import { SeverityIcon } from './SeverityIcon'
import { SEVERITY_SURFACE, SEVERITY_TONE } from './severity'

/**
 * Alert: a message about the content it sits in, or about the app.
 *
 * This absorbed `Banner`. The two were the same component with different
 * padding: Alert was a bordered box with a title and no action, Banner was a
 * full-width strip with an action and no title, and they had already drifted on
 * what `info` meant (Alert tinted its text with the accent — purple — while its
 * border used --color-info; Banner declined to tint info at all). Banner had
 * zero usages in the app while `AutoCompactBanner` hand-rolled a worse copy of
 * it, which is the clearest sign it wasn't earning a file.
 *
 * `type` is the difference that remains, and it's the only one that mattered:
 * - `default` — bordered, lightly washed. It belongs to nearby content.
 * - `filled` — solid, with a rail. The banner case: it spans a region and is
 *   about the whole app, so it has to hold its own against everything below it.
 *
 * `Toast` stays separate. It floats, it's transient, it expires on a timer —
 * different job, different look. What it shares is `./severity`, so the family
 * can't disagree about what a warning is again.
 */
const alertVariants = cva('relative flex w-full items-start gap-2.5 border', {
  variants: {
    variant: {
      neutral: SEVERITY_TONE.neutral,
      info: SEVERITY_TONE.info,
      success: SEVERITY_TONE.success,
      warning: SEVERITY_TONE.warning,
      error: SEVERITY_TONE.error,
      // Banner's own, kept: a product announcement is the one message that's
      // about Verql rather than the user's data, so it wears the brand accent.
      update: SEVERITY_TONE.update,
    },
    /**
     * How much of its colour the alert wears. Three weights, which is the split
     * MUI arrived at too (`standard` / `filled` / `outlined`) — worth matching,
     * because it's the vocabulary most people already have.
     */
    type: {
      default: cn(SEVERITY_SURFACE.subtle, 'rounded-lg px-3.5 py-3 shadow-[var(--shadow-card)]'),
      // Tighter and denser than `default`: a banner is a strip across a region,
      // not a card in a column, so it doesn't want a card's padding.
      filled: cn(SEVERITY_SURFACE.solid, 'rounded-lg border-l-4 border-l-[var(--fb-vc)] px-3 py-2'),
      // The quietest: the tone lives in the border only, no wash. Still an
      // opaque surface rather than `transparent` — MUI's outlined is see-through,
      // but these land over grids and editors, and a transparent fill hands the
      // decision about whether the text is readable to whatever happens to be
      // behind it. Outlined means untinted, not unpainted.
      outlined: cn(
        'rounded-lg border-[color-mix(in_srgb,var(--fb-vc)_44%,var(--color-border-default))]',
        'bg-bg-elevated px-3.5 py-3'
      ),
    },
  },
  defaultVariants: { variant: 'neutral', type: 'default' },
})

export type AlertVariant = NonNullable<VariantProps<typeof alertVariants>['variant']>
export type AlertType = NonNullable<VariantProps<typeof alertVariants>['type']>

export interface AlertAction {
  label: string
  onClick: () => void
}

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title' | 'type'>,
    VariantProps<typeof alertVariants> {
  /** The headline. Optional — most alerts are one line, and then the body takes
   *  the headline's weight rather than being a muted afterthought under nothing. */
  title?: string
  /** Replace the severity mark. `null` removes it. */
  icon?: React.ReactNode
  /**
   * One action, rendered with a chevron — "View details ›".
   *
   * A node is still accepted for the cases that genuinely need two buttons
   * (Compact now / Skip, Run / Decline), but the `{label, onClick}` form is
   * preferred: it takes the tone colouring automatically and can't drift.
   */
  action?: AlertAction | React.ReactNode
  onClose?: () => void
  closeLabel?: string
}

function isAction(a: unknown): a is AlertAction {
  return typeof a === 'object' && a !== null && 'label' in a && 'onClick' in a
}

export function Alert({
  className,
  variant = 'neutral',
  type,
  title,
  icon,
  action,
  onClose,
  closeLabel = 'Close alert',
  children,
  ...props
}: AlertProps) {
  const v = variant ?? 'neutral'

  return (
    <div
      // `alert` interrupts a screen reader; `status` waits its turn. An error or
      // a warning has earned the interruption, an announcement hasn't.
      role={v === 'error' || v === 'warning' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant, type }), className)}
      {...props}
    >
      {icon === undefined ? (
        <SeverityIcon severity={v} className="mt-px" />
      ) : (
        icon !== null && <span className="mt-px shrink-0 text-[var(--fb-vc)]">{icon}</span>
      )}

      <div className="min-w-0 flex-1">
        {title && (
          <p className="text-[length:var(--field-fs-sm)] font-semibold leading-snug text-text-primary">
            {title}
          </p>
        )}
        {children && (
          // A plain div, NOT a <Text>. The body is a slot: the query-error view
          // puts a whole subtree in here — paragraphs, a hint box, a badge, a
          // disclosure button, a code block — and nesting those inside a <Text>
          // (a span) put block elements and buttons inside a span.
          //
          // Untitled is the common case (4 of the app's 7 alerts), so an
          // untitled body carries the line and stays primary. Only a body
          // *under* a title is a supporting line, and gets muted.
          <div
            className={cn(
              'text-[length:var(--field-fs-sm)] leading-relaxed',
              // `secondary`, not `muted`. An Alert is something you're meant to
              // read, and muted is the app's dimmest text — it's for metadata
              // you skip. A supporting line should be quieter than its title,
              // not harder to read than the surface it sits on.
              title ? 'mt-1 text-text-secondary' : 'text-text-primary'
            )}
          >
            {children}
          </div>
        )}
      </div>

      {isAction(action) ? (
        <Button
          variant="bare"
          size="none"
          onClick={action.onClick}
          className="mt-px flex shrink-0 items-center gap-0.5 px-1 text-[length:var(--field-fs-sm)] font-semibold text-[var(--fb-vc)] hover:brightness-125"
        >
          {action.label}
          <ChevronRight size={13} />
        </Button>
      ) : (
        action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>
      )}

      {onClose && (
        <IconButton
          label={closeLabel}
          variant="ghost"
          size="xs"
          onClick={onClose}
          className="-mt-0.5 -mr-1 shrink-0 text-text-muted hover:text-text-primary"
        >
          <X size={14} />
        </IconButton>
      )}
    </div>
  )
}
