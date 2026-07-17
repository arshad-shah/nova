import React, { useEffect } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent } from 'storybook/test'
import type { Tab, QueryTab, TableTab, ErDiagramTab, ConnectionFormTab, PluginDetailTab } from '@shared/types'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionsStore } from '@/stores/connections'
import { Stack, Text } from '@/primitives'
import { TabBar } from './TabBar'

// ---------------------------------------------------------------------------
// Tab factories
// ---------------------------------------------------------------------------

function makeQueryTab(overrides: Partial<QueryTab> = {}): QueryTab {
  return {
    id: 'q1',
    type: 'query',
    title: 'SELECT * FROM users',
    connectionId: 'conn-1',
    schema: 'public',
    sql: 'SELECT * FROM users;',
    results: null,
    isExecuting: false,
    error: null,
    isDirty: false,
    ...overrides,
  }
}

function makeTableTab(overrides: Partial<TableTab> = {}): TableTab {
  return {
    id: 't1',
    type: 'table',
    title: 'users',
    connectionId: 'conn-1',
    tableName: 'users',
    schema: 'public',
    ...overrides,
  }
}

function makeErDiagramTab(overrides: Partial<ErDiagramTab> = {}): ErDiagramTab {
  return {
    id: 'er1',
    type: 'er-diagram',
    title: 'ER Diagram — public',
    connectionId: 'conn-1',
    schema: 'public',
    ...overrides,
  }
}

function makeConnectionFormTab(overrides: Partial<ConnectionFormTab> = {}): ConnectionFormTab {
  return {
    id: 'cf1',
    type: 'connection-form',
    title: 'New Connection',
    ...overrides,
  }
}

