/** Theme identifiers are now contributed by the bundled `core-themes` plugin
 * (and any third-party plugin that registers more). The list lives in the
 * theme registry; this type stays a permissive string so settings can hold
 * any registered theme id without coupling the type system to the bundled
 * set. The renderer's `useTheme()` hook returns the live list. */
export type Theme = string

/** The two theme ids the app can always fall back to, regardless of what a
 *  plugin has (un)registered: `DARK` is 'ion', the Verql brand theme baked
 *  into the app shell as a non-plugin baseline (`stores/themes.ts`'s
 *  `BASELINE_ION`); `LIGHT` is 'lab', the `core-themes` plugin's light-mode
 *  default. Centralised so the default settings below, the renderer's
 *  resolve-fallback logic (`ThemeProvider`), and Monaco's theme fallback
 *  (`lib/monaco-themes.ts`) can't drift from each other. */
export const DEFAULT_THEME_ID = {
  DARK: 'ion',
  LIGHT: 'lab',
} as const

export interface GeneralSettings {
  /** UI language (BCP-47 / locale id). 'en' is the in-bundle default. */
  language: string
  queryTimeout: number
  maxHistoryItems: number
  defaultPageSize: number
  /** Ask before closing a tab with unsaved changes. */
  confirmOnUnsavedClose: boolean
  /** Re-open the tabs that were active when the app last quit. */
  restoreTabsOnStartup: boolean
  /** Show a confirmation dialog before running DELETE/DROP/TRUNCATE/UPDATE without WHERE. */
  confirmDestructiveQueries: boolean
}

export type AppearanceMode = 'light' | 'dark' | 'system'

export interface AppearanceSettings {
  /** Theme id the user has explicitly picked. When `appearanceMode` is
   *  `system`, the resolved theme is `lightTheme` or `darkTheme` based on
   *  `prefers-color-scheme` and this field is ignored. */
  theme: Theme
  /** Controls how the active theme is resolved:
   *  - `light` → always render `lightTheme`
   *  - `dark`  → always render `darkTheme`
   *  - `system` → follow the OS color scheme, flipping between the two */
  appearanceMode: AppearanceMode
  /** Preferred theme id when the resolved mode is light. */
  lightTheme: Theme
  /** Preferred theme id when the resolved mode is dark. */
  darkTheme: Theme
  uiDensity: 'compact' | 'comfortable' | 'spacious'
  sidebarPosition: 'left' | 'right'
  accentColor: string
  sidebarWidth: number
  /** Show the status bar at the bottom of the window. */
  showStatusBar: boolean
  /** Use animated transitions for menus, dropdowns, banners. */
  animations: boolean
  /** Show the secondary (right) sidebar. Persisted across sessions. */
  showSecondarySidebar: boolean
  /** Width of the secondary (right) sidebar in pixels. Clamped 220..640. */
  secondarySidebarWidth: number
  /** Show the bottom dock. Persisted across sessions. */
  showBottomDock: boolean
  /** Height of the bottom dock in pixels. Clamped 120..640. */
  bottomDockHeight: number
  /** Height of the Activity panel's detail drawer in pixels. Clamped 120..640,
   *  and further capped at render so the stream keeps at least ~120px. */
  activityDetailHeight: number
}

export interface EditorSettings {
  fontSize: number
  fontFamily: string
  tabSize: number
  wordWrap: boolean
  minimap: boolean
  lineNumbers: boolean
  bracketMatching: boolean
  cursorStyle: 'line' | 'block' | 'underline'
  ligatures: boolean
  /** Allow the cursor to move past the end of the file. */
  scrollPastEnd: boolean
  /** Render the cursor with subtle smoothing animation. */
  smoothCursor: boolean
  /** Auto-close brackets/quotes when typing the opening character. */
  autoClosingBrackets: boolean
  /** Highlight the current line. */
  highlightActiveLine: boolean
}

export interface DataDisplaySettings {
  nullDisplay: string
  dateFormat: 'iso' | 'locale' | 'custom'
  /** Token pattern used when `dateFormat` is `custom` (e.g. `yyyy-MM-dd HH:mm:ss`). */
  customDateFormat: string
  numberFormat: 'raw' | 'locale'
  maxColumnWidth: number
  /** How to render booleans in result grids. */
  booleanDisplay: 'true_false' | 'one_zero' | 'yes_no' | 'checkmark'
  /** Truncate text cells to this many characters; full value in tooltip. */
  truncateTextAt: number
}

/** Central registry of built-in keybinding action ids — the single source of
 *  truth shared by the defaults below, the App-level shortcut dispatch, and the
 *  Monaco editor's action bindings. Plugin commands use composite ids
 *  (`pluginId:commandId`) and are not listed here. */
