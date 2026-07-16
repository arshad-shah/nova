/**
 * The Verql mark — the single source of truth for every brand artifact.
 *
 * Nothing else in the repo should hand-author this geometry. `build-brand.mjs`
 * generates the app assets, the site assets, the platform icons and the
 * Microsoft Store tiles from this file, so they cannot drift apart.
 *
 * Geometry: three shapes — two arms that cross, and a `flap` (the folded
 * underside) whose top edge is the crease. Authored on a 1322×1190 canvas;
 * `VIEWBOX_TRANSFORM` refits that into the square 1024 viewBox every consumer
 * expects. Do not "tidy" the coordinates — they came from the approved artwork.
 */

// ── Geometry (authoring space: 1322 × 1190) ──────────────────────────────────

export const RIGHT_ARM =
  'M860 240H1074C1084 240 1092 245 1096 253C1099 260 1097 267 1093 274L853 690C842 708 824 718 804 720C784 722 764 714 750 700C744 694 738 686 733 678L659 555L833 258C839 247 848 240 860 240Z'

export const LEFT_ARM =
  'M248 240H462C474 240 484 247 491 259L733 680C745 701 761 712 783 717C793 719 802 720 812 719H627C586 719 554 735 538 759C530 771 528 785 532 798L226 276C221 267 221 258 226 250C231 243 238 240 248 240Z'

export const FLAP =
  'M846 684C834 702 816 713 795 717C788 719 780 720 772 720H626C586 720 555 734 539 758C528 775 528 792 536 807L614 940C618 947 625 951 634 951H694C704 951 711 946 716 937L846 684Z'

/** The right arm sits 9px left of the drawn position — approved 2026-07-16 to
 *  close the gap between the arms. Applied to the arm, its glow and its shadow. */
export const RIGHT_ARM_DX = -9

/**
 * Refit the artwork's bounding box (x 221..1087, y 240..951) into the square
 * 1024 viewBox, centred, at the same optical width the previous mark occupied
 * (660/1024) so every existing call site keeps rendering at the same size.
 */
export const VIEWBOX_TRANSFORM = 'translate(13.7 58.2) scale(0.762)'

// ── Colour ───────────────────────────────────────────────────────────────────
// Retuned onto the Ion brand hexes (approved 2026-07-16) so the mark and the
// app's accent tokens are literally the same colour:
//   --raw-vpurple-500 #7A5CFF   --raw-vcyan-500 #00D4FF   --raw-vpurple-600 #5B43F6
// Keep these in step with `primitives/theme/tokens.css`.

export const BRAND = {
  purple: '#7A5CFF',
  cyan: '#00D4FF',
  indigo: '#5B43F6',
  action: '#2563EB',
}

/** Flat fills for the monochrome variants. */
export const MONO = {
  light: { arm: '#F2F4F7', armAlt: '#E5E7EB', flap: '#B9C3D3', edge: '#0B0F16' },
  dark: { arm: '#111827', armAlt: '#252E3F', flap: '#0B0F16', edge: '#F2F4F7' },
}

/**
 * Outer contour for the monochrome + light-tile variants (approved 2026-07-16).
 * Flattened to one colour the three shapes merge into a blob and the mark
 * disappears entirely on a same-tone background; the contour keeps the
 * silhouette. Drawn as a stroke on each shape, so it also separates the parts.
 */
const CONTOUR_WIDTH = 14

const defs = (id) => `
    <linearGradient id="${id}-left" x1="250" y1="245" x2="770" y2="735" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BRAND.purple}"/><stop offset="0.28" stop-color="#6C5BFC"/>
      <stop offset="0.62" stop-color="#3B84F8"/><stop offset="0.88" stop-color="#12BFF8"/>
      <stop offset="1" stop-color="${BRAND.cyan}"/>
    </linearGradient>
    <linearGradient id="${id}-right" x1="895" y1="230" x2="745" y2="730" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BRAND.cyan}"/><stop offset="0.42" stop-color="#0FA8F7"/>
      <stop offset="0.78" stop-color="#1A6BF3"/><stop offset="1" stop-color="${BRAND.action}"/>
    </linearGradient>
    <linearGradient id="${id}-flap" x1="540" y1="720" x2="775" y2="940" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BRAND.indigo}"/><stop offset="0.34" stop-color="#4A42F6"/>
      <stop offset="0.75" stop-color="#3543F2"/><stop offset="1" stop-color="${BRAND.action}"/>
    </linearGradient>
    <radialGradient id="${id}-leftGlow" cx="6%" cy="1%" r="105%">
      <stop offset="0" stop-color="#9B7BFF" stop-opacity="0.38"/>
      <stop offset="0.55" stop-color="#8142FF" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#244AF5" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-rightGlow" cx="92%" cy="4%" r="92%">
      <stop offset="0" stop-color="#2CE0FF" stop-opacity="0.35"/>
      <stop offset="0.55" stop-color="#16C9FF" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#133EF5" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-flapGlow" cx="8%" cy="10%" r="110%">
      <stop offset="0" stop-color="${BRAND.purple}" stop-opacity="0.42"/>
      <stop offset="0.55" stop-color="#5D44FF" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#1C34EC" stop-opacity="0"/>
    </radialGradient>
    <filter id="${id}-soft" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="12"/>
    </filter>
    <filter id="${id}-cast" x="-30%" y="-30%" width="160%" height="180%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <clipPath id="${id}-rightClip"><path d="${RIGHT_ARM}"/></clipPath>
    <clipPath id="${id}-leftClip"><path d="${LEFT_ARM}"/></clipPath>
    <clipPath id="${id}-flapClip"><path d="${FLAP}"/></clipPath>`

