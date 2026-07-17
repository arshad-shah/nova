import type { DriverPresentation, DriverTone } from '@shared/driver-capabilities'

/**
 * Resolving a driver's visual identity from the `presentation` capability.
 *
 * This replaces three hardcoded driver-id → label/colour maps that lived in the
 * renderer (`ConnectionSegment`, `ConnectionSwitcher`, `ConnectionListItem`).
 * They had already drifted: two omitted snowflake entirely, and mongodb was a
 * different colour in each. That is the failure mode the ownership rule in
 * CLAUDE.md exists to prevent — the renderer was deciding what each driver looks
 * like, so every new driver meant editing the renderer, and a plugin-contributed
 * driver could never look like anything.
 *
 * The driver declares its identity; the renderer decides how to paint a tone.
 */

export interface ResolvedDriverPresentation {
  /** Short chip label. Never empty. */
  abbreviation: string
  tone: DriverTone
}

/**
 * @param presentation the driver's declared capability, if any
 * @param type the driver id, used only for the fallback label
 */
export function resolveDriverPresentation(
  presentation: DriverPresentation | undefined,
  type: string
): ResolvedDriverPresentation {
  return {
    // A driver that declares nothing still gets a sensible chip, which is what
    // lets a plugin-contributed driver render without a renderer change.
    abbreviation: presentation?.abbreviation ?? fallbackAbbreviation(type),
    tone: presentation?.tone ?? 'neutral',
  }
}

function fallbackAbbreviation(type: string): string {
  return type.slice(0, 2).toUpperCase()
}

/**
 * Tone → text colour, for surfaces that tint the label itself (the connection
 * switcher). Kept here so the two text-tinting surfaces cannot drift the way
 * the maps this replaces did.
 */
export const DRIVER_TONE_TEXT: Record<DriverTone, string> = {
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
  neutral: 'text-text-muted',
}

/**
 * Tone → `Badge` tone. Badge's own variant names are not identical to ours
 * ('neutral' is Badge's 'default'), so the mapping is explicit rather than a
 * cast that would silently break if either set changes.
 */
export const DRIVER_TONE_BADGE: Record<
  DriverTone,
  'accent' | 'warning' | 'info' | 'error' | 'default' | 'success'
> = {
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  error: 'error',
  info: 'info',
  neutral: 'default',
}
