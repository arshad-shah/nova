import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, fireEvent } from 'storybook/test'
import { Button } from '@/primitives'
import { useSettingsStore } from '@/stores/settings'
import { ActivityList } from './ActivityList'
import type { ActivityEntry } from '@shared/activity'

const now = Date.now()

// Covers each level, each kind tone (data / agent / muted), a very long title,
// an entry with no source and no duration, and a range of durations so the
// duration bar (and its p95 warning tone) has something to scale.
const SAMPLE: ActivityEntry[] = [
  { id: '1', ts: now - 300, kind: 'query', level: 'success', title: '42 row(s) · 12ms', detail: 'SELECT * FROM users WHERE active = true', source: 'Prod', durationMs: 12 },
  { id: '2', ts: now - 900, kind: 'query', level: 'error', title: 'Query failed', detail: 'SELECT * FROM nope\n\nrelation "nope" does not exist', source: 'Prod' },
  { id: '3', ts: now - 1500, kind: 'connection', level: 'success', title: 'Connected to Prod', source: 'prod-1', durationMs: 88 },
  { id: '4', ts: now - 2100, kind: 'tool-call', level: 'success', title: 'list_tables · 8ms', detail: '{}', source: 'list_tables', durationMs: 8 },
  { id: '5', ts: now - 2800, kind: 'plugin', level: 'info', title: 'Activated mongodb', source: 'app:plugins', durationMs: 140 },
  { id: '6', ts: now - 3500, kind: 'network', level: 'info', title: 'POST anthropic.com/v1/messages · 200', source: 'api.anthropic.com', durationMs: 1200 },
  { id: '7', ts: now - 4200, kind: 'ipc', level: 'debug', title: 'db:query · 3ms', source: 'db:query', durationMs: 3 },
  { id: '8', ts: now - 5000, kind: 'store', level: 'debug', title: 'tabs: activeTabId', source: 'tabs' },
  { id: '9', ts: now - 6000, kind: 'perf', level: 'warn', title: 'Long task 213ms', durationMs: 213 },
  { id: '10', ts: now - 7000, kind: 'notification', level: 'warn', title: 'Schema cache is stale' },
  { id: '11', ts: now - 8200, kind: 'log', level: 'error', title: 'Auto-start failed', detail: 'Error: port 7337 already in use', source: 'app:mcp' },
  { id: '12', ts: now - 9000, kind: 'log', level: 'debug', title: 'Resolved 9 bundled plugins', detail: 'sqlite, postgresql, mysql, db-tools, ai, core-formats, core-themes, ssh-tunnel, os-notifications', source: 'app:plugins' },
  // No source and no duration — the meta line must stay tidy.
  { id: '13', ts: now - 10000, kind: 'log', level: 'info', title: 'Ready' },
  // A very long title that must wrap (narrow) / ellipse (wide) without shoving
  // the timestamp, kind or duration off the row.
  { id: '14', ts: now - 11000, kind: 'query', level: 'success', title: 'SELECT very_long_column_name_one, very_long_column_name_two, very_long_column_name_three FROM analytics.events_2026_partitioned WHERE created_at BETWEEN $1 AND $2 ORDER BY created_at DESC LIMIT 500', source: 'Analytics', durationMs: 640 },
]

function Harness({ entries, width }: { entries: ActivityEntry[]; width: number }) {
  return (
    <div style={{ height: 480, width }} className="border border-border bg-bg-secondary">
      <ActivityList entries={entries} onClear={() => {}} />
    </div>
  )
}

const meta: Meta<typeof Harness> = {
  title: 'Shell/ActivityList',
  component: Harness,
  parameters: { layout: 'centered' },
  args: { entries: SAMPLE, width: 340 },
}
export default meta

type Story = StoryObj<typeof Harness>

export const Default: Story = {}
/** The minimum panel width — the row is two-line (message wraps, meta beneath). */
export const Narrow: Story = { args: { width: 280 } }
/** A wide panel — the row collapses to one line and drops the duration bar. */
export const Wide: Story = { args: { width: 560 } }
export const Empty: Story = { args: { entries: [] } }

// Traced entries forming three shapes: a clean group, a group whose child
// errored (parent still succeeded), and a group with a single child. Plus a
// bare untraced row between them.
const GROUPED: ActivityEntry[] = [
  { id: 'g1-ipc', ts: now - 5000, kind: 'ipc', level: 'debug', title: 'db:query · 2ms', source: 'db:query', durationMs: 2, traceId: 'trace-clean' },
  { id: 'g1-q', ts: now - 4998, kind: 'query', level: 'success', title: '128 row(s) · 40ms', detail: 'SELECT * FROM orders', source: 'Prod', durationMs: 40, traceId: 'trace-clean' },
  { id: 'g1-perf', ts: now - 4990, kind: 'perf', level: 'info', title: 'render 6ms', durationMs: 6, traceId: 'trace-clean' },
  { id: 'bare1', ts: now - 4000, kind: 'connection', level: 'success', title: 'Connected to Prod', source: 'prod-1' },
  { id: 'g2-ipc', ts: now - 3000, kind: 'ipc', level: 'debug', title: 'ai:tool · 5ms', source: 'perform_app_action', durationMs: 5, traceId: 'trace-failing' },
  { id: 'g2-tool', ts: now - 2995, kind: 'tool-call', level: 'success', title: 'query · 210ms', source: 'query', durationMs: 210, traceId: 'trace-failing' },
  { id: 'g2-net', ts: now - 2900, kind: 'network', level: 'error', title: 'POST provider failed', detail: 'Error: request timed out', source: 'api.example.com', durationMs: 120, traceId: 'trace-failing' },
  { id: 'g3-conn', ts: now - 1500, kind: 'connection', level: 'success', title: 'Connect Analytics', source: 'analytics', durationMs: 88, traceId: 'trace-two' },
  { id: 'g3-ipc', ts: now - 1495, kind: 'ipc', level: 'debug', title: 'db:connect · 90ms', source: 'db:connect', durationMs: 90, traceId: 'trace-two' },
]

