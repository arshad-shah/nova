/**
 * Teardown for the **static** boot splash — the markup in `index.html` that
 * paints on the app window's first frame, before the renderer bundle has been
 * evaluated and React exists. (The React `<SplashScreen>` takes over from
 * there; see `main.tsx`.)
 *
 * Dismissal is deliberately belt-and-braces. The overlay is full-window,
 * `z-index: 9999` and a drag region, so anything that leaves it on screen
 * leaves the app looking hung *and* unclickable — indistinguishable, to the
 * user, from a boot that never finished.
 */

/** Matches the CSS transition on `#boot-splash` in `src/renderer/index.html`. */
const FADE_MS = 300

/**
 * Longest the splash may stay up after React has been handed the root. Only
 * the backstop uses it — the animation-frame path normally dismisses the
 * splash within a frame or two of the first commit.
 */
export const BOOT_SPLASH_MAX_MS = 4000

/**
 * Fade out and remove the static splash. Idempotent: the animation-frame path
 * and the backstop can race, and whichever runs second finds no element.
 */
export function dismissBootSplash(doc: Document = document): void {
  const el = doc.getElementById('boot-splash')
  if (!el) return
  el.classList.add('boot-splash--leaving')
  // Wait out the CSS transition before removal so we don't flash through.
  setTimeout(() => el.remove(), FADE_MS)
}

/**
 * Schedule dismissal two ways.
 *
 * A double `requestAnimationFrame` is the *preferred* trigger: it lands just
 * after React's first commit, so the handoff to the React splash has no gap.
 * But animation frames are not guaranteed to run — Chromium doesn't service
 * them for a window that is occluded or minimised, which are real launch states
 * (start-minimised, launched behind another window, a software-rendered or
 * headless session). A timer is the backstop, so the splash comes down even if
 * a frame never arrives.
 *
 * Returns a function that cancels both, for tests and teardown.
 */
export function scheduleBootSplashDismissal(doc: Document = document): () => void {
  const dismiss = (): void => dismissBootSplash(doc)
  let raf: number | undefined
  let inner: number | undefined
  if (typeof requestAnimationFrame === 'function') {
    raf = requestAnimationFrame(() => {
      inner = requestAnimationFrame(dismiss)
    })
  }
  const timer = setTimeout(dismiss, BOOT_SPLASH_MAX_MS)
  return () => {
    if (raf !== undefined) cancelAnimationFrame(raf)
    if (inner !== undefined) cancelAnimationFrame(inner)
    clearTimeout(timer)
  }
}