export const KEYBINDING_ACTION = {
  EXECUTE_QUERY: 'execute-query',
  SAVE_QUERY: 'save-query',
  NEW_TAB: 'new-tab',
  CLOSE_TAB: 'close-tab',
  TOGGLE_SIDEBAR: 'toggle-sidebar',
  COMMAND_PALETTE: 'command-palette',
  FOCUS_EDITOR: 'focus-editor',
  TOGGLE_SECONDARY_SIDEBAR: 'toggle-secondary-sidebar',
  TOGGLE_BOTTOM_DOCK: 'toggle-bottom-dock',
  /** Editor-only (no default user binding row); referenced by QueryEditor. */
  AI_INLINE_TRIGGER: 'ai-inline-trigger',
} as const

export type KeybindingActionId = (typeof KEYBINDING_ACTION)[keyof typeof KEYBINDING_ACTION]

export interface KeyBinding {
  id: string
  label: string
  keys: string[]
  category: string
}

export interface AISettings {
  openaiKey: string
  anthropicKey: string
  ollamaEndpoint: string
  activeProvider: string
  activeModel: string
}

/** First-run onboarding + release-awareness state. Drives the Welcome tab on a
 *  fresh install and the version-named "What's New" tab after an update. Not a
 *  user-facing settings category — there is no UI under Settings for these; they
 *  are written by the app (boot logic + the Welcome checklist). */
export interface OnboardingSettings {
  /** Version whose release notes the user has already seen. Empty string means
   *  a fresh install (no version has ever been recorded), which is the signal
   *  to open the Welcome tab rather than a release-notes tab. */
  lastSeenVersion: string
  /** Ids of Get-Started checklist steps the user has manually marked done.
   *  Steps can also be auto-satisfied (e.g. once a connection exists); the
   *  Welcome view treats a step as complete if either is true. */
  completedSteps: string[]
  /** When true, the Welcome tab is not auto-opened on launch (the user opted
   *  out via the "Show welcome on startup" toggle). It can still be reopened
   *  from Help → Welcome or the command palette. */
  hideOnStartup: boolean
}

export interface MCPSettings {
  enabled: boolean
  port: number
  token: string
  /** When the preferred port is busy, bind the next free port instead of failing. */
  autoPort: boolean
  /** Hide write-permission tools from MCP clients entirely. */
  readOnly: boolean
  /** Row cap applied to the query tool's returned rows. */
  maxRows: number
  /** Tool ids the user has disabled (not exposed to MCP clients). */
  disabledTools: string[]
}

export interface AppSettings {
  general: GeneralSettings
  appearance: AppearanceSettings
  editor: EditorSettings
  dataDisplay: DataDisplaySettings
  ai: AISettings
  mcp: MCPSettings
  onboarding: OnboardingSettings
  keybindings: KeyBinding[]
  plugins: Record<string, Record<string, unknown>>
  /** Names of plugins the user has explicitly deactivated. Persisted so the
   *  choice survives app restarts — without this, every boot re-activates
   *  every resolved plugin. */
  disabledPlugins: string[]
  /** Per-plugin permission grants the user has approved, keyed by plugin name.
   *  Values are `PluginPermission` ids (typed as strings here to keep `shared/`
   *  decoupled from the main-process SDK). Persisted so granted capabilities
   *  survive restarts. */
  pluginGrants: Record<string, string[]>
}

