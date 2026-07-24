import { useCallback, useEffect, useRef, useState } from 'react'
import { useToastStore } from '@/stores/toast'
import { Stack, Toast, Box, cn } from '@/primitives'
import type { ToastTone } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'

const LEAVE_MS = 300
const DEFAULT_DURATION = 5000

/** The kit's guideline — "do not stack more than 3 toasts" — enforced rather
 *  than drawn. Past three, a stack stops being glanceable and becomes a log;
 *  the oldest give way to the newest. */
const MAX_VISIBLE = 3

type ToastData = {
  id: string
  type: 'error' | 'success' | 'info' | 'warning'
  title: string
  message?: string
  persistent?: boolean
  duration?: number
  action?: { label: string; onClick: () => void }
}
type RenderToast = ToastData & { leaving?: boolean }

/** The store speaks in kinds; the primitive speaks in tones. */
const TONE: Record<ToastData['type'], ToastTone> = {
  error: 'error',
  success: 'success',
  info: 'info',
  warning: 'warning',
}

export function ToastContainer() {
  const { t } = useTranslation()
  const toasts = useToastStore(s => s.toasts)
  const removeToast = useToastStore(s => s.removeToast)
  const [items, setItems] = useState<RenderToast[]>([])

  // Sync store -> local: append new toasts, refresh kept ones (so in-place updates like
  // loading -> success apply), and flag any that left the store as `leaving`.
  useEffect(() => {
    setItems((prev) => {
      const byId = new Map(toasts.map((x) => [x.id, x as ToastData]))
      const prevIds = new Set(prev.map((x) => x.id))
      const kept = prev.map((it) =>
        byId.has(it.id) ? { ...(byId.get(it.id) as ToastData), leaving: false } : { ...it, leaving: true }
      )
      const added = toasts
        .filter((x) => !prevIds.has(x.id))
        .map((x) => ({ ...(x as ToastData), leaving: false }))
      return [...kept, ...added]
    })
  }, [toasts])

  // X click or countdown elapsed -> tell the store; the sync effect flags it leaving,
  // the child animates out, then onLeft drops it from local.
  const handleRequestDismiss = useCallback((id: string) => removeToast(id), [removeToast])
  const handleLeft = useCallback((id: string) => setItems((prev) => prev.filter((x) => x.id !== id)), [])

  if (items.length === 0) return null

  // Newest wins. A toast already animating out still has to render until it has
  // finished, so it doesn't count against the cap.
  const live = new Set(items.filter((x) => !x.leaving).slice(-MAX_VISIBLE))
  const visible = items.filter((x) => x.leaving || live.has(x))

  return (
    <Stack
      gap="none"
      className="pointer-events-none fixed right-4 bottom-10 z-50 w-95 max-w-[calc(100vw-2rem)]"
      aria-live="polite"
      aria-relevant="additions"
    >
      {visible.map((it) => (
        <ToastItem
          key={it.id}
          data={it}
          leaving={!!it.leaving}
          dismissLabel={t('shell.toast.dismiss')}
          onRequestDismiss={handleRequestDismiss}
          onLeft={handleLeft}
        />
      ))}
    </Stack>
  )
}

/**
 * The motion wrapper. It owns entering, leaving and the gap; the Toast owns
 * everything you can see. Splitting there is what lets the height collapse on
 * exit without the toast needing to know it's in a stack.
 */
function ToastItem({
  data,
  leaving,
  dismissLabel,
  onRequestDismiss,
  onLeft,
}: {
  data: RenderToast
  leaving: boolean
  dismissLabel: string
  onRequestDismiss: (id: string) => void
  onLeft: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const persistent = !!data.persistent
  // A persistent info toast is the app's "still working" state.
  const isLoading = persistent && data.type === 'info'

  // Entrance: render from the initial state, release next frame so CSS transitions in.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
    return () => cancelAnimationFrame(r)
  }, [])

  // Exit: when `leaving` flips true, collapse the measured height, then notify.
  useEffect(() => {
    if (!leaving) return
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onLeft(data.id)
      return
    }
    el.style.maxHeight = `${el.scrollHeight}px`
    void el.offsetHeight // reflow so the next change animates
    el.style.maxHeight = '0px'
    const tm = window.setTimeout(() => onLeft(data.id), LEAVE_MS + 40)
    return () => window.clearTimeout(tm)
  }, [leaving, data.id, onLeft])

  return (
    <Box
      ref={ref}
      className={cn(
        'toast-item mt-[var(--toast-gap)] [&:first-child]:mt-0',
        !entered && 'is-enter',
        leaving && 'is-leaving'
      )}
    >
      <Toast
        tone={TONE[data.type]}
        title={data.title}
        description={data.message}
        action={data.action}
        loading={isLoading}
        dismissLabel={dismissLabel}
        // Persistent toasts get no timer and no track.
        duration={persistent ? undefined : (data.duration ?? DEFAULT_DURATION)}
        onDismiss={() => onRequestDismiss(data.id)}
      />
    </Box>
  )
}
