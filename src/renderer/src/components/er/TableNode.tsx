import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Key, Link } from 'lucide-react'
import type { TableNodeData } from './er-layout'
import { Box, Flex, Text } from '@/primitives'

function TableNodeComponent({ data }: NodeProps) {
  const { tableName, columns, color } = data as TableNodeData

  return (
    <Box className="bg-bg-secondary border border-border rounded-lg overflow-hidden shadow-lg min-w-[200px]" style={{ borderColor: color }}>
      <Handle type="target" position={Position.Left} className="!bg-accent !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-accent !w-2 !h-2" />

      <Box className="px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: color }}>
        {tableName}
      </Box>

      <Box className="divide-y divide-border">
        {columns.map((col) => (
          <Flex key={col.name} align="center" gap="xs" className="px-2.5 py-1 text-[11px]">
            {col.isPrimaryKey ? (
              <Key size={10} strokeWidth={1.8} className="text-key-pk shrink-0" />
            ) : col.isForeignKey ? (
              <Link size={10} strokeWidth={1.8} className="text-key-fk shrink-0" />
            ) : (
              <Box as="span" className="w-2.5 shrink-0" />
            )}
            <Text size="xs" color="primary">{col.name}</Text>
            <Text size="xs" color="muted" className="ml-auto">{col.dataType}</Text>
          </Flex>
        ))}
      </Box>
    </Box>
  )
}

export const TableNode = memo(TableNodeComponent)
