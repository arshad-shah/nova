import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { ErdView } from './ErdView'
import type { Diagram } from './model'

/** A schema exercising all four crow's-foot cardinalities, identifying vs
 *  non-identifying connectors, a namespace eyebrow, and a self-reference. */
const diagram: Diagram = {
  entities: [
    { id: 'tenant', namespace: 'core', name: 'tenant', columns: [
      { name: 'id', type: 'uuid', role: 'pk', nullable: false },
      { name: 'slug', type: 'citext', role: 'uq', nullable: false },
      { name: 'display_name', type: 'text', nullable: false },
    ] },
    { id: 'account', namespace: 'core', name: 'account', columns: [
      { name: 'id', type: 'uuid', role: 'pk', nullable: false },
      { name: 'tenant_id', type: 'uuid', role: 'fk', nullable: false },
      { name: 'email', type: 'citext', role: 'uq', nullable: false },
      { name: 'manager_id', type: 'uuid', role: 'fk', nullable: true },
    ] },
    { id: 'session', namespace: 'core', name: 'session', columns: [
      { name: 'id', type: 'uuid', role: 'pk', nullable: false },
      { name: 'account_id', type: 'uuid', role: 'fk', nullable: false },
      { name: 'expires_at', type: 'timestamptz', nullable: false },
    ] },
    { id: 'role', namespace: 'auth', name: 'role', columns: [
      { name: 'id', type: 'uuid', role: 'pk', nullable: false },
      { name: 'tenant_id', type: 'uuid', role: 'fk', nullable: false },
      { name: 'name', type: 'text', nullable: false },
    ] },
    { id: 'account_role', namespace: 'auth', name: 'account_role', columns: [
      { name: 'account_id', type: 'uuid', role: 'pfk', nullable: false },
      { name: 'role_id', type: 'uuid', role: 'pfk', nullable: false },
    ] },
  ],
  relationships: [
    { id: 'r1', from: 'account', fromColumn: 'tenant_id', to: 'tenant', toColumn: 'id', identifying: false, fromCardinality: 'zero-or-many', toCardinality: 'one' },
    { id: 'r2', from: 'session', fromColumn: 'account_id', to: 'account', toColumn: 'id', identifying: false, fromCardinality: 'many', toCardinality: 'one' },
    { id: 'r3', from: 'role', fromColumn: 'tenant_id', to: 'tenant', toColumn: 'id', identifying: false, fromCardinality: 'zero-or-many', toCardinality: 'one' },
    { id: 'r4', from: 'account_role', fromColumn: 'account_id', to: 'account', toColumn: 'id', identifying: true, fromCardinality: 'one', toCardinality: 'zero-or-one' },
    { id: 'r5', from: 'account_role', fromColumn: 'role_id', to: 'role', toColumn: 'id', identifying: true, fromCardinality: 'one', toCardinality: 'zero-or-one' },
    { id: 'self', from: 'account', fromColumn: 'manager_id', to: 'account', toColumn: 'id', identifying: false },
  ],
}

const meta: Meta<typeof ErdView> = {
  title: 'Components/Er/ErdView',
  component: ErdView,
  decorators: [
    (Story) => (
      <div style={{ width: 900, height: 560 }}>
        <Story />
      </div>
    ),
  ],
  args: { diagram },
}
export default meta
type Story = StoryObj<typeof meta>

/** Left-to-right flow (default): parents to the left of the entities that
 *  reference them, crow's-foot notation, and the notation legend. */
export const Horizontal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const surface = canvas.getByRole('img')
    await expect(surface).toHaveAttribute('aria-label', expect.stringContaining('5 entities'))
    await expect(surface).toHaveAttribute('aria-label', expect.stringContaining('6 relationships'))

    // Keyboard affordances: focus the surface and drive fit/zoom without a mouse.
    surface.focus()
    await userEvent.keyboard('0') // fit
    await userEvent.keyboard('+') // zoom in
    await userEvent.keyboard('-') // zoom out
    await userEvent.keyboard('{Escape}') // clear selection

    // Zoom controls exist and respond.
    await userEvent.click(canvas.getByRole('button', { name: /zoom in/i }))
    await userEvent.click(canvas.getByRole('button', { name: /fit to view/i }))
  },
}

/** Top-to-bottom flow, driven by the `direction` prop. */
export const Vertical: Story = {
  args: { direction: 'TB' },
}

/** Legend suppressed — the diagram fills the surface without the key panel. */
export const NoLegend: Story = {
  args: { legend: false },
}
