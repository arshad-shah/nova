import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MCPApprovalDialog } from '@/components/ai/MCPApprovalDialog'
import { useAIStore } from '@/stores/ai'

/**
 * The MCP approval dialog gates tool calls an external client asked to run
 * against the user's database. It must FAIL CLOSED.
 *
 * Moving it onto the `Modal` primitive introduced dismissal routes it never had
 * (Escape, backdrop click). Those must reject, not silently drop the request —
 * and nothing but a test stops a later change from wiring `onClose` to "just
 * hide it", which would fail OPEN.
 */

const respond = vi.fn()

const request = {
  requestId: 'req-1',
  toolName: 'query',
  permission: 'write' as const,
  statement: 'DELETE FROM users',
  language: 'sql',
}

function setStore(pending: unknown) {
  useAIStore.setState({
    mcpPendingApproval: pending,
    respondToMCPApproval: respond,
  } as never)
}

beforeEach(() => {
  respond.mockClear()
  setStore(request)
})

describe('MCPApprovalDialog — fails closed', () => {
  it('rejects when dismissed without an explicit choice (Escape / backdrop)', () => {
    // A native <dialog> signals Escape and backdrop dismissal by emitting
    // `close`, which is what Modal listens for. jsdom implements no modality,
    // so dispatch exactly what the browser would rather than fake a keypress
    // that jsdom would never turn into a close.
    const { container } = render(<MCPApprovalDialog />)
    const dialog = container.querySelector('dialog')!

    fireEvent(dialog, new Event('close'))

    expect(respond).toHaveBeenCalledWith('req-1', false)
  })

  it('rejects — never approves — when the Reject button is used', async () => {
    const user = userEvent.setup()
    render(<MCPApprovalDialog />)

    await user.click(screen.getByRole('button', { name: /reject/i }))

    expect(respond).toHaveBeenCalledWith('req-1', false)
  })

  it('approves ONLY on an explicit Approve click', async () => {
    const user = userEvent.setup()
    render(<MCPApprovalDialog />)

    await user.click(screen.getByRole('button', { name: /approve/i }))

    expect(respond).toHaveBeenCalledWith('req-1', true)
    expect(respond).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when there is no pending request', () => {
    setStore(null)
    const { container } = render(<MCPApprovalDialog />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the statement the caller wants to run, so approval is informed', () => {
    // An approval prompt that hides what it is approving is worse than none.
    render(<MCPApprovalDialog />)
    expect(screen.getByText(/DELETE FROM users/)).toBeInTheDocument()
  })

  it('distinguishes a write request from a read request', () => {
    render(<MCPApprovalDialog />)
    expect(screen.getByText(/write/i)).toBeInTheDocument()
  })

  it('presents a non-SQL tool call in its own terms, not as SQL', () => {
    // The motivating bug: a Mongo/Redis tool call has no `sql` param, so its
    // payload was serialized to JSON and stuffed into a field named `sql`,
    // then highlighted as SQL — mislabeling what the human is approving. The
    // payload must show verbatim, in the driver's own language.
    const payload = JSON.stringify({ command: 'DEL', key: 'session:abc' }, null, 2)
    setStore({
      requestId: 'req-2',
      toolName: 'redis_command',
      permission: 'write' as const,
      statement: payload,
      language: 'json',
    })
    render(<MCPApprovalDialog />)
    expect(screen.getByText(/"command": "DEL"/)).toBeInTheDocument()
    // The code view must be told the payload is JSON, never assume SQL.
    expect(screen.getByText('JSON')).toBeInTheDocument()
    expect(screen.queryByText('SQL')).toBeNull()
  })
})
