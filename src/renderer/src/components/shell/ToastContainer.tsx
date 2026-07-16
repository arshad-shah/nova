import { useCallback, useEffect, useRef, useState } from 'react'
import { X, AlertCircle, CheckCircle, Info, Loader2 } from 'lucide-react'
import { useToastStore } from '@/stores/toast'
import { Stack, Flex, Text, IconButton, Box, cn } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'

const LEAVE_MS = 300
const DEFAULT_DURATION = 5000

type ToastData = {
  id: string
  type: 'error' | 'success' | 'info'
  title: string
  message?: string
  persistent?: boolean
  duration?: number
}
type RenderToast = ToastData & { leaving?: boolean }

const icons = { error: AlertCircle, success: CheckCircle, info: Info } as const

export function ToastContainer() {
  const { t } = useTranslation()
  const { toasts, removeToast } = useToastStore()
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

  return (
    <Stack
      gap="none"
      className="fixed bottom-10 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] pointer-events-none"
      aria-live="polite"
      aria-relevant="additions"
    >
      {items.map((it) => (
        <ToastView
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

function ToastView({
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
  const isLoading = persistent && data.type === 'info'
  const Icon = isLoading ? Loader2 : icons[data.type]

  // entrance: render from initial state, release next frame so CSS transitions in
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
    return () => cancelAnimationFrame(r)
  }, [])

  // auto-dismiss countdown with pause-on-hover (non-persistent only)
  const remaining = useRef(data.duration ?? DEFAULT_DURATION)
  const startedAt = useRef(0)
  const timer = useRef<number | null>(null)
  const paused = useRef(false)
  const clear = useCallback(() => {
    if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null }
  }, [])
  const arm = useCallback(() => {
    if (persistent) return
    startedAt.current = Date.now()
    timer.current = window.setTimeout(() => onRequestDismiss(data.id), Math.max(0, remaining.current))
  }, [persistent, data.id, onRequestDismiss])
  useEffect(() => { arm(); return clear }, [arm, clear])
  useEffect(() => { if (leaving) clear() }, [leaving, clear])

  // exit: when `leaving` flips true, collapse height (measured) then notify the container
  useEffect(() => {
    if (!leaving) return
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onLeft(data.id); return }
    el.style.maxHeight = `${el.scrollHeight}px`
    void el.offsetHeight // reflow so the next change animates
    el.style.maxHeight = '0px'
    const tm = window.setTimeout(() => onLeft(data.id), LEAVE_MS + 40)
    return () => window.clearTimeout(tm)
  }, [leaving, data.id, onLeft])

  const handleMouseEnter = () => {
    if (persistent || paused.current || leaving) return
    paused.current = true; clear(); remaining.current -= Date.now() - startedAt.current
  }
  const handleMouseLeave = () => {
    if (persistent || !paused.current || leaving) return
    paused.current = false; arm()
  }

  return (
    <Box
      ref={ref}
      role={data.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ ['--dur' as string]: `${data.duration ?? DEFAULT_DURATION}ms` }}
      className={cn(
        'vq-toast',
        data.type,
        '[&:first-child]:mt-0 mt-[var(--toast-gap)]',
        !entered && 'is-enter',
        leaving && 'is-leaving',
        !persistent && !leaving && 'is-running',
      )}
    >
      <Flex align="start" gap="sm">
        <Icon size={16} aria-hidden className={cn('vq-toast__icon shrink-0 mt-0.5', isLoading && 'vq-toast__spin')} />
        <Box className="flex-1 min-w-0">
          <Text size="sm" weight="medium" as="p">{data.title}</Text>
          {data.message && (
            <Text size="xs" color="secondary" as="p" className="mt-0.5 whitespace-pre-wrap break-words">
              {data.message}
            </Text>
          )}
        </Box>
        <IconButton
          label={dismissLabel}
          size="xs"
          variant="ghost"
          onClick={() => onRequestDismiss(data.id)}
          className="shrink-0 -mr-1 -mt-0.5 text-text-muted hover:text-text-primary"
        >
          <X size={14} />
        </IconButton>
      </Flex>
      {!persistent && <Box as="span" aria-hidden className="vq-toast__track" />}
    </Box>
  )
}
