import { useState } from 'react'
import { Box, Flex, Text } from '@/primitives'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/primitives/utils/cn'
import { WidgetRenderer } from '../WidgetRenderer'
import type { SectionWidget as SectionWidgetType } from '@shared/plugin-ui-types'

interface Props {
  widget: SectionWidgetType
  pluginId: string
}

export function SectionWidgetRenderer({ widget, pluginId }: Props) {
  const [collapsed, setCollapsed] = useState(widget.collapsed ?? false)
  const collapsible = widget.collapsible ?? true

  if (widget.visible === false) return null

  return (
    <Box className="space-y-1">
      <Flex
        align="center"
        gap="xs"
        className={cn('px-2 py-1', collapsible && 'cursor-pointer')}
        onClick={() => collapsible && setCollapsed(!collapsed)}
      >
        {collapsible && (
          <ChevronRight
            size={12}
            className={cn('text-text-muted transition-transform', !collapsed && 'rotate-90')}
          />
        )}
        <Text size="xs" color="muted" className="uppercase tracking-wider">
          {widget.label}
        </Text>
      </Flex>
      {!collapsed && (
        <Box className="space-y-1 pl-2">
          <WidgetRenderer widgets={widget.children} pluginId={pluginId} />
        </Box>
      )}
    </Box>
  )
}