/** The full-colour mark: gradients, per-shape glows, drop shadow, cast shadow. */
function colorBody(id, { shadow = true } = {}) {
  const r = (inner) => `<g transform="translate(${RIGHT_ARM_DX} 0)">${inner}</g>`
  return `
    ${shadow ? `<g opacity="0.38" filter="url(#${id}-soft)">
      ${r(`<path d="${RIGHT_ARM}" fill="#1D7FE8"/>`)}
      <path d="${LEFT_ARM}" fill="${BRAND.indigo}"/>
      <path d="${FLAP}" fill="#3543F2"/>
    </g>` : ''}
    ${r(`<path d="${RIGHT_ARM}" fill="url(#${id}-right)"/>
      <rect x="650" y="220" width="460" height="530" fill="url(#${id}-rightGlow)" clip-path="url(#${id}-rightClip)"/>`)}
    <path d="${LEFT_ARM}" fill="url(#${id}-left)"/>
    <rect x="215" y="225" width="620" height="610" fill="url(#${id}-leftGlow)" clip-path="url(#${id}-leftClip)"/>
    <path d="${FLAP}" fill="url(#${id}-flap)"/>
    <g clip-path="url(#${id}-flapClip)">
      <g filter="url(#${id}-cast)" opacity="0.5" transform="translate(0 14)">
        ${r(`<path d="${RIGHT_ARM}" fill="#050A1E"/>`)}
        <path d="${LEFT_ARM}" fill="#050A1E"/>
      </g>
    </g>
    <rect x="520" y="700" width="345" height="270" fill="url(#${id}-flapGlow)" clip-path="url(#${id}-flapClip)"/>`
}

/** Flat monochrome: one stroke colour on every shape gives the outer contour
 *  AND separates the arms from the flap, which flat fills alone cannot. */
function monoBody(tone) {
  const c = MONO[tone]
  const s = `stroke="${c.edge}" stroke-width="${CONTOUR_WIDTH}" stroke-linejoin="round"`
  return `
    <g transform="translate(${RIGHT_ARM_DX} 0)"><path d="${RIGHT_ARM}" fill="${c.armAlt}" ${s}/></g>
    <path d="${LEFT_ARM}" fill="${c.arm}" ${s}/>
    <path d="${FLAP}" fill="${c.flap}" ${s}/>`
}

/** currentColor silhouette — inherits the surrounding text/accent colour. */
function currentColorBody() {
  return `
    <g transform="translate(${RIGHT_ARM_DX} 0)"><path d="${RIGHT_ARM}" opacity="0.82"/></g>
    <path d="${LEFT_ARM}"/>
    <path d="${FLAP}" opacity="0.66"/>`
}

const HEADER = (comment) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none" aria-hidden="true">
  <!--
${comment.split('\n').map((l) => `    ${l}`).join('\n')}

    GENERATED by scripts/brand/build-brand.mjs from scripts/brand/mark.mjs.
    Do not edit by hand — your change will be overwritten. Edit the source.
  -->`

/**
 * Build a mark SVG.
 * @param {'color'|'mono-light'|'mono-dark'|'currentColor'} variant
 * @param {{tile?: string|null, tileRadius?: number, shadow?: boolean, comment?: string}} opts
 */
export function buildMark(variant, opts = {}) {
  const { tile = null, tileRadius = 232, shadow = true, comment = '' } = opts
  const id = 'vq'
  const needsDefs = variant === 'color'
  const body =
    variant === 'color' ? colorBody(id, { shadow })
      : variant === 'currentColor' ? currentColorBody()
        : monoBody(variant === 'mono-light' ? 'light' : 'dark')

  const fill = variant === 'currentColor' ? ' fill="currentColor"' : ''
  const head = HEADER(comment).replace('fill="none"', variant === 'currentColor' ? 'fill="currentColor"' : 'fill="none"')

  return `${head}
${needsDefs ? `  <defs>${defs(id)}\n  </defs>\n` : ''}${tile ? `  <rect width="1024" height="1024" rx="${tileRadius}" fill="${tile}"/>\n` : ''}  <g transform="${VIEWBOX_TRANSFORM}"${fill}>${body}
  </g>
</svg>
`
}

/** The dark app-icon tile (dock, taskbar, Store). */
export const TILE_DARK = 'url(#vq-tile)'
export const TILE_DARK_DEF = `
    <linearGradient id="vq-tile" x1="512" y1="0" x2="512" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#131D31"/><stop offset="1" stop-color="#0A0E18"/>
    </linearGradient>`
export const TILE_LIGHT = '#F2F4F7'
