import { useEffect, useState } from 'react'
import { Database, ChevronDown, Layers, HardDrive } from 'lucide-react'
import { useConnectionsStore } from '@/stores/connections'
import { useSchemaStore } from '@/stores/schema'
import { useTabsStore } from '@/stores/tabs'
import { useDriverCapabilitiesStore } from '@/stores/driver-capabilities'
import { pickDefaultSchema } from '@/lib/pick-default-schema'
import { Button, Text, Divider, ScrollArea, Flex, Box } from '@/primitives'
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
  const [showConnDropdown, setShowConnDropdown] = useState(false)
  const [showDbDropdown, setShowDbDropdown] = useState(false)
  const [showSchemaDropdown, setShowSchemaDropdown] = useState(false)
  const [schemaList, setSchemaList] = useState<string[]>([])
  const [databaseList, setDatabaseList] = useState<string[]>([])

  const connectedList = connections.filter(c => connectedIds.has(c.id))
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
    setShowConnDropdown(false)
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
    setShowDbDropdown(false)
  }

  const handleSelectSchema = (s: string) => {
    setTabSchema(tabId, s)
    setShowSchemaDropdown(false)
  }

  const closeAllDropdowns = () => {
    setShowConnDropdown(false)
    setShowDbDropdown(false)
    setShowSchemaDropdown(false)
  }

  return (
    <Flex align="center" gap="xs" className="relative">
      {/* Connection selector */}
      <Button
        variant="outline"
        size="xs"
        onClick={() => { setShowConnDropdown(!showConnDropdown); setShowDbDropdown(false); setShowSchemaDropdown(false) }}
        className="flex items-center gap-1.5"
      >
        {activeConn ? (
          <>
            <Box className="w-2 h-2 rounded-full" style={{ backgroundColor: activeConn.color ?? 'var(--color-accent)' }} />
            <Text size="xs" color="primary" truncate className="max-w-28">{activeConn.name}</Text>
          </>
        ) : (
          <>
            <Database size={12} className="text-text-muted" />
            <Text size="xs" color="muted">{t('query.connection.noConnection')}</Text>
          </>
        )}
        <ChevronDown size={10} className="text-text-muted" />
      </Button>

      {/* Database selector — only for multi-database connections */}
      {activeConn && hasMultipleDatabases && (
        <>
          <Text size="xs" color="muted">/</Text>
          <Button
            variant="outline"
            size="xs"
            onClick={() => { setShowDbDropdown(!showDbDropdown); setShowConnDropdown(false); setShowSchemaDropdown(false) }}
            className="flex items-center gap-1"
          >
            <HardDrive size={11} className="text-text-muted" />
            <Text size="xs" color="secondary" truncate className="max-w-24">{database ?? t('query.connection.database')}</Text>
            <ChevronDown size={10} className="text-text-muted" />
          </Button>
        </>
      )}

      {/* Schema selector */}
      {activeConn && schemaList.length > 0 && (
        <>
          <Text size="xs" color="muted">/</Text>
          <Button
            variant="outline"
            size="xs"
            onClick={() => { setShowSchemaDropdown(!showSchemaDropdown); setShowConnDropdown(false); setShowDbDropdown(false) }}
            className="flex items-center gap-1"
          >
            <Layers size={11} className="text-text-muted" />
            <Text size="xs" color="secondary" truncate className="max-w-24">{schema ?? t('query.connection.schema')}</Text>
            <ChevronDown size={10} className="text-text-muted" />
          </Button>
        </>
      )}

      {/* Backdrop for any dropdown */}
      {(showConnDropdown || showDbDropdown || showSchemaDropdown) && (
        <Box className="fixed inset-0 z-40" onClick={closeAllDropdowns} />
      )}

      {/* Connection dropdown */}
      {showConnDropdown && (
        <ScrollArea direction="vertical" className="absolute top-full left-0 mt-1 z-50 bg-bg-secondary border border-border rounded-lg shadow-xl min-w-[260px] py-1 max-h-80">
          {/* Active connections */}
          {connectedList.length === 0 && (
            <Text size="xs" color="muted" as="p" className="px-3 py-2">{t('query.connection.noActiveConnections')}</Text>
          )}
          {connectedList.map(conn => (
            <Button
              key={conn.id}
              variant="ghost"
              size="xs"
              onClick={() => handleSelectConnection(conn.id)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-hover transition-colors rounded-none border-0 h-auto ${
                connectionId === conn.id ? 'text-accent' : 'text-text-secondary'
              }`}
            >
              <Box className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: conn.color ?? 'var(--color-accent)' }} />
              <Text size="xs" truncate>{conn.name}</Text>
              <Text size="xs" color="muted" className="ml-auto">{conn.database}</Text>
            </Button>
          ))}

          {/* Disconnected connections */}
          {connections.filter(c => !connectedIds.has(c.id)).length > 0 && (
            <>
              <Divider />
              <Text size="xs" color="muted" as="p" className="px-3 py-0.5 text-[10px] uppercase tracking-wider">{t('query.connection.disconnected')}</Text>
              {connections.filter(c => !connectedIds.has(c.id)).map(conn => (
                <Button
                  key={conn.id}
                  variant="ghost"
                  size="xs"
                  onClick={async () => {
                    const result = await connect(conn.id)
                    if (result.success) handleSelectConnection(conn.id)
                    setShowConnDropdown(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted hover:bg-hover transition-colors rounded-none border-0 h-auto"
                >
                  <Box className="w-2 h-2 rounded-full shrink-0 bg-text-muted" />
                  <Text size="xs" truncate>{conn.name}</Text>
                  <Text size="xs" color="muted" className="ml-auto text-[10px]">{t('query.connection.clickToConnect')}</Text>
                </Button>
              ))}
            </>
          )}
        </ScrollArea>
      )}

      {/* Database dropdown */}
      {showDbDropdown && (
        <ScrollArea direction="vertical" className="absolute top-full left-0 mt-1 z-50 bg-bg-secondary border border-border rounded-lg shadow-xl min-w-[200px] py-1 max-h-60">
          {databaseList.length === 0 && (
            <Text size="xs" color="muted" as="p" className="px-3 py-2">{t('query.connection.noDatabasesFound')}</Text>
          )}
          {databaseList.map(db => (
            <Button
              key={db}
              variant="ghost"
              size="xs"
              onClick={() => handleSelectDatabase(db)}
              className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs hover:bg-hover transition-colors rounded-none border-0 h-auto ${
                database === db ? 'text-accent' : 'text-text-secondary'
              }`}
            >
              <HardDrive size={11} className="shrink-0" />
              <Text size="xs" truncate>{db}</Text>
            </Button>
          ))}
        </ScrollArea>
      )}

      {/* Schema dropdown */}
      {showSchemaDropdown && (
        <ScrollArea direction="vertical" className="absolute top-full right-0 mt-1 z-50 bg-bg-secondary border border-border rounded-lg shadow-xl min-w-[180px] py-1 max-h-60">
          {schemaList.length === 0 && (
            <Text size="xs" color="muted" as="p" className="px-3 py-2">{t('query.connection.noSchemasFound')}</Text>
          )}
          {schemaList.map(s => (
            <Button
              key={s}
              variant="ghost"
              size="xs"
              onClick={() => handleSelectSchema(s)}
              className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs hover:bg-hover transition-colors rounded-none border-0 h-auto ${
                schema === s ? 'text-accent' : 'text-text-secondary'
              }`}
            >
              <Layers size={11} className="shrink-0" />
              <Text size="xs" truncate>{s}</Text>
            </Button>
          ))}
        </ScrollArea>
      )}
    </Flex>
  )
}
