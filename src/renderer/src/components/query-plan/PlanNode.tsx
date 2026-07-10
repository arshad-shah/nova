import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { PlanNode as PlanNodeType } from '@shared/types'
import { Box, Flex, Text } from '@/primitives'

interface Props {
  node: PlanNodeType
  maxCost: number
  depth?: number
}

function costColor(ratio: number): string {
  if (ratio < 0.3) return 'var(--color-success)'
  if (ratio < 0.6) return 'var(--color-warning)'
  return 'var(--color-error)'
}

function onCostColor(ratio: number): string {
  if (ratio < 0.3) return 'var(--color-on-success)'
  if (ratio < 0.6) return 'var(--color-on-warning)'
  return 'var(--color-on-error)'
}

export function PlanNodeView({ node, maxCost, depth = 0 }: Props) {
  const [expanded, setExpanded] = useState(true)
  const costRatio = maxCost > 0 ? node.cost / maxCost : 0
  const hasChildren = node.children.length > 0
  const color = costColor(costRatio)
  const onColor = onCostColor(costRatio)

  return (
    <Box style={{ marginLeft: depth * 24 }}>
      <Flex
        align="center"
        gap="sm"
        className="py-1.5 px-2 rounded-md hover:bg-white/5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown size={14} className="text-text-muted shrink-0" /> : <ChevronRight size={14} className="text-text-muted shrink-0" />
        ) : (
          <Box as="span" className="w-3.5 shrink-0" />
        )}

        <Text size="xs" weight="semibold" className="px-2 py-0.5 rounded" style={{ backgroundColor: color, color: onColor }}>
          {node.type}
        </Text>

        {node.table && <Text size="xs" color="accent">{node.table}</Text>}

        <Box className="flex-1 mx-2 h-2 bg-bg-tertiary rounded-full overflow-hidden">
          <Box className="h-full rounded-full transition-all" style={{ width: `${Math.max(costRatio * 100, 2)}%`, backgroundColor: color }} />
        </Box>

        <Text size="xs" color="muted" className="shrink-0">cost: {node.cost.toFixed(1)}</Text>
        <Text size="xs" color="muted" className="shrink-0">rows: {node.rows}</Text>
        {node.actualTime !== undefined && (
          <Text size="xs" color="warning" className="shrink-0">{node.actualTime.toFixed(1)}ms</Text>
        )}
      </Flex>

      {expanded && hasChildren && (
        <Box>
          {node.children.map((child, i) => (
            <PlanNodeView key={i} node={child} maxCost={maxCost} depth={depth + 1} />
          ))}
        </Box>
      )}
    </Box>
  )
}
