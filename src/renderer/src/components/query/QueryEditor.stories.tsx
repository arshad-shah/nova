import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { useState } from 'react'
import { QueryEditor } from './QueryEditor'

/**
 * Renders the real `QueryEditor`. The component is uncontrolled-ish
 * (parent owns `value`), so we wrap each story in a tiny `useState` host
 * that mirrors how `QueryPanel` drives the editor. Storybook ends up
 * exercising the same Monaco mount path the app uses — themes, CodeLens,
 * AI inline completion provider, the whole stack.
 *
 * No mock editor, no hand-rolled Monaco setup. The decorator below
 * provides the parent state; everything else flows through the real
 * exported component.
 */
interface HostProps {
  initial?: string
  connectionId?: string | null
  schema?: string | null
  databaseType?: string
}
function Host({ initial = '', connectionId = null, schema = null, databaseType = 'postgresql' }: HostProps) {
  const [value, setValue] = useState(initial)
  return (
    <div className="h-100 w-200 border border-border-default rounded-md overflow-hidden bg-bg-primary">
      <QueryEditor
        tabId="storybook-tab"
        value={value}
        onChange={setValue}
        onExecute={fn()}
        connectionId={connectionId}
        schema={schema}
        databaseType={databaseType}
      />
    </div>
  )
}

const meta: Meta<typeof Host> = {
  title: 'Components/Query/QueryEditor',
  component: Host,
}
export default meta
type Story = StoryObj<typeof Host>

export const Empty: Story = {
  args: { initial: '' },
}

export const WithQuery: Story = {
  args: {
    initial: 'SELECT id, email, created_at\nFROM users\nWHERE created_at > NOW() - INTERVAL \'7 days\'\nORDER BY created_at DESC\nLIMIT 100;',
  },
}

export const MultipleStatements: Story = {
  args: {
    initial: [
      'SELECT count(*) FROM orders;',
      '',
      'SELECT status, count(*)',
      'FROM orders',
      'GROUP BY status;',
      '',
      'EXPLAIN ANALYZE SELECT * FROM orders WHERE total > 1000;',
    ].join('\n'),
  },
}

/**
 * Reproduces the original bug: multiple queries without `;` between them.
 * Previously rendered a single Run/Explain stack; should now show one stack
 * per statement (boundary detected via the statement-introducing keyword).
 */
export const MultipleStatementsNoSemicolons: Story = {
  args: {
    initial: [
      'SELECT 1',
      'SELECT 2',
      'INSERT INTO whatever (x) VALUES (1)',
    ].join('\n'),
  },
}

export const Mongo: Story = {
  args: {
    databaseType: 'mongodb',
    initial: '{ "find": "users", "filter": { "active": true }, "limit": 25 }',
  },
}
