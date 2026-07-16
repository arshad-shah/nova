import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, Loader2, RotateCcw, X, Check } from 'lucide-react'
import { useAIStore } from '@/stores/ai'
import { useTranslation } from '@/i18n/I18nProvider'
import { Box } from '@/primitives'

const AUTO_TRIGGER_THRESHOLD = 0.80
const FORCED_WARNING_THRESHOLD = 0.95
const DELAY_MS = 5_000

type Phase =
  | { kind: 'idle' }
  | { kind: 'pending' }            // ≥80%, countdown active
  | { kind: 'compacting' }
  | { kind: 'success' }
  | { kind: 'forced' }             // ≥95%, suppression overridden, no auto-run

/**
 * Watches token usage vs context window and drives the auto-compact UX.
 * Phases:
 *   - idle: nothing to do; the component returns null.
 *   - pending: ≥80% used, countdown 5s. Buttons: Now / Skip.
 *   - compacting: compactConversation in flight.
 *   - success: prior messages snapshot available; Undo button + auto-dismiss.
 *   - forced: ≥95% used; suppression ignored, manual click required.
 */
export function AutoCompactBanner() {
  const { t } = useTranslation()
  const messages = useAIStore((s) => s.messages)
  const stats = useAIStore((s) => s.sessionStats)
  const isStreaming = useAIStore((s) => s.isStreaming)
  const isAwaiting = useAIStore((s) => s.isAwaitingResponse)
  const isCompacting = useAIStore((s) => s.isCompacting)
  const activeModel = useAIStore((s) => s.activeModel)
  const models = useAIStore((s) => s.models)
  const activeId = useAIStore((s) => s.activeConversationId)
  const suppressed = useAIStore((s) => (activeId ? Boolean(s.autoCompactSuppressed[activeId]) : false))
  const lastSnapshot = useAIStore((s) => s.lastPreCompactMessages)

  const compact = useAIStore((s) => s.compactConversation)
  const undo = useAIStore((s) => s.undoLastCompact)
  const suppress = useAIStore((s) => s.suppressAutoCompactForActive)

  const ctxWindow = models.find((m) => m.id === activeModel)?.contextWindow ?? null
  const used = stats.totalInputTokens + stats.totalOutputTokens
  const pct = ctxWindow && ctxWindow > 0 ? used / ctxWindow : 0

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const timer = useRef<number | undefined>(undefined)
  const successTimer = useRef<number | undefined>(undefined)
  const justCompactedRef = useRef(false)

  useEffect(() => {
    if (isCompacting) {
      window.clearTimeout(timer.current)
      setPhase({ kind: 'compacting' })
      return
    }
    if (justCompactedRef.current && !isCompacting) {
      justCompactedRef.current = false
      setPhase({ kind: 'success' })
      window.clearTimeout(successTimer.current)
      successTimer.current = window.setTimeout(() => setPhase({ kind: 'idle' }), 8_000)
      return
    }
    if (pct >= FORCED_WARNING_THRESHOLD && messages.length >= 6) {
      window.clearTimeout(timer.current)
      setPhase({ kind: 'forced' })
      return
    }
    if (pct >= AUTO_TRIGGER_THRESHOLD && !suppressed && messages.length >= 6 && !isStreaming && !isAwaiting) {
      if (phase.kind !== 'pending') {
        window.clearTimeout(timer.current)
        setPhase({ kind: 'pending' })
        timer.current = window.setTimeout(() => {
          justCompactedRef.current = true
          void compact()
        }, DELAY_MS)
      }
      return
    }
    if (phase.kind === 'pending' || phase.kind === 'forced') {
      window.clearTimeout(timer.current)
      setPhase({ kind: 'idle' })
    }
  }, [pct, suppressed, messages.length, isStreaming, isAwaiting, isCompacting, compact, phase.kind])

  useEffect(() => () => {
    window.clearTimeout(timer.current)
    window.clearTimeout(successTimer.current)
  }, [])

  if (phase.kind === 'idle') return null

  if (phase.kind === 'pending') {
    return (
      <Wrapper tone="warn">
        <AlertTriangle size={12} className="shrink-0" />
        <Box as="span" className="flex-1 text-[11px]"><strong>{t('aiui.autoCompact.usedPct', { pct: Math.round(pct * 100) })}</strong> {t('aiui.autoCompact.pending')}</Box>
        <button className="rounded bg-warning text-[10px] font-medium px-2 py-0.5 text-bg-primary"
          onClick={() => { window.clearTimeout(timer.current); justCompactedRef.current = true; void compact() }}>
          {t('aiui.autoCompact.now')}
        </button>
        <button className="rounded border border-warning/50 text-warning text-[10px] px-2 py-0.5"
          onClick={() => { window.clearTimeout(timer.current); suppress(); setPhase({ kind: 'idle' }) }}>
          {t('aiui.autoCompact.skip')}
        </button>
      </Wrapper>
    )
  }

  if (phase.kind === 'compacting') {
    return (
      <Wrapper tone="info">
        <Loader2 size={12} className="shrink-0 animate-spin" />
        <Box as="span" className="flex-1 text-[11px]">{t('aiui.autoCompact.compacting')}</Box>
      </Wrapper>
    )
  }

  if (phase.kind === 'success') {
    return (
      <Wrapper tone="ok">
        <Check size={12} className="shrink-0" />
        <Box as="span" className="flex-1 text-[11px]">{t('aiui.autoCompact.success')}</Box>
        {lastSnapshot ? (
          <button className="rounded border border-success/50 text-success text-[10px] px-2 py-0.5 inline-flex items-center gap-1"
            onClick={() => { void undo(); setPhase({ kind: 'idle' }) }}>
            <RotateCcw size={10} /> {t('aiui.autoCompact.undo')}
          </button>
        ) : null}
        <button className="text-success/70 hover:text-success" aria-label={t('aiui.autoCompact.dismiss')}
          onClick={() => setPhase({ kind: 'idle' })}>
          <X size={12} />
        </button>
      </Wrapper>
    )
  }

  // forced
  return (
    <Wrapper tone="error">
      <AlertTriangle size={12} className="shrink-0" />
      <Box as="span" className="flex-1 text-[11px]"><strong>{t('aiui.autoCompact.usedPct', { pct: Math.round(pct * 100) })}</strong> {t('aiui.autoCompact.forced')}</Box>
      <button className="rounded bg-error text-[10px] font-medium px-2 py-0.5 text-bg-primary"
        onClick={() => { justCompactedRef.current = true; void compact() }}>
        {t('aiui.autoCompact.compactNow')}
      </button>
    </Wrapper>
  )
}

function Wrapper({ tone, children }: { tone: 'warn' | 'info' | 'ok' | 'error'; children: ReactNode }) {
  const bg = tone === 'warn' ? 'bg-warning/10 border-warning/30 text-warning'
    : tone === 'info' ? 'bg-accent/10 border-accent/30 text-accent'
    : tone === 'ok' ? 'bg-success/10 border-success/30 text-success'
    : 'bg-error/10 border-error/30 text-error'
  return (
    <Box className={`flex items-center gap-2 px-3 py-2 border-b ${bg}`}>
      {children}
    </Box>
  )
}
