import { useEffect } from 'react'
import { BottomDock, useHasBottomPanels } from '@/components/shell/BottomDock'
import { ActivityBar } from '@/components/shell/ActivityBar'
import { Sidebar } from '@/components/shell/Sidebar'
import { TitleBar } from '@/components/shell/TitleBar'
import { StatusBar } from '@/components/shell/StatusBar'
import { TabBar } from '@/components/shell/tab-bar'
import { ToastContainer } from '@/components/shell/ToastContainer'
import { CommandPalette } from '@/components/command-palette/CommandPalette'
import { AboutModal } from '@/components/shell/AboutModal'
import { ActiveTabView } from '@/components/shell/ActiveTabView'
import { TabCloseGuard } from '@/components/shell/TabCloseGuard'
import { Flex, Box, ResizeHandle } from '@/primitives'
import { useTabsStore } from '@/stores/tabs'
import { tabActions, usePendingClose } from '@/stores/tab-actions'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useConnectionsStore } from '@/stores/connections'
import { MCPApprovalDialog } from '@/components/ai/MCPApprovalDialog'
import { PluginRestartBanner } from '@/components/plugins/PluginRestartBanner'
import { SectionErrorBoundary } from '@/components/shell/SectionErrorBoundary'
import { SecondarySidebar } from '@/components/shell/SecondarySidebar'
import { SecondaryActivityBar } from '@/components/shell/SecondaryActivityBar'
import { registerBuiltinStatementContributions } from '@/lib/statement-contributions'
import { registerBuiltinAppActions } from '@/lib/app-actions/builtins'
import { initAppActionBridge } from '@/lib/app-actions/bridge'
import { usePanelResize } from '@/hooks/usePanelResize'
import { useAppKeyboardShortcuts } from '@/hooks/useAppKeyboardShortcuts'
import { useFileDropForwarding } from '@/hooks/useFileDropForwarding'
import { useShellMenuEvents } from '@/hooks/useShellMenuEvents'
import { useTranslation } from '@/i18n/I18nProvider'

// Register CodeLens statement contributions once at module init. Re-registration
// is a no-op (the registry replaces by dbType), so HMR remains safe.
registerBuiltinStatementContributions()
// Register built-in app actions (deep-link / agentic action targets) once, and
// wire the main-process agentic action bridge to the renderer registry.
registerBuiltinAppActions()
initAppActionBridge()

