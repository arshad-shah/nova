/**
 * The renderer's boot sequence, as a pure function over injected steps.
 *
 * It lives here rather than inline in `main.tsx` for one reason: what happens
 * when a boot step *fails* is the whole point of this module, and that is not
 * something you can assert on an entry file whose import has side effects.
 *
 * The rule it encodes: **boot has two phases, split by what a failure costs.**
 *
 *  1. **Settings hydrate.** Nothing renders without it — `<AppLoader>` keeps
 *     `<SplashScreen>` up until the settings store reports `loaded`. A failure
 *     here is therefore fatal, and has to be *surfaced*. It used to be an
 *     unhandled rejection, which is exactly how a broken preload bridge (the
 *     sandboxed preload importing `node:crypto`, #226) presented to users as an
 *     app permanently stuck on the splash screen with no error anywhere.
 *
 *  2. **Everything after it** — the settings listener, diagnostics, tab
 *     restore, AI/saved-query/history hydration, onboarding. By then the shell
 *     is on screen and usable, so a failure must cost one feature, not the
 *     whole window. These are reported and stepped over.
 *
 * The legacy-preference migration runs before phase 1 and is best-effort in its
 * own right: it carries two cosmetic values, and its localStorage keys are only
 * cleared on success, so a failure simply retries on the next launch.
 */

export interface RendererBootSteps {
  /** One-time localStorage → settings-store migration. Best-effort. */
  migrateLegacyPreferences: () => Promise<void>
  /** Load settings into the store. Fatal on failure — nothing renders without it. */
  hydrateSettings: () => Promise<void>
  /** Everything that can fail without stopping the app from being usable. */
  afterHydrate: () => Promise<void>
  /** Called with the fatal error so the UI can show it instead of a stuck splash. */
  onFatal: (error: Error) => void
  /** Non-fatal failure reporter. Defaults to `console.error`. */
  onRecoverable?: (stage: string, error: unknown) => void
}

/** Normalize a thrown value so `onFatal` always receives a real `Error`. */
function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * Run the boot sequence. Never rejects: every failure is routed to `onFatal`
 * (phase 1) or `onRecoverable` (phase 2), so the caller can `void` it without
 * leaving an unhandled rejection behind — the very thing that hid this class of
 * bug in the first place.
 *
 * Resolves to `true` when the app reached a usable state, `false` when boot
 * failed fatally.
 */
export async function runRendererBoot(steps: RendererBootSteps): Promise<boolean> {
  const report = steps.onRecoverable ?? ((stage, error) => {
    console.error(`[boot] ${stage} failed; continuing`, error)
  })

  try {
    await steps.migrateLegacyPreferences()
  } catch (error) {
    report('legacy preference migration', error)
  }

  try {
    await steps.hydrateSettings()
  } catch (error) {
    steps.onFatal(asError(error))
    return false
  }

  try {
    await steps.afterHydrate()
  } catch (error) {
    report('post-hydrate startup', error)
  }

  return true
}
