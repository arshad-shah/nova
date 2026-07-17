import { t } from '@shared/i18n'

/** Human-readable "time since" — "just now", "5m ago", "3h ago", "2d ago".
 *  Uses the shared (non-React) `t`, so it reflects the current locale at call
 *  time without threading a translate function through every caller. */
export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return t('shell.notifications.justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('shell.notifications.minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('shell.notifications.hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  return t('shell.notifications.daysAgo', { count: days })
}

/** Zero-pad a number to `width` digits. Shared so callers don't re-declare it. */
export const pad = (n: number, width = 2): string => String(n).padStart(width, '0')

/** Compact elapsed-time formatting for a millisecond duration: sub-second reads
 *  `"420ms"`, one second and up reads `"1.4s"`. The one home for the ms→string
 *  ladder that the query gutter and AI explain panels each hand-rolled. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** Wall-clock time of a timestamp, `HH:MM:SS`. */
export function formatClockTime(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Wall-clock time with milliseconds, `HH:MM:SS.mmm`. */
export function formatClockTimeWithMillis(ts: number): string {
  const d = new Date(ts)
  return `${formatClockTime(ts)}.${pad(d.getMilliseconds(), 3)}`
}
