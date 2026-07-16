import { AlertTriangle, CheckCircle2, Info, MinusCircle, Sparkles, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * The shared vocabulary for the feedback family — Toast, Alert and Banner.
 *
 * The three say the same five things in three places, and they had already
 * drifted apart saying them: Alert tinted `info` with the accent (purple) while
 * its own border used `--color-info` (cyan), and Banner declined to tint `info`
 * at all. Same word, three colours. One table fixes that by construction.
 *
 * Each component still declares its own CVA variants — they don't all support
 * the same set (`update` is a Banner idea; nothing else announces a release) —
 * but they all resolve the colour and the icon from here.
 */
export type Severity = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'update'

/**
 * Sets two custom properties per tone:
 * - `--fb-vc`: the tone's colour. Everything that carries meaning — border,
 *   fill, icon, action, track — reads from this, so a tone is one declaration
 *   rather than five.
 * - `--fb-glyph`: what's knocked out of a filled icon.
 *
 * Warning is the only light fill, and it's why `--fb-glyph` exists rather than
 * a hardcoded white: white on amber is ~1.7:1. The glyph is the page ground
 * instead, which self-inverts with the theme — the same rule the action colour
 * follows.
 */
export const SEVERITY_TONE = {
  neutral: '[--fb-vc:var(--color-text-tertiary)] [--fb-glyph:#ffffff]',
  info: '[--fb-vc:var(--color-info)] [--fb-glyph:#ffffff]',
  success: '[--fb-vc:var(--color-success)] [--fb-glyph:#ffffff]',
  warning: '[--fb-vc:var(--color-warning)] [--fb-glyph:var(--color-bg-primary)]',
  error: '[--fb-vc:var(--color-error)] [--fb-glyph:#ffffff]',
  // The brand's own hue — a product announcement is the one message that is
  // about Verql rather than about the user's data.
  update: '[--fb-vc:var(--color-accent)] [--fb-glyph:#ffffff]',
} as const satisfies Record<Severity, string>

/** Solid marks: a filled shape with the glyph knocked out, which reads at 16px
 *  where a hairline outline muddies. Drawn via `fill` + `stroke` — see
 *  `SeverityIcon`. */
export const SEVERITY_ICON = {
  neutral: MinusCircle,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  update: Sparkles,
} as const satisfies Record<Severity, LucideIcon>

/**
 * The surface every member of the family sits on: a wash of the tone over the
 * elevated surface, with a border tinted the same way. `subtle` is for
 * something sitting in content; `solid` is for something interrupting it.
 *
 * Both mixes are against `--color-bg-elevated`, which is OPAQUE, and neither
 * uses an alpha fill. That's deliberate: these land over query results, over a
 * grid, over an editor — a translucent surface would let whatever is behind
 * decide whether the text on top is readable, and nothing in here gets to be
 * conditional on that. The tone is mixed *into* the surface, not laid over it.
 */
export const SEVERITY_SURFACE = {
  subtle:
    'border-[color-mix(in_srgb,var(--fb-vc)_34%,var(--color-border-default))] bg-[color-mix(in_srgb,var(--fb-vc)_11%,var(--color-bg-elevated))]',
  solid:
    'border-[color-mix(in_srgb,var(--fb-vc)_48%,var(--color-border-default))] bg-[color-mix(in_srgb,var(--fb-vc)_18%,var(--color-bg-elevated))]',
} as const
