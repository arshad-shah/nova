import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import { CodeView } from './CodeView'

const meta = {
  title: 'Primitives/Data Display/CodeView',
  component: CodeView,
} satisfies Meta<typeof CodeView>

export default meta
type Story = StoryObj<typeof meta>

export const Sql: Story = {
  args: {
    code: 'SELECT id, name FROM users WHERE active = true;',
    language: 'sql',
  },
  play: async ({ canvas }) => {
    const copyButton = canvas.getByRole('button', { name: 'Copy' })
    await userEvent.click(copyButton)
    // useClipboard flips its `copied` flag synchronously, before the
    // (possibly-blocked) clipboard write settles.
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Copied' })).toBeInTheDocument())
    // ...and reverts back after the reset delay.
    await waitFor(
      () => expect(canvas.getByRole('button', { name: 'Copy' })).toBeInTheDocument(),
      { timeout: 3000 },
    )
  },
}

export const Json: Story = {
  args: {
    code: '{\n  "mcpServers": {\n    "verql": { "type": "sse" }\n  }\n}',
    language: 'json',
  },
}

export const JavaScript: Story = {
  args: {
    code: 'const result = await db.query("SELECT * FROM users");\nconsole.log(result.rows);',
    language: 'javascript',
  },
}

export const NoCopyButton: Story = {
  args: {
    code: 'SELECT count(*) FROM orders;',
    language: 'sql',
    showCopy: false,
  },
}

export const WithActions: Story = {
  args: {
    code: 'SELECT id, name, email FROM customers LIMIT 10;',
    language: 'sql',
    actions: (
      <button
        type="button"
        style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer' }}
      >
        Insert
      </button>
    ),
  },
}
