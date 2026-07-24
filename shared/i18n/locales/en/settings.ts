export const settings = {
  general: {
    blurb: 'Basic application settings',
    queryTimeout: {
      label: 'Query Timeout',
      description: 'Maximum time in seconds before a query is cancelled',
    },
    maxHistoryItems: {
      label: 'Max History Items',
      description: 'Number of recent queries to keep in history',
    },
    defaultPageSize: {
      label: 'Default Page Size',
      description: 'Number of rows to fetch per page when browsing tables',
    },
    maxViewDataRows: {
      label: 'Max Rows to View',
      description: 'How many rows to load at a time when viewing a table’s data. A large table loads in pages instead of all at once.',
    },
    confirmDestructive: {
      label: 'Confirm destructive queries',
      description:
        'Show a confirmation dialog before running DELETE, DROP, TRUNCATE, or UPDATE without WHERE',
    },
    confirmUnsavedClose: {
      label: 'Confirm on unsaved close',
      description: 'Ask before closing a tab that has unsaved changes',
    },
    restoreTabs: {
      label: 'Restore tabs on startup',
      description: 'Re-open the tabs that were active when the app last quit',
    },
  },

  // Category nav labels (lib/settings-categories.ts).
  nav: {
    general: 'General',
    appearance: 'Appearance',
    editor: 'Editor',
    connections: 'Connections',
    'data-display': 'Data Display',
    keybindings: 'Keybindings',
    ai: 'AI',
    mcp: 'MCP Server',
    plugins: 'Plugins',
  },

  // Shared chrome around the settings surface (SettingsLayout).
  layout: {
    fallbackTitle: 'Settings',
    searchPlaceholder: 'Search settings',
    clearSearch: 'Clear search',
    categories: 'Categories',
    matches: 'Matches ({count})',
    autoSaveHint: 'Changes save automatically',
    sectionLabel: '{label} settings',
    autoSaveToastTitle: 'Auto-saved',
    autoSaveToastMessage: 'Settings apply immediately — no save required.',
  },

  // Updates (UpdatesSection).
  updates: {
    label: 'Updates',
    description: 'Managed via {manager}. Current version: {version}',
    checking: 'Checking…',
    checkForUpdates: 'Check for updates',
    installUpdate: 'Install update',
    restartToApply: 'Restart to apply',
  },

  // Plugin-contributed settings rows (PluginContributedSettings).
  contributed: {
    from: 'From {plugin}',
  },

  appearance: {
    blurb: 'Customize how verql looks and feels',
    colorMode: {
      label: 'Color Mode',
      description: 'Light, dark, or follow the operating system',
    },
    mode: {
      light: 'Light',
      dark: 'Dark',
      system: 'System',
    },
    systemHint:
      'Following the OS — picking a theme below pins it as your preference for that side.',
    darkThemes: 'Dark themes',
    lightThemes: 'Light themes',
    themeMissingRequired:
      'This theme is missing required tokens — selecting it would break the UI. Missing: {tokens}',
    themeMissingRecommended: 'Missing recommended tokens: {tokens}',
    uiDensity: {
      label: 'UI Density',
      description: 'Controls spacing and padding across the interface',
      compact: 'Compact',
      comfortable: 'Comfortable',
      spacious: 'Spacious',
    },
    sidebarPosition: {
      label: 'Sidebar Position',
      description: 'Place the sidebar on the left or right side',
      left: 'Left',
      right: 'Right',
    },
    accentColor: {
      label: 'Accent Color',
      descriptionCustom: 'Custom accent overriding the theme default',
      descriptionDefault: 'Follows the theme — pick a colour to override',
      useThemeDefault: 'Use theme default',
    },
    showStatusBar: {
      label: 'Show status bar',
      description: 'Display the status bar at the bottom of the window',
    },
    showSecondarySidebar: {
      label: 'Show secondary sidebar',
      description: 'Show the right (secondary) sidebar by default',
    },
    showBottomDock: {
      label: 'Show bottom dock',
      description: "Show the bottom dock by default when there's content to display",
    },
    animations: {
      label: 'Animations',
      description: 'Animate menus, dropdowns, and transitions',
    },
  },

  editor: {
    blurb: 'Configure the SQL editor',
    fontSize: {
      label: 'Font Size',
      description: 'Editor font size in pixels',
    },
    fontFamily: {
      label: 'Font Family',
      description: 'Font used in the editor',
      jetBrainsMono: 'JetBrains Mono',
      sfMono: 'SF Mono',
      firaCode: 'Fira Code',
      cascadiaCode: 'Cascadia Code',
      systemMonospace: 'System Monospace',
    },
    tabSize: {
      label: 'Tab Size',
      description: 'Number of spaces per tab',
      two: '2 spaces',
      four: '4 spaces',
    },
    cursorStyle: {
      label: 'Cursor Style',
      description: 'Shape of the editor cursor',
      line: 'Line',
      block: 'Block',
      underline: 'Underline',
    },
    wordWrap: {
      label: 'Word Wrap',
      description: 'Wrap long lines in the editor',
    },
    minimap: {
      label: 'Minimap',
      description: 'Show code minimap on the right side',
    },
    lineNumbers: {
      label: 'Line Numbers',
      description: 'Show line numbers in the gutter',
    },
    bracketMatching: {
      label: 'Bracket Matching',
      description: 'Highlight matching brackets',
    },
    ligatures: {
      label: 'Ligatures',
      description: 'Enable font ligatures',
    },
    highlightActiveLine: {
      label: 'Highlight active line',
      description: 'Tint the row the cursor is on',
    },
    autoClosingBrackets: {
      label: 'Auto-close brackets',
      description: 'Automatically insert the matching bracket or quote',
    },
    smoothCursor: {
      label: 'Smooth cursor',
      description: 'Animate cursor movement',
    },
    scrollPastEnd: {
      label: 'Scroll past end',
      description: 'Allow scrolling beyond the last line',
    },
  },

  dataDisplay: {
    blurb: 'How query results and table data are displayed',
    nullDisplay: {
      label: 'Null Display',
      description: 'Text shown for NULL values in results',
    },
    dateFormat: {
      label: 'Date Format',
      description: 'How date values are formatted',
      iso: 'ISO 8601',
      locale: 'Locale',
      custom: 'Custom',
    },
    customDatePattern: {
      label: 'Custom Date Pattern',
      description: 'Tokens: yyyy MM dd HH mm ss SSS — e.g. yyyy-MM-dd HH:mm:ss',
    },
    booleanDisplay: {
      label: 'Boolean Display',
      description: 'How boolean values are rendered in results',
      trueFalse: 'true / false',
      oneZero: '1 / 0',
      yesNo: 'Yes / No',
      checkmark: '✓ / ✗',
    },
    numberFormat: {
      label: 'Number Format',
      description: 'How numeric values are formatted',
      raw: 'Raw',
      locale: 'Locale',
    },
    maxColumnWidth: {
      label: 'Max Column Width',
      description: 'Maximum width in pixels for result columns',
    },
    truncateTextAt: {
      label: 'Truncate Text At',
      description:
        'Trim long text cells to this many characters; the full value shows in a tooltip. 0 disables.',
    },
  },

  connections: {
    blurb:
      'Connection options are owned by the database driver plugins. Per-driver settings (SSL, ports, driver-specific options) live with the driver and only show here while that plugin is active. Configure SSL and similar options per connection in the connection form.',
  },

  keybindings: {
    blurb:
      'Customise shortcuts for built-in actions. Click the pencil and press a key combination (with Cmd/Ctrl) to rebind. Plugin shortcuts are owned by their plugin and shown for reference.',
    searchPlaceholder: 'Search keybindings...',
    columnAction: 'Action',
    columnShortcut: 'Shortcut',
    columnEdit: 'Edit',
    pressShortcut: 'Press shortcut… (Esc to cancel)',
    rebind: 'Rebind',
    rebindAria: 'Rebind {label}',
    resetToDefault: 'Reset to default',
    resetAria: 'Reset {label}',
    resetAll: 'Reset all to defaults',
  },

  ai: {
    blurb: 'Provider credentials and endpoints for AI Assistant',
    openaiKey: {
      label: 'OpenAI API Key',
      description: 'Stored encrypted in the OS keyring. Used when the active provider is OpenAI.',
    },
    anthropicKey: {
      label: 'Anthropic API Key',
      description:
        'Stored encrypted in the OS keyring. Used when the active provider is Anthropic.',
    },
    apiKeyInputAria: '{label} input',
    apiKeySavedPlaceholder: '••••••••  (saved)',
    replace: 'Replace',
    clear: 'Clear',
    ollamaEndpoint: {
      label: 'Ollama Endpoint',
      description: 'Base URL for local Ollama API',
      aria: 'Ollama endpoint',
    },
  },

  mcp: {
    blurb: 'Expose your active database connection to external AI tools like Claude Code',
    serverStatus: {
      label: 'Server Status',
      running:
        'Running on port {port} · {clients, plural, one {# client} other {# clients}} connected',
      stopped: 'Server is stopped',
    },
    working: 'Working...',
    stopServer: 'Stop Server',
    startServer: 'Start Server',
    autoSelectedPort: 'Requested port {requested} was busy — using {actual}.',
    portInUse: 'Port {port} is already in use. Enable auto-port or pick another.',
    startFailed: 'Failed to start MCP server',
    port: {
      label: 'Port',
      description: 'Preferred HTTP port for the MCP server',
      aria: 'MCP server port',
    },
    autoPort: {
      label: 'Auto-resolve port',
      description: 'If the preferred port is busy, bind the next free port',
    },
    readOnly: {
      label: 'Read-only mode',
      description: 'Hide write tools from MCP clients entirely',
    },
    maxRows: {
      label: 'Max rows',
      description: 'Row cap returned by the query tool',
      aria: 'Max rows',
    },
    toolsHeading: 'Tools exposed to MCP clients',
    enableTool: 'Enable {tool}',
    authToken: {
      label: 'Auth Token',
      description: 'Bearer token for authenticating MCP clients',
      placeholder: 'Start server to generate',
      aria: 'MCP auth token',
      regenerate: 'Regenerate token',
    },
    claudeConfig: {
      label: 'Claude Code Config',
      description: 'Copy this to ~/.claude.json to connect Claude Code',
      copy: 'Copy Config',
    },
    tokenPlaceholderConfig: '<start server to generate>',
    recentActivity: 'Recent activity',
    noActivity: 'No MCP tool calls yet.',
  },

  plugins: {
    blurb: 'Manage installed plugins',
    bundled: 'Bundled',
    version: 'v{version}',
    toggleAria: 'Toggle {plugin}',
  },
} as const
