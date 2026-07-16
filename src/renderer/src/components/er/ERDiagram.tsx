import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TableNode } from './TableNode'
import { buildErElements, layoutErDiagram, type TableNodeData } from './er-layout'
import { useSelectionStore } from '@/stores/selection'
import { useSchemaStore } from '@/stores/schema'
import { useConnectionsStore } from '@/stores/connections'
import { useDataNouns, nounVars } from '@/hooks/useDataNouns'
import { Loader2 } from 'lucide-react'
import { Flex, Text, Box, Button, Spinner } from '@/primitives'
import { useTheme } from '@/primitives/theme/ThemeProvider'
import { useTranslation } from '@/i18n/I18nProvider'

function readVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

const nodeTypes = { tableNode: TableNode }

interface Props {
  connectionId: string
  schema: string
}

export function ERDiagram({ connectionId, schema }: Props) {
  const { t } = useTranslation()
  const nouns = useDataNouns(connectionId)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TableNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loading, setLoading] = useState(true)
  const [direction, setDirection] = useState<'LR' | 'TB'>('LR')
  const { fetchTables, fetchColumns } = useSchemaStore()
  const { theme } = useTheme()
  const { gridColor, accentColor } = useMemo(() => ({
    // Ion values, mirroring baseline.css — xyflow needs concrete colours and
    // can't resolve var(--…). Read live first; these only fire if the token
    // is missing.
    gridColor: readVar('--color-border-default', '#252E3F'),
    accentColor: readVar('--color-accent', '#7A5CFF'),
  }), [theme])

  useEffect(() => {
    let cancelled = false

    async function loadSchema() {
      setLoading(true)
      const tables = await fetchTables(connectionId, schema)

      const tablesWithColumns = await Promise.all(
        tables.filter(table => table.type === 'table').map(async (table) => {
          const columns = await fetchColumns(connectionId, table.name, schema)
          return { name: table.name, columns }
        })
      )

      if (cancelled) return

      const { nodes: rawNodes, edges: rawEdges } = buildErElements(tablesWithColumns)
      const { nodes: layoutedNodes, edges: layoutedEdges } = layoutErDiagram(rawNodes, rawEdges, direction)
      setNodes(layoutedNodes)
      setEdges(layoutedEdges)
      setLoading(false)
    }

    loadSchema()
    return () => { cancelled = true }
  }, [connectionId, schema])

  const handleRelayout = useCallback((dir: 'LR' | 'TB') => {
    setDirection(dir)
    const { nodes: layoutedNodes, edges: layoutedEdges } = layoutErDiagram(nodes, edges, dir)
    setNodes([...layoutedNodes])
    setEdges([...layoutedEdges])
  }, [nodes, edges, setNodes, setEdges])

  if (loading) {
    return (
      <Flex align="center" justify="center" className="flex-1 bg-bg-tertiary h-full">
        <Spinner size="md" label={t('shell.er.loading')} />
      </Flex>
    )
  }

  if (nodes.length === 0) {
    return (
      <Flex align="center" justify="center" className="flex-1 bg-bg-tertiary h-full">
        <Text size="sm" color="muted">{t('shell.er.noTables', { ...nounVars(nouns), schema })}</Text>
      </Flex>
    )
  }

  return (
    <Box className="h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          useSelectionStore.getState().setSelection({
            kind: 'erNode',
            connectionId,
            schema,
            table: node.id,
          })
        }}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color={gridColor} gap={20} size={1} />
        <Controls
          position="bottom-right"
          className="!bg-bg-secondary !border-border !shadow-lg [&>button]:!bg-bg-secondary [&>button]:!border-border [&>button]:!text-text-secondary [&>button:hover]:!bg-white/5"
        />
        <MiniMap
          position="bottom-left"
          nodeColor={(n) => (n.data as TableNodeData)?.color ?? accentColor}
          maskColor="rgba(0,0,0,0.7)"
          className="!bg-bg-secondary !border-border"
        />
        <Flex gap="xs" className="absolute top-3 right-3 z-10">
          <Button
            variant="outline"
            size="xs"
            onClick={() => handleRelayout('LR')}
            className={`transition-colors ${direction === 'LR' ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-muted hover:text-text-primary'}`}
          >
            {t('shell.er.horizontal')}
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => handleRelayout('TB')}
            className={`transition-colors ${direction === 'TB' ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-muted hover:text-text-primary'}`}
          >
            {t('shell.er.vertical')}
          </Button>
        </Flex>
      </ReactFlow>
    </Box>
  )
}
