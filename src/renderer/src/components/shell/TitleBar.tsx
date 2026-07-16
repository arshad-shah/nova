import { Text, Badge, Box } from '@/primitives'
import { VerqlMark } from '@/components/brand/VerqlMark'
import { useTranslation } from '@/i18n/I18nProvider'
import { platform as detectedPlatform } from '@/lib/platform'
import { WindowControls } from './WindowControls'
import { MenuBar } from './MenuBar'

const isDev = import.meta.env.DEV

/** Override the detected host platform — used by Storybook to preview the bar
 *  as it renders on each OS. In the app it's left unset and auto-detected. */
export type TitleBarPlatform = NodeJS.Platform | 'web'

interface TitleBarProps {
  platform?: TitleBarPlatform
}

/**
 * The application title bar — owned and styled by the app on every platform.
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
  const { t } = useTranslation()
  const isMac = platform === 'darwin'
  return (
    <div className="drag-region flex items-center h-10 bg-bg-primary px-0 border-b border-border shrink-0">
      <div
        className="flex items-center h-full"
        // On Windows these resolve to the overlay's available rectangle; on
        // every other platform they're undefined and fall back to the full bar.
        style={{ marginLeft: 'env(titlebar-area-x, 0px)', width: 'env(titlebar-area-width, 100%)' }}
      >
        <div className={`no-drag flex items-center gap-2 ${isMac ? 'pl-20' : 'pl-4'}`}>
          {/* The bare mark, not the tiled app icon — the tile is for OS surfaces
              (dock, taskbar) that need a container; in-app the mark sits
              directly on the title bar. */}
          <VerqlMark size={24} variant="color" />
          {/* Wordmark: lowercase, tight tracking. Lowercased in CSS rather than
              in the catalogue so the translated app name stays a proper noun
              everywhere else it's used. */}
          <Text size="sm" weight="semibold" color="primary" className="lowercase tracking-[-0.02em]">
            {t('shell.titleBar.appName')}
          </Text>
          {isDev && (
            <Badge variant="warning" size="sm" className="text-[9px] leading-none">
              {t('shell.statusBar.dev')}
            </Badge>
          )}
        </div>
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
