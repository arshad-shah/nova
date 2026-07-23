/**
 * Canvas painter.
 *
 * The world-to-screen transform is applied in JavaScript rather than through
 * ctx.scale, for one reason: it lets every stroke be snapped to the device
 * pixel grid. A hairline is exactly one device pixel wide and sits exactly on
 * a device pixel, at any zoom and any device pixel ratio.
 */
import {
  GUTTER_W,
  HEADER_H,
  LOD_SCALE,
  NAME_TYPE_GAP,
  PAD_X,
  RADIUS,
  ROW_H,
  fit,
  type Card,
  type Measure,
} from './metrics'
import { CORNER, type Route } from './route'
import { LEGEND, symbol, type Prim } from './notation'
import type { ErdTheme } from './theme-bridge'
import type { Viewport } from './viewport'

export interface PaintInput {
  cards: Card[]
  routes: Route[]
  view: Viewport
  theme: ErdTheme
  measure: Measure
  width: number
  height: number
  dpr: number
  selected?: string | null
  hovered?: string | null
  /** Ids of entities adjacent to the selection. */
  related?: Set<string>
  legend?: boolean
  /** Localised legend copy. Falls back to the English defaults in `LEGEND`. */
  legendLabels?: { entries: readonly string[]; nonIdentifying: string }
}

const fontCache = new Map<string, string>()
function scaleFont(font: string, k: number): string {
  if (k === 1) return font
  const key = font + '@' + k.toFixed(3)
  let out = fontCache.get(key)
  if (out === undefined) {
    out = font.replace(/([\d.]+)px/, (_, n) => (parseFloat(n) * k).toFixed(2) + 'px')
    fontCache.set(key, out)
  }
  return out
}

export function paint(ctx: CanvasRenderingContext2D, p: PaintInput): void {
  const { view, theme, dpr, width, height } = p
  const s = view.scale

  // Snap a world coordinate to the device grid: `.5` for hairline strokes so
  // the one-pixel line covers exactly one column of pixels, whole for fills.
  const sx = (wx: number) => wx * s + view.x
  const sy = (wy: number) => wy * s + view.y
  const hair = (v: number) => (Math.round(v * dpr) + 0.5) / dpr
  const solid = (v: number) => Math.round(v * dpr) / dpr
  const HAIR = 1 / dpr

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = theme.surface
  ctx.fillRect(0, 0, width, height)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'

  drawGrid(ctx, p, sx, sy, solid)

  const dim = p.selected != null
  const lit = (r: Route) => p.selected != null && (r.from === p.selected || r.to === p.selected)

  // Two passes so highlighted connectors always sit above their neighbours.
  for (const pass of [0, 1]) {
    for (const r of p.routes) {
      if ((lit(r) ? 1 : 0) !== pass) continue
      if (sx(r.maxX) < 0 || sx(r.minX) > width || sy(r.maxY) < 0 || sy(r.minY) > height) continue
      drawRoute(ctx, r, {
        color: lit(r) ? theme.edgeActive : dim ? theme.edgeMuted : theme.edge,
        width: Math.max(HAIR, (lit(r) ? 1.5 : 1) * Math.min(1, s)),
        sx,
        sy,
        hair,
        s,
        surface: theme.surface,
      })
    }
  }

  for (const c of p.cards) {
    const x = sx(c.x)
    const y = sy(c.y)
    const w = c.w * s
    const h = c.h * s
    if (x + w < 0 || x > width || y + h < 0 || y > height) continue
    drawCard(ctx, c, p, { x, y, w, h, hair, solid, HAIR })
  }

  if (p.legend !== false) drawLegend(ctx, p)
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  p: PaintInput,
  sx: (n: number) => number,
  sy: (n: number) => number,
  solid: (n: number) => number
): void {
  const s = p.view.scale
  if (s < 0.45) return
  const step = 24 * s
  const alpha = Math.min(1, (s - 0.45) / 0.35)
  ctx.fillStyle = p.theme.grid
  ctx.globalAlpha = alpha
  const x0 = ((sx(0) % step) + step) % step
  const y0 = ((sy(0) % step) + step) % step
  const d = Math.max(1 / p.dpr, Math.min(2, s))
  for (let x = x0; x < p.width; x += step) {
    for (let y = y0; y < p.height; y += step) {
      ctx.fillRect(solid(x), solid(y), d, d)
    }
  }
  ctx.globalAlpha = 1
}

