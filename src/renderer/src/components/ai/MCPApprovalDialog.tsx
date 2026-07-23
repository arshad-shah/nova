import { useAIStore } from '@/stores/ai'
import { AlertTriangle } from 'lucide-react'
import { CodeView, Box, Text, Button, Modal } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'
import { TOOL_PERMISSION } from '@shared/mcp'

export function MCPApprovalDialog() {
  const { t } = useTranslation()
  const req = useAIStore(s => s.mcpPendingApproval)
  const respond = useAIStore(s => s.respondToMCPApproval)
  if (!req) return null

  // Dismissing without an explicit choice (Escape / backdrop click) is
  // treated the same as clicking Reject — an approval dialog should never
  // fail open.
  const dismiss = () => respond(req.requestId, false)

  return (
    <Modal open={!!req} onClose={dismiss} className="bg-bg-primary mx-4">
      <Box className="flex items-center gap-3 px-4 py-3 border-b border-border bg-warning/10">
        <AlertTriangle size={18} className="text-warning shrink-0" />
        <Text as="span" size="sm" weight="medium">{t('aiui.approval.mcpTitle')}</Text>
        <Box as="span" className={`ml-auto text-3xs px-1.5 py-0.5 rounded ${req.permission === TOOL_PERMISSION.WRITE ? 'bg-warning/20 text-warning' : 'bg-bg-secondary text-text-secondary'}`}>
          {req.permission === TOOL_PERMISSION.WRITE ? t('aiui.approval.write') : t('aiui.approval.read')}
        </Box>
      </Box>
      <Box className="p-4">
        <Text as="p" className="text-xs text-text-secondary mb-2">
          {t('aiui.approval.mcpPrompt', {
            toolName: req.toolName,
          })}
        </Text>
        <Box className="max-h-48 overflow-y-auto">
          <CodeView code={req.statement} language={req.language} />
        </Box>
      </Box>
      <Box className="flex justify-end gap-2 px-4 py-3 border-t border-border">
        <Button variant="bare" size="none" onClick={dismiss} className="px-4 py-1.5 text-sm rounded-md border border-border text-text-secondary hover:bg-hover transition-colors">{t('aiui.approval.reject')}</Button>
        <Button variant="bare" size="none" onClick={() => respond(req.requestId, true)} className="px-4 py-1.5 text-sm rounded-md bg-accent text-action-fg hover:opacity-90 transition-colors">{t('aiui.approval.approve')}</Button>
      </Box>
    </Modal>
  )
}
