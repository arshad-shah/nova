import { useEffect, useState } from 'react'
import { Database, ChevronDown, Layers, HardDrive } from 'lucide-react'
import { useConnectionsStore } from '@/stores/connections'
import { useSchemaStore } from '@/stores/schema'
import { useTabsStore } from '@/stores/tabs'
import { useDriverCapabilitiesStore } from '@/stores/driver-capabilities'
import { pickDefaultSchema } from '@/lib/pick-default-schema'
import { Button, Text, Flex, DropdownMenu, ConnectionDot } from '@/primitives'
import { Menu } from '@/primitives/surfaces/menu'
import { IPC_CHANNELS } from '@shared/ipc'
import { useTranslation } from '@/i18n/I18nProvider'

interface Props {
  tabId: string
  connectionId: string | null
  database: string | null
  schema: string | null
}

export function ConnectionSelector({ tabId, connectionId, database, schema }: Props) {
  const { t } = useTranslation()
  const { connections, connectedIds, connect } = useConnectionsStore()
  const { fetchSchemas, fetchDatabases, switchDatabase } = useSchemaStore()
  const { setTabConnection, setTabDatabase, setTabSchema, setTabTxnStatus } = useTabsStore()
  const fetchCaps = useDriverCapabilitiesStore((s) => s.fetch)
  const [schemaList, setSchemaList] = useState<string[]>([])
  const [databaseList, setDatabaseList] = useState<string[]>([])

  const connectedList = connections.filter(c => connectedIds.has(c.id))
  const disconnectedList = connections.filter(c => !connectedIds.has(c.id))
  const activeConn = connections.find(c => c.id === connectionId)
  const hasMultipleDatabases = databaseList.length > 1

  // Fetch databases when connection changes
  useEffect(() => {
    if (!connectionId || !connectedIds.has(connectionId)) {
      setDatabaseList([])
      return
    }

    fetchDatabases(connectionId).then(dbs => {
      setDatabaseList(dbs)
      // Auto-set default database if none selected and multi-DB
      if (!database && dbs.length > 0) {
        const conn = connections.find(c => c.id === connectionId)
        const defaultDb = conn?.database && dbs.includes(conn.database) ? conn.database : dbs[0]
        setTabDatabase(tabId, defaultDb)
      }
    })
  }, [connectionId, connectedIds])

  // Fetch schemas when connection or database changes
  useEffect(() => {
    if (!connectionId || !connectedIds.has(connectionId)) {
      setSchemaList([])
      return
    }

    fetchSchemas(connectionId, database ?? undefined).then(async (s) => {
      setSchemaList(s)
      // Auto-set default schema if none selected. The driver decides which
      // schema to prefer via its capability spec — the renderer is generic.
      if (!schema && s.length > 0) {
        const conn = connections.find(c => c.id === connectionId)
        const caps = conn ? await fetchCaps(conn.type) : null
        const defaultSchema = pickDefaultSchema(caps ?? {}, s, conn?.database)
        if (defaultSchema) setTabSchema(tabId, defaultSchema)
      }
    })
  }, [connectionId, database, connectedIds])

  const handleSelectConnection = async (id: string) => {
    if (id !== connectionId && connectionId) {
      // Release any per-tab transactional session on the OLD connection so it
      // isn't orphaned on that connection's adapter when the tab moves. The
      // adapter rolls back + releases; DB_SESSION_CLOSE is a tolerant no-op when
      // no session is open. Reset txn status so the new connection gets a fresh
      // BEGIN on its first transactional query instead of reusing stale state.
      try {
        await window.electronAPI.invoke(IPC_CHANNELS.DB_SESSION_CLOSE, connectionId, tabId)
      } catch {
        // best-effort — the session may not exist
      }
      setTabTxnStatus(tabId, 'none')
    }
    setTabConnection(tabId, id)
  }

  const handleConnectAndSelect = async (id: string) => {
    const result = await connect(id)
    if (result.success) handleSelectConnection(id)
  }

  const handleSelectDatabase = async (db: string) => {
    if (connectionId) {
      try {
        await switchDatabase(connectionId, db)
      } catch {
        // ignore — some adapters don't support switchDatabase
      }
    }
    setTabDatabase(tabId, db)
    // Reset schema when database changes — will be re-fetched by the useEffect
    setTabSchema(tabId, '')
  }

  const handleSelectSchema = (s: string) => {
    setTabSchema(tabId, s)
  }

  return (
    <Flex align="center" gap="xs" className="relative">
      {/* Connection selector */}
      <DropdownMenu
        aria-label={t('query.connection.noConnection')}
        trigger={
          <Button variant="outline" size="xs" className="flex items-center gap-1.5">
            {activeConn ? (
              <>
                <ConnectionDot size="sm" state="neutral" color={activeConn.color} />
                <Text size="xs" color="primary" truncate className="max-w-28">{activeConn.name}</Text>
              </>
            ) : (
              <>
                <Database size={12} strokeWidth={1.8} className="text-text-muted" />
                <Text size="xs" color="muted">{t('query.connection.noConnection')}</Text>
              </>
            )}
            <ChevronDown size={10} strokeWidth={1.8} className="text-text-muted" />
          </Button>
        }
      >
        {connectedList.length === 0 && (
          <Text size="xs" color="muted" as="p" className="px-3 py-2">{t('query.connection.noActiveConnections')}</Text>
        )}
        {connectedList.map(conn => (
          <Menu.Item key={conn.id} label={conn.name} onSelect={() => handleSelectConnection(conn.id)}>
            <Flex align="center" gap="xs" className="flex-1 min-w-0">
              <ConnectionDot size="sm" state="neutral" color={conn.color} />
              <Text size="xs" truncate color={connectionId === conn.id ? 'accent' : 'secondary'}>{conn.name}</Text>
              <Text size="xs" color="muted" className="ml-auto">{conn.database}</Text>
            </Flex>
          </Menu.Item>
        ))}

        {disconnectedList.length > 0 && (
          <>
            <Menu.Separator />
            <Menu.Section label={t('query.connection.disconnected')}>
              {disconnectedList.map(conn => (
                <Menu.Item key={conn.id} label={conn.name} onSelect={() => handleConnectAndSelect(conn.id)}>
                  <Flex align="center" gap="xs" className="flex-1 min-w-0">
                    <ConnectionDot size="sm" state="neutral" color="var(--color-text-muted)" />
                    <Text size="xs" color="muted" truncate>{conn.name}</Text>
                    <Text size="xs" color="muted" className="ml-auto text-3xs">{t('query.connection.clickToConnect')}</Text>
                  </Flex>
                </Menu.Item>
              ))}
            </Menu.Section>
          </>
        )}
      </DropdownMenu>

      {/* Database selector — only for multi-database connections */}
      {activeConn && hasMultipleDatabases && (
        <>
          <Text size="xs" color="muted">/</Text>
          <DropdownMenu
            aria-label={t('query.connection.database')}
            trigger={
              <Button variant="outline" size="xs" className="flex items-center gap-1">
                <HardDrive size={11} strokeWidth={1.8} className="text-text-muted" />
                <Text size="xs" color="secondary" truncate className="max-w-24">{database ?? t('query.connection.database')}</Text>
                <ChevronDown size={10} strokeWidth={1.8} className="text-text-muted" />
              </Button>
            }
          >
            {databaseList.length === 0 && (
              <Text size="xs" color="muted" as="p" className="px-3 py-2">{t('query.connection.noDatabasesFound')}</Text>
            )}
            {databaseList.length > 0 && (
              <Menu.RadioGroup label={t('query.connection.database')}>
                {databaseList.map(db => (
                  <Menu.RadioItem
                    key={db}
                    label={db}
                    checked={database === db}
                    onSelect={() => handleSelectDatabase(db)}
                  >
                    <Flex align="center" gap="xs" className="flex-1 min-w-0">
                      <HardDrive size={11} strokeWidth={1.8} className="shrink-0" />
                      <Text size="xs" truncate>{db}</Text>
                    </Flex>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            )}
          </DropdownMenu>
        </>
      )}

      {/* Schema selector */}
      {activeConn && schemaList.length > 0 && (
        <>
          <Text size="xs" color="muted">/</Text>
          <DropdownMenu
            aria-label={t('query.connection.schema')}
            trigger={
              <Button variant="outline" size="xs" className="flex items-center gap-1">
                <Layers size={11} strokeWidth={1.8} className="text-text-muted" />
                <Text size="xs" color="secondary" truncate className="max-w-24">{schema ?? t('query.connection.schema')}</Text>
                <ChevronDown size={10} strokeWidth={1.8} className="text-text-muted" />
              </Button>
            }
          >
            {schemaList.length === 0 && (
              <Text size="xs" color="muted" as="p" className="px-3 py-2">{t('query.connection.noSchemasFound')}</Text>
            )}
            {schemaList.length > 0 && (
              <Menu.RadioGroup label={t('query.connection.schema')}>
                {schemaList.map(s => (
                  <Menu.RadioItem
                    key={s}
                    label={s}
                    checked={schema === s}
                    onSelect={() => handleSelectSchema(s)}
                  >
                    <Flex align="center" gap="xs" className="flex-1 min-w-0">
                      <Layers size={11} strokeWidth={1.8} className="shrink-0" />
                      <Text size="xs" truncate>{s}</Text>
                    </Flex>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            )}
          </DropdownMenu>
        </>
      )}
    </Flex>
  )
}
