import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
import { useTranslation } from '@/i18n/I18nProvider'
import { IconButton } from '@/primitives'

/**
 * App-drawn minimise / maximise / close buttons for the custom title bar.
 *
 * Only rendered on Linux, where Electron has no native Window Controls Overlay
 * (macOS keeps its traffic lights; Windows keeps the native overlay buttons).
 * Actions and maximise-state are driven through the `window:*` IPC channels so
 * the buttons stay in sync with OS-level state changes (snap, window menu,
 * double-clicking the drag region) — not just our own clicks.
 */
export function WindowControls() {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    // `electronAPI` is absent outside Electron (Storybook / tests); the buttons
    // still render so the layout is previewable, they just don't drive a window.
    const api = window.electronAPI
    if (!api) return
    let active = true
    api
      .invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED)
      .then((m) => {
        if (active) setMaximized(m === true)
      })
      .catch(() => { })
    const off = api.on(IPC_EVENTS.WINDOW_MAXIMIZE_CHANGED, (isMax) =>
      setMaximized(Boolean(isMax)),
    )
    return () => {
      active = false
      off()
    }
  }, [])

  const minimize = (): void => {
    void window.electronAPI?.invoke(IPC_CHANNELS.WINDOW_MINIMIZE)
  }
  const toggleMaximize = (): void => {
    window.electronAPI?.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE).then(setMaximized).catch(() => { })
  }
  const close = (): void => {
    void window.electronAPI?.invoke(IPC_CHANNELS.WINDOW_CLOSE)
  }

  // Title-bar controls are edge-to-edge: full height, 48px wide, square. We use
  // the IconButton primitive (ghost) and override geometry + the bespoke hover
  // states (subtle for min/max, Windows red for close) via className — twMerge
  // lets these win over the variant defaults.
  const base = 'no-drag w-12 h-full rounded-none text-text-muted focus-visible:shadow-none'
  const minMax = `${base} hover:bg-active hover:text-text-primary focus-visible:bg-active focus-visible:text-text-primary`
  const closeBtn = `${base} hover:bg-error hover:text-text-inverse focus-visible:bg-error focus-visible:text-text-inverse`

  return (
    <div className="no-drag flex items-stretch h-full">
      <IconButton variant="ghost" onClick={minimize} className={minMax} label={t('shell.titleBar.minimize')}>
        <Minus size={16} aria-hidden="true" />
      </IconButton>
      <IconButton
        variant="ghost"
        onClick={toggleMaximize}
        className={minMax}
        label={maximized ? t('shell.titleBar.restore') : t('shell.titleBar.maximize')}
      >
        {maximized ? <Copy size={13} aria-hidden="true" /> : <Square size={13} aria-hidden="true" />}
      </IconButton>
      <IconButton variant="ghost" onClick={close} className={closeBtn} label={t('shell.titleBar.close')}>
        <X size={16} aria-hidden="true" />
      </IconButton>
    </div>
  )
}