export const defaultSettings: AppSettings = {
  general: {
    language: 'en',
    queryTimeout: 30,
    maxHistoryItems: 200,
    defaultPageSize: 100,
    confirmOnUnsavedClose: true,
    restoreTabsOnStartup: true,
    confirmDestructiveQueries: true,
  },
  appearance: {
    theme: DEFAULT_THEME_ID.DARK,
    appearanceMode: 'dark',
    lightTheme: DEFAULT_THEME_ID.LIGHT,
    darkTheme: DEFAULT_THEME_ID.DARK,
    uiDensity: 'comfortable',
    sidebarPosition: 'left',
    // Empty means "follow the theme's accent". Setting any non-empty value
    // overrides the theme accent app-wide (and is preserved across theme
    // switches — user opt-in customisation).
    accentColor: '',
    sidebarWidth: 240,
    showStatusBar: true,
    animations: true,
    showSecondarySidebar: false,
    secondarySidebarWidth: 320,
    showBottomDock: true,
    bottomDockHeight: 240,
    activityDetailHeight: 220,
  },
  editor: {
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
    tabSize: 2,
    wordWrap: true,
    minimap: false,
    lineNumbers: true,
    bracketMatching: true,
    cursorStyle: 'line',
    ligatures: true,
    scrollPastEnd: false,
    smoothCursor: false,
    autoClosingBrackets: true,
    highlightActiveLine: true,
  },
  dataDisplay: {
    nullDisplay: 'NULL',
    dateFormat: 'iso',
    customDateFormat: 'yyyy-MM-dd HH:mm:ss',
    numberFormat: 'raw',
    maxColumnWidth: 300,
    booleanDisplay: 'true_false',
    truncateTextAt: 200,
  },
  ai: {
    openaiKey: '',
    anthropicKey: '',
    ollamaEndpoint: 'http://localhost:11434',
    activeProvider: 'ollama',
    activeModel: '',
  },
  mcp: {
    enabled: false,
    port: 3100,
    token: '',
    autoPort: true,
    readOnly: false,
    maxRows: 500,
    disabledTools: [],
  },
  onboarding: {
    lastSeenVersion: '',
    completedSteps: [],
    hideOnStartup: false,
  },
  keybindings: [
    { id: KEYBINDING_ACTION.EXECUTE_QUERY, label: 'Execute Query', keys: ['Ctrl+Enter', 'Cmd+Enter'], category: 'Query Execution' },
    { id: KEYBINDING_ACTION.NEW_TAB, label: 'New Tab', keys: ['Ctrl+T', 'Cmd+T'], category: 'Navigation' },
    { id: KEYBINDING_ACTION.CLOSE_TAB, label: 'Close Tab', keys: ['Ctrl+W', 'Cmd+W'], category: 'Navigation' },
    { id: KEYBINDING_ACTION.TOGGLE_SIDEBAR, label: 'Toggle Sidebar', keys: ['Ctrl+B', 'Cmd+B'], category: 'Panels' },
    { id: KEYBINDING_ACTION.COMMAND_PALETTE, label: 'Command Palette', keys: ['Ctrl+Shift+P', 'Cmd+Shift+P'], category: 'Navigation' },
    { id: KEYBINDING_ACTION.FOCUS_EDITOR, label: 'Focus Editor', keys: ['Ctrl+1', 'Cmd+1'], category: 'Editor' },
    { id: KEYBINDING_ACTION.SAVE_QUERY, label: 'Save Query', keys: ['Ctrl+S', 'Cmd+S'], category: 'Query Execution' },
    { id: KEYBINDING_ACTION.TOGGLE_SECONDARY_SIDEBAR, label: 'Toggle Secondary Sidebar', keys: ['Ctrl+Alt+B', 'Cmd+Alt+B'], category: 'Panels' },
    { id: KEYBINDING_ACTION.TOGGLE_BOTTOM_DOCK, label: 'Toggle Bottom Dock', keys: ['Ctrl+J', 'Cmd+J'], category: 'Panels' },
  ],
  plugins: {},
  disabledPlugins: [],
  pluginGrants: {},
}

/** Accent values that were the *default* (not user-chosen) in past versions.
 * Cleared on load so users who never customised the accent stop being stuck
 * with the legacy purple after we changed the default. */
const LEGACY_DEFAULT_ACCENTS = new Set([
  '#7c6ff7', // pre-Nightshift purple default
  '#2bd9a3', // 0.4.0 mint shipped briefly before the default went empty
])

/** Deep merge user settings with defaults so new keys get defaults automatically */
export function mergeWithDefaults(persisted: Partial<AppSettings>): AppSettings {
  const result = { ...defaultSettings }
  for (const key of Object.keys(defaultSettings) as (keyof AppSettings)[]) {
    if (
      key === 'keybindings' ||
      key === 'plugins' ||
      key === 'disabledPlugins' ||
      key === 'pluginGrants'
    ) {
      if (persisted[key] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(result as any)[key] = persisted[key]
      }
    } else if (persisted[key] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(result as any)[key] = { ...(defaultSettings as any)[key], ...(persisted as any)[key] }
    }
  }
  // Migration: clear a previously-default accent so theme accent takes over.
  if (
    result.appearance.accentColor &&
    LEGACY_DEFAULT_ACCENTS.has(result.appearance.accentColor.toLowerCase())
  ) {
    result.appearance.accentColor = ''
  }
  return result
}

/** `ConfigStore.getSetting`/`setSetting` (`main/config/store.ts`) take an
 *  arbitrary dotted key-path, so most call sites are one-off literals that
 *  don't warrant a constant. These key-paths are read/written from more
 *  than one file, though, so they're centralised here — a rename on one side
 *  would otherwise silently stop reading/writing the other. */
export const CONFIG_KEY = {
  APPEARANCE_THEME: 'appearance.theme',
  APPEARANCE_SIDEBAR_WIDTH: 'appearance.sidebarWidth',
  MCP_ENABLED: 'mcp.enabled',
  MCP_READ_ONLY: 'mcp.readOnly',
  MCP_DISABLED_TOOLS: 'mcp.disabledTools',
  MCP_TOKEN: 'mcp.token',
  KEYBINDINGS: 'keybindings',
} as const