function makePluginDetailTab(overrides: Partial<PluginDetailTab> = {}): PluginDetailTab {
  return {
    id: 'pd1',
    type: 'plugin-detail',
    title: 'MongoDB Driver',
    pluginName: 'mongodb',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Store seeding helper
// ---------------------------------------------------------------------------

function seedStores(tabs: Tab[], activeTabId: string | null) {
  useTabsStore.setState({ tabs, activeTabId, recentlyClosed: [] })
  useConnectionsStore.setState({ activeConnectionId: 'conn-1' })
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: 'Components/Shell/TabBar',
  component: TabBar,
  decorators: [
    (Story: React.ComponentType) => (
      <div style={{ width: 900 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TabBar>

export default meta
type Story = StoryObj<typeof meta>

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Single active query tab — the default starting state. */
export const SingleTab: Story = {
  beforeEach: () => {
    const tab = makeQueryTab()
    seedStores([tab], tab.id)
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('SELECT * FROM users')).toBeInTheDocument()
    await expect(canvas.getByLabelText('New Query Tab')).toBeInTheDocument()
  },
}

/** Multiple tabs of mixed types with one active. */
export const MultipleTabs: Story = {
  beforeEach: () => {
    seedStores(
      [
        makeQueryTab({ id: 'q1', title: 'SELECT * FROM users' }),
        makeTableTab({ id: 't1', title: 'orders' }),
        makeErDiagramTab({ id: 'er1', title: 'ER Diagram — public' }),
        makeConnectionFormTab({ id: 'cf1', title: 'New Connection' }),
        makePluginDetailTab({ id: 'pd1', title: 'MongoDB Driver' }),
      ],
      't1',
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('SELECT * FROM users')).toBeInTheDocument()
    await expect(canvas.getByText('orders')).toBeInTheDocument()
    await expect(canvas.getByText('ER Diagram — public')).toBeInTheDocument()
    await expect(canvas.getByText('New Connection')).toBeInTheDocument()
    await expect(canvas.getByText('MongoDB Driver')).toBeInTheDocument()
  },
}

/** A dirty query tab shows the unsaved indicator dot. */
export const DirtyQueryTab: Story = {
  beforeEach: () => {
    seedStores(
      [
        makeQueryTab({ id: 'q1', title: 'Unsaved query', isDirty: true }),
        makeQueryTab({ id: 'q2', title: 'Saved query', isDirty: false }),
      ],
      'q1',
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Unsaved query')).toBeInTheDocument()
    await expect(canvas.getByText('Saved query')).toBeInTheDocument()
  },
}

/** No tabs open — empty bar with just the new-tab button. */
export const EmptyBar: Story = {
  beforeEach: () => {
    seedStores([], null)
  },
  play: async ({ canvas }) => {
    const newBtn = canvas.getByLabelText('New Query Tab')
    await expect(newBtn).toBeInTheDocument()
    await userEvent.click(newBtn)
    // After click, a new query tab should be added via the real store action
    const state = useTabsStore.getState()
    await expect(state.tabs.length).toBe(1)
    await expect(state.tabs[0].type).toBe('query')
  },
}

/** Many tabs to demonstrate overflow state. */
export const ManyTabs: Story = {
  beforeEach: () => {
    const tabs = Array.from({ length: 12 }, (_, i) =>
      makeQueryTab({
        id: `q${i}`,
        title: `Query ${i + 1} — ${['users', 'orders', 'products', 'analytics', 'sessions', 'payments', 'invoices', 'logs', 'events', 'metrics', 'reports', 'backups'][i]}`,
      }),
    )
    seedStores(tabs, 'q0')
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Query 1 — users')).toBeInTheDocument()
  },
}

/** Clicking a tab switches the active tab via the real store. */
export const TabActivation: Story = {
  beforeEach: () => {
    seedStores(
      [
        makeQueryTab({ id: 'q1', title: 'Tab One' }),
        makeTableTab({ id: 't1', title: 'Tab Two' }),
      ],
      'q1',
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText('Tab Two'))
    const state = useTabsStore.getState()
    await expect(state.activeTabId).toBe('t1')
  },
}

/** Clicking the close button removes the tab via the real store. */
export const TabClose: Story = {
  beforeEach: () => {
    const tab = makeQueryTab({ id: 'q1', title: 'Closable tab' })
    seedStores([tab], tab.id)
  },
  play: async ({ canvas }) => {
    const closeBtn = canvas.getByLabelText('Close tab')
    await userEvent.click(closeBtn)
    const state = useTabsStore.getState()
    await expect(state.tabs.length).toBe(0)
    await expect(state.recentlyClosed.length).toBe(1)
  },
}

/** All five tab types rendered together to verify icon and color mapping. */
export const AllTabTypes: Story = {
  beforeEach: () => {
    seedStores(
      [
        makeQueryTab({ id: 'q1', title: 'Query' }),
        makeTableTab({ id: 't1', title: 'Table' }),
        makeErDiagramTab({ id: 'er1', title: 'ER Diagram' }),
        makeConnectionFormTab({ id: 'cf1', title: 'Connection Form' }),
        makePluginDetailTab({ id: 'pd1', title: 'Plugin Detail' }),
      ],
      'q1',
    )
  },
}

// ---------------------------------------------------------------------------
// Density stories
// ---------------------------------------------------------------------------

/* Restores the previous density on unmount. Without the cleanup, whichever
   density story ran last leaks onto <html> and silently resizes every
   subsequent story in the suite. */
function withDensity(density: 'compact' | 'comfortable' | 'spacious') {
  return (Story: () => React.ReactElement) => {
    const root = document.documentElement
    const previous = root.getAttribute('data-density')
    useEffect(() => {
      root.setAttribute('data-density', density)
      return () => {
        if (previous === null) root.removeAttribute('data-density')
        else root.setAttribute('data-density', previous)
      }
    }, [previous])
    return <Story />
  }
}

const DENSITY_TABS: [Tab[], string] = [
  [
    makeQueryTab({ id: 'q1', title: 'SELECT * FROM users' }),
    makeTableTab({ id: 't1', title: 'orders' }),
    makeErDiagramTab({ id: 'er1', title: 'ER Diagram — public' }),
  ],
  'q1',
]

/** Bar/tab heights come from `--tab-*` density tokens on `[data-density]`. */
export const DensityCompact: Story = {
  decorators: [withDensity('compact')],
  beforeEach: () => {
    seedStores(...DENSITY_TABS)
  },
}

export const DensityComfortable: Story = {
  decorators: [withDensity('comfortable')],
  beforeEach: () => {
    seedStores(...DENSITY_TABS)
  },
}

export const DensitySpacious: Story = {
  decorators: [withDensity('spacious')],
  beforeEach: () => {
    seedStores(...DENSITY_TABS)
  },
}

// ---------------------------------------------------------------------------
// All-themes story
// ---------------------------------------------------------------------------

const THEMES = [
  'ion', 'nightshift', 'lab', 'inkpaper', 'dark', 'light',
  'midnight', 'dracula', 'nord', 'solarized', 'catppuccin',
] as const

/** The active tab has no gradient strip; its only cues are the workspace-
 *  coloured fill, the fillets and brighter text. Every bundled theme sets
 *  tab-bar-bg != tab-active-bg, so the signal survives — but the margin
 *  varies. Ink & Paper is the tightest pair (#FBF6EA vs #F2EBDE): if the
 *  active tab is going to disappear anywhere, it's there. */
export const AllThemes: Story = {
  beforeEach: () => {
    seedStores(
      [
        makeQueryTab({ id: 'q1', title: 'SELECT * FROM users' }),
        makeTableTab({ id: 't1', title: 'orders' }),
      ],
      'q1',
    )
  },
  render: () => (
    <Stack gap="md">
      {THEMES.map(theme => (
        // bg-bg-primary gives the label a themed backdrop instead of
        // inheriting the ambient (unrelated) page background — without it
        // axe measures the label's contrast against whatever theme
        // Storybook's own chrome happens to be in, not this row's theme.
        <div key={theme} data-theme={theme} className="bg-bg-primary p-2 rounded">
          <Text size="xs" color="secondary" className="mb-1">{theme}</Text>
          <TabBar />
        </div>
      ))}
    </Stack>
  ),
  play: async ({ canvas }) => {
    // Programmatic sanity check, not a substitute for visual review: the
    // active tab's computed background must differ from the bar's, on every
    // theme. This proves the two fills are distinguishable colors — it does
    // NOT prove the contrast is comfortable to the human eye (that needs a
    // human looking at the Ink & Paper row, the tightest pair).
    const tabs = canvas.getAllByRole('tab', { selected: true })
    await expect(tabs.length).toBe(THEMES.length)
    for (const tab of tabs) {
      // The tablist itself is unstyled; `bg-tab-bar-bg` lives on its parent,
      // the bar container rendered by TabBar.
      const bar = tab.closest('[role="tablist"]')?.parentElement
      if (!bar) continue
      const tabBg = getComputedStyle(tab).backgroundColor
      const barBg = getComputedStyle(bar).backgroundColor
      await expect(tabBg).not.toBe(barBg)
    }
  },
}

// ---------------------------------------------------------------------------
// Keyboard navigation story
// ---------------------------------------------------------------------------

/** The only end-to-end coverage of the roving-tabindex keyboard contract:
 *  manual activation — arrows move focus, Enter/Space activates. Every other
 *  keyboard assertion in this codebase is a pure-reducer unit test against
 *  `nextFocusIndex`/`resolveRovingId`; this play function is the gate on the
 *  wired-up DOM behaviour. */
export const KeyboardNavigation: Story = {
  beforeEach: () => {
    seedStores(
      [
        makeQueryTab({ id: 'q1', title: 'Tab One' }),
        makeTableTab({ id: 't1', title: 'Tab Two' }),
        makeErDiagramTab({ id: 'er1', title: 'Tab Three' }),
      ],
      'q1',
    )
  },
  play: async ({ canvas, step }) => {
    const tabs = canvas.getAllByRole('tab')

    await step('the strip is a single tab stop, landing on the active tab', async () => {
      await userEvent.tab()
      const active = tabs.find(t => t.getAttribute('aria-selected') === 'true')
      await expect(active).toHaveFocus()
      await expect(active?.id).toBe('tab-q1')
    })

    await step('ArrowRight moves focus without changing selection', async () => {
      await userEvent.keyboard('{ArrowRight}')
      await expect(tabs[1]).toHaveFocus()
      // The contract: focus moved to Tab Two, but Tab One is still selected.
      await expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
      await expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
      await expect(useTabsStore.getState().activeTabId).toBe('q1')
    })

    await step('Enter activates the focused tab', async () => {
      await userEvent.keyboard('{Enter}')
      await expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
      await expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
      await expect(useTabsStore.getState().activeTabId).toBe('t1')
    })
  },
}
