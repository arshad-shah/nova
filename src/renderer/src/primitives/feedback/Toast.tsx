import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '../utils/cn'
import { Button, IconButton } from '../forms/Button'
import { SeverityIcon } from './SeverityIcon'
import { SEVERITY_TONE } from './severity'

/**
 * Toast: brief, non-blocking feedback about something that just happened.
 *
 * Deliberately NOT tinted like `Alert`, and that's the design idea rather than
 * an omission. An Alert sits in content and has to be found, so it wears its
 * colour. A toast slides in over the app — it already has your attention, and
 * five stacked in five different colours is a fruit salad. So the surface stays
 * neutral and only the mark carries the severity, which also lets a stack read
 * as one object instead of five competing ones.
 *
 * It shares `./severity` with Alert, so a warning is the same warning in both;
 * they differ only in how much of it they wear.
 *
 * Timing lives here, not in the container: a toast that pauses when you hover
 * it has to know about its own hover, and splitting "when do I expire" from
 * "am I being read" across two components is exactly how this drifted into two
 * implementations the first time.
 */

const toastVariants = cva(
  cn(
    // `group` so the track and the close button can react to hover without a
    // bespoke CSS selector.
    'toast group pointer-events-auto relative flex items-start gap-2.5 overflow-hidden',
    'rounded-xl border border-border-default px-3.5 py-3',
    // One neutral surface for every severity — see the note above. Opaque, not
    // translucent: a toast lands over results, a grid, an editor, and a
    // see-through surface lets whatever is underneath decide whether the text
    // on top is readable. The shadow is what makes it float, not the blur.
    'bg-bg-elevated shadow-[var(--shadow-dropdown)]',
    'transition-transform duration-[var(--transition-fast)] hover:-translate-y-px',
    'motion-reduce:transition-none motion-reduce:hover:translate-y-0'
  ),
  {
    variants: {
      /**
       * What it means. Toast has no weight axis — it's always the same neutral
       * card, and only the mark is coloured.
       *
       * `--fb-vc` is the tone's colour, and everything that carries it — the
       * mark and the track — reads from it. One declaration per tone.
       */
      tone: {
        neutral: SEVERITY_TONE.neutral,
        success: SEVERITY_TONE.success,
        info: SEVERITY_TONE.info,
        warning: SEVERITY_TONE.warning,
        error: SEVERITY_TONE.error,
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
)

export type ToastTone = NonNullable<VariantProps<typeof toastVariants>['tone']>

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
    tone,
    duration,
    onDismiss,
    action,
    loading = false,
    dismissLabel = 'Dismiss',
    className,
  },
  ref
) {
  const v = tone ?? 'neutral'

  // Auto-dismiss, pausing while the pointer is over the toast. `remaining` is
  // what's left of `duration` — so a hover doesn't restart the clock, it holds
  // it, and the toast resumes where it was.
  const remaining = useRef(duration ?? 0)
  const startedAt = useRef(0)
  const timer = useRef<number | null>(null)
  const paused = useRef(false)
  // Mirrored into state purely so the track can hold with the clock. Without
  // it the CSS animation keeps draining while the timer is paused, and the bar
  // tells you the toast is about to go when it isn't.
  const [isPaused, setIsPaused] = useState(false)

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

  const pause = useCallback(() => {
    if (duration == null || paused.current) return
    paused.current = true
    setIsPaused(true)
    clear()
    remaining.current -= Date.now() - startedAt.current
  }, [duration, clear])

  const resume = useCallback(() => {
    if (duration == null || !paused.current) return
    paused.current = false
    setIsPaused(false)
    arm()
  }, [duration, arm])

  /**
   * Hold the clock while the window is in the background, which is MUI's
   * default for Snackbar and an obviously right one we didn't have: a toast
   * that expires while you're in another app was never shown to anyone. It
   * resumes with whatever time was left when you come back.
   */
  useEffect(() => {
    if (duration == null) return
    window.addEventListener('blur', pause)
    window.addEventListener('focus', resume)
    return () => {
      window.removeEventListener('blur', pause)
      window.removeEventListener('focus', resume)
    }
  }, [duration, pause, resume])

  return (
    <div
      ref={ref}
      // An error or a warning interrupts; everything else waits its turn.
      role={v === 'error' || v === 'warning' ? 'alert' : 'status'}
      className={cn(toastVariants({ tone }), className)}
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      <SeverityIcon severity={v} loading={loading} className="mt-px" />

      {/* Title and description are the SAME colour, and identical to Alert's —
          the same two roles get the same two values in both. The hierarchy is
          weight (600 vs 400) and size (fs-md vs fs-sm), which is enough on its
          own; dimming the description only halved its contrast to buy a
          separation those two already gave for free. */}
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--field-fs-md)] font-semibold leading-snug text-text-primary">
          {title}
        </p>
        {description && (
          <p className="mt-1 text-[length:var(--field-fs-sm)] leading-relaxed whitespace-pre-wrap break-words text-text-primary">
            {description}
          </p>
        )}
      </div>

      {action && (
        <Button
          variant="bare"
          size="none"
          onClick={action.onClick}
          // A chip, not a coloured link. On a neutral surface the action is the
          // only thing competing with the mark, so it should read as a control
          // rather than borrow the severity's colour.
          className={cn(
            'shrink-0 self-center rounded-md border border-border-default px-2 py-1',
            'text-[length:var(--field-fs-xs)] font-semibold text-text-primary',
            'transition-colors hover:bg-hover motion-reduce:transition-none'
          )}
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
          // Present but quiet until you go for it — the toast expires on its
          // own, so the X shouldn't compete with the message.
          className={cn(
            '-mt-0.5 -mr-1 shrink-0 text-text-muted opacity-0 transition-opacity',
            'group-hover:opacity-100 focus-visible:opacity-100 hover:text-text-primary',
            'motion-reduce:transition-none'
          )}
        >
          <X size={14} />
        </IconButton>
      )}

      {duration != null && (
        <span
          aria-hidden
          className={cn(
            'toast-progress absolute inset-x-0 bottom-0 h-[2px] origin-left bg-[var(--fb-vc)] opacity-70',
            isPaused && '[animation-play-state:paused]'
          )}
          style={{ animationDuration: `${duration}ms` }}
        />
      )}
    </div>
  )
})
