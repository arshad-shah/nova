import { Box, Flex, Text } from '@/primitives'
import { cn } from '@/primitives/utils/cn'
import type { StatusIndicatorWidget as StatusIndicatorWidgetType } from '@shared/plugin-ui-types'

interface Props {
  widget: StatusIndicatorWidgetType
}

const statusColors: Record<string, string> = {
  ok: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  loading: 'bg-accent animate-pulse',
}

export function StatusIndicatorWidgetRenderer({ widget }: Props) {
  if (widget.visible === false) return null

  return (
    <Flex align="center" gap="xs">
      <Box className={cn('h-1.5 w-1.5 rounded-full', statusColors[widget.status ?? 'ok'])} />
      <Text size="xs" color="secondary" className="text-[10px]">
        {widget.label}
      </Text>
    </Flex>
  )
}
