import { StrictMode, useEffect, useState } from 'react'
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
import { runRendererBoot } from '@/lib/boot'
import { scheduleBootSplashDismissal } from '@/lib/boot-splash'
import './styles/globals.css'
import { IPC_CHANNELS } from '@shared/ipc'
import { CONFIG_KEY } from '@shared/settings'
import { ipc } from '@/platform/client'

/** One-time migration of two cosmetic preferences from localStorage into the
 *  settings store. The keys are cleared only once every write has landed, so a
 *  partial failure simply retries on the next launch. */
async function migrateLegacyPreferences(): Promise<void> {
  const oldTheme = localStorage.getItem('verql-theme')
  const oldSidebarWidth = localStorage.getItem('verql-sidebar-width')
  if (!oldTheme && !oldSidebarWidth) return

  if (oldTheme) {
    await ipc.invoke(IPC_CHANNELS.SETTINGS_SET, CONFIG_KEY.APPEARANCE_THEME, oldTheme)
  }
  if (oldSidebarWidth) {
    await ipc.invoke(
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

/** Everything that runs once settings are in place. The shell is already on
 *  screen by now, so each of these degrades a feature rather than the app —
 *  `runRendererBoot` reports a failure here and carries on. */
async function startBackgroundWork(): Promise<void> {
  initSettingsListener()
  // Wire verbose renderer diagnostics (state + perf). Capture stays off
  // until the dev flips the Activity panel's verbose toggle.
  installRendererDiagnostics()
  // Restore the previous session's query tabs, gated by the user's preference.
  // Persistence runs regardless so the durable set stays fresh if they enable
  // restore later. Backed by the app-data SQLite store + the incremental
  // tab-persistence engine.
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
      const { version } = await ipc.invoke(IPC_CHANNELS.APP_ABOUT_INFO)
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

function AppLoader() {
  const hydrate = useSettingsStore((s) => s.hydrate)
  const loaded = useSettingsStore((s) => s.loaded)
  const editorFontFamily = useSettingsStore((s) => s.settings.editor.fontFamily)
  // A fatal boot failure (see lib/boot.ts). Held in state and rethrown during
  // render so the <ErrorBoundary> above — which sits outside every provider and
  // can therefore always paint — turns it into a readable screen with a retry,
  // instead of leaving the splash up forever with no explanation.
  const [bootError, setBootError] = useState<Error | null>(null)

  // Push the user's editor font onto the root `--app-font-mono` variable so
  // every `font-mono` surface (inspector, result grid, code chips, …) reflects
  // the Settings → Editor choice instead of the Tailwind default mono stack.
  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-mono', editorFontFamily)
  }, [editorFontFamily])

  useEffect(() => {
    void runRendererBoot({
      migrateLegacyPreferences,
      hydrateSettings: hydrate,
      afterHydrate: startBackgroundWork,
      onFatal: setBootError,
    })
  }, [hydrate])

  // Rethrown during render, not from the effect: a throw inside an async effect
  // callback escapes React entirely and lands as an unhandled rejection, which
  // is precisely how this failure used to go unreported.
  if (bootError) throw bootError

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppLoader />
    </ErrorBoundary>
  </StrictMode>
)

// React has rendered (or at least scheduled) — bring down the static splash
// that covered the gap between window-shown and bundle-evaluated. See
// lib/boot-splash.ts for why this is scheduled two independent ways.
scheduleBootSplashDismissal()
