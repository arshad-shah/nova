import type { Meta, StoryObj } from '@storybook/react-vite'
import { ThemeProvider } from '@/primitives/theme/ThemeProvider'
import { VerqlMark } from './VerqlMark'

const meta: Meta<typeof VerqlMark> = {
  title: 'Components/Brand/VerqlMark',
  component: VerqlMark,
  args: {
    size: 96,
  },
  // VerqlMark's `auto` variant reads the active theme via useTheme(), which
  // requires the app ThemeProvider in the tree (Storybook's toolbar only sets
  // the data-theme attribute, not the React context).
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

/** Full brand palette (violet + cyan ribbons). Works on any surface. */
export const Color: Story = {
  args: { variant: 'color' },
}

/** Frost (white-ish) silhouette — for dark surfaces. */
export const Light: Story = {
  args: { variant: 'light' },
}

/** Midnight silhouette — for light surfaces. */
export const Dark: Story = {
  args: { variant: 'dark' },
}

/** `auto` resolves light/dark from the active theme's type (the default). */
export const Auto: Story = {
  args: { variant: 'auto' },
}

/** Small inline size, as used next to list items in the sidebar. */
export const Small: Story = {
  args: { variant: 'color', size: 16 },
}
