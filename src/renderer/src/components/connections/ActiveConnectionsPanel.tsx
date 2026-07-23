import { useState } from 'react'
import { Database, Plus } from 'lucide-react'
import { Box, Flex, IconButton, Stack, Text, Tooltip, EmptyState, Button } from '@/primitives'
import { useConnectionsStore } from '@/stores/connections'
import { useTabsStore } from '@/stores/tabs'
import { notifyError } from '@/lib/notify-error'
import { initialAutoCommit } from '@/lib/initial-autocommit'
import { ConfirmDialog } from '@/components/shell/ConfirmDialog'
import { ConnectionListItem } from './ConnectionListItem'
import { useTranslation } from '@/i18n/I18nProvider'

/**
 * IntelliJ-style active-connections pane.
 *
 * The connections store already tracks `connectedIds` as a Set, so multi-
 * connect is supported at the data layer; this panel makes that state
 * visible and actionable. Row rendering lives in `ConnectionListItem` so
 * the visual states can be developed in Storybook without spinning up a
 * connections store. This file is just data binding.
 */
export function ActiveConnectionsPanel() {
  const { t } = useTranslation()
  const connections = useConnectionsStore(s => s.connections)
  const connectedIds = useConnectionsStore(s => s.connectedIds)
  const activeConnectionId = useConnectionsStore(s => s.activeConnectionId)
  const setActiveConnection = useConnectionsStore(s => s.setActiveConnection)
  const disconnect = useConnectionsStore(s => s.disconnect)
  const connect = useConnectionsStore(s => s.connect)
  const deleteConnection = useConnectionsStore(s => s.deleteConnection)
  const addQueryTab = useTabsStore(s => s.addQueryTab)
  const openConnectionForm = useTabsStore(s => s.openConnectionForm)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  // Connected first, then alphabetical — live state reads at a glance.
  const sorted = [...connections].sort((a, b) => {
    const aConn = connectedIds.has(a.id) ? 0 : 1
    const bConn = connectedIds.has(b.id) ? 0 : 1
    if (aConn !== bConn) return aConn - bConn
    return a.name.localeCompare(b.name)
  })

  const handleConnect = async (id: string) => {
    const result = await connect(id)
    if (!result.success) notifyError(result.error ?? t('connections.connectionFailed'), { titlePrefix: t('connections.active.connectErrorPrefix') })
  }

  const confirmDelete = () => {
    if (pendingDelete) void deleteConnection(pendingDelete.id)
    setPendingDelete(null)
  }

  if (connections.length === 0) {
    return (
      <Box className="p-4">
        <EmptyState
          icon={<Database size={20} className="text-text-muted" />}
          title={t('connections.active.emptyTitle')}
          description={t('connections.active.emptyDescription')}
          action={
            <Button
              variant="bare"
              size="none"
              onClick={() => openConnectionForm()}
              className="text-xs text-accent hover:underline"
            >
              {t('connections.active.newConnection')}
            </Button>
          }
        />
      </Box>
    )
  }

  // Pre-bucket so we can render a "Live" section header above connected rows.
  // The headers are subtle (uppercase muted text) — same visual weight as the
  // "Categories" / "Matches" headers in Settings, so the panel reads as one
  // family with the rest of the secondary-sidebar surfaces.
  const live = sorted.filter(c => connectedIds.has(c.id))
  const saved = sorted.filter(c => !connectedIds.has(c.id))

  return (
    <>
    <Stack className="py-1">
      <Flex align="center" justify="between" className="px-3 py-1">
        <Text size="xs" color="muted" className="text-3xs uppercase tracking-wider">
          {t('connections.active.count', { n: connections.length })}
        </Text>
        <Tooltip content={t('connections.active.newConnection')}>
          <IconButton
            label={t('connections.active.newConnection')}
            size="xs"
            variant="ghost"
            onClick={() => openConnectionForm()}
          >
            <Plus size={12} />
          </IconButton>
        </Tooltip>
      </Flex>

      {live.length > 0 && (
        <>
          <Text size="xs" color="muted" className="px-3 pt-2 pb-1 text-3xs uppercase tracking-wider">
            {t('connections.active.live', { n: live.length })}
          </Text>
          {live.map(c => (
            <ConnectionListItem
              key={c.id}
              connection={c}
              connected
              active={activeConnectionId === c.id}
              onActivate={() => setActiveConnection(c.id)}
              onEdit={() => openConnectionForm(c.id)}
              onConnect={() => handleConnect(c.id)}
              onDisconnect={() => void disconnect(c.id)}
              onOpenQueryTab={() => {
                setActiveConnection(c.id)
                addQueryTab(c.id, null, { autoCommit: initialAutoCommit(c) })
              }}
              onDelete={() => setPendingDelete({ id: c.id, name: c.name })}
            />
          ))}
        </>
      )}

      {saved.length > 0 && (
        <>
          <Text size="xs" color="muted" className="px-3 pt-2 pb-1 text-3xs uppercase tracking-wider">
            {t('connections.active.saved', { n: saved.length })}
          </Text>
          {saved.map(c => (
            <ConnectionListItem
              key={c.id}
              connection={c}
              connected={false}
              active={activeConnectionId === c.id}
              onActivate={() => setActiveConnection(c.id)}
              onEdit={() => openConnectionForm(c.id)}
              onConnect={() => handleConnect(c.id)}
              onDisconnect={() => void disconnect(c.id)}
              onOpenQueryTab={() => {
                setActiveConnection(c.id)
                addQueryTab(c.id, null, { autoCommit: initialAutoCommit(c) })
              }}
              onDelete={() => setPendingDelete({ id: c.id, name: c.name })}
            />
          ))}
        </>
      )}
    </Stack>
    <ConfirmDialog
      open={pendingDelete !== null}
      variant="danger"
      title={t('connections.active.deleteTitle')}
      message={pendingDelete ? t('connections.active.deleteMessage', { name: pendingDelete.name }) : undefined}
      confirmLabel={t('connections.active.deleteConfirm')}
      onConfirm={confirmDelete}
      onCancel={() => setPendingDelete(null)}
    />
    </>
  )
}
