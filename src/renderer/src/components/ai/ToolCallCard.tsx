import { useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, ShieldQuestion, Loader2 } from 'lucide-react'
import type { AIChatMessage } from '@shared/ai-types'
import { useAIStore } from '@/stores/ai'
import { Text } from '@/primitives/typography/Text'
import { Box } from '@/primitives/layout/Box'
import { Button } from '@/primitives/forms/Button'
import { appActions } from '@/lib/app-actions/registry'
import { CodeBlock } from './CodeBlock'
import { useTranslation } from '@/i18n/I18nProvider'
import { t } from '@shared/i18n'

interface ToolCallCardProps {
  message: AIChatMessage
  result?: AIChatMessage
}

function extractQuery(args: string): string | null {
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>
    if (parsed.query) return String(parsed.query)
    if (parsed.sql) return String(parsed.sql)
    return null
  } catch {
    return null
  }
}

function guessLanguage(query: string): string {
  try {
    JSON.parse(query)
    return 'json'
  } catch {
    return 'sql'
  }
}

function parseToolResult(content: string): { success: boolean; summary: string; detail?: string } {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    if (parsed.error) {
      return { success: false, summary: String(parsed.error) }
    }
    if (parsed.data && typeof parsed.data === 'object' && parsed.data !== null) {
      const data = parsed.data as Record<string, unknown>
      if (data.rowCount !== undefined) {
        return { success: true, summary: t('aiui.tool.rowsReturned', { count: Number(data.rowCount) }) }
      }
    }
    return { success: Boolean(parsed.success), summary: content }
  } catch {
    // Not JSON — use the display string as-is
    return { success: !content.toLowerCase().startsWith('error'), summary: content }
  }
}

function getToolLabel(name: string, args: string): string {
  // Resolve agentic UI actions to their friendly title (e.g. "Open ER Diagram")
  // rather than showing the raw tool/action id.
  if (name === 'perform_app_action') {
    try {
      const actionId = (JSON.parse(args) as { actionId?: string }).actionId
      const title = actionId ? appActions.get(actionId)?.title : undefined
      return title ?? t('aiui.tool.appAction')
    } catch {
      return t('aiui.tool.appAction')
    }
  }
  if (name.includes('execute') || name.includes('query')) return t('aiui.tool.queryExecution')
  if (name.includes('explain')) return t('aiui.tool.queryExplain')
  if (name.includes('schema') || name.includes('table') || name.includes('list')) return t('aiui.tool.schemaLookup')
  return name
}

export function ToolCallCard({ message, result }: ToolCallCardProps) {
  const { t } = useTranslation()
  const [showCode, setShowCode] = useState(false)
  const toolCall = message.toolCalls?.[0]
  if (!toolCall) return null

  const pendingApproval = useAIStore(s => s.pendingApproval)

  const query = extractQuery(toolCall.arguments)
  const label = getToolLabel(toolCall.name, toolCall.arguments)
  const parsed = result ? parseToolResult(result.content) : null
  const isWaitingApproval = !result && pendingApproval !== null
  const isExecuting = !result && pendingApproval === null

  return (
    <Box className="mb-2.5 mx-2 rounded-lg border border-border-default border-l-2 border-l-warning overflow-hidden">
      {/* Header */}
      <Button
        variant="bare"
        size="none"
        onClick={() => setShowCode(s => !s)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-tertiary)] border-b border-[var(--color-border)] hover:bg-[var(--color-hover)] transition-colors text-left"
      >
        {isWaitingApproval ? (
          <ShieldQuestion size={12} className="text-warning shrink-0" />
        ) : isExecuting ? (
          <Loader2 size={12} className="text-[var(--color-accent)] shrink-0 animate-spin" />
        ) : parsed?.success ? (
          <CheckCircle2 size={12} className="text-[var(--color-success)] shrink-0" />
        ) : (
          <XCircle size={12} className="text-[var(--color-error)] shrink-0" />
        )}
        <Box as="span" className="flex-1 text-xs font-medium text-[var(--color-text)]">{label}</Box>
        {isWaitingApproval && (
          <Box as="span" className="text-[10px] text-warning">{t('aiui.tool.awaitingApproval')}</Box>
        )}
        {isExecuting && (
          <Box as="span" className="text-[10px] text-[var(--color-text-tertiary)]">{t('aiui.tool.running')}</Box>
        )}
        {parsed && (
          <Box as="span" className={`text-[10px] ${parsed.success ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
            {parsed.success ? t('aiui.tool.done') : t('aiui.tool.failed')}
          </Box>
        )}
        {showCode ? (
          <ChevronDown size={12} className="text-[var(--color-text-tertiary)] shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-[var(--color-text-tertiary)] shrink-0" />
        )}
      </Button>

      {/* Query code */}
      {showCode && query && (
        <Box className="px-3 pt-2">
          <CodeBlock code={query} language={guessLanguage(query)} alwaysShowInsert />
        </Box>
      )}

      {/* Result */}
      {parsed && (
        <Box className="px-3 py-2">
          <Text size="xs" color={parsed.success ? 'secondary' : 'error'}>
            {toolCall.name === 'perform_app_action' && parsed.success ? label : parsed.summary}
          </Text>
        </Box>
      )}
    </Box>
  )
}
