/**
 * Theme bridge. The ERD painter draws onto a canvas, which cannot resolve
 * `var(--…)`, so the palette is read *once* out of the live semantic token
 * layer and handed to the painter as concrete values. This is the whole reason
 * the old renderer duplicated token values and shipped a `readVar` workaround —
 * here every colour and every type step comes straight from the tokens the rest
 * of the app already themes, so the diagram follows `data-theme` into dark,
 * light, midnight, and any plugin theme with zero hardcoded colours.
 *
 * `watchTheme` fires the callback whenever `data-theme` flips, so `ErdView` can
 * repaint with the freshly resolved palette.
 */

export interface ErdTheme {
  surface: string
  grid: string
  card: string
  cardHeader: string
  cardBorder: string
  cardBorderStrong: string
  divider: string
  title: string
  eyebrow: string
  columnName: string
  columnNameMuted: string
  columnType: string
  edge: string
  edgeMuted: string
  edgeActive: string
  pk: string
  fk: string
  uq: string
  select: string
  fontTitle: string
  fontEyebrow: string
  fontRow: string
  fontType: string
  fontLegend: string
}

/** Fallback font stack, only used when the DOM cannot be measured (headless). */
const FALLBACK_STACK = 'system-ui, sans-serif'

/**
 * Read a semantic colour token as a concrete value. Chains to a second token
 * when the first is absent so there is never a hardcoded colour to drift — the
 * bundled themes always define these, so the chain is belt-and-braces.
 */
function readColor(cs: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = cs.getPropertyValue(name).trim()
  return v || fallback
}

/** Resolve a type-ramp step to a pixel size via an offscreen probe. */
function readSize(host: HTMLElement, cssVar: string, fallbackPx: number): number {
  const probe = document.createElement('div')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.fontSize = `var(${cssVar})`
  host.appendChild(probe)
  const px = parseFloat(getComputedStyle(probe).fontSize)
  host.removeChild(probe)
  return Number.isFinite(px) && px > 0 ? px : fallbackPx
}

/**
 * Snapshot the current theme's palette + type ramp off `el` (the element that
 * carries `data-theme`, `<html>` by default). Colours resolve through the
 * semantic token layer; sizes resolve through the named type ramp.
 */
export function readErdTheme(el: HTMLElement = document.documentElement): ErdTheme {
  const cs = getComputedStyle(el)
  const family = cs.fontFamily?.trim() || FALLBACK_STACK

  const surface = readColor(cs, '--color-bg-inset', readColor(cs, '--color-bg-primary', ''))
  const card = readColor(cs, '--color-bg-secondary', surface)
  const cardHeader = readColor(cs, '--color-bg-tertiary', card)
  const border = readColor(cs, '--color-border-default', '')
  const borderSubtle = readColor(cs, '--color-border-subtle', border)
  const borderStrong = readColor(cs, '--color-border-strong', border)
  const textPrimary = readColor(cs, '--color-text-primary', '')
  const textSecondary = readColor(cs, '--color-text-secondary', textPrimary)
  const textTertiary = readColor(cs, '--color-text-tertiary', textSecondary)
  const keyPk = readColor(cs, '--color-key-pk', textPrimary)
  const keyFk = readColor(cs, '--color-key-fk', textSecondary)
  const accent = readColor(cs, '--color-accent', keyPk)
  const dataAccent = readColor(cs, '--color-data-accent', keyFk)

  const szEyebrow = readSize(el, '--text-3xs', 10)
  const szType = readSize(el, '--text-2xs', 11)
  const szRow = readSize(el, '--text-xs', 12)
  const szTitle = readSize(el, '--text-sm', 14)

  return {
    surface,
    grid: borderSubtle,
    card,
    cardHeader,
    cardBorder: border,
    cardBorderStrong: borderStrong,
    divider: borderSubtle,
    title: textPrimary,
    eyebrow: textTertiary,
    columnName: textPrimary,
    columnNameMuted: textSecondary,
    columnType: textTertiary,
    edge: borderStrong,
    edgeMuted: borderSubtle,
    edgeActive: dataAccent,
    pk: keyPk,
    fk: keyFk,
    uq: dataAccent,
    select: accent,
    fontTitle: `600 ${szTitle}px ${family}`,
    fontEyebrow: `500 ${szEyebrow}px ${family}`,
    fontRow: `450 ${szRow}px ${family}`,
    fontType: `450 ${szType}px ${family}`,
    fontLegend: `500 ${szType}px ${family}`,
  }
}

/**
 * Invoke `onChange` whenever the theme applied to `<html>` changes. Returns an
 * unsubscribe. The renderer re-reads the palette and repaints on the callback.
 */
export function watchTheme(onChange: () => void, el: HTMLElement = document.documentElement): () => void {
  const obs = new MutationObserver(onChange)
  obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
  return () => obs.disconnect()
}
