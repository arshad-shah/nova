/**
 * The SVG exporter shares layout + routing with the canvas painter, so the two
 * cannot place things differently. These checks lock the serialiser's contract:
 * a well-formed document, escaped text, and one card group per entity.
 */
import { describe, it, expect } from 'vitest'
import { buildCards } from '../../../src/renderer/src/components/er/metrics'
import { layout } from '../../../src/renderer/src/components/er/layout'
import { route } from '../../../src/renderer/src/components/er/route'
import { toSvg } from '../../../src/renderer/src/components/er/svg'
import type { Diagram } from '../../../src/renderer/src/components/er/model'
import type { ErdTheme } from '../../../src/renderer/src/components/er/theme-bridge'

const THEME = {
  surface: '#000', grid: '#111', card: '#222', cardHeader: '#333',
  cardBorder: '#444', cardBorderStrong: '#555', divider: '#666',
  title: '#777', eyebrow: '#888', columnName: '#999', columnNameMuted: '#aaa',
  columnType: '#bbb', edge: '#ccc', edgeMuted: '#ddd', edgeActive: '#eee',
  pk: '#f00', fk: '#0f0', uq: '#00f', select: '#fff',
  fontTitle: '600 14px s', fontEyebrow: '500 10px s', fontRow: '450 12px s',
  fontType: '450 11px s', fontLegend: '500 11px s',
} as ErdTheme

const measure = (text: string): number => text.length * 6.4

const DIAGRAM: Diagram = {
  entities: [
    { id: 'a', namespace: 'core', name: 'a & <b>', columns: [
      { name: 'id', type: 'uuid', role: 'pk' },
      { name: 'b_id', type: 'int', role: 'fk' },
    ] },
    { id: 'b', name: 'b', columns: [{ name: 'id', type: 'uuid', role: 'pk' }] },
  ],
  relationships: [{ id: 'r', from: 'a', fromColumn: 'b_id', to: 'b', toColumn: 'id', identifying: true }],
}

function render(): string {
  const cards = buildCards(DIAGRAM.entities, THEME, measure)
  layout(cards, DIAGRAM.relationships)
  const routes = route(cards, DIAGRAM.relationships)
  return toSvg(cards, routes, THEME)
}

describe('toSvg', () => {
  it('produces a single well-formed svg document', () => {
    const svg = render()
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    // Balanced <g> groups.
    expect((svg.match(/<g/g) ?? []).length).toBe((svg.match(/<\/g>/g) ?? []).length)
  })

  it('escapes markup-significant characters in entity names', () => {
    const svg = render()
    expect(svg).toContain('a &amp; &lt;b&gt;')
    expect(svg).not.toContain('a & <b>')
  })

  it('emits an identifying relationship as a solid (non-dashed) path', () => {
    const svg = render()
    // Connector paths are the ones with `fill="none"`; the header caps are
    // filled. Our single relationship is identifying, so none should be dashed.
    const connectors = (svg.match(/<path[^>]*fill="none"[^>]*>/g) ?? [])
    expect(connectors.length).toBeGreaterThan(0)
    expect(connectors.some((p) => p.includes('stroke-dasharray'))).toBe(false)
  })

  it('renders the namespace eyebrow when present', () => {
    const svg = render()
    expect(svg).toContain('>CORE<')
  })
})
