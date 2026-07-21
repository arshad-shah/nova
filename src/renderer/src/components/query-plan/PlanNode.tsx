import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { PlanNode as PlanNodeType } from '@shared/types'
import { Box, Flex, Text } from '@/primitives'
import { Progress } from '@/primitives/feedback/Progress'

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

// Same thresholds as costColor, expressed as a Progress `tone` for the bar.
function costTone(ratio: number): 'success' | 'warning' | 'error' {
  if (ratio < 0.3) return 'success'
  if (ratio < 0.6) return 'warning'
  return 'error'
}

export function PlanNodeView({ node, maxCost, depth = 0 }: Props) {
  const [expanded, setExpanded] = useState(true)
  const costRatio = maxCost > 0 ? node.cost / maxCost : 0
  const hasChildren = node.children.length > 0
  const color = costColor(costRatio)

  return (
    <Box style={{ marginLeft: depth * 24 }}>
      <Flex
        align="center"
        gap="sm"
        className="py-1.5 px-2 rounded-md hover:bg-hover cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown size={14} className="text-text-muted shrink-0" /> : <ChevronRight size={14} className="text-text-muted shrink-0" />
        ) : (
          <Box as="span" className="w-3.5 shrink-0" />
        )}

        {/* Cost tint is computed, so it stays inline — but it reads a token,
            and the label uses inverse text: every status colour is a light
            tint, so inverse stays legible on all three and flips correctly
            on light themes. */}
        <Text size="xs" weight="semibold" className="px-2 py-0.5 rounded text-text-inverse" style={{ backgroundColor: color }}>
          {node.type}
        </Text>

        {node.table && <Text size="xs" color="accent">{node.table}</Text>}

        <Progress
          value={Math.max(costRatio * 100, 2)}
          tone={costTone(costRatio)}
          size="lg"
          className="flex-1 mx-2 bg-bg-tertiary shadow-none"
          aria-label={`cost ${node.cost.toFixed(1)}`}
        />

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
