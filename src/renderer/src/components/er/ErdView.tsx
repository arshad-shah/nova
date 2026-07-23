/**
 * React host. This is the only file in the ERD renderer that imports React;
 * everything it calls is framework-free, so the same core drives an SVG export
 * or a headless geometry test without a DOM.
 *
 * The palette is read out of the live token layer (see `theme-bridge`) and
 * refreshed whenever `data-theme` changes, so the canvas follows the app theme
 * without duplicating a single colour value.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react'
import { IconButton } from '@/primitives/forms/Button'
import { Flex } from '@/primitives'
import { buildCards, createMeasure, type Card } from './metrics'
import { layout, type Direction, type LayoutOptions } from './layout'
import { pruneRelationships, type Diagram } from './model'
import { route } from './route'
import { paint } from './paint'
import { readErdTheme, watchTheme, type ErdTheme } from './theme-bridge'
import { bounds, fitToView as fitView, identity, pick, toWorldX, toWorldY, zoomAt, type Viewport } from './viewport'

export interface ErdViewProps {
  diagram: Diagram
  direction?: Direction
  theme?: ErdTheme
  layoutOptions?: Partial<LayoutOptions>
  legend?: boolean
  legendLabels?: { entries: readonly string[]; nonIdentifying: string }
  ariaLabel?: string
  controlLabels?: { zoomIn: string; zoomOut: string; fit: string }
  className?: string
  onSelect?: (id: string | null) => void
}

const MINIMAP_W = 168
const MINIMAP_H = 112

export function ErdView({
  diagram,
  direction = 'LR',
  theme: themeProp,
  layoutOptions,
  legend = true,
  legendLabels,
  ariaLabel,
  controlLabels,
  className,
  onSelect,
}: ErdViewProps) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const minimap = useRef<HTMLCanvasElement>(null)
  const view = useRef<Viewport>(identity())
  const size = useRef({ w: 0, h: 0 })
  const dirty = useRef(true)
  const drag = useRef<{ card: Card | null; x: number; y: number; moved: boolean } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  // The palette is snapshotted from the live token layer and refreshed on any
  // `data-theme` change, so the canvas never holds a stale or duplicated colour.
  const [domTheme, setDomTheme] = useState<ErdTheme>(() => readErdTheme())
  useEffect(() => watchTheme(() => setDomTheme(readErdTheme())), [])
  const theme = themeProp ?? domTheme

  const measure = useMemo(createMeasure, [])

  const model = useMemo(() => {
    const rels = pruneRelationships(diagram)
    const cards = buildCards(diagram.entities, theme, measure)
    layout(cards, rels, { ...layoutOptions, direction })
    return { cards, rels, index: new Map(cards.map((c) => [c.id, c])) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram, theme, direction, measure])

  const [routes, setRoutes] = useState(() => route(model.cards, model.rels))
  const reroute = useCallback(() => {
    setRoutes(route(model.cards, model.rels))
  }, [model])

  // Keep routes in step when the model is rebuilt (diagram/theme/direction).
  useEffect(() => {
    setRoutes(route(model.cards, model.rels))
  }, [model])

  const related = useMemo(() => {
    if (!selected) return undefined
    const s = new Set<string>()
    for (const r of model.rels) {
      if (r.from === selected) s.add(r.to)
      if (r.to === selected) s.add(r.from)
    }
    return s
  }, [selected, model])

  const invalidate = () => {
    dirty.current = true
  }

  // --- sizing -------------------------------------------------------------
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      size.current = { w: Math.max(1, r.width), h: Math.max(1, r.height) }
      const c = canvas.current
      if (c) {
        const dpr = window.devicePixelRatio || 1
        c.width = Math.round(size.current.w * dpr)
        c.height = Math.round(size.current.h * dpr)
        c.style.width = size.current.w + 'px'
        c.style.height = size.current.h + 'px'
      }
      invalidate()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fit once per diagram, and only after the host has a real size.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (size.current.w > 1) {
        view.current = fitView(model.cards, size.current.w, size.current.h)
        invalidate()
      }
    })
    return () => cancelAnimationFrame(id)
  }, [model])

  // --- render loop --------------------------------------------------------
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!dirty.current) return
      const c = canvas.current
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return
      dirty.current = false
      paint(ctx, {
        cards: model.cards,
        routes,
        view: view.current,
        theme,
        measure,
        width: size.current.w,
        height: size.current.h,
        dpr: window.devicePixelRatio || 1,
        selected,
        hovered,
        related,
        legend,
        legendLabels,
      })
      paintMinimap(minimap.current, model.cards, view.current, size.current, theme)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [model, routes, theme, measure, selected, hovered, related, legend, legendLabels])

  useEffect(invalidate, [routes, selected, hovered, theme, legend, legendLabels])

  // --- interaction --------------------------------------------------------
  const localTo = (el: HTMLElement, e: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const { x, y } = localTo(canvas.current!, e)
    const hit = pick(model.cards, toWorldX(view.current, x), toWorldY(view.current, y))
    drag.current = { card: hit, x, y, moved: false }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (hit) {
      // Bring to front so a dragged card is never painted under a neighbour.
      const i = model.cards.indexOf(hit)
      model.cards.splice(i, 1)
      model.cards.push(hit)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = localTo(canvas.current!, e)
    const d = drag.current
    if (!d) {
      const hit = pick(model.cards, toWorldX(view.current, x), toWorldY(view.current, y))
      const id = hit?.id ?? null
      if (id !== hovered) setHovered(id)
      return
    }
    const dx = x - d.x
    const dy = y - d.y
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return
    d.moved = true
    d.x = x
    d.y = y
    if (d.card) {
      d.card.x = Math.round(d.card.x + dx / view.current.scale)
      d.card.y = Math.round(d.card.y + dy / view.current.scale)
      reroute()
    } else {
      view.current = { ...view.current, x: view.current.x + dx, y: view.current.y + dy }
      invalidate()
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    ;(e.target as Element).releasePointerCapture(e.pointerId)
    if (d && !d.moved) {
      const id = d.card?.id ?? null
      setSelected(id)
      onSelect?.(id)
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    const { x, y } = localTo(canvas.current!, e)
    if (e.ctrlKey || e.metaKey) {
      view.current = zoomAt(view.current, x, y, Math.exp(-e.deltaY * 0.0018))
    } else {
      view.current = { ...view.current, x: view.current.x - e.deltaX, y: view.current.y - e.deltaY }
    }
    invalidate()
  }

  const zoomBy = useCallback((factor: number) => {
    const c = size.current
    view.current = zoomAt(view.current, c.w / 2, c.h / 2, factor)
    invalidate()
  }, [])

  const fit = useCallback(() => {
    const c = size.current
    view.current = fitView(model.cards, c.w, c.h)
    invalidate()
  }, [model])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const c = size.current
    const step = e.shiftKey ? 120 : 40
    switch (e.key) {
      case '0':
        view.current = fitView(model.cards, c.w, c.h)
        break
      case '+':
      case '=':
        view.current = zoomAt(view.current, c.w / 2, c.h / 2, 1.2)
        break
      case '-':
        view.current = zoomAt(view.current, c.w / 2, c.h / 2, 1 / 1.2)
        break
      case 'ArrowLeft':
        view.current = { ...view.current, x: view.current.x + step }
        break
      case 'ArrowRight':
        view.current = { ...view.current, x: view.current.x - step }
        break
      case 'ArrowUp':
        view.current = { ...view.current, y: view.current.y + step }
        break
      case 'ArrowDown':
        view.current = { ...view.current, y: view.current.y - step }
        break
      case 'Escape':
        setSelected(null)
        onSelect?.(null)
        return
      default:
        return
    }
    e.preventDefault()
    invalidate()
  }

  // Click the minimap to recentre the viewport on the picked world point.
  const onMinimapDown = (e: React.PointerEvent) => {
    const cards = model.cards
    if (!cards.length) return
    const b = bounds(cards)
    const scale = Math.min(MINIMAP_W / b.w, MINIMAP_H / b.h) * 0.9
    const ox = (MINIMAP_W - b.w * scale) / 2
    const oy = (MINIMAP_H - b.h * scale) / 2
    const { x, y } = localTo(minimap.current!, e)
    const wx = (x - ox) / scale + b.x
    const wy = (y - oy) / scale + b.y
    const s = view.current.scale
    view.current = { scale: s, x: size.current.w / 2 - wx * s, y: size.current.h / 2 - wy * s }
    invalidate()
  }

  return (
    <div ref={host} className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvas}
        tabIndex={0}
        role="img"
        aria-label={ariaLabel ?? `Entity relationship diagram, ${diagram.entities.length} entities, ${model.rels.length} relationships`}
        style={{ display: 'block', outline: 'none', cursor: hovered ? 'grab' : 'default', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      />
      <Flex direction="column" gap="xs" className="absolute top-3 right-3 z-10">
        <IconButton
          label={controlLabels?.zoomIn ?? 'Zoom in'}
          size="sm"
          variant="outline"
          className="bg-bg-secondary"
          onClick={() => zoomBy(1.2)}
        >
          <ZoomIn size={14} strokeWidth={1.8} />
        </IconButton>
        <IconButton
          label={controlLabels?.zoomOut ?? 'Zoom out'}
          size="sm"
          variant="outline"
          className="bg-bg-secondary"
          onClick={() => zoomBy(1 / 1.2)}
        >
          <ZoomOut size={14} strokeWidth={1.8} />
        </IconButton>
        <IconButton
          label={controlLabels?.fit ?? 'Fit to view'}
          size="sm"
          variant="outline"
          className="bg-bg-secondary"
          onClick={fit}
        >
          <Maximize size={14} strokeWidth={1.8} />
        </IconButton>
      </Flex>
      <canvas
        ref={minimap}
        width={MINIMAP_W}
        height={MINIMAP_H}
        aria-hidden="true"
        onPointerDown={onMinimapDown}
        className="absolute bottom-3 right-3 z-10 rounded-md border border-border-default bg-bg-secondary shadow-lg"
        style={{ width: MINIMAP_W, height: MINIMAP_H, cursor: 'pointer' }}
      />
    </div>
  )
}

/** Overview map: card footprints plus the visible-world rectangle. ~40 lines,
 *  exactly as the renderer README sketches it — `bounds()` + a second paint. */
