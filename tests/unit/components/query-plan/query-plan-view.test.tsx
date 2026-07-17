import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryPlanView } from '../../../../src/renderer/src/components/query-plan/QueryPlanView'
import type { PlanNode } from '../../../../shared/types'

/**
 * Behavioural tests for `QueryPlanView` / `PlanNodeView` — the dialect-agnostic
 * plan renderer. Covers the empty-plan message, the max-cost computation used
 * to scale every node's bar (must recurse into children, not just top-level
 * siblings), collapse/expand of a node with children, and that a leaf node
 * has no toggle affordance.
 */

function node(overrides: Partial<PlanNode> = {}): PlanNode {
  return { type: 'Seq Scan', cost: 10, rows: 100, children: [], details: '', ...overrides }
}

describe('QueryPlanView', () => {
  it('shows an empty-state message instead of a tree when the plan is empty', () => {
    render(<QueryPlanView plan={[]} />)
    expect(screen.getByText(/no.*plan|plan/i)).toBeInTheDocument()
    expect(screen.queryByText('Seq Scan')).not.toBeInTheDocument()
  })

  it('computes the header cost as the MAX across the whole tree, including nested children, not just top-level nodes', () => {
    const plan = [
      node({ type: 'Nested Loop', cost: 5, children: [node({ type: 'Index Scan', cost: 42 })] }),
    ]
    render(<QueryPlanView plan={plan} />)
    // maxCost (42.0, from the nested child) drives the header text — a bug
    // that only summed top-level nodes would report 5.0 here instead.
    expect(screen.getByText(/Max cost: 42\.0/)).toBeInTheDocument()
  })

  it('renders one top-level PlanNodeView per root plan node', () => {
    const plan = [node({ type: 'Seq Scan' }), node({ type: 'Hash Join' })]
    render(<QueryPlanView plan={plan} />)
    expect(screen.getByText('Seq Scan')).toBeInTheDocument()
    expect(screen.getByText('Hash Join')).toBeInTheDocument()
  })
})

describe('PlanNodeView (via QueryPlanView)', () => {
  it('starts expanded and shows child rows for a node with children', () => {
    const plan = [node({ type: 'Hash Join', children: [node({ type: 'Seq Scan', table: 'orders' })] })]
    render(<QueryPlanView plan={plan} />)
    expect(screen.getByText('orders')).toBeInTheDocument()
  })

  it('collapses a node with children on click, hiding its descendants', async () => {
    const user = userEvent.setup()
    const plan = [node({ type: 'Hash Join', children: [node({ type: 'Seq Scan', table: 'orders' })] })]
    render(<QueryPlanView plan={plan} />)
    expect(screen.getByText('orders')).toBeInTheDocument()

    await user.click(screen.getByText('Hash Join'))
    expect(screen.queryByText('orders')).not.toBeInTheDocument()

    await user.click(screen.getByText('Hash Join'))
    expect(screen.getByText('orders')).toBeInTheDocument()
  })

  it('does not render a chevron toggle for a leaf node (nothing to expand)', () => {
    const plan = [node({ type: 'Seq Scan', table: 'orders' })]
    const { container } = render(<QueryPlanView plan={plan} />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('shows the actual-time annotation only when the driver reported it', () => {
    const withTime = [node({ type: 'Seq Scan', actualTime: 12.345 })]
    const { rerender } = render(<QueryPlanView plan={withTime} />)
    expect(screen.getByText('12.3ms')).toBeInTheDocument()

    rerender(<QueryPlanView plan={[node({ type: 'Seq Scan' })]} />)
    expect(screen.queryByText(/ms$/)).not.toBeInTheDocument()
  })

  it('omits the table label entirely when the plan node has none (e.g. an aggregate node)', () => {
    const plan = [node({ type: 'Aggregate', table: undefined })]
    render(<QueryPlanView plan={plan} />)
    expect(screen.getByText('Aggregate')).toBeInTheDocument()
    expect(screen.queryByText('orders')).not.toBeInTheDocument()
  })
})
