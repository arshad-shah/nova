import { Fragment, useMemo } from 'react'
import { Box, Flex, Text, KbdGroup } from '@/primitives'
import { VerqlMark } from '@/components/brand/VerqlMark'

interface ShortcutHint {
  keys: string[]
  label: string
}

const SHORTCUTS: ShortcutHint[] = [
  { keys: ['mod', 'shift', 'p'], label: 'Show all commands' },
  { keys: ['mod', 't'], label: 'New query tab' },
  { keys: ['mod', 'shift', 'n'], label: 'New connection' },
]

export function WelcomeScreen() {
  const shortcuts = useMemo(() => SHORTCUTS, [])

  return (
    <Flex align="center" justify="center" className="flex-1 bg-bg-tertiary h-full select-none">
      <Flex direction="column" align="center" gap="xl" className="text-center">
        {/* Watermark — large, dim glyph in the page foreground color so it
            tints with the active theme but reads as decorative chrome. */}
        <VerqlMark size={240} className="opacity-25" />
        <Box className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2">
          {shortcuts.map(({ keys, label }) => (
            <Fragment key={label}>
              <Text size="base" color="muted" className="justify-self-end">{label}</Text>
              <KbdGroup size="lg" keys={keys} className="justify-self-start" />
            </Fragment>
          ))}
        </Box>
      </Flex>
    </Flex>
  )
}
