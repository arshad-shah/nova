import type { ReactNode } from 'react'
import { Box, Card, Text } from '@/primitives'

/** A titled card that groups related connection-form fields together. */
export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    // `padding="none"` because the header and body own their own padding and
    // the divider has to run edge to edge. The subtle border is kept: this
    // groups fields inside a form that is already on a panel, so a full-weight
    // border would box in a box.
    <Card padding="none" className="border-border-subtle overflow-hidden">
      <Box className="px-4 py-3 border-b border-border-subtle flex flex-col">
        <Text size="sm" weight="semibold" color="primary">{title}</Text>
        {description && <Text size="xs" color="muted" className="mt-0.5">{description}</Text>}
      </Box>
      <Box className="p-4">{children}</Box>
    </Card>
  )
}
