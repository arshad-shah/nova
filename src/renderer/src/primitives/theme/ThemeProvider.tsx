import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSettingsStore } from '@/stores/settings'
import { useThemesStore } from '@/stores/themes'
import { CONFIG_KEY, DEFAULT_THEME_ID, type AppearanceMode } from '@shared/settings'

export type Theme = string

interface ThemeContextValue {
  /** Resolved theme id currently applied to `<html>`. */
  theme: Theme
  /** Set the active theme. Also pins it as the preference for the current
   *  appearance mode (light → lightTheme, dark → darkTheme); when mode is
   *  `system`, pins both light and dark sides depending on the theme's type. */
  setTheme: (theme: Theme) => void
  /** Light/dark/system selector. */
  mode: AppearanceMode
  setMode: (mode: AppearanceMode) => void
  /** All registered theme ids — for theme pickers. */
  themes: readonly Theme[]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const appearance = useSettingsStore((s) => s.settings.appearance)
  const setSetting = useSettingsStore((s) => s.set)
  const themes = useThemesStore((s) => s.themes)
  const themesLoaded = useThemesStore((s) => s.loaded)
  const fetchThemes = useThemesStore((s) => s.fetch)

  const { uiDensity, accentColor, animations, appearanceMode, lightTheme, darkTheme } = appearance

  // Track OS dark-mode preference so `system` mode can flip themes when the
  // user toggles their OS appearance without restarting the app.
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(getSystemPrefersDark)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    fetchThemes()
  }, [fetchThemes])

  // Compute the effective theme based on appearance mode + OS preference.
  // Falls back to whatever `theme` is set to if the configured light/dark
  // theme id isn't in the registry yet (e.g. a plugin theme uninstalled).
  // Also skips themes that the registry validated as broken — pointing the
  // resolved theme at one would half-paint the app with no recovery.
  const resolvedTheme = useMemo<string>(() => {
    const selectable = new Set(
      themes.filter((t) => !t.validation || t.validation.ok).map((t) => t.id),
    )
    const safe = (id: string, fallback: string) => (selectable.has(id) ? id : fallback)
    if (appearanceMode === 'light') return safe(lightTheme, DEFAULT_THEME_ID.LIGHT)
    if (appearanceMode === 'dark') return safe(darkTheme, DEFAULT_THEME_ID.DARK)
    // system
    const wantDark = systemPrefersDark
    return wantDark ? safe(darkTheme, DEFAULT_THEME_ID.DARK) : safe(lightTheme, DEFAULT_THEME_ID.LIGHT)
  }, [appearanceMode, lightTheme, darkTheme, systemPrefersDark, themes])

  // Mirror the resolved theme back into `appearance.theme` so other code
  // paths (Monaco editor lookup, theme-aware components) can read a single
  // source of truth without re-implementing the mode logic.
  useEffect(() => {
    if (appearance.theme !== resolvedTheme) {
      setSetting(CONFIG_KEY.APPEARANCE_THEME, resolvedTheme)
    }
  }, [resolvedTheme, appearance.theme, setSetting])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    document.documentElement.setAttribute('data-density', uiDensity)
  }, [uiDensity])

  useEffect(() => {
    document.documentElement.setAttribute('data-animations', animations ? 'on' : 'off')
  }, [animations])

  useEffect(() => {
    const root = document.documentElement
    if (accentColor && accentColor.trim() !== '') {
      root.style.setProperty('--color-accent', accentColor)
      root.style.setProperty('--color-accent-hover', `color-mix(in oklch, ${accentColor}, white 20%)`)
      root.style.setProperty('--color-accent-muted', `color-mix(in oklch, ${accentColor}, transparent 80%)`)
      root.style.setProperty('--color-focus-ring', accentColor)
    } else {
      root.style.removeProperty('--color-accent')
      root.style.removeProperty('--color-accent-hover')
      root.style.removeProperty('--color-accent-muted')
      root.style.removeProperty('--color-focus-ring')
    }
  }, [accentColor])

  const themeIds = themes.map((t) => t.id)

  // Picking a theme updates the corresponding side (light or dark) so the
  // mode toggle stays meaningful. If the user is in system mode, we still
  // pin the theme by its type so flipping the OS mode picks the same theme
  // family the user just chose.
  const setTheme = (newTheme: Theme) => {
    const meta = themes.find((t) => t.id === newTheme)
    // Refuse to land on a theme that's missing required tokens. A broken
    // theme paints the app half-styled; the picker already disables these
    // visually, but a programmatic call (URL handler, command palette,
    // restored settings from a stale config) shouldn't be able to bypass
    // that. The validation report comes from the registry, so absence
    // means "not yet validated" (e.g. the baseline Nightshift entry) and
    // is treated as selectable.
    if (meta?.validation && !meta.validation.ok) {
      console.warn(
        `[themes] refusing to set '${newTheme}': missing required tokens ` +
          meta.validation.missingRequired.join(', '),
      )
      return
    }
    const side: 'lightTheme' | 'darkTheme' = meta?.type === 'light' ? 'lightTheme' : 'darkTheme'
    setSetting(`appearance.${side}`, newTheme)
    setSetting(CONFIG_KEY.APPEARANCE_THEME, newTheme)
    // If the user is in a fixed mode that doesn't match this theme's type,
    // flip the mode too — picking a light theme while stuck in dark mode is
    // clearly unintended.
    if (
      (appearanceMode === 'dark' && meta?.type === 'light') ||
      (appearanceMode === 'light' && meta?.type === 'dark')
    ) {
      setSetting('appearance.appearanceMode', meta!.type)
    }
  }

  const setMode = (m: AppearanceMode) => {
    setSetting('appearance.appearanceMode', m)
  }

  // Don't block first paint: the baseline CSS already styles the app, and
  // the fallback theme list contains Nightshift, so rendering before the
  // IPC fetch completes is safe.
  if (!themesLoaded && themes.length === 0) return null

  return (
    <ThemeContext value={{ theme: resolvedTheme, setTheme, mode: appearanceMode, setMode, themes: themeIds }}>
      {children}
    </ThemeContext>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
