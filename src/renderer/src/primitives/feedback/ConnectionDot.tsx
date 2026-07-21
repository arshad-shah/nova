import type { CSSProperties } from 'react'
import { StatusDot } from './StatusDot'

/**
 * ConnectionDot: the small color swatch used to represent a database
 * connection — the user's chosen `connection.color`, or a fallback that
 * depends on `state`.
 *
 * This composes `StatusDot` for the base shape (size, `shrink-0`, rounding,
 * the `label`→`role="status"` accessibility behaviour) but does NOT use its
 * `tone`/`glow` variants: those are keyed to a fixed palette of *named*
 * meanings (success/warning/…), while a connection's colour is a runtime
 * value the user picked, so it has to flow through an inline `style`
 * (background colour + the halo/ring, both computed from that same colour)
 * rather than a CVA variant. That's the documented exception to
 * "static colours use semantic tokens" — this one isn't static.
 *
 * `state` is deliberately NOT a single unified "connected-ness" concept —
 * it's context-dependent by design (see `docs/ui-modularity-followups.md`
 * item 4):
 *   - `neutral` — used where the surrounding UI already conveys connection
 *     state some other way (e.g. the connection picker's own "connected"
 *     list). Falls back to the accent color; no dimming, no ring/glow.
 *   - `connected` — falls back to success; gets a colour-matched halo.
 *   - `disconnected` — falls back to the disabled text color; rendered at
 *     45% opacity with a faint inset ring instead of a glow.
 *
 * Passing an explicit `color` always wins over the state's fallback — e.g. a
 * disconnected row that wants to show a flat, uncolored dot regardless of
 * the connection's own `color` can pass `state="neutral"` with an explicit
 * muted `color` instead of relying on any fallback at all.
 */
export type ConnectionDotState = 'connected' | 'disconnected' | 'neutral'
export type ConnectionDotSize = 'sm' | 'md'

export interface ConnectionDotProps {
  /** The connection profile's user-chosen colour, if any. */
  color?: string
  /** `sm` = 8px, `md` = 10px. */
  size?: ConnectionDotSize
  /** Drives the fallback colour when `color` is absent, plus the optional glow/dimming. */
  state?: ConnectionDotState
  className?: string
  /** Accessible name — see `StatusDot`'s `label` for when to use this. */
  label?: string
}

function fallbackColor(state: ConnectionDotState): string {
  switch (state) {
    case 'connected':
      return 'var(--color-success)'
    case 'disconnected':
      return 'var(--color-text-disabled)'
    case 'neutral':
    default:
      return 'var(--color-accent)'
  }
}

export function ConnectionDot({
  color,
  size = 'sm',
  state = 'neutral',
  className,
  label,
}: ConnectionDotProps) {
  const resolved = color ?? fallbackColor(state)

  let style: CSSProperties = { backgroundColor: resolved }
  if (state === 'connected') {
    style = {
      ...style,
      boxShadow: `0 0 0 1.5px color-mix(in srgb, ${resolved} 35%, transparent), 0 0 6px color-mix(in srgb, ${resolved} 50%, transparent)`,
    }
  } else if (state === 'disconnected') {
    style = {
      ...style,
      opacity: 0.45,
      boxShadow: 'inset 0 0 0 1px var(--color-border-strong)',
    }
  }

  return <StatusDot size={size} tone="muted" className={className} style={style} label={label} />
}