interface RouteStyle {
  color: string
  width: number
  sx: (n: number) => number
  sy: (n: number) => number
  hair: (n: number) => number
  s: number
  surface: string
}

function drawRoute(ctx: CanvasRenderingContext2D, r: Route, st: RouteStyle): void {
  const { sx, sy, hair } = st
  ctx.strokeStyle = st.color
  ctx.lineWidth = st.width
  ctx.setLineDash(r.dashed ? [5 * st.s, 4 * st.s] : [])

  ctx.beginPath()
  const n = r.pts.length / 2
  const px = (i: number) => hair(sx(r.pts[i * 2]))
  const py = (i: number) => hair(sy(r.pts[i * 2 + 1]))
  ctx.moveTo(px(0), py(0))
  const rad = CORNER * st.s
  for (let i = 1; i < n - 1; i++) {
    // Radius must never exceed half of either adjoining segment, or the
    // corner will overshoot and the polyline will visibly kink.
    const back = Math.hypot(px(i) - px(i - 1), py(i) - py(i - 1))
    const fwd = Math.hypot(px(i + 1) - px(i), py(i + 1) - py(i))
    ctx.arcTo(px(i), py(i), px(i + 1), py(i + 1), Math.min(rad, back / 2, fwd / 2))
  }
  ctx.lineTo(px(n - 1), py(n - 1))
  ctx.stroke()

  ctx.setLineDash([])
  drawSymbols(ctx, r.symbols, st)
}

function drawSymbols(ctx: CanvasRenderingContext2D, prims: Prim[], st: RouteStyle): void {
  const { sx, sy, hair } = st
  ctx.lineWidth = st.width
  ctx.beginPath()
  for (const s of prims) {
    if (s.k === 'line') {
      ctx.moveTo(hair(sx(s.x1)), hair(sy(s.y1)))
      ctx.lineTo(hair(sx(s.x2)), hair(sy(s.y2)))
    }
  }
  ctx.stroke()

  for (const s of prims) {
    if (s.k !== 'ring') continue
    ctx.beginPath()
    ctx.arc(hair(sx(s.cx)), hair(sy(s.cy)), s.r * st.s, 0, Math.PI * 2)
    // Filled with the surface colour so the connector does not run through it.
    ctx.fillStyle = st.surface
    ctx.fill()
    ctx.stroke()
  }
}

interface Box {
  x: number
  y: number
  w: number
  h: number
  hair: (n: number) => number
  solid: (n: number) => number
  HAIR: number
}

