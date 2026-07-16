import { useCallback, useEffect, useState } from 'react'
import { Box, Flex } from '@/primitives'
import { useConnectionsStore, useActiveProfile } from '@/stores/connections'
import { usePluginUIStore, selectContributions } from '@/stores/plugin-ui'
import { WidgetRenderer } from '@/components/plugin-ui/WidgetRenderer'
import { PluginSlot } from '@/components/plugins/PluginSlot'
import {
  ConnectionSegment,
  SchemaSegment,
  MultiConnectionSegment,
  PluginStatusSegment,
  DevSegment,
} from './status-bar'

export function StatusBar() {
  const { activeConnectionId, connectedIds } = useConnectionsStore()
  const active = useActiveProfile()
  const isConnected = activeConnectionId ? connectedIds.has(activeConnectionId) : false

  const [showNewConnection, setShowNewConnection] = useState(false)
  const handleNewConnection = useCallback(() => setShowNewConnection(true), [])

  // Emit event for App.tsx to handle new connection form (unchanged contract)
  useEffect(() => {
    if (showNewConnection) {
      window.dispatchEvent(new CustomEvent('statusbar:new-connection'))
      setShowNewConnection(false)
    }
  }, [showNewConnection])

  const statusBarContributions = usePluginUIStore(selectContributions('statusBar'))
  useEffect(() => {
    usePluginUIStore.getState().fetchContributions('statusBar')
  }, [])

  // Schema and multi-connection segments dispatch a window event that ConnectionSegment listens for,
  // so they open the same switcher dropdown without prop-drilling.
  const openSwitcher = useCallback(() => {
    window.dispatchEvent(new CustomEvent('statusbar:open-switcher'))
  }, [])

  return (
    <Flex
      align="center"
      className="relative h-7 shrink-0 select-none border-t border-border-default bg-bg-primary"
    >
      {/* Left cluster */}
      <Flex align="stretch" className="h-full">
        <ConnectionSegment onNewConnection={handleNewConnection} />
        <SchemaSegment onClick={openSwitcher} />
        <MultiConnectionSegment onClick={openSwitcher} />
      </Flex>

      <Box className="flex-1" />

      {/* Right cluster */}
      <Flex align="stretch" className="h-full">
        {isConnected &&
          statusBarContributions
            .filter(
              (c) =>
                c.meta.zone === 'right' && active?.type && c.pluginId.includes(active.type)
            )
            .map((c) => (
              <Box key={c.contributionId} className="flex items-center border-l border-border-default px-2">
                <WidgetRenderer widgets={c.widgets} pluginId={c.pluginId} />
              </Box>
            ))}
        {/* Plugin contributions that aren't tied to the active driver (e.g. AI) target this slot. */}
        <PluginSlot
          id="app.statusBar.right"
          wrap={(nodes) => <Flex align="stretch" className="h-full">{nodes}</Flex>}
        />
        <PluginStatusSegment />
        <DevSegment />
      </Flex>
    </Flex>
  )
}