/** Sets the persisted grouping flag for a story, then renders the panel. */
function GroupedHarness({ entries, grouping }: { entries: ActivityEntry[]; grouping: boolean }) {
  useEffect(() => {
    useSettingsStore.getState().set('appearance.activityGrouping', grouping)
  }, [grouping])
  const active = useSettingsStore((s) => s.settings.appearance.activityGrouping)
  return (
    <div style={{ height: 480, width: 340 }} className="border border-border bg-bg-secondary">
      {/* Wait for the flag to settle so the story shows the intended mode. */}
      {active === grouping && <ActivityList entries={entries} onClear={() => {}} />}
    </div>
  )
}

/** Three trace shapes: a clean group, a group whose child errored (its rail
 *  rolls up to error though the parent succeeded), and a one-child group. */
export const Grouped: StoryObj<typeof GroupedHarness> = {
  render: () => <GroupedHarness entries={GROUPED} grouping />,
}

/** The same entries with grouping off — flat chronological order, one toggle away. */
export const GroupingOff: StoryObj<typeof GroupedHarness> = {
  render: () => <GroupedHarness entries={GROUPED} grouping={false} />,
}

/** Typing a filter narrows the stream to matching entries as a removable token;
 *  removing the token restores the full stream. */
export const FilterInteraction: Story = {
  play: async ({ canvas }) => {
    const field = canvas.getByRole('textbox')
    await userEvent.type(field, 'kind:connection{Enter}')
    // Only the connection entry survives; the query rows are gone.
    await expect(canvas.getByText('Connected to Prod')).toBeInTheDocument()
    await expect(canvas.queryByText('42 row(s) · 12ms')).not.toBeInTheDocument()

    // Removing the token restores the full stream.
    await userEvent.click(canvas.getByRole('button', { name: 'Remove filter' }))
    await expect(canvas.getByText('42 row(s) · 12ms')).toBeInTheDocument()
  },
}

/** Selecting a row opens the pinned drawer without scrolling the stream, and
 *  Escape closes it. */
export const DrawerInteraction: Story = {
  play: async ({ canvas }) => {
    const list = canvas.getByRole('listbox')
    // Detach from the tail and settle at the top so the scroll position is
    // stable (the stream auto-scrolls to the newest entry while pinned).
    list.scrollTop = 0
    fireEvent.scroll(list)
    const before = list.scrollTop

    const rows = canvas.getAllByRole('option')
    await userEvent.click(rows[0])
    await expect(await canvas.findByRole('region', { name: 'Entry detail' })).toBeInTheDocument()
    // Selecting a row must not scroll the stream.
    await expect(list.scrollTop).toBe(before)

    // Focus lands in the drawer on open; Escape closes it.
    await userEvent.keyboard('{Escape}')
    await expect(canvas.queryByRole('region', { name: 'Entry detail' })).not.toBeInTheDocument()
  },
}

// A harness that appends live entries on demand, to exercise the tail pill.
function TailHarness({ entries }: { entries: ActivityEntry[] }) {
  const [items, setItems] = useState(entries)
  const emit = () =>
    setItems((prev) => [
      { id: `live-${prev.length}`, ts: now + prev.length, kind: 'log', level: 'info', title: `Live entry ${prev.length}` },
      ...prev,
    ])
  // Deliberately short so the sample always overflows and can be scrolled up.
  return (
    <div style={{ height: 300, width: 340 }} className="flex flex-col border border-border bg-bg-secondary">
      <Button size="sm" onClick={emit} className="m-1 shrink-0">Emit</Button>
      <div className="min-h-0 flex-1">
        <ActivityList entries={items} onClear={() => {}} />
      </div>
    </div>
  )
}

/** Scrolling up detaches the tail; entries that arrive while detached surface a
 *  "N new" pill that re-pins and clears on click. */
export const TailInteraction: StoryObj<typeof TailHarness> = {
  render: () => <TailHarness entries={SAMPLE} />,
  play: async ({ canvas }) => {
    const list = canvas.getByRole('listbox')
    // Detach by scrolling up.
    list.scrollTop = 0
    fireEvent.scroll(list)

    // Emit two entries while detached.
    const emit = canvas.getByRole('button', { name: 'Emit' })
    await userEvent.click(emit)
    await userEvent.click(emit)

    // The pill appears with the arrival count (its accessible name is the text).
    const pill = await canvas.findByRole('button', { name: /2 new entries/ })
    await expect(pill).toBeInTheDocument()

    // Clicking it re-pins and clears the pill.
    await userEvent.click(pill)
    await expect(canvas.queryByRole('button', { name: /new entries/ })).not.toBeInTheDocument()
  },
}
