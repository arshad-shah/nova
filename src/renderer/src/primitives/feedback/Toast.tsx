import React, { forwardRef, useCallback, useEffect, useRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react'
import { cn } from '../utils/cn'
import { Button, IconButton } from '../forms/Button'

/**
 * Toast: brief, non-blocking feedback about something that just happened.
 *
 * This is the whole toast — the surface, the icon, the text, the action, the
 * dismiss and the auto-dismiss track. It used to be half of one:
 * `ToastContainer` carried a second, complete copy (`ToastView`) with its own
 * CSS block, and the primitive was imported by nothing but its own story. The
 * two had already drifted — `warning` existed here but was unreachable from the
 * store, and `info` resolved to a different colour in each. The container now
 * renders this, and owns only what a container should: position, stacking and
 * the enter/leave motion.
 *
 * Timing lives here, not in the container: a toast that pauses when you hover
 * it has to know about its own hover, and splitting "when do I expire" from
 * "am I being read" across two components is how they drifted the first time.
 */

const toastVariants = cva(
  cn(
    // `group` so the track can pause on hover without a bespoke CSS selector.
    'toast group pointer-events-auto relative flex items-start gap-2.5 overflow-hidden',
    'rounded-[var(--field-r-lg)] border shadow-[var(--shadow-elevated)]',
    // Density-aware, and even on both sides now there's no rail to clear.
    'py-[calc(var(--field-gap)+4px)] px-[calc(var(--field-px)+2px)]',
    // Tinted by the variant, not neutral: the border and the fill are washes of
    // `--toast-vc` over the elevated surface, so the whole card carries the
    // meaning rather than just the rail. Translucent + blurred so it reads as
    // floating above the app rather than punched into it.
    'border-[color-mix(in_srgb,var(--toast-vc)_26%,var(--color-border-default))]',
    'bg-[color-mix(in_srgb,var(--toast-vc)_7%,color-mix(in_srgb,var(--color-bg-elevated)_88%,transparent))]',
    'backdrop-blur-[10px]',
    'transition-shadow duration-[var(--transition-fast)] hover:shadow-[var(--shadow-dropdown)]',
    'motion-reduce:transition-none'
  ),
  {
    variants: {
      /**
       * `--toast-vc` is the variant's colour, and everything that carries it —
       * the border, the fill, the icon, the action, the track — reads from it.
       * One declaration per variant instead of five.
       */
      variant: {
        neutral: '[--toast-vc:var(--color-text-tertiary)] [--toast-glyph:#ffffff]',
        success: '[--toast-vc:var(--color-success)] [--toast-glyph:#ffffff]',
        info: '[--toast-vc:var(--color-info)] [--toast-glyph:#ffffff]',
        // The one light fill: white on amber is ~1.7:1 and unreadable, so the
        // glyph is knocked out in the page ground instead. Same reasoning as
        // the action colour — the fill decides the glyph, not the palette.
        warning: '[--toast-vc:var(--color-warning)] [--toast-glyph:var(--color-bg-primary)]',
        error: '[--toast-vc:var(--color-error)] [--toast-glyph:#ffffff]',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
)

/** Solid, not outline: the kit's marks are a filled shape with the glyph
 *  knocked out of it, which reads at 15px where a hairline outline muddies. */
const VARIANT_ICON = {
  neutral: Info,
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
} as const

export type ToastVariant = NonNullable<VariantProps<typeof toastVariants>['variant']>

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastProps extends VariantProps<typeof toastVariants> {
  /** The headline — what happened. */
  title: string
  /** The supporting line. Omit for a one-line toast. */
  description?: string
  /**
   * Auto-dismiss after this many ms, showing a progress track that pauses while
   * hovered. Omit to make the toast persistent — then it stays until dismissed.
   */
  duration?: number
  /** Called when the timer elapses or the close button is pressed. Omit to
   *  render no close button — for a toast the caller dismisses itself. */
  onDismiss?: () => void
  /** One action. More than one and it isn't a toast, it's a dialog. */
  action?: ToastAction
  /** Swap the icon for a spinner — for work still in flight. */
  loading?: boolean
  dismissLabel?: string
  className?: string
}

export const Toast = forwardRef<HTMLDivElement, ToastProps>(function Toast(
  {
    title,
    description,
    variant,
    duration,
    onDismiss,
    action,
    loading = false,
    dismissLabel = 'Dismiss',
    className,
  },
  ref
) {
  const v = variant ?? 'neutral'
  const Icon = loading ? Loader2 : VARIANT_ICON[v]

  // Auto-dismiss, pausing while the pointer is over the toast. `remaining` is
  // what's left of `duration` — so a hover doesn't restart the clock, it holds
  // it, and the toast resumes where it was.
  const remaining = useRef(duration ?? 0)
  const startedAt = useRef(0)
  const timer = useRef<number | null>(null)
  const paused = useRef(false)

  const clear = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const arm = useCallback(() => {
    if (duration == null || !onDismiss) return
    startedAt.current = Date.now()
    timer.current = window.setTimeout(onDismiss, Math.max(0, remaining.current))
  }, [duration, onDismiss])

  useEffect(() => {
    if (duration == null) return
    remaining.current = duration
    paused.current = false
    arm()
    return clear
  }, [duration, arm, clear])

  const handleMouseEnter = () => {
    if (duration == null || paused.current) return
    paused.current = true
    clear()
    remaining.current -= Date.now() - startedAt.current
  }
  const handleMouseLeave = () => {
    if (duration == null || !paused.current) return
    paused.current = false
    arm()
  }

  return (
    <div
      ref={ref}
      // An error or a warning interrupts; everything else waits its turn.
      role={v === 'error' || v === 'warning' ? 'alert' : 'status'}
      className={cn(toastVariants({ variant }), className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {loading ? (
        <Loader2 size={16} aria-hidden className="mt-px shrink-0 animate-spin text-[var(--toast-vc)]" />
      ) : (
        // `fill` paints the shape, `stroke` knocks the glyph out of it — a
        // filled disc with a white tick, rather than lucide's default outline.
        <Icon
          size={16}
          aria-hidden
          fill="var(--toast-vc)"
          stroke="var(--toast-glyph)"
          strokeWidth={2}
          className="mt-px shrink-0"
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--field-fs-md)] font-semibold leading-snug text-text-primary">
          {title}
        </p>
        {description && (
          <p className="mt-1 text-[length:var(--field-fs-sm)] leading-relaxed whitespace-pre-wrap break-words text-text-muted">
            {description}
          </p>
        )}
      </div>

      {action && (
        <Button
          variant="bare"
          size="none"
          onClick={action.onClick}
          // Coloured by the variant so the action reads as part of the message
          // rather than a stray link. `self-center` keeps it on the title line
          // for a one-liner and centred against both lines otherwise.
          className="shrink-0 self-center px-1 text-[length:var(--field-fs-sm)] font-semibold text-[var(--toast-vc)] hover:brightness-125"
        >
          {action.label}
        </Button>
      )}

      {onDismiss && (
        <IconButton
          label={dismissLabel}
          variant="ghost"
          size="xs"
          onClick={onDismiss}
          className="-mt-0.5 -mr-1 shrink-0 text-text-muted hover:text-text-primary"
        >
          <X size={14} />
        </IconButton>
      )}

      {duration != null && (
        <span
          aria-hidden
          className="toast-progress absolute inset-x-0 bottom-0 h-[2px] origin-left bg-[var(--toast-vc)] opacity-85"
          style={{ animationDuration: `${duration}ms` }}
        />
      )}
    </div>
  )
})