function drawCard(ctx: CanvasRenderingContext2D, c: Card, p: PaintInput, b: Box): void {
  const t = p.theme
  const s = p.view.scale
  const { hair, solid, HAIR } = b
  const x = solid(b.x)
  const y = solid(b.y)
  const w = solid(b.x + b.w) - x
  const h = solid(b.y + b.h) - y
  const r = Math.min(RADIUS * s, w / 2, h / 2)
  const isSel = p.selected === c.id
  const isRel = p.related?.has(c.id) ?? false
  const dim = p.selected != null && !isSel && !isRel

  ctx.globalAlpha = dim ? 0.45 : 1

  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = t.card
  ctx.fill()

  // Header band: rounded at the top, square where it meets the body.
  const hh = Math.min(h, HEADER_H * s)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, hh)
  ctx.clip()
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = t.cardHeader
  ctx.fill()
  ctx.restore()

  // Header text.
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, hh)
  ctx.clip()
  const tx = x + PAD_X * s
  const avail = c.w - PAD_X * 2
  if (c.entity.namespace) {
    ctx.font = scaleFont(t.fontEyebrow, s)
    ctx.fillStyle = t.eyebrow
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(fit(c.entity.namespace.toUpperCase(), t.fontEyebrow, avail, p.measure), tx, y + 14 * s)
    ctx.font = scaleFont(t.fontTitle, s)
    ctx.fillStyle = t.title
    ctx.fillText(fit(c.entity.name, t.fontTitle, avail, p.measure), tx, y + 29 * s)
  } else {
    ctx.font = scaleFont(t.fontTitle, s)
    ctx.fillStyle = t.title
    ctx.textBaseline = 'middle'
    ctx.fillText(fit(c.entity.name, t.fontTitle, avail, p.measure), tx, y + hh / 2)
  }
  ctx.restore()

  // Divider under the header.
  ctx.strokeStyle = t.divider
  ctx.lineWidth = HAIR
  ctx.beginPath()
  ctx.moveTo(x, hair(y + hh))
  ctx.lineTo(x + w, hair(y + hh))
  ctx.stroke()

  if (s >= LOD_SCALE) drawRows(ctx, c, p, { x, y, w, h, hair, solid, HAIR })
  else drawSummary(ctx, c, p, { x, y, w, h, hair, solid, HAIR })

  // Border last, so it sits over both bands.
  roundRect(ctx, hair(b.x), hair(b.y), w, h, r)
  ctx.strokeStyle = isSel ? t.select : isRel ? t.cardBorderStrong : t.cardBorder
  ctx.lineWidth = isSel ? Math.max(HAIR, 2 * Math.min(1, s)) : HAIR
  ctx.stroke()

  if (p.hovered === c.id && !isSel) {
    ctx.strokeStyle = t.cardBorderStrong
    ctx.lineWidth = Math.max(HAIR, 1.5 * Math.min(1, s))
    ctx.stroke()
  }

  ctx.globalAlpha = 1
}

function drawRows(ctx: CanvasRenderingContext2D, c: Card, p: PaintInput, b: Box): void {
  const t = p.theme
  const s = p.view.scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(b.x, b.y, b.w, b.h)
  ctx.clip()
  ctx.textBaseline = 'middle'

  c.entity.columns.forEach((col, i) => {
    const midY = b.y + c.rows[i].midY * s
    const left = b.x + PAD_X * s

    glyph(ctx, col.role ?? null, left + 5 * s, midY, s, t)

    const typeText = col.type
    const typeW = p.measure(typeText, t.fontType)
    const nameMax = Math.max(20, c.w - PAD_X * 2 - GUTTER_W - NAME_TYPE_GAP - typeW)

    ctx.font = scaleFont(t.fontRow, s)
    ctx.fillStyle = col.role === 'pk' || col.role === 'pfk' ? t.columnName : t.columnNameMuted
    ctx.fillText(fit(col.name, t.fontRow, nameMax, p.measure), left + GUTTER_W * s, midY)

    ctx.font = scaleFont(t.fontType, s)
    ctx.fillStyle = t.columnType
    ctx.globalAlpha = (col.nullable === false ? 1 : 0.72) * (ctx.globalAlpha || 1)
    ctx.textAlign = 'right'
    ctx.fillText(typeText, b.x + b.w - PAD_X * s, midY)
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1
  })

  ctx.restore()
}

/** Zoomed out: replace the rows with a density read of the key structure. */
function drawSummary(ctx: CanvasRenderingContext2D, c: Card, p: PaintInput, b: Box): void {
  const t = p.theme
  const s = p.view.scale
  const top = b.y + HEADER_H * s
  const bar = Math.max(1, 3 * s)
  let y = top + 6 * s
  for (const col of c.entity.columns) {
    if (y > b.y + b.h - 4 * s) break
    ctx.fillStyle =
      col.role === 'pk' || col.role === 'pfk'
        ? t.pk
        : col.role === 'fk'
          ? t.fk
          : col.role === 'uq'
            ? t.uq
            : t.divider
    ctx.fillRect(b.x + PAD_X * s, Math.round(y), Math.max(6, (c.w - PAD_X * 2) * s * 0.6), bar)
    y += ROW_H * s
  }
}