function paintMinimap(
  el: HTMLCanvasElement | null,
  cards: Card[],
  view: Viewport,
  size: { w: number; h: number },
  theme: ErdTheme
): void {
  if (!el) return
  const ctx = el.getContext('2d')
  if (!ctx || !cards.length) return
  ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H)
  const b = bounds(cards)
  const scale = Math.min(MINIMAP_W / b.w, MINIMAP_H / b.h) * 0.9
  const ox = (MINIMAP_W - b.w * scale) / 2
  const oy = (MINIMAP_H - b.h * scale) / 2
  const mx = (wx: number) => ox + (wx - b.x) * scale
  const my = (wy: number) => oy + (wy - b.y) * scale

  ctx.fillStyle = theme.cardBorderStrong
  for (const c of cards) {
    ctx.fillRect(mx(c.x), my(c.y), Math.max(1, c.w * scale), Math.max(1, c.h * scale))
  }

  // Visible world region, mapped through the current viewport.
  const vx0 = toWorldX(view, 0)
  const vy0 = toWorldY(view, 0)
  const vx1 = toWorldX(view, size.w)
  const vy1 = toWorldY(view, size.h)
  ctx.strokeStyle = theme.edgeActive
  ctx.lineWidth = 1
  ctx.strokeRect(mx(vx0) + 0.5, my(vy0) + 0.5, (vx1 - vx0) * scale, (vy1 - vy0) * scale)
}
