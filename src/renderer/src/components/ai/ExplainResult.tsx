import { useCallback, useEffect } from 'react'
import { Sparkles, Copy, RefreshCcw, MessageSquarePlus, Square, AlertCircle } from 'lucide-react'
import { Button } from '@/primitives/forms/Button'
import { Text, Box } from '@/primitives'
import { Flex } from '@/primitives/layout/Flex'
import { MarkdownContent } from '@/components/ai/MarkdownContent'
import { useTabsStore } from '@/stores/tabs'
import { useExplainStore } from '@/stores/explain'
import { useAIStore } from '@/stores/ai'
import { useUiStore } from '@/stores/ui'
import { notifyError } from '@/lib/notify-error'
import { parseAppError } from '@/lib/db-error'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
import { useTranslation } from '@/i18n/I18nProvider'
import { t as coreT } from '@shared/i18n'

export function ExplainResult({ tabId, explanation }: { tabId: string; explanation: string | null }) {
  const { t } = useTranslation()
  const per = useExplainStore(s => s.byTab[tabId])
  const setTabAiExplanation = useTabsStore(s => s.setTabAiExplanation)

  // Subscribe to streaming events for THIS tab. The event channel is broadcast
  // to all renderers; filter by streamId to only consume our own stream.
  useEffect(() => {
    const off = window.electronAPI.on(IPC_EVENTS.AI_EXPLAIN_EVENT, (event: unknown) => {
      const e = event as { streamId: string; kind: string; text?: string; durationMs?: number; message?: string }
      const cur = useExplainStore.getState().byTab[tabId]
      if (!cur || e.streamId !== cur.streamId) return
      if (e.kind === 'token' && e.text) {
        useExplainStore.getState().appendToken(tabId, e.text)
      } else if (e.kind === 'done') {
        const finalText = useExplainStore.getState().byTab[tabId]?.streamingText ?? ''
        setTabAiExplanation(tabId, finalText)
        useExplainStore.getState().finishStream(tabId, e.durationMs ?? 0)
      } else if (e.kind === 'error') {
        useExplainStore.getState().failStream(tabId, e.message ?? coreT('aiui.explain.streamFailed'))
      }
    })
    return off
  }, [tabId, setTabAiExplanation])

  if (!per?.loading && !explanation && !per?.error) return null

  const streamingText = per?.streamingText ?? ''
  const display = streamingText || explanation || ''

  return (
    <Box className="border-t border-accent/30 bg-bg-secondary shrink-0">
      <Flex align="center" gap="sm" className="px-3 py-1.5 border-b border-border-default/40">
        <Sparkles size={12} className="text-accent" />
        <Text size="xs" className="text-accent font-medium">{t('aiui.explain.explanation')}</Text>
        <Flex align="center" gap="xs" className="ml-auto">
          {per?.loading
            ? <StopButton tabId={tabId} streamId={per?.streamId} />
            : <ModelDurationLabel model={per?.model} durationMs={per?.durationMs} />}
        </Flex>
      </Flex>
      <Box className="px-3 py-2 text-sm text-text-secondary max-h-48 overflow-auto">
        {per?.error
          ? <ErrorRow message={per.error} />
          : per?.loading && !streamingText
            ? <SkeletonBody />
            : <MarkdownContent content={display} />}
      </Box>
      {!per?.loading && (explanation || streamingText) ? (
        <ActionBar tabId={tabId} text={display} />
      ) : null}
    </Box>
  )
}

function StopButton({ tabId, streamId }: { tabId: string; streamId: string | null | undefined }) {
  const { t } = useTranslation()
  return (
    <Button
      variant="ghost"
      size="xs"
      className="!h-6 !px-1.5 gap-1 text-text-muted"
      onClick={() => {
        if (streamId) void window.electronAPI.invoke(IPC_CHANNELS.AI_EXPLAIN_ABORT, streamId)
        useExplainStore.getState().failStream(tabId, coreT('aiui.explain.stopped'))
      }}
    >
      <Square size={10} /> {t('aiui.explain.stop')}
    </Button>
  )
}

function ModelDurationLabel({ model, durationMs }: { model: string | null | undefined; durationMs: number | null | undefined }) {
  if (!model && durationMs == null) return null
  const ms = durationMs != null ? (durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`) : null
  return <Text size="xs" color="muted">{[model, ms].filter(Boolean).join(' · ')}</Text>
}

function ErrorRow({ message }: { message: string }) {
  return (
    <Flex align="center" gap="xs">
      <AlertCircle size={12} className="text-error" />
      <Text size="xs" color="error">{message}</Text>
    </Flex>
  )
}

function SkeletonBody() {
  return (
    <Box className="space-y-1.5 py-1">
      <Box className="h-3 rounded bg-bg-tertiary animate-pulse w-[90%]" />
      <Box className="h-3 rounded bg-bg-tertiary animate-pulse w-[75%]" />
      <Box className="h-3 rounded bg-bg-tertiary animate-pulse w-[60%]" />
    </Box>
  )
}

function ActionBar({ tabId, text }: { tabId: string; text: string }) {
  const { t } = useTranslation()
  const askInChat = useCallback(() => {
    const tab = useTabsStore.getState().tabs.find((item) => item.id === tabId)
    const sql = tab && tab.type === 'query' ? tab.sql : ''
    const prefill = `> ${sql.split('\n').join('\n> ')}\n\nFollow-up about this explanation:\n\n${text}\n\n`
    useAIStore.getState().seedComposer(prefill)
    useUiStore.getState().setSecondaryActivePanel('plugin:ai-chat')
  }, [tabId, text])

  const regenerate = useCallback(async () => {
    const tab = useTabsStore.getState().tabs.find((item) => item.id === tabId)
    if (!tab || tab.type !== 'query' || !tab.results) return
    const request = {
      sql: tab.sql,
      columns: tab.results.fields.map((f) => f.name),
      rowCount: tab.results.rowCount,
      sampleRows: tab.results.rows.slice(0, 5),
    }
    try {
      const { streamId, model } = await window.electronAPI.invoke(
        IPC_CHANNELS.AI_EXPLAIN_START,
        request,
      ) as { streamId: string; model: string }
      useExplainStore.getState().startStream(tabId, streamId, model)
    } catch (err) {
      const parsed = parseAppError(err)
      useExplainStore.getState().failStream(tabId, parsed.message)
      notifyError(err, { titlePrefix: coreT('aiui.explain.failedPrefix') })
    }
  }, [tabId])

  return (
    <Flex gap="xs" className="px-3 py-1 border-t border-border-default/40">
      <Button variant="ghost" size="xs" className="!h-6 !px-1.5 gap-1" onClick={() => navigator.clipboard.writeText(text)}>
        <Copy size={10} /> {t('aiui.explain.copy')}
      </Button>
      <Button variant="ghost" size="xs" className="!h-6 !px-1.5 gap-1" onClick={regenerate}>
        <RefreshCcw size={10} /> {t('aiui.explain.regenerate')}
      </Button>
      <Button variant="ghost" size="xs" className="!h-6 !px-1.5 gap-1" onClick={askInChat}>
        <MessageSquarePlus size={10} /> {t('aiui.explain.askFollowUp')}
      </Button>
    </Flex>
  )
}
