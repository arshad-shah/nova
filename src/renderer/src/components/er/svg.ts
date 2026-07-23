/**
 * SVG serialiser. Same geometry, different output target, which is the point
 * of keeping layout and routing free of any drawing calls: export and screen
 * can never drift apart.
 */
import { GUTTER_W, HEADER_H, PAD_X, RADIUS, type Card } from './metrics'
import type { Route } from './route'
import type { ErdTheme } from './theme-bridge'
import { bounds } from './viewport'

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function toSvg(cards: Card[], routes: Route[], theme: ErdTheme, pad = 32): string {
  const b = bounds(cards)
  const w = Math.ceil(b.w + pad * 2)
  const h = Math.ceil(b.h + pad * 2)
  const ox = pad - b.x
  const oy = pad - b.y
  const out: string[] = []

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="${theme.surface}"/>`,
    `<g transform="translate(${ox} ${oy})" shape-rendering="geometricPrecision">`
  )

  for (const r of routes) {
    let d = ''
    for (let i = 0; i < r.pts.length; i += 2) {
      d += (i === 0 ? 'M' : 'L') + r.pts[i] + ' ' + r.pts[i + 1]
    }
    out.push(
      `<path d="${d}" fill="none" stroke="${theme.edge}" stroke-width="1"${r.dashed ? ' stroke-dasharray="5 4"' : ''}/>`
    )
    for (const s of r.symbols) {
      if (s.k === 'line') {
        out.push(
          `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${theme.edge}" stroke-width="1"/>`
        )
      } else {
        out.push(
          `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${theme.surface}" stroke="${theme.edge}" stroke-width="1"/>`
        )
      }
    }
  }

  for (const c of cards) {
    out.push(
      `<g transform="translate(${c.x} ${c.y})">`,
      `<rect width="${c.w}" height="${c.h}" rx="${RADIUS}" fill="${theme.card}" stroke="${theme.cardBorder}"/>`,
      `<path d="M0 ${RADIUS}a${RADIUS} ${RADIUS} 0 0 1 ${RADIUS} -${RADIUS}h${c.w - RADIUS * 2}a${RADIUS} ${RADIUS} 0 0 1 ${RADIUS} ${RADIUS}v${HEADER_H - RADIUS}H0Z" fill="${theme.cardHeader}"/>`,
      `<line x1="0" y1="${HEADER_H}" x2="${c.w}" y2="${HEADER_H}" stroke="${theme.divider}"/>`
    )
    if (c.entity.namespace) {
      out.push(
        `<text x="${PAD_X}" y="14" fill="${theme.eyebrow}" font-family="Inter" font-size="10" font-weight="500">${esc(c.entity.namespace.toUpperCase())}</text>`,
        `<text x="${PAD_X}" y="29" fill="${theme.title}" font-family="Inter" font-size="13" font-weight="600">${esc(c.entity.name)}</text>`
      )
    } else {
      out.push(
        `<text x="${PAD_X}" y="${HEADER_H / 2 + 4}" fill="${theme.title}" font-family="Inter" font-size="13" font-weight="600">${esc(c.entity.name)}</text>`
      )
    }
    c.entity.columns.forEach((col, i) => {
      const y = c.rows[i].midY + 4
      const key = col.role === 'fk' ? theme.fk : col.role === 'uq' ? theme.uq : theme.pk
      if (col.role) out.push(`<circle cx="${PAD_X + 5}" cy="${y - 4}" r="2.6" fill="${key}"/>`)
      out.push(
        `<text x="${PAD_X + GUTTER_W}" y="${y}" fill="${theme.columnNameMuted}" font-family="Inter" font-size="12">${esc(col.name)}</text>`,
        `<text x="${c.w - PAD_X}" y="${y}" fill="${theme.columnType}" font-family="Inter" font-size="11" text-anchor="end">${esc(col.type)}</text>`
      )
    })
    out.push('</g>')
  }

  out.push('</g></svg>')
  return out.join('')
}
