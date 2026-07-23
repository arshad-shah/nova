import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Architectural guard: generalises `ipc-channels-single-sourced.test.ts` to
 * every OTHER closed-set id constant in the repo (driver ids, panel ids,
 * plugin lifecycle phases, ...). IPC_CHANNELS / IPC_EVENTS already have their
 * own dedicated, narrowly-scoped test — this file does not duplicate it.
 *
 * The values are imported from the real modules (never copy-pasted here), so
 * a rename of a constant's value can't silently desync this guard from what
 * it's guarding.
 *
 * For each set below, a small number of TRIGGER patterns describe the exact
 * call-site shapes the codebase actually uses for that set (an argument to a
 * named function, a known object-property key, a computed-property key, a
 * `===` comparison). A raw string literal is only flagged when it appears in
 * one of those shapes AND its value is exactly one of the set's members —
 * both conditions have to hold, which is what keeps this precise instead of
 * flagging every stray occurrence of an ordinary word like 'settings' or
 * 'error'. See the "sets deliberately left out" note at the bottom for sets
 * that could NOT be scoped this precisely.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const ROOTS = ['src/main', 'src/renderer/src', 'src/preload', 'shared']

// A raw string-literal capture: group 1 is the quote, group 2 is the value.
// Reused as the tail of every trigger below so every rule enforces the same
// "whole quoted token, not a substring" match IPC_CHANNELS's guard relies on.
const Q = String.raw`(['"])([a-zA-Z][a-zA-Z0-9_.-]*)\1`

interface Trigger {
  /** Capture group 2 is the candidate literal. */
  regex: RegExp
  /** Restrict this trigger to these repo-relative files. Some call-site
   *  shapes (a bare `id: 'word'` in a list item, say) are common enough that
   *  they collide with unrelated same-named list items elsewhere in the app
   *  (a Welcome-tab step id, a context-menu item id, ...) — scoping the
   *  trigger to the file(s) that actually spell this set's ids that way
   *  keeps the shape usable without flagging those unrelated collisions. */
  onlyIn?: string[]
}

interface Rule {
  setName: string
  constHint: string
  /** Repo-relative path(s) that legitimately spell these values by hand
   *  because they're the module that DEFINES the set. */
  definingFiles: string[]
  values: readonly string[]
  triggers: Trigger[]
  /** If this also matches on the same line, suppress the hit — used where a
   *  value collides with an unrelated vocabulary in a specific known shape
   *  (see SCHEMA_OBJECT_KIND's 'function' vs. Monaco completion-item kind). */
  lineExclude?: RegExp
}

/** Shorthand so most trigger declarations stay a one-liner. */
function trig(regex: RegExp, onlyIn?: string[]): Trigger {
  return { regex, onlyIn }
}

