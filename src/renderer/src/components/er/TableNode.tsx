import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Key, Link } from 'lucide-react'
import type { TableNodeData } from './er-layout'
import { Box, Card, Flex, Text } from '@/primitives'
import { onFillInk } from '@/lib/color-contrast'

function TableNodeComponent({ data }: NodeProps) {
  const { tableName, columns, color } = data as TableNodeData

  return (
    // An ER node is a floating card on a canvas, so `elevated`. The inline
    // borderColor is the connection's own colour and must still win, which is
    // why Card never marks its border !important.
    <Card
      variant="elevated"
      padding="none"
      className="min-w-50 overflow-hidden border"
      style={{ borderColor: color }}
    >
      <Handle type="target" position={Position.Left} className="!bg-accent !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-accent !w-2 !h-2" />

      {/* The header is painted the table's own hue, which is fixed across
          themes — so the label can't be a theme text token (that would flip to
          a dark label on a saturated hue on dark themes). onFillInk picks the
          readable ink from the fill itself; the value it returns is a
          `--color-on-fill-*` token, so nothing here is a raw palette colour. */}
      <Text
        as="div"
        size="xs"
        weight="semibold"
        className="px-3 py-1.5"
        style={{ backgroundColor: color, color: onFillInk(color) }}
      >
        {tableName}
      </Text>

      <Box className="divide-y divide-border">
        {columns.map((col) => (
          <Flex key={col.name} align="center" gap="xs" className="px-2.5 py-1 text-2xs">
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
    </Card>
  )
}

export const TableNode = memo(TableNodeComponent)
