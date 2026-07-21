import type { Monaco } from '@monaco-editor/react'
import { useThemesStore } from '@/stores/themes'
import { DEFAULT_THEME_ID } from '@shared/settings'

const FALLBACK_THEME_ID = DEFAULT_THEME_ID.DARK
const definedThemes = new Set<string>()
let monacoRef: Monaco | null = null

/** Register every theme that ships a Monaco definition onto the supplied
 * Monaco instance. Idempotent — re-registering a theme that's already
 * been defined is cheap and lets us re-run on subscription updates without
 * tracking per-theme dirty state. */
function syncThemesToMonaco(monaco: Monaco): void {
  monacoRef = monaco
  const themes = useThemesStore.getState().themes
  for (const t of themes) {
    if (!t.monaco) continue
    if (definedThemes.has(t.id)) continue
    monaco.editor.defineTheme(t.id, {
      base: t.monaco.base,
      inherit: true,
      colors: t.monaco.colors,
      rules: t.monaco.rules.map((r) => ({
        token: r.token,
        foreground: r.foreground,
        background: r.background,
        fontStyle: r.fontStyle
      }))
    })
    definedThemes.add(t.id)
  }
}

// Keep Monaco's theme catalogue in sync with the registry. Plugin-contributed
// themes registered after the editor mounts get picked up automatically.
useThemesStore.subscribe((state, prev) => {
  if (!monacoRef) return
  if (state.themes === prev.themes) return
  // New themes arrived — only newly added ones bypass the dedupe set.
  syncThemesToMonaco(monacoRef)
})

export function defineAppThemes(monaco: Monaco): void {
  syncThemesToMonaco(monaco)
}

/** Resolve the active app theme to a Monaco theme name. Theme ids and Monaco
 * theme names are now 1:1 — the plugin contributes its monaco def alongside
 * its app tokens. Falls back to ion if the theme isn't registered or
 * doesn't ship Monaco rules. */
export function getMonacoThemeName(appTheme: string): string {
  const themes = useThemesStore.getState().themes
  const found = themes.find((t) => t.id === appTheme && t.monaco)
  if (found) return found.id
  const fallback = themes.find((t) => t.id === FALLBACK_THEME_ID && t.monaco)
  return fallback?.id ?? 'vs-dark'
}
