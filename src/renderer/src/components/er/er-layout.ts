import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'

const NODE_WIDTH = 220
const NODE_HEIGHT_BASE = 40
const NODE_HEIGHT_PER_COLUMN = 22

// XYFlow's `Node<T>` constraint requires `T extends Record<string, unknown>`,
// so we declare an index signature to satisfy the structural type. Concrete
// callers still access `tableName`, `columns`, `color` by name and get the
// proper types — TS narrows through the named properties first.
export interface TableNodeData extends Record<string, unknown> {
  tableName: string
  columns: { name: string; dataType: string; isPrimaryKey: boolean; isForeignKey: boolean }[]
  color: string
}

export function layoutErDiagram(
  nodes: Node<TableNodeData>[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'LR'
): { nodes: Node<TableNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 })

  nodes.forEach((node) => {
    const height = NODE_HEIGHT_BASE + (node.data.columns.length * NODE_HEIGHT_PER_COLUMN)
    g.setNode(node.id, { width: NODE_WIDTH, height })
  })

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target)
  })

  dagre.layout(g)

  const isHorizontal = direction === 'LR'
  const layoutedNodes: Node<TableNodeData>[] = nodes.map((node) => {
    const pos = g.node(node.id)
    const height = NODE_HEIGHT_BASE + (node.data.columns.length * NODE_HEIGHT_PER_COLUMN)
    return {
      ...node,
      targetPosition: (isHorizontal ? 'left' : 'top') as Node['targetPosition'],
      sourcePosition: (isHorizontal ? 'right' : 'bottom') as Node['sourcePosition'],
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - height / 2
      }
    }
  })

  return { nodes: layoutedNodes, edges }
}

// Node accent colors drawn from the theme's decorative ramp (var() strings so
// the browser resolves them live — the ER diagram re-themes without a rebuild).
const TABLE_COLORS = [
  'var(--color-decorative-1)', 'var(--color-decorative-2)',
  'var(--color-decorative-3)', 'var(--color-decorative-4)',
  'var(--color-decorative-5)', 'var(--color-decorative-6)',
  'var(--color-decorative-7)', 'var(--color-decorative-8)',
]

export function buildErElements(
  tables: { name: string; columns: { name: string; dataType: string; isPrimaryKey: boolean; isForeignKey: boolean; references?: { table: string; column: string } }[] }[]
): { nodes: Node<TableNodeData>[]; edges: Edge[] } {
  const tableSet = new Set(tables.map(t => t.name))

  const nodes: Node<TableNodeData>[] = tables.map((table, i) => ({
    id: table.name,
    type: 'tableNode',
    position: { x: 0, y: 0 },
    data: {
      tableName: table.name,
      columns: table.columns.map(c => ({
        name: c.name,
        dataType: c.dataType,
        isPrimaryKey: c.isPrimaryKey,
        isForeignKey: c.isForeignKey
      })),
      color: TABLE_COLORS[i % TABLE_COLORS.length]
    }
  }))

  const edges: Edge[] = []
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.isForeignKey && col.references && tableSet.has(col.references.table)) {
        edges.push({
          id: `${table.name}.${col.name}->${col.references.table}.${col.references.column}`,
          source: table.name,
          target: col.references.table,
          label: `${col.name} → ${col.references.column}`,
          type: 'smoothstep',
          animated: false,
          style: { stroke: 'var(--color-accent)', strokeWidth: 1.5 },
          labelStyle: { fontSize: 9, fill: 'var(--color-text-tertiary)' }
        })
      }
    }
  }

  return { nodes, edges }
}
