import { useEffect } from 'react'
import { useAIStore, AI_CHAT_PANEL_ID } from '@/stores/ai'
import { useUiStore } from '@/stores/ui'
import { Box } from '@/primitives/layout/Box'
import { MessageThread } from './MessageThread'
import { ActionZone } from './ActionZone'
import { AutoCompactBanner } from './AutoCompactBanner'
import { ChatPanelHeader } from './ChatPanelHeader'

export function ChatPanel() {
  const panelOpen = useUiStore(
    s => s.secondarySidebarVisible && s.secondaryActivePanel === AI_CHAT_PANEL_ID
  )
  const loadConfiguredProviders = useAIStore(s => s.loadConfiguredProviders)
  const loadModels = useAIStore(s => s.loadModels)
  const loadPermissionProfile = useAIStore(s => s.loadPermissionProfile)

  useEffect(() => {
    if (panelOpen) {
      loadConfiguredProviders().then(() => loadModels())
      loadPermissionProfile()
    }
  }, [panelOpen, loadConfiguredProviders, loadModels, loadPermissionProfile])

  return (
    <Box className="flex flex-col h-full bg-bg-primary">
      <ChatPanelHeader />
      <AutoCompactBanner />
      <MessageThread />
      <ActionZone />
    </Box>
  )
}
