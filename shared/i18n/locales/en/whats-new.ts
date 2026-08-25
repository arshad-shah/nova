// Authored "What's New" release-notes content. This is the user-facing copy for
// each curated release; the registry (src/renderer/src/lib/release-notes/) holds
// only the structure (version, date, icons, ids, tones) and references these
// keys. Like all user-facing strings, release-notes prose lives on the i18n
// surface — never inlined in the registry or components.
//
// Convention: shared group headings + link labels at the top, then one block per
// version keyed `v<major>_<minor>_<patch>`. Each highlight is `{ title, description }`.
export const whatsNew = {
  groups: {
    features: 'New features',
    improvements: 'Improvements',
    fixes: 'Fixes',
  },
  links: {
    changelog: 'Full changelog',
    sdkDocs: 'Plugin SDK docs',
    userGuide: 'User guide',
  },
  // Covers everything since 1.5.0 — the release pages for 1.6.0 and 1.7.0 were
  // never authored, and a user updating from 1.5.0 only ever sees this page, so
  // the tab-bar, menu and ER-diagram work from those releases is folded in here.
  v1_8_0: {
    headline: 'Built for bigger databases',
    summary:
      'Verql no longer reads a whole table — or a whole Redis keyspace — into memory just to show you what is in it. Browsing is paged and bounded, Redis stops blocking your server while it lists keys, the app opens faster, and the Activity panel has been rebuilt around the message you are actually looking for. Two security fixes land here as well.',
    viewData: {
      title: 'Browse large tables without the wait',
      description:
        'Viewing data used to read every record into memory before showing you anything, so a large table could hang the app. Verql now loads a page at a time — the header tells you when there is more, and Load more fetches the next batch. Set the page size under Settings → General → Max Rows to View (500 by default). Exports are unchanged and still write everything.',
    },
    redisScan: {
      title: 'Redis that doesn’t stall your server',
      description:
        'Every Redis key-listing path used a command that walks the entire keyspace and blocks the server for as long as it runs — simply expanding a large connection could freeze every other client. Verql now walks keys incrementally instead. A new Max keys to scan setting (10,000 by default) caps how far a listing goes, and the Key scan batch size setting, which until now did nothing at all, genuinely tunes it.',
    },
    activityPanel: {
      title: 'A rebuilt Activity panel',
      description:
        'The message now gets the full width of the row, with severity moved to a slim rail down the edge. Search and the filter chips collapse into one bar you can type into — "level:error kind:query" alongside free text. Details open in a pinned, resizable drawer instead of pushing the list around, the stream tails newest entries at the bottom, and everything a single run caused is grouped under it, so a buried error is visible without expanding anything.',
    },
    erDiagram: {
      title: 'ER diagrams that say what a relationship means',
      description:
        'The diagram is redrawn from scratch. Connectors now carry crow’s-foot cardinality — exactly one, zero or one, one or many, zero or many — with identifying relationships drawn solid and non-identifying dashed, plus a legend built from the same symbols. Each connector meets the row of the field it constrains, cards size to their contents, and the whole diagram follows your theme.',
    },
    fasterStart: {
      title: 'The app opens faster',
      description:
        'The query editor, results grid, ER diagram, AI chat and charts are no longer loaded before Verql can draw anything. Each one arrives the moment you first open it, so the welcome screen, the app shell and your connections appear without waiting on parts you may not use at all this session.',
    },
    snappier: {
      title: 'A snappier window while you work',
      description:
        'Typing in the editor no longer re-renders the whole app shell. And surfaces that want the same schema information at the same moment — the explorer and an ER diagram open on one schema, say — now share a single round trip instead of each making its own.',
    },
    schemaErrors: {
      title: 'The explorer tells failed apart from empty',
      description:
        'A schema load that failed used to look exactly like one that came back empty, or spin on “Loading…” forever. Failures now show an error row with a Retry action, and are recorded in Activity so you can see what actually went wrong.',
    },
    databaseSwitch: {
      title: 'Switching databases fails loudly',
      description:
        'When switching a connection to another database failed — it had been dropped, or you lacked permission — Verql updated the tab anyway and quietly ran your next query against the previous one. The failure now surfaces and the tab stays where it was. Drivers that cannot switch no longer offer the picker at all.',
    },
    statements: {
      title: 'One consistent view of your statements',
      description:
        'Running a single statement, importing a file and formatting each used their own rules for where one statement ends and the next begins, and they disagreed. They now share one. Comments stay with the statement they belong to, and on PostgreSQL a function body written between $$ markers no longer splits at its own semicolons.',
    },
    tabBar: {
      title: 'A roomier, keyboard-friendly tab bar',
      description:
        'Tabs are larger at every density, the active one is easier to pick out, and the bar is fully operable from the keyboard and exposed to assistive tech. Menus across the app share one implementation now, so a right-click near the edge of the screen flips into view instead of being clipped.',
    },
    redisInjection: {
      title: 'Redis key names can no longer run commands',
      description:
        'Viewing Redis data built commands by pasting key names into text, so a key deliberately named to contain a line break could run a command of the attacker’s choosing — destructive ones included — just by being browsed. Key names are now passed as data and never re-read as commands. Keys containing spaces read correctly for the first time, and the Redis console understands quoted arguments.',
    },
    writeGate: {
      title: 'Writes can’t slip past the approval prompt',
      description:
        'The check that decides whether a statement needs your approval removed comments without understanding quoted text, so a write hidden after a comment marker inside a string could be read as harmless and run unprompted through the AI assistant or a connected MCP client. Anything the check cannot read with confidence is now treated as a write.',
    },
    staleResponses: {
      title: 'Late answers no longer overwrite fresh ones',
      description:
        'Switching connections quickly could let a slow reply for the connection you left populate the one you moved to — listing its databases, and sometimes selecting one that does not exist there. Replies that arrive after you have moved on are now discarded, across the explorer, the connection picker and the plugin and data browsers.',
    },
  },
  // Covers everything since 1.3.1 — the release pages for 1.4.x were never
  // authored, and a user updating from 1.3.1 only ever sees this page, so the
  // form-field, text-area and toast work from 1.4.0 is folded in here.
  v1_5_0: {
    headline: 'A new look for Verql',
    summary:
      'Verql has been redrawn around Ion — a new default theme and a rebuilt set of controls. macOS gets the full application menu it was missing, menu shortcuts now follow your own keybindings, and the fields, text area and notifications you work in every day have been reworked.',
    ion: {
      title: 'Ion, the new default look',
      description:
        'A new palette and a redrawn mark, applied across every screen. Ion is the default theme now — the other themes are still there under Settings → Appearance, and any theme you had picked is kept.',
    },
    macMenu: {
      title: 'The full menu on macOS',
      description:
        'The macOS menu was missing a lot: there was no Query menu at all, and no Settings, Find in Editor, Close or Reopen Tab, panel toggles, Welcome or What’s New. Every command is now on the menu, placed where macOS users expect it — Settings sits in the Verql menu at Cmd+, rather than under File.',
    },
    textArea: {
      title: 'A text area you can work in',
      description:
        'The multi-line editor is rebuilt as a card you can resize from a corner grip, with optional auto-grow, a character counter that warns as you near a limit, and a clear button.',
    },
    fields: {
      title: 'Fields that follow your density setting',
      description:
        'Every field — text, number, password, file and date pickers, and the text area — now changes height, text size, corner radius and padding together with Settings → Appearance → UI density. Glyphs are crisp icons, the password field shows a strength meter, and file pickers highlight when you drag a file onto them.',
    },
    toasts: {
      title: 'Notifications that get out of the way',
      description:
        'Toasts slide in, and dismissing one slides the rest up smoothly instead of jumping. Each can auto-dismiss on a progress bar that pauses while you hover, so you have time to read it — and long-running ones stay until they finish.',
    },
    about: {
      title: 'An About window that matches the app',
      description:
        'Clicking About Verql on macOS now opens Verql’s own About window — the same one every other platform shows — instead of the plain system panel.',
    },
    shortcuts: {
      title: 'Menu shortcuts follow your keybindings',
      description:
        'Menu shortcuts were fixed in place, so rebinding a command under Settings → Keybindings left the old key still firing the old command. They now follow whatever you set. One change to note: New Query is Cmd/Ctrl+T — the shortcut the keybindings list always showed — where the menu used to say Cmd/Ctrl+N.',
    },
    contrast: {
      title: 'Notifications read at full contrast',
      description:
        'Alert and toast messages are no longer tinted their status colour, which made them harder to read. The message reads in normal high-contrast text and the status colour moves to the icon and a slim rail down the edge.',
    },
    security: {
      title: 'Security and dependency refresh',
      description:
        'Every outstanding dependency security advisory is resolved, and the packages Verql is built on are updated to their patched versions.',
    },
  },
  v1_3_1: {
    headline: 'Verql comes to Linux and the Microsoft Store',
    summary:
      'Installing and updating Verql just got easier on more platforms. Linux users can now install it with Homebrew, Windows users can get it from the Microsoft Store, and every download is published with a verifiable, signed checksum.',
    linux: {
      title: 'Now available on Linux',
      description:
        'Install Verql on Linux with Homebrew — "brew install arshad-shah/verql/verql" — and keep it current with "brew upgrade", the same way as on macOS.',
    },
    microsoftStore: {
      title: 'Now on the Microsoft Store',
      description:
        'Windows users can install Verql straight from the Microsoft Store, with the Store handling signing and automatic updates — no security prompts to click through.',
    },
    updates: {
      title: 'Effortless updates',
      description:
        'Verql keeps itself current through your platform’s own channel: "brew upgrade" on macOS and Linux, and the Store on Windows. No separate updater to babysit.',
    },
    verifiableDownloads: {
      title: 'Verifiable, signed downloads',
      description:
        'Every release now ships a single checksum manifest signed with Sigstore, plus a software bill of materials — so you can confirm a download came from Verql’s build and wasn’t tampered with.',
    },
  },
  v1_2_0: {
    headline: 'Plugins go public on npm, and a warmer first run',
    summary:
      'The plugin SDK is now on npm, so anyone can build and share Verql plugins. First-time users get a guided welcome, and in-app release notes mean you’ll always know what changed in an update.',
    sdkOnNpm: {
      title: 'Plugin SDK published to npm',
      description:
        'Build Verql plugins against @verql/plugin-sdk, now available on npm. Install it with "npm install @verql/plugin-sdk" and code against the same typed, Electron-free surface the bundled drivers use — then ship your own drivers, exporters, themes, AI providers and tools.',
    },
    welcome: {
      title: 'A guided first run',
      description:
        'New installs open a Welcome tab with quick actions and a Get Started checklist that tracks your progress — connect a database, run a query, set up the AI assistant, and more.',
    },
    releaseNotes: {
      title: 'Release notes, in the app',
      description:
        'After an update, Verql opens a “What’s New” page (like this one) so new features don’t go unnoticed. Reach it any time from Help → What’s New.',
    },
    nouns: {
      title: 'Speaks your database’s language',
      description:
        'The explorer and menus now use each driver’s own terms — objects, fields and records where “tables, columns and rows” don’t fit — so document and key/value stores read naturally instead of being forced into SQL wording.',
    },
  },
  v1_1_0: {
    headline: 'Smarter EXPLAIN, data browsing for every store, and an app-designed shell',
    summary:
      'This release pushes more database knowledge into the drivers themselves, adds one-click data browsing for non-SQL stores, and replaces the OS chrome with a shell we designed end to end.',
    explain: {
      title: 'Driver-declared EXPLAIN',
      description:
        'Each driver now carries its own explain statement, so query plans use the right syntax for Postgres, MySQL, SQLite and Snowflake — and the Explain action hides for stores that can’t plan, like Redis and MongoDB.',
    },
    browse: {
      title: 'Browse data in any store',
      description:
        'A new "View data" action opens a grid for non-SQL stores — keys and values for Redis, documents for MongoDB — using each driver’s own reader. No query required.',
    },
    shell: {
      title: 'An app-designed shell',
      description:
        'On Windows and Linux the native menu bar is replaced with our own File / Edit / View / Query / Help menus and window controls, for a consistent look on every platform.',
    },
    about: {
      title: 'A custom About window',
      description:
        'A branded "About Verql" panel with app and build versions, a copyable build block, and quick links — replacing the old "open the website" behaviour.',
    },
    diagnostics: {
      title: 'Richer diagnostics',
      description:
        'The activity stream now captures IPC calls, plugin lifecycle, network requests and performance long-tasks, with a structured detail drawer and a session error summary for faster debugging.',
    },
    design: {
      title: 'A more polished design system',
      description:
        'Size variants across more primitives, a redesigned Switch that reads identically across every theme, and a new gradient hero surface used by the About window.',
    },
    connForm: {
      title: 'Clearer connection form',
      description:
        'The new-connection form is reorganised into clear, grouped sections so the fields you need are easier to find.',
    },
    liveLayout: {
      title: 'Layout toggles apply instantly',
      description:
        'The "show secondary sidebar" and "show bottom dock" settings now take effect live instead of waiting for a restart.',
    },
    mysql: {
      title: 'Tidier MySQL explorer',
      description:
        'Server-internal databases are hidden and schemas no longer mis-nest, so the MySQL tree shows just your data.',
    },
    headlessSecrets: {
      title: 'No crash without OS encryption',
      description:
        'Verql no longer crashes when the operating system’s secret encryption is unavailable (for example on headless or WSL setups).',
    },
  },
} as const
