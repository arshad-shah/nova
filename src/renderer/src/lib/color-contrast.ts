/**
 * Readable labels over a *decorative colour fill*.
 *
 * When text sits directly on an entity's own colour — an ER node header painted
 * its table hue, an identity tile — the label cannot be a theme text token: the
 * fill is theme-independent, so a token that flips with the app theme (e.g.
 * `text-text-inverse`, which is white on the light theme but near-black on the
 * dark one) would put a dark label on a saturated hue on the dark theme and
 * regress contrast. The legible ink depends on the FILL, not the app theme.
 *
 * `onFillInk` picks between the two fixed inks in the token layer
 * (`--color-on-fill-light` — a dark ink for a pale fill; `--color-on-fill-dark`
 * — a light ink for a saturated/dark one) using the WCAG relative luminance of
 * the fill. It returns a `var(--color-on-fill-*)` reference, never a raw colour,
 * so the inks stay themable and no palette literal leaks back into a component.
 */

/** The canonical WCAG black-vs-white crossover: above this luminance a dark ink
 *  out-contrasts a light one on the fill. */
const LIGHT_FILL_THRESHOLD = 0.179

/**
 * The token reference for a readable label/marker on `fill` (any `#rgb` /
 * `#rrggbb` colour). Unparseable input falls back to the light ink, which is
 * the safe default for the saturated hues these fills usually are.
 */
export function onFillInk(fill: string): string {
  const lum = relativeLuminance(fill)
  return lum !== null && lum > LIGHT_FILL_THRESHOLD
    ? 'var(--color-on-fill-light)'
    : 'var(--color-on-fill-dark)'
}

/** WCAG 2.x relative luminance of a `#rgb` / `#rrggbb` colour, or `null` when
 *  the string is not a hex colour. */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  let body = match[1]
  if (body.length === 3) body = body.replace(/./g, (c) => c + c)
  const value = parseInt(body, 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}
