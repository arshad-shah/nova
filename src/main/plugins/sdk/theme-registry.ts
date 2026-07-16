// src/main/plugins/sdk/theme-registry.ts
import type { Disposable } from './types'

export interface ThemeMonacoRule {
  token: string
  foreground: string
  background?: string
  fontStyle?: string
}

export interface ThemeMonacoDef {
  base: 'vs' | 'vs-dark'
  colors: Record<string, string>
  rules: ThemeMonacoRule[]
}

export interface ThemePreview {
  bg: string
  sidebar: string
  text: string
  accent: string
}

/** Result of running a registered theme through `validateTheme()`. */
export interface ThemeValidationReport {
  /** True iff no required tokens are missing. Recommended-only gaps still pass. */
  ok: boolean
  /** Tokens that MUST be present for the theme to render correctly. */
  missingRequired: string[]
  /** Tokens that SHOULD be present — fallbacks exist, but the theme looks off without them. */
  missingRecommended: string[]
}

export interface RegisteredTheme {
  id: string
  name: string
  type: 'dark' | 'light'
  /** CSS variable map; emitted as `[data-theme="id"] { --k: v; ... }`. */
  tokens?: Record<string, string>
  /** Raw CSS body (already self-scoped) for legacy themes that use multiple selectors. */
  css?: string
  /** Monaco editor token theme; consumed by the renderer's monaco bootstrap. */
  monaco?: ThemeMonacoDef
  /** Swatch shown in the Appearance settings theme grid. */
  preview?: ThemePreview
  /** Plugin name that registered it — for debugging / display. */
  source?: string
  /** Populated by the boot coordinator after `validateTheme()` runs. */
  validation?: ThemeValidationReport
}

/**
 * Tokens that the app's primitives reference directly. Missing one of these
 * means visible bugs in core surfaces, so a theme that omits them is treated
 * as broken — the user gets an error toast and the theme is flagged in the
 * picker.
 */
export const REQUIRED_THEME_TOKENS: readonly string[] = [
  '--color-bg-primary',
  '--color-bg-secondary',
  '--color-bg-tertiary',
  '--color-bg-elevated',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-tertiary',
  '--color-border-default',
  '--color-accent',
  '--color-focus-ring',
]

/**
 * Tokens whose absence won't crash anything (fallbacks exist on `:root` in
 * tokens.css), but where the inherited Ion value will probably clash with
 * the theme's intended palette. Surfaced as a warning, not an error.
 */
export const RECOMMENDED_THEME_TOKENS: readonly string[] = [
  '--color-accent-hover',
  '--color-accent-muted',
  '--color-success',
  '--color-warning',
  '--color-error',
  '--color-info',
  '--color-hover',
  '--color-active',
  '--color-skeleton-base',
  '--color-skeleton-highlight',
  '--color-tab-bar-bg',
  '--color-tab-active-bg',
  '--color-tab-active-fg',
  '--color-tab-inactive-fg',
  '--color-tab-hover-bg',
  '--shadow-card',
  '--shadow-dropdown',
  '--shadow-elevated',
  '--shadow-focus-glow',
]

/**
 * Inspect a theme's declared CSS variables and report which required /
 * recommended tokens are missing. Looks at both the structured `tokens` map
 * and any inline `css` body — a theme can declare via either path (or both).
 *
 * Pure / side-effect-free; the caller decides whether to toast, log, badge,
 * or block on the result.
 */
export function validateTheme(theme: RegisteredTheme): ThemeValidationReport {
  const declared = new Set<string>()

  if (theme.tokens) {
    for (const key of Object.keys(theme.tokens)) {
      declared.add(key.startsWith('--') ? key : `--${key}`)
    }
  }

  if (theme.css) {
    // Match `--name:` declarations regardless of surrounding selectors.
    const matches = theme.css.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)
    for (const match of matches) {
      declared.add(match[1])
    }
  }

  const missingRequired = REQUIRED_THEME_TOKENS.filter((t) => !declared.has(t))
  const missingRecommended = RECOMMENDED_THEME_TOKENS.filter((t) => !declared.has(t))

  return {
    ok: missingRequired.length === 0,
    missingRequired,
    missingRecommended,
  }
}

export interface ThemeRegisterOptions {
  /** Refuse to register the theme when any REQUIRED_THEME_TOKENS are missing.
   *  Default `false` (lenient): the theme is accepted but its entry carries a
   *  `validation.ok === false` so the renderer can disable it in the picker.
   *  Set `true` for plugin-author CI checks where you want a hard failure. */
  strict?: boolean
}

export interface ThemeRegistry {
  register(theme: RegisteredTheme, options?: ThemeRegisterOptions): Disposable
  getAll(): RegisteredTheme[]
  get(id: string): RegisteredTheme | undefined
  has(id: string): boolean
  onChange(listener: () => void): Disposable
}

export class ThemeRegistryImpl implements ThemeRegistry {
  private themes = new Map<string, RegisteredTheme>()
  private listeners = new Set<() => void>()

  register(theme: RegisteredTheme, options: ThemeRegisterOptions = {}): Disposable {
    if (!theme.id) throw new Error('Theme registration requires an id')
    if (this.themes.has(theme.id)) {
      throw new Error(`Theme '${theme.id}' is already registered`)
    }
    // Run validation eagerly so the entry carries an authoritative report
    // from the moment it lands in the registry. The picker can then disable
    // broken themes without re-running validateTheme() on every render, and
    // a strict caller can refuse to ship one that fails the required-token
    // gate.
    const validation = validateTheme(theme)
    if (options.strict && !validation.ok) {
      throw new Error(
        `Theme '${theme.id}' is missing required tokens: ${validation.missingRequired.join(', ')}`,
      )
    }
    this.themes.set(theme.id, { ...theme, validation })
    this.notify()
    return {
      dispose: () => {
        this.themes.delete(theme.id)
        this.notify()
      }
    }
  }

  getAll(): RegisteredTheme[] {
    return [...this.themes.values()]
  }

  get(id: string): RegisteredTheme | undefined {
    return this.themes.get(id)
  }

  has(id: string): boolean {
    return this.themes.has(id)
  }

  onChange(listener: () => void): Disposable {
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try { fn() } catch { /* listener errors are isolated */ }
    }
  }
}
