import { useEffect, useRef } from 'react'
import { platform as detectedPlatform } from '@/lib/platform'
import { IPC_CHANNELS } from '@shared/ipc'
import { WindowControls } from './WindowControls'
import { MenuBar } from './MenuBar'
import { ipc } from '@/platform/client'

/** Override the detected host platform — used by Storybook to preview the bar
 *  as it renders on each OS. In the app it's left unset and auto-detected. */
export type TitleBarPlatform = NodeJS.Platform | 'web'

interface TitleBarProps {
  platform?: TitleBarPlatform
}

/**
 * The application title bar — owned and styled by the app on every platform.
 *
 * The bar is deliberately bare: the brand mark and the dev badge lived here and
 * earned their space back for whatever the app puts in the title bar next. The
 * mark still identifies the app where an OS surface needs it (dock, taskbar) and
 * in the About window.
 *
 * Native window controls are preserved wherever the OS provides them, so we
 * only lay out *around* them:
 *   • macOS  — leave room on the left for the native traffic lights.
 *   • Windows — the inner row is sized to the Window Controls Overlay area via
 *     the `env(titlebar-area-*)` variables, so content never slides under the
 *     native min/max/close buttons (which the OS draws at top-right).
 *   • Linux  — no overlay API, so we render our own {@link WindowControls}.
 *
 * The whole bar is a drag region; interactive bits opt out with `no-drag`.
 */
export function TitleBar({ platform = detectedPlatform }: TitleBarProps = {}) {
  const isMac = platform === 'darwin'
  const barRef = useRef<HTMLDivElement>(null)

  // macOS draws the traffic lights over our bar, and only the app can position
  // them. The bar's height follows the UI density setting, so report the
  // measured height and let the main process re-centre them — observed rather
  // than computed, so it stays right whatever changes the bar's height.
  useEffect(() => {
    if (!isMac) return
    const el = barRef.current
    if (!el) return
    // Always measure the border box. A ResizeObserver entry's contentRect
    // excludes the bottom border, which would report a height 1px short of the
    // first-paint measurement and leave the lights a pixel high.
    const report = (): void => {
      const h = el.getBoundingClientRect().height
      if (h > 0) void ipc.optional(IPC_CHANNELS.WINDOW_SET_TITLEBAR_HEIGHT, h)
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isMac])

  return (
    <div
      ref={barRef}
      className="drag-region flex items-center h-10 bg-bg-primary px-0 border-b border-border shrink-0"
    >
      <div
        className="flex items-center h-full"
        // On Windows these resolve to the overlay's available rectangle; on
        // every other platform they're undefined and fall back to the full bar.
        style={{ marginLeft: 'env(titlebar-area-x, 0px)', width: 'env(titlebar-area-width, 100%)' }}
      >
        {/* Keeps the left edge clear of the OS traffic lights on macOS, so
            anything added to the bar starts clear of them. A fixed pixel value,
            not a spacing step: the OS draws the lights at a fixed size, so an
            inset that scaled with UI density would strand them in dead space.
            They end at 67px (15px in, three 12px buttons, 8px apart); the rest
            is breathing room. Carried as an inline width — the sanctioned way to
            pin a density-independent pixel value (a named width step would be
            density-scaled). The Windows/Linux side is a normal spacing step. */}
        <div
          className={`shrink-0 ${isMac ? '' : 'w-4'}`}
          style={isMac ? { width: 88 } : undefined}
          aria-hidden
        />
        {/* Windows/Linux render our app-designed menu bar here (macOS uses the
            global native menu). */}
        {!isMac && <MenuBar />}
        <div className="flex-1 h-full" />
        {/* Windows + Linux draw their own controls (macOS uses native traffic
            lights). They're h-full so they always match the bar height. */}
        {!isMac && <WindowControls />}
      </div>
    </div>
  )
}
