import type { Meta, StoryObj } from '@storybook/react-vite'
import { Flex, Stack, Text } from '@/primitives'
import { DECORATIVE_COUNT } from './theme-color'

const meta: Meta = {
  title: 'Theme/Decorative Tokens',
}
export default meta
type Story = StoryObj

export const Ramp: Story = {
  render: () => (
    <Stack gap="sm">
      <Text size="sm" color="muted">
        Derived from accent/status tokens — themeable, no per-theme upkeep.
      </Text>
      <Flex gap="sm" wrap>
        {Array.from({ length: DECORATIVE_COUNT }, (_, i) => i + 1).map((n) => (
          <Stack key={n} gap="xs" align="center">
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                background: `var(--color-decorative-${n})`,
              }}
            />
            <Text size="xs" color="muted">
              {n}
            </Text>
          </Stack>
        ))}
      </Flex>
    </Stack>
  ),
}
