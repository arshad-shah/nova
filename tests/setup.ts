import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

/**
 * jsdom does not implement `HTMLDialogElement.showModal()` / `.close()`.
 *
 * The `Modal` primitive is built on a native `<dialog>`, so without these any
 * component that renders an open Modal throws "dialog.showModal is not a
 * function" — which silently makes a whole class of components (command
 * palette, approval dialogs) untestable in the unit project. This was
 * previously stubbed per test file; centralising it means a new Modal test
 * just works.
 *
 * These are STUBS, not a polyfill. Behaviour the real element owns is not
 * simulated: the top layer, true modality, focus trapping, and Escape emitting
 * `cancel`/`close`. To test an Escape dismissal, dispatch what the browser
 * would:
 *     fireEvent(dialog, new Event('close'))
 * Anything that depends on real modality belongs in the Storybook/Playwright
 * project, which runs a real browser.
 */
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= vi.fn(function showModal(this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close ??= vi.fn(function close(this: HTMLDialogElement) {
    this.open = false
    this.dispatchEvent(new Event('close'))
  })
}