export function App() {
  const { t } = useTranslation()
  // Subscribe per-field (not the whole store): App renders the entire shell, so
  // a whole-store subscription re-rendered it on every tab mutation — including
  // per-keystroke updateTabSql. Actions are stable refs, so selecting them
  // individually is free.
  const tabs = useTabsStore(s => s.tabs)
  const activeTabId = useTabsStore(s => s.activeTabId)
  const addQueryTab = useTabsStore(s => s.addQueryTab)
  const closeTab = useTabsStore(s => s.closeTab)
  const reopenTab = useTabsStore(s => s.reopenTab)
  const openConnectionForm = useTabsStore(s => s.openConnectionForm)
  const sidebarVisible = useUiStore(s => s.sidebarVisible)
  const setSidebarWidth = useUiStore(s => s.setSidebarWidth)
  const sidebarWidth = useSettingsStore(s => s.settings.appearance.sidebarWidth)
  const sidebarPosition = useSettingsStore(s => s.settings.appearance.sidebarPosition)
  const showStatusBar = useSettingsStore(s => s.settings.appearance.showStatusBar)
  const bottomDockHeight = useSettingsStore(s => s.settings.appearance.bottomDockHeight)
  const bottomDockVisible = useUiStore(s => s.bottomDockVisible)
  const setBottomDockHeight = useUiStore(s => s.setBottomDockHeight)
  const secondarySidebarWidth = useSettingsStore(s => s.settings.appearance.secondarySidebarWidth)
  const secondarySidebarVisible = useUiStore(s => s.secondarySidebarVisible)
  const setSecondarySidebarWidth = useUiStore(s => s.setSecondarySidebarWidth)
  const activeConnectionId = useConnectionsStore(s => s.activeConnectionId)
  const loadConnections = useConnectionsStore(s => s.loadConnections)

  // Bootstrap the connections store on first render. Previously the explorer's
  // top-of-tree dropdown owned this load via its own useEffect; when we
  // consolidated connection management into the secondary-sidebar panel and
  // deleted that component, the load lost its caller and the panel rendered
  // against an empty store. Doing it at the App level guarantees every
  // consumer (the panel, the status bar quick-switcher, the per-tab
  // ConnectionSelector) sees the saved profiles regardless of mount order.
  useEffect(() => {
    void loadConnections()
  }, [loadConnections])
  const activeTab = tabs.find(tab => tab.id === activeTabId)
  const hasBottomPanels = useHasBottomPanels()
  const paletteOpen = useUiStore(s => s.commandPaletteOpen)
  const aboutModalOpen = useUiStore(s => s.aboutModalOpen)
  // Shared across every close site (tab-bar X, Cmd+W, context menu). The
  // store gives us a single pending tab id; setting it raises the dialog.
  const pendingTxnQueue = usePendingClose(s => s.txnQueue)
  const pendingDirtyBatch = usePendingClose(s => s.dirtyBatch)
  const resolvePendingHead = usePendingClose(s => s.resolveHead)
  const clearPendingBatch = usePendingClose(s => s.clearBatch)

  // Global shell behaviour — keyboard shortcuts, dropped-file forwarding and
  // native-menu commands — lives in focused hooks (see ./hooks).
  useAppKeyboardShortcuts({ activeConnectionId, activeTabId, addQueryTab, closeTab, reopenTab })
  useFileDropForwarding()
  useShellMenuEvents()

  // Panel resize behavior (draft-during-drag, commit-on-release, collapse on
  // double-click) is shared across the three handles via usePanelResize.
  const {
    effective: effectiveBottomHeight,
    onResize: handleBottomResize,
    onResizeEnd: handleBottomResizeEnd,
    onDoubleClick: handleBottomResizeDoubleClick,
  } = usePanelResize({
    value: bottomDockHeight, min: 120, max: 640, restoreDefault: 240, direction: -1,
    read: () => useSettingsStore.getState().settings.appearance.bottomDockHeight,
    commit: setBottomDockHeight,
  })

  const {
    effective: effectiveSecondaryWidth,
    onResize: handleSecondaryResize,
    onResizeEnd: handleSecondaryResizeEnd,
    onDoubleClick: handleSecondaryResizeDoubleClick,
  } = usePanelResize({
    value: secondarySidebarWidth, min: 220, max: 640, restoreDefault: 320, direction: -1,
    read: () => useSettingsStore.getState().settings.appearance.secondarySidebarWidth,
    commit: setSecondarySidebarWidth,
  })

  const {
    effective: effectiveSidebarWidth,
    onResize: handleSidebarResize,
    onResizeEnd: handleSidebarResizeEnd,
    onDoubleClick: handleSidebarResizeDoubleClick,
  } = usePanelResize({
    value: sidebarWidth, min: 180, max: 480, restoreDefault: 240, direction: 1,
    read: () => useSettingsStore.getState().settings.appearance.sidebarWidth,
    commit: setSidebarWidth,
  })

  return (
    <Flex direction="column" className="h-screen bg-bg-primary text-text-primary">
      <SectionErrorBoundary label={t('shell.sectionLabels.titleBar')}>
        <TitleBar />
      </SectionErrorBoundary>
      <Flex className="flex-1 overflow-hidden">
        <SectionErrorBoundary label={t('shell.sectionLabels.activityBar')}>
          <ActivityBar />
        </SectionErrorBoundary>
        {sidebarVisible && sidebarPosition === 'left' && (
          <>
            <Flex direction="column" style={{ width: effectiveSidebarWidth }} className="shrink-0 overflow-hidden">
              <SectionErrorBoundary label={t('shell.sectionLabels.sidebar')}>
                <Sidebar />
              </SectionErrorBoundary>
            </Flex>
            <ResizeHandle
              direction="horizontal"
              onResize={handleSidebarResize}
              onResizeEnd={handleSidebarResizeEnd}
              onDoubleClick={handleSidebarResizeDoubleClick}
            />
          </>
        )}
        <Flex direction="column" className="flex-1 overflow-hidden">
          { activeTab && <TabBar /> }
          <Flex direction="column" className="flex-1 overflow-hidden">
            <ActiveTabView activeTab={activeTab} activeTabId={activeTabId} />
            {bottomDockVisible && hasBottomPanels && (
              <>
                <ResizeHandle
                  direction="vertical"
                  onResize={handleBottomResize}
                  onResizeEnd={handleBottomResizeEnd}
                  onDoubleClick={handleBottomResizeDoubleClick}
                />
                <Box style={{ height: effectiveBottomHeight }} className="shrink-0">
                  <SectionErrorBoundary label={t('shell.sectionLabels.bottomDock')}>
                    <BottomDock />
                  </SectionErrorBoundary>
                </Box>
              </>
            )}
          </Flex>
        </Flex>
        {sidebarVisible && sidebarPosition === 'right' && (
          <>
            <ResizeHandle
              direction="horizontal"
              onResize={handleSidebarResize}
              onResizeEnd={handleSidebarResizeEnd}
              onDoubleClick={handleSidebarResizeDoubleClick}
            />
            <Flex direction="column" style={{ width: effectiveSidebarWidth }} className="shrink-0 overflow-hidden">
              <SectionErrorBoundary label={t('shell.sectionLabels.sidebar')}>
                <Sidebar />
              </SectionErrorBoundary>
            </Flex>
          </>
        )}
        {secondarySidebarVisible && (
          <>
            <ResizeHandle
              direction="horizontal"
              onResize={handleSecondaryResize}
              onResizeEnd={handleSecondaryResizeEnd}
              onDoubleClick={handleSecondaryResizeDoubleClick}
            />
            <Flex direction="column" style={{ width: effectiveSecondaryWidth }} className="shrink-0 overflow-hidden">
              <SectionErrorBoundary label={t('shell.sectionLabels.secondarySidebar')}>
                <SecondarySidebar />
              </SectionErrorBoundary>
            </Flex>
          </>
        )}
        <SectionErrorBoundary label={t('shell.sectionLabels.secondaryActivityBar')}>
          <SecondaryActivityBar />
        </SectionErrorBoundary>
      </Flex>
      {showStatusBar && (
        <SectionErrorBoundary label={t('shell.sectionLabels.statusBar')}>
          <StatusBar />
        </SectionErrorBoundary>
      )}
      <ToastContainer />
      <SectionErrorBoundary label={t('shell.sectionLabels.commandPalette')}>
        <CommandPalette open={paletteOpen} onClose={() => useUiStore.getState().setCommandPaletteOpen(false)} />
      </SectionErrorBoundary>
      <AboutModal open={aboutModalOpen} onClose={() => useUiStore.getState().setAboutModalOpen(false)} />
      <SectionErrorBoundary label={t('shell.sectionLabels.mcpApproval')}>
        <MCPApprovalDialog />
      </SectionErrorBoundary>
      <SectionErrorBoundary label={t('shell.sectionLabels.pluginRestartBanner')}>
        <PluginRestartBanner />
      </SectionErrorBoundary>
      <TabCloseGuard
        txnQueue={pendingTxnQueue}
        dirtyBatch={pendingDirtyBatch}
        resolveHead={resolvePendingHead}
        clearBatch={clearPendingBatch}
        closeTab={closeTab}
      />
    </Flex>
  )
}
