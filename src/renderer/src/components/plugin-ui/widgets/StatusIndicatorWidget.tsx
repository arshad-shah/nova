import { Flex, Text, StatusDot, type StatusDotTone } from '@/primitives'
import type { StatusIndicatorWidget as StatusIndicatorWidgetType } from '@shared/plugin-ui-types'

interface Props {
  widget: StatusIndicatorWidgetType
}

const statusTones: Record<string, StatusDotTone> = {
  ok: 'success',
  warning: 'warning',
  error: 'error',
  loading: 'accent',
}

export function StatusIndicatorWidgetRenderer({ widget }: Props) {
  if (widget.visible === false) return null

  const status = widget.status ?? 'ok'

  return (
    <Flex align="center" gap="xs">
      <StatusDot size="xs" tone={statusTones[status]} pulse={status === 'loading'} />
      <Text size="xs" color="secondary" className="text-3xs">
        {widget.label}
      </Text>
    </Flex>
  )
}
