import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { TransactionToolbar } from './TransactionToolbar'

const meta: Meta<typeof TransactionToolbar> = {
  title: 'Components/Query/TransactionToolbar',
  component: TransactionToolbar,
  decorators: [
    (Story) => (
      <div className="p-4 bg-bg-primary">
        <Story />
      </div>
    ),
  ],
  args: {
    onToggleAutoCommit: fn(),
    onCommit: fn(),
    onRollback: fn(),
    onIsolationChange: fn(),
    onReadOnlyChange: fn(),
  },
}
export default meta
type Story = StoryObj<typeof TransactionToolbar>

/**
 * Driver only supports auto-commit toggle (e.g. a simple driver with no
 * manual transaction support). Shows the toggle and status badge only.
 */
export const AutoCommitOnly: Story = {
  args: {
    caps: { autoCommit: true, manualTransactions: false },
    txn: { autoCommit: true, status: 'none', readOnly: false },
  },
}

/**
 * Full transaction-capable driver (Postgres/MySQL style) with autoCommit
 * disabled and no active transaction — shows Commit/Rollback in disabled
 * state and "Idle" status badge.
 */
export const FullTransactionIdle: Story = {
  args: {
    caps: {
      autoCommit: true,
      manualTransactions: true,
      transactionLabel: 'Transaction',
      rollbackKind: 'full',
    },
    txn: { autoCommit: false, status: 'none', readOnly: false },
  },
}

/**
 * Full transaction-capable driver with an active transaction — Commit and
 * Rollback buttons are enabled, status badge shows "Transaction active".
 */
export const FullTransactionActive: Story = {
  args: {
    caps: {
      autoCommit: true,
      manualTransactions: true,
      transactionLabel: 'Transaction',
      rollbackKind: 'full',
    },
    txn: { autoCommit: false, status: 'active', readOnly: false },
  },
}

/**
 * Redis-style driver using MULTI/EXEC semantics. The rollback button is
 * labelled "Discard" and the status badge reflects the MULTI/EXEC label.
 */
export const RedisStyle: Story = {
  args: {
    caps: {
      autoCommit: true,
      manualTransactions: true,
      transactionLabel: 'MULTI/EXEC',
      rollbackKind: 'discard',
    },
    txn: { autoCommit: false, status: 'active', readOnly: false },
  },
}

/**
 * Postgres-style driver with isolation level selector and read-only toggle.
 * Transaction is active with SERIALIZABLE isolation in read-only mode.
 */
export const WithIsolationAndReadOnly: Story = {
  args: {
    caps: {
      autoCommit: true,
      manualTransactions: true,
      transactionLabel: 'Transaction',
      rollbackKind: 'full',
      isolationLevels: ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'],
      readOnly: true,
    },
    txn: {
      autoCommit: false,
      status: 'active',
      isolationLevel: 'SERIALIZABLE',
      readOnly: true,
    },
  },
}
