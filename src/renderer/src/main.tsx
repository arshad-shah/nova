import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/shell/ErrorBoundary'
import { ThemeProvider } from './primitives/theme/ThemeProvider'
import { I18nProvider } from './i18n/I18nProvider'
import { SplashScreen } from './components/shell/SplashScreen'
import { App } from './App'
import { useSettingsStore, initSettingsListener } from '@/stores/settings'
import { useAIStore } from '@/stores/ai'
import { useQueryHistoryStore } from '@/stores/query-history'
import { initTabPersistence } from '@/lib/tab-persistence'
import { useTabsStore } from '@/stores/tabs'
import { decideStartupSurface } from '@/lib/onboarding'
import { installRendererDiagnostics } from '@/lib/store-diagnostics'
import { hydrateSavedQueries } from '@/components/saved-queries/SavedQueriesPanel'
import './styles/globals.css'
import { IPC_CHANNELS } from '@shared/ipc'
import { CONFIG_KEY } from '@shared/settings'

function AppLoader() {
  const hydrate = useSettingsStore((s) => s.hydrate)
  const loaded = useSettingsStore((s) => s.loaded)
  const editorFontFamily = useSettingsStore((s) => s.settings.editor.fontFamily)

  // Push the user's editor font onto the root `--app-font-mono` variable so
  // every `font-mono` surface (inspector, result grid, code chips, …) reflects
  // the Settings → Editor choice instead of the Tailwind default mono stack.
  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-mono', editorFontFamily)
  }, [editorFontFamily])

  useEffect(() => {
    async function init() {
      // One-time migration from localStorage to settings store
      const oldTheme = localStorage.getItem('verql-theme')
      const oldSidebarWidth = localStorage.getItem('verql-sidebar-width')

      if (oldTheme || oldSidebarWidth) {
        if (oldTheme) {
          await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS_SET, CONFIG_KEY.APPEARANCE_THEME, oldTheme)
        }
        if (oldSidebarWidth) {
          await window.electronAPI.invoke(
            IPC_CHANNELS.SETTINGS_SET,
            CONFIG_KEY.APPEARANCE_SIDEBAR_WIDTH,
            parseFloat(oldSidebarWidth)
          )
        }
        localStorage.removeItem('verql-theme')
        localStorage.removeItem('verql-sidebar-width')
        // Legacy split-ratio key is no longer used; clear it if present.
        localStorage.removeItem('verql-split-ratio')
      }

      await hydrate()
      initSettingsListener()
      // Wire verbose renderer diagnostics (state + perf). Capture stays off
      // until the dev flips the Activity panel's verbose toggle.
      installRendererDiagnostics()
      // Restore the previous session's query tabs before the shell paints,
      // gated by the user's preference. Persistence runs regardless so the
      // durable set stays fresh if they enable restore later. Backed by the
      // app-data SQLite store + the incremental tab-persistence engine.
      await initTabPersistence({
        restoreOnStartup: useSettingsStore.getState().settings.general.restoreTabsOnStartup,
      })
      // Load app-data-store–backed state (AI conversations, saved queries),
      // migrating any legacy localStorage payload on first run. Non-blocking
      // for first paint — these populate the AI panel and saved-queries list.
      void useAIStore.getState().hydrate()
      void hydrateSavedQueries()
      void useQueryHistoryStore.getState().hydrate()
      // First-run Welcome / post-update "What's New". Runs after tab restore so
      // the onboarding surface opens as the active tab, and records the running
      // version so each surface opens at most once per transition. Non-blocking.
      void (async () => {
        try {
          const { version } = await window.electronAPI.invoke(IPC_CHANNELS.APP_ABOUT_INFO)
          const onboarding = useSettingsStore.getState().settings.onboarding
          const surface = decideStartupSurface({
            lastSeenVersion: onboarding.lastSeenVersion,
            currentVersion: version,
            hideWelcomeOnStartup: onboarding.hideOnStartup,
          })
          if (surface?.kind === 'welcome') useTabsStore.getState().openWelcome()
          else if (surface?.kind === 'release-notes') useTabsStore.getState().openReleaseNotes(surface.version)
          if (onboarding.lastSeenVersion !== version) {
            void useSettingsStore.getState().set('onboarding.lastSeenVersion', version)
          }
        } catch { /* onboarding is best-effort; never block boot */ }
      })()
    }
    init()
  }, [hydrate])

  if (!loaded) {
    return (
      <ThemeProvider>
        <SplashScreen />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>
  )
}

/**
 * Tear down the pre-React splash (rendered statically in index.html) once
 * React has mounted. A short fade keeps the handoff smooth — the React-side
 * <SplashScreen> picks up immediately while settings hydrate.
 */
function dismissBootSplash() {
  const el = document.getElementById('boot-splash')
  if (!el) return
  el.classList.add('boot-splash--leaving')
  // Wait out the CSS transition before removal so we don't flash through.
  window.setTimeout(() => el.remove(), 300)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppLoader />
    </ErrorBoundary>
  </StrictMode>
)

// React has rendered (or at least scheduled) — fade out the static splash that
// covers the gap between window-shown and bundle-evaluated. Use rAF so the
// removal happens after the first React commit, not before it.
requestAnimationFrame(() => requestAnimationFrame(dismissBootSplash))