/** Key-role glyphs. Vector paths, no icon font, no sprite sheet. */
function glyph(
  ctx: CanvasRenderingContext2D,
  role: string | null,
  cx: number,
  cy: number,
  s: number,
  t: ErdTheme
): void {
  if (!role) return
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  ctx.lineWidth = 1.25
  ctx.lineCap = 'round'

  if (role === 'pk' || role === 'pfk') {
    ctx.strokeStyle = t.pk
    ctx.beginPath()
    ctx.arc(-2.4, 0, 2.1, 0, Math.PI * 2)
    ctx.moveTo(-0.4, 0)
    ctx.lineTo(3.6, 0)
    ctx.moveTo(2.2, 0)
    ctx.lineTo(2.2, 2)
    ctx.moveTo(3.6, 0)
    ctx.lineTo(3.6, 1.6)
    ctx.stroke()
    if (role === 'pfk') {
      ctx.fillStyle = t.fk
      ctx.beginPath()
      ctx.arc(-2.4, 0, 0.9, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (role === 'fk') {
    ctx.strokeStyle = t.fk
    ctx.beginPath()
    ctx.moveTo(-3.4, 0)
    ctx.lineTo(2.6, 0)
    ctx.moveTo(0.6, -2)
    ctx.lineTo(2.8, 0)
    ctx.lineTo(0.6, 2)
    ctx.stroke()
  } else {
    ctx.strokeStyle = t.uq
    ctx.beginPath()
    ctx.arc(0, 0, 2.4, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawLegend(ctx: CanvasRenderingContext2D, p: PaintInput): void {
  const t = p.theme
  const pad = 12
  const rowH = 20
  const w = 168
  const h = pad * 2 + LEGEND.length * rowH + 22
  const x = 16
  const y = p.height - h - 16

  roundRect(ctx, x, y, w, h, 8)
  ctx.fillStyle = t.card
  ctx.globalAlpha = 0.94
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = t.cardBorder
  ctx.lineWidth = 1 / p.dpr
  ctx.stroke()

  ctx.font = t.fontLegend
  ctx.textBaseline = 'middle'

  const id = (n: number) => n // legend draws in screen space already
  LEGEND.forEach((entry, i) => {
    const cy = y + pad + rowH * i + rowH / 2
    const px = x + pad
    ctx.strokeStyle = t.edge
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px, cy + 0.5)
    ctx.lineTo(px + 40, cy + 0.5)
    ctx.stroke()
    drawSymbols(ctx, symbol(entry.card, px, cy, 1, 0), {
      color: t.edge,
      width: 1,
      sx: id,
      sy: id,
      hair: (v) => Math.round(v) + 0.5,
      s: 1,
      surface: t.card,
    })
    ctx.fillStyle = t.columnNameMuted
    ctx.fillText(p.legendLabels?.entries[i] ?? entry.label, px + 52, cy)
  })

  const cy = y + pad + rowH * LEGEND.length + 8
  ctx.strokeStyle = t.edge
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.moveTo(x + pad, cy + 0.5)
  ctx.lineTo(x + pad + 40, cy + 0.5)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = t.columnType
  ctx.fillText(p.legendLabels?.nonIdentifying ?? 'Non-identifying', x + pad + 52, cy)
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.lineTo(x + w - k, y)
  ctx.arcTo(x + w, y, x + w, y + k, k)
  ctx.lineTo(x + w, y + h - k)
  ctx.arcTo(x + w, y + h, x + w - k, y + h, k)
  ctx.lineTo(x + k, y + h)
  ctx.arcTo(x, y + h, x, y + h - k, k)
  ctx.lineTo(x, y + k)
  ctx.arcTo(x, y, x + k, y, k)
  ctx.closePath()
}
