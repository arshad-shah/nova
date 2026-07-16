import { useAIStore } from '@/stores/ai'
import { AlertTriangle } from 'lucide-react'
import { CodeView, Box, Text } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'

export function MCPApprovalDialog() {
  const { t } = useTranslation()
  const req = useAIStore(s => s.mcpPendingApproval)
  const respond = useAIStore(s => s.respondToMCPApproval)
  if (!req) return null

  return (
    <Box className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Box className="bg-bg-primary border border-border rounded-lg shadow-xl max-w-lg w-full mx-4">
        <Box className="flex items-center gap-3 px-4 py-3 border-b border-border bg-yellow-500/10">
          <AlertTriangle size={18} className="text-yellow-500 shrink-0" />
          <Box as="span" className="text-sm font-medium text-text-primary">{t('aiui.approval.mcpTitle')}</Box>
          <Box as="span" className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${req.permission === 'write' ? 'bg-yellow-500/20 text-yellow-600' : 'bg-bg-secondary text-text-secondary'}`}>
            {req.permission === 'write' ? t('aiui.approval.write') : t('aiui.approval.read')}
          </Box>
        </Box>
        <Box className="p-4">
          <Text as="p" className="text-xs text-text-secondary mb-2">
            {t('aiui.approval.mcpPrompt', {
              toolName: req.toolName,
            })}
          </Text>
          <Box className="max-h-48 overflow-y-auto">
            <CodeView code={req.sql} language="sql" />
          </Box>
        </Box>
        <Box className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button onClick={() => respond(req.requestId, false)} className="px-4 py-1.5 text-sm rounded-md border border-border text-text-secondary hover:bg-hover transition-colors">{t('aiui.approval.reject')}</button>
          <button onClick={() => respond(req.requestId, true)} className="px-4 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90 transition-colors">{t('aiui.approval.approve')}</button>
        </Box>
      </Box>
    </Box>
  )
}
