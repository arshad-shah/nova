import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { Code } from './Code'

const meta = {
  title: 'Primitives/Typography/Code',
  component: Code,
  argTypes: {
    block: { control: 'boolean' },
    size: { control: 'select', options: ['3xs', '2xs', 'xs', 'sm'] },
  },
} satisfies Meta<typeof Code>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    block: false,
    children: 'console.log("hello")',
  },
  play: async ({ canvas }) => {
    const code = canvas.getByText('console.log("hello")')
    await expect(code).toBeInTheDocument()
    await expect(code.tagName).toBe('CODE')
  },
}

export const Block: Story = {
  args: {
    block: true,
    children: `function greet(name: string) {\n  return \`Hello, \${name}!\`\n}`,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/function greet/)).toBeInTheDocument()
  },
}

// The two sub-`xs` steps (`3xs`/`2xs`) keep inline code and stack traces legible
// in dense chrome (tooltips, error panels) without an ad-hoc `text-[10px]`.
export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {(['3xs', '2xs', 'xs', 'sm'] as const).map((size) => (
        <Code key={size} size={size}>
          {`size="${size}"  SELECT * FROM t`}
        </Code>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/size="3xs"/)).toBeInTheDocument()
  },
}

export const InContext: Story = {
  render: () => (
    <p style={{ color: 'var(--color-text-primary)', fontSize: 14, lineHeight: 1.6 }}>
      Call <Code>document.getElementById()</Code> to select an element, or use <Code>querySelector()</Code> for CSS selectors.
    </p>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('document.getElementById()')).toBeInTheDocument()
    await expect(canvas.getByText('querySelector()')).toBeInTheDocument()
  },
}