async function loadRules(): Promise<Rule[]> {
  const [
    menus,
    settings,
    mcp,
    types,
    activity,
    ui,
    settingsCategories,
    detailTabMod,
    appActionsMod,
    pluginTypes,
    permissions,
    sdkTypes,
    protocol,
  ] = await Promise.all([
    import('../../../shared/menus'),
    import('../../../shared/settings'),
    import('../../../shared/mcp'),
    import('../../../shared/types'),
    import('../../../shared/activity'),
    import('../../../src/renderer/src/stores/ui'),
    import('../../../src/renderer/src/lib/settings-categories'),
    import('../../../src/renderer/src/components/plugins/plugin-detail/constants'),
    import('../../../src/renderer/src/lib/app-actions/ids'),
    import('../../../src/main/plugins/types'),
    import('../../../src/main/plugins/sdk/permissions'),
    import('../../../src/main/plugins/sdk/types'),
    import('../../../src/main/plugins/isolation/protocol'),
  ])

  return [
    {
      setName: 'MENU_ACTION',
      constHint: 'MENU_ACTION.<X> (shared/menus.ts)',
      definingFiles: ['shared/menus.ts'],
      values: Object.values(menus.MENU_ACTION),
      triggers: [
        trig(new RegExp(String.raw`\brunMenuAction\(\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\[\s*${Q}\s*\]:\s*\{`, 'g')),
      ],
    },
    {
      setName: 'KEYBINDING_ACTION',
      constHint: 'KEYBINDING_ACTION.<X> (shared/settings.ts)',
      definingFiles: ['shared/settings.ts'],
      values: Object.values(settings.KEYBINDING_ACTION),
      triggers: [
        trig(new RegExp(String.raw`\beditorRegistry\.runAction\(\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\bbindingId:\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\[\s*${Q}\s*\]:\s*\(\)\s*=>`, 'g')),
        trig(new RegExp(String.raw`\.id\s*===\s*${Q}`, 'g')),
      ],
    },
    {
      setName: 'ACTIVITY_PANEL',
      constHint: 'ACTIVITY_PANEL.<X> (src/renderer/src/stores/ui.ts)',
      definingFiles: ['src/renderer/src/stores/ui.ts'],
      values: Object.values(ui.ACTIVITY_PANEL),
      triggers: [
        trig(new RegExp(String.raw`\bsetActivePanel\(\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\bactivePanel\s*===\s*${Q}`, 'g')),
        // `{ id: 'x', icon: ... }` also shows up for unrelated list items
        // elsewhere (Welcome-tab steps, command-palette entries) — restrict
        // to the one file that actually builds the activity-bar icon list.
        trig(new RegExp(String.raw`\bid:\s*${Q},\s*icon:`, 'g'), [
          'src/renderer/src/components/shell/ActivityBar.tsx',
        ]),
        trig(new RegExp(String.raw`\[\s*${Q}\s*\]:\s*t\(`, 'g'), [
          'src/renderer/src/components/shell/Sidebar.tsx',
        ]),
      ],
    },
    {
      setName: 'SECONDARY_PANEL',
      constHint: 'SECONDARY_PANEL.<X> (src/renderer/src/stores/ui.ts)',
      definingFiles: ['src/renderer/src/stores/ui.ts'],
      values: Object.values(ui.SECONDARY_PANEL),
      triggers: [
        trig(new RegExp(String.raw`\bsetSecondaryActivePanel\(\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\bsecondaryActivePanel\s*===\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\brenderButton\(\s*${Q}`, 'g'), [
          'src/renderer/src/components/shell/SecondaryActivityBar.tsx',
        ]),
      ],
    },
    {
      setName: 'BOTTOM_PANEL',
      constHint: 'BOTTOM_PANEL.<X> (src/renderer/src/stores/ui.ts)',
      definingFiles: ['src/renderer/src/stores/ui.ts'],
      values: Object.values(ui.BOTTOM_PANEL),
      triggers: [
        trig(new RegExp(String.raw`\bsetBottomDockActivePanel\(\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\bbottomActivePanel\s*===\s*${Q}`, 'g')),
        // Same rationale as ACTIVITY_PANEL's id+icon trigger above.
        trig(new RegExp(String.raw`\bid:\s*${Q},\s*title:`, 'g'), [
          'src/renderer/src/components/shell/BottomDock.tsx',
        ]),
      ],
    },
    {
      setName: 'SETTINGS_CATEGORY',
      constHint: 'SETTINGS_CATEGORY.<X> (src/renderer/src/lib/settings-categories.ts)',
      definingFiles: ['src/renderer/src/lib/settings-categories.ts'],
      values: Object.values(settingsCategories.SETTINGS_CATEGORY),
      triggers: [
        trig(new RegExp(String.raw`\bopenSettings\(\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\bactiveSettingsCategory:\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\[\s*${Q}\s*\]:\s*[A-Z]\w*Settings`, 'g'), [
          'src/renderer/src/components/settings/SettingsLayout.tsx',
        ]),
      ],
    },
    {
      setName: 'DEFAULT_THEME_ID',
      constHint: 'DEFAULT_THEME_ID.DARK / .LIGHT (shared/settings.ts)',
      definingFiles: ['shared/settings.ts'],
      values: Object.values(settings.DEFAULT_THEME_ID),
      triggers: [
        trig(new RegExp(String.raw`\bsafe\([a-zA-Z]+,\s*${Q}\)`, 'g')),
        trig(new RegExp(String.raw`\b(?:theme|darkTheme|lightTheme):\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\bFALLBACK_THEME_ID\s*=\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`!==\s*${Q}\)`, 'g')),
      ],
    },
    {
      setName: 'CONFIG_KEY',
      constHint: 'CONFIG_KEY.<X> (shared/settings.ts)',
      definingFiles: ['shared/settings.ts'],
      values: Object.values(settings.CONFIG_KEY),
      triggers: [
        trig(new RegExp(String.raw`\b(?:setSetting|getSetting|getSettingsCategory)\(\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`settingsStore\.get\(\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`configStore\.(?:setSetting|getSetting)\(\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\bkeyPath\s*(?:===|!==)\s*${Q}`, 'g')),
      ],
    },
    {
      setName: 'TOOL_PERMISSION',
      constHint: 'TOOL_PERMISSION.READ / .WRITE (shared/mcp.ts)',
      definingFiles: ['shared/mcp.ts'],
      values: Object.values(mcp.TOOL_PERMISSION),
      triggers: [
        trig(new RegExp(String.raw`\bpermission:\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\.permission\s*===\s*${Q}`, 'g')),
      ],
    },
    {
      setName: 'SCHEMA_OBJECT_KIND',
      constHint: 'SCHEMA_OBJECT_KIND.<X> (shared/types.ts)',
      definingFiles: ['shared/types.ts'],
      values: Object.values(types.SCHEMA_OBJECT_KIND),
      triggers: [
        trig(new RegExp(String.raw`\bkind:\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\.kind\s*===\s*${Q}`, 'g')),
      ],
      // Monaco completion items also use `kind: 'function'` (a
      // CompletionItemKind, unrelated to schema objects) on a `{ label: ...,
      // kind: 'function', ... }` line — exclude that shape specifically.
      lineExclude: /\blabel:/,
    },
    {
      setName: 'ACTIVITY_KIND',
      constHint: 'ACTIVITY_KIND.<X> (shared/activity.ts)',
      definingFiles: ['shared/activity.ts'],
      values: Object.values(activity.ACTIVITY_KIND),
      triggers: [trig(new RegExp(String.raw`\bkind:\s*${Q}`, 'g'))],
    },
    {
      setName: 'CONTRIBUTION_KIND',
      constHint: 'CONTRIBUTION_KIND.<X> (src/main/plugins/types.ts)',
      definingFiles: ['src/main/plugins/types.ts'],
      values: Object.values(pluginTypes.CONTRIBUTION_KIND),
      // The ledger shape is a template literal: `${CONTRIBUTION_KIND.DRIVER}:${d.id}`.
      triggers: [trig(new RegExp(String.raw`\`([a-z]+):\$\{`, 'g'))],
    },
    {
      setName: 'PLUGIN_PERMISSION',
      constHint: 'PLUGIN_PERMISSION.<X> (src/main/plugins/sdk/permissions.ts)',
      definingFiles: ['src/main/plugins/sdk/permissions.ts'],
      values: Object.values(permissions.PLUGIN_PERMISSION),
      triggers: [
        trig(new RegExp(String.raw`\bhasPermission\(\s*grant,\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\bPermissionDeniedError\([^,]+,\s*${Q}`, 'g')),
      ],
    },
    {
      setName: 'TOOL_SURFACE',
      constHint: 'TOOL_SURFACE.AI / .MCP (src/main/plugins/sdk/types.ts)',
      definingFiles: ['src/main/plugins/sdk/types.ts'],
      values: Object.values(sdkTypes.TOOL_SURFACE),
      triggers: [
        trig(new RegExp(String.raw`\bsurfaces:\s*\[\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\.surfaces\.includes\(\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\bsurfaces\s*===\s*${Q}`, 'g')),
      ],
    },
    {
      setName: 'PLUGIN_PHASE',
      constHint: 'PLUGIN_PHASE.<X> (src/main/plugins/sdk/types.ts)',
      definingFiles: ['src/main/plugins/sdk/types.ts'],
      values: Object.values(sdkTypes.PLUGIN_PHASE),
      triggers: [trig(new RegExp(String.raw`\bphase:\s*${Q}`, 'g'))],
    },
    {
      setName: 'CAPABILITY_SURFACE',
      constHint: 'CAPABILITY_SURFACE.<X> (src/main/plugins/isolation/protocol.ts)',
      definingFiles: ['src/main/plugins/isolation/protocol.ts'],
      values: Object.values(protocol.CAPABILITY_SURFACE),
      triggers: [
        trig(new RegExp(String.raw`\bforward\(\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\bsurface:\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\[\s*${Q}\s*\]:\s*new Set\(`, 'g')),
      ],
    },
    {
      setName: 'DETAIL_TAB',
      constHint: 'DETAIL_TAB.<X> (src/renderer/src/components/plugins/plugin-detail/constants.ts)',
      definingFiles: ['src/renderer/src/components/plugins/plugin-detail/constants.ts'],
      values: Object.values(detailTabMod.DETAIL_TAB),
      triggers: [
        trig(new RegExp(String.raw`\bactiveTab\s*===\s*${Q}`, 'g')),
        trig(new RegExp(String.raw`\buseState<DetailTabId>\(\s*${Q}`, 'g')),
      ],
    },
    {
      setName: 'APP_ACTION',
      constHint: 'APP_ACTION.<X> (src/renderer/src/lib/app-actions/ids.ts)',
      definingFiles: ['src/renderer/src/lib/app-actions/ids.ts'],
      values: Object.values(appActionsMod.APP_ACTION),
      triggers: [
        trig(new RegExp(String.raw`\[\s*${Q}\s*\]:`, 'g'), [
          'src/renderer/src/components/ai/ActionChip.tsx',
        ]),
        // A bare `id: 'word'` collides with unrelated list-item ids elsewhere
        // (e.g. a context-menu item id) — restrict to the one file that
        // actually declares the built-in AppAction catalogue.
        trig(new RegExp(String.raw`\bid:\s*${Q},`, 'g'), [
          'src/renderer/src/lib/app-actions/builtins.ts',
        ]),
      ],
    },
  ]
}

// ─── Baseline allowlist (the ratchet) ────────────────────────────────────────
//
// Leftovers the sweep could not fix, spelled out precisely so this list can
// only ever shrink. Format matches the violation key below: `file:line`.
// Empty today — if you add an entry, you MUST also leave a comment saying why
// it can't just be fixed.
const BASELINE_ALLOWLIST = new Set<string>([])

function violationKey(rel: string, line: number): string {
  return `${rel}:${line}`
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walk(full))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|stories)\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

interface Hit {
  key: string
  message: string
}

function findViolations(rules: Rule[]): Hit[] {
  const hits: Hit[] = []

  for (const root of ROOTS) {
    const abs = path.join(REPO_ROOT, root)
    if (!fs.existsSync(abs)) continue
    for (const file of walk(abs)) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/')
      const src = fs.readFileSync(file, 'utf-8')
      const lines = src.split('\n')
      for (const rule of rules) {
        // A file is exempt only from the rule it DEFINES, not from every rule.
        // Exempting it globally would unguard the repo's most central files:
        // stores/ui.ts defines the panel ids, so it would stop being checked
        // for SETTINGS_CATEGORY and ACTIVITY_KIND too; likewise
        // shared/settings.ts (KEYBINDING_ACTION, DEFAULT_THEME_ID, CONFIG_KEY),
        // shared/ipc.ts and shared/menus.ts.
        if (rule.definingFiles.includes(rel)) continue
        lines.forEach((line, i) => {
          if (rule.lineExclude?.test(line)) return
          for (const trigger of rule.triggers) {
            if (trigger.onlyIn && !trigger.onlyIn.includes(rel)) continue
            trigger.regex.lastIndex = 0
            let m: RegExpExecArray | null
            while ((m = trigger.regex.exec(line))) {
              const value = m[2]
              if (rule.values.includes(value)) {
                hits.push({
                  key: violationKey(rel, i + 1),
                  message: `${rel}:${i + 1}  raw literal '${value}' → use ${rule.constHint}`,
                })
              }
            }
          }
        })
      }
    }
  }
  return hits
}

describe('internal id constants are single-sourced', () => {
  // The scan walks the whole repo tree reading every file; run it once for the
  // describe (raising the timeout for the one-off FS pass) rather than once per
  // `it`, which under full-suite CPU load tipped past the 5s default.
  let hits: Hit[]
  beforeAll(async () => {
    const rules = await loadRules()
    hits = findViolations(rules)
  }, 30_000)

  it('has no raw literals at known call sites for a guarded constant set', () => {
    const fresh = hits.filter((h) => !BASELINE_ALLOWLIST.has(h.key))
    expect(
      fresh,
      `\nRaw literals found where a centralised constant should be used instead:\n${fresh
        .map((h) => h.message)
        .join('\n')}\n`,
    ).toEqual([])
  })

  it('the baseline allowlist has no stale entries', () => {
    const found = new Set(hits.map((h) => h.key))
    const stale = [...BASELINE_ALLOWLIST].filter((key) => !found.has(key))
    expect(
      stale,
      `\nThese BASELINE_ALLOWLIST entries no longer have a matching violation — remove them so the list can shrink:\n${stale.join('\n')}\n`,
    ).toEqual([])
  })

  // Guard the guard: each trigger shape must actually catch what it claims to,
  // and the compliant form (referencing the constant) must not match.
  it('detects a raw literal at each trigger shape (regex sanity)', () => {
    const cases: Array<[RegExp, string, boolean]> = [
      [new RegExp(String.raw`\brunMenuAction\(\s*${Q}`), `runMenuAction('new-connection')`, true],
      [new RegExp(String.raw`\brunMenuAction\(\s*${Q}`), `runMenuAction(MENU_ACTION.NEW_CONNECTION)`, false],
      [new RegExp(String.raw`\bkind:\s*${Q}`), `kind: 'query'`, true],
      [new RegExp(String.raw`\bkind:\s*${Q}`), `kind: ACTIVITY_KIND.QUERY`, false],
      [new RegExp(String.raw`\bpermission:\s*${Q}`), `permission: 'write'`, true],
      [new RegExp(String.raw`\bpermission:\s*${Q}`), `permission: TOOL_PERMISSION.WRITE`, false],
    ]
    for (const [re, sample, expected] of cases) {
      re.lastIndex = 0
      expect(re.test(sample), `${re} on ${JSON.stringify(sample)}`).toBe(expected)
    }
  })
})

/**
 * Sets deliberately left OUT of this guard, and why:
 *
 * - MCP_ACTIVITY_STATUS ('ok'|'error'|'rejected', shared/mcp.ts): its natural
 *   call-site shape (`status: 'X'` / `.status === 'X'`) collides with the
 *   unrelated `QueryHistoryEntry.status` ('ok'|'error', shared/appdata.ts)
 *   and other ad hoc `status`-shaped fields across the codebase — e.g.
 *   `status: 'error'` in useQueryExecution.ts has nothing to do with MCP.
 *   A regex can't tell these apart without type information; a smaller
 *   honest guard beats a noisy one, so this set is skipped.
 * - SEVERITY_TONE / SEVERITY_ICON / SEVERITY_SURFACE (primitives/feedback):
 *   their values (info/success/warning/error) ARE the CVA variant vocabulary
 *   shared by dozens of unrelated `variant="error"`-style primitive props.
 *   Not preciseable with a call-site regex.
 * - MENU_SIZE (primitives/surfaces/menu): zero references outside its
 *   defining module — below the "used in 2+ places" threshold, not a
 *   duplication risk yet.
 * - RAW_TEMPLATES (bundled/ai/prompts): prompt text, not identifiers.
 * - PluginStatus['state'] / MCPToolInfo-adjacent discriminants that stayed
 *   plain union literals (e.g. `{ state: 'discovered' }`): these are
 *   exhaustively switched-on discriminants where the literal type IS the
 *   contract — turning them into a constant would weaken narrowing for no
 *   real gain, so the sweep correctly left them alone and this guard does
 *   too.
 */
