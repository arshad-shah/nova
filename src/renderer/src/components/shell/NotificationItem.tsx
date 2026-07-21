import { Flex, Box, Text, Button, StatusDot, type StatusDotTone } from '@/primitives'
import { cn } from '@/primitives/utils/cn'
import { formatRelativeTime } from '@/lib/format-time'
import type { Notification } from '@/stores/notifications'

const dotToneMap: Record<Notification['type'], StatusDotTone> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  success: 'success',
}

interface NotificationItemProps {
  notification: Notification
  onClick: (id: string) => void
}

export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const { id, type, message, source, timestamp, read } = notification

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onClick(id)}
      className={cn(
        'w-full justify-start rounded-none px-3.5 py-1.5 h-auto border-b border-border-subtle',
        read && 'opacity-60'
      )}
    >
      <Flex direction="row" align="start" gap="sm" className="w-full">
        <StatusDot
          size="xs"
          tone={dotToneMap[type]}
          className={cn('mt-1.25', read && 'opacity-40')}
        />
        <Box className="min-w-0 flex-1 text-left">
          <Text size="xs" color="primary" truncate>{message}</Text>
          <Text size="xs" color="muted" className="mt-0.5 text-[9px]">
            {source && <Box as="span">{source.label} · </Box>}
            {formatRelativeTime(timestamp)}
          </Text>
        </Box>
      </Flex>
    </Button>
  )
}
