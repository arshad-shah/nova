// Single source of truth for reading theme colors as *strings*, for
// canvas/SVG contexts (swift-chart, @xyflow/react) that cannot consume a
// Tailwind className. Reads live CSS custom properties, so callers that
// re-read on theme change automatically re-theme. This is the sanctioned
// escape hatch from "use a token class" — it is on the guardrail allowlist.

/** Read a single CSS custom property off the document root. */
export function themeColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Resolve a map of `{ key: '--css-var' }` to `{ key: 'resolved color' }`. */
export function readThemeColors<T extends Record<string, string>>(map: T): { [K in keyof T]: string } {
  const out = {} as { [K in keyof T]: string }
  for (const key in map) out[key] = themeColor(map[key])
  return out
}

/** Number of derived decorative tokens declared in tokens.css. */
export const DECORATIVE_COUNT = 8

/** Resolve `--color-decorative-N` (1-based, wraps with modulo). */
export function decorativeColor(index: number): string {
  const n = ((index - 1) % DECORATIVE_COUNT + DECORATIVE_COUNT) % DECORATIVE_COUNT + 1
  return themeColor(`--color-decorative-${n}`)
}
