import { useEffect, type ReactNode } from 'react'
import { useSelectionStore } from '@/stores/selection'
import { useTabsStore } from '@/stores/tabs'
import { useSchemaStore } from '@/stores/schema'
import { useConnectionsStore } from '@/stores/connections'
import { Box, Flex, Stack, Text, Divider, Badge } from '@/primitives'
import type { QueryTab, FieldInfo } from '@shared/types'
import { useTranslation } from '@/i18n/I18nProvider'

export function InspectorPanel() {
  const { t } = useTranslation()
  const selection = useSelectionStore(s => s.selection)
  const activeTab = useTabsStore(s => s.tabs.find(item => item.id === s.activeTabId))

  if (selection?.kind === 'row') {
    return (
      <Stack direction="vertical" gap="none" className="p-3">
        {Object.entries(selection.row).map(([key, value]) => {
          const col = selection.columns.find(c => c.name === key)
          return (
            <Box key={key} className="py-2 border-b border-border last:border-b-0">
              <Flex align="baseline" gap="sm">
                <Text size="xs" className="font-mono font-semibold">{key}</Text>
                {col?.dataType && <Text size="xs" color="muted">{col.dataType}</Text>}
              </Flex>
              <Text size="sm" className="font-mono break-words whitespace-pre-wrap">
                {value === null
                  ? t('shell.inspector.nullValue')
                  : typeof value === 'object'
                    ? JSON.stringify(value)
                    : String(value)}
              </Text>
            </Box>
          )
        })}
      </Stack>
    )
  }

  if (selection?.kind === 'erNode' || selection?.kind === 'table') {
    return <TableSummary connectionId={selection.connectionId} schema={selection.schema} table={selection.table} />
  }

  if (activeTab?.type === 'query') {
    return <QueryInspector tab={activeTab as QueryTab} />
  }

  return (
    <Flex align="center" justify="center" className="h-full p-4">
      <Text color="muted" size="sm">{t('shell.inspector.nothingToInspect')}</Text>
    </Flex>
  )
}

function QueryInspector({ tab }: { tab: QueryTab }) {
  const { t } = useTranslation()
  const connection = useConnectionsStore(s =>
    tab.connectionId ? s.connections.find(c => c.id === tab.connectionId) : undefined
  )

  const status: { label: string; tone: 'accent' | 'muted' | 'error' } = tab.isExecuting
    ? { label: t('shell.inspector.statusExecuting'), tone: 'accent' }
    : tab.error
      ? { label: t('shell.inspector.statusError'), tone: 'error' }
      : tab.results
        ? { label: t('shell.inspector.statusOk'), tone: 'accent' }
        : { label: t('shell.inspector.statusIdle'), tone: 'muted' }

  return (
    <Stack direction="vertical" gap="sm" className="p-3">
      <Section title={t('shell.inspector.sectionStatus')}>
        <Stat label={t('shell.inspector.state')} value={status.label} valueTone={status.tone} />
        {tab.results && (
          <>
            <Stat label={t('shell.inspector.rows')} value={String(tab.results.rowCount ?? tab.results.rows.length)} />
            <Stat label={t('shell.inspector.duration')} value={t('shell.inspector.durationValue', { ms: tab.results.duration })} />
            {tab.results.affectedRows > 0 && (
              <Stat label={t('shell.inspector.affected')} value={String(tab.results.affectedRows)} />
            )}
            <Stat label={t('shell.inspector.columns')} value={String(tab.results.fields.length)} />
          </>
        )}
        {tab.isDirty && <Stat label={t('shell.inspector.unsaved')} value={t('shell.inspector.yes')} valueTone="accent" />}
      </Section>

      <Divider />

      <Section title={t('shell.inspector.sectionConnection')}>
        <Stat label={t('shell.inspector.profile')} value={connection?.name ?? '—'} />
        {connection?.type && <Stat label={t('shell.inspector.driver')} value={connection.type} />}
        {tab.database && <Stat label={t('shell.inspector.database')} value={tab.database} />}
        {tab.schema && <Stat label={t('shell.inspector.schema')} value={tab.schema} />}
      </Section>

      {tab.error && (
        <>
          <Divider />
          <Section title={t('shell.inspector.sectionError')}>
            <Text size="xs" className="font-mono whitespace-pre-wrap break-words">{tab.error}</Text>
          </Section>
        </>
      )}

      {tab.results && tab.results.fields.length > 0 && (
        <>
          <Divider />
          <Section title={t('shell.inspector.sectionColumns', { count: tab.results.fields.length })}>
            <FieldList fields={tab.results.fields} />
          </Section>
        </>
      )}

      {tab.sql.trim() && (
        <>
          <Divider />
          <Section title={t('shell.inspector.sectionStatement')}>
            <Box className="bg-bg-secondary rounded-sm p-2 max-h-40 overflow-auto">
              <Text size="xs" className="font-mono whitespace-pre-wrap break-words">
                {tab.sql.length > 800 ? tab.sql.slice(0, 800) + '…' : tab.sql}
              </Text>
            </Box>
          </Section>
        </>
      )}

      {tab.results && tab.results.rows.length > 0 && (
        <Text size="xs" color="muted" className="mt-1">
          {t('shell.inspector.clickRowToInspect')}
        </Text>
      )}
    </Stack>
  )
}

function FieldList({ fields }: { fields: FieldInfo[] }) {
  const { t } = useTranslation()
  return (
    <Stack direction="vertical" gap="none">
      {fields.map(f => (
        <Flex key={f.name} align="baseline" gap="sm" className="py-1 border-b border-border last:border-b-0">
          <Text size="xs" className="font-mono font-semibold truncate">{f.name}</Text>
          <Text size="xs" color="muted" className="ml-auto">{f.dataType}</Text>
          {f.nullable === false && <Text size="xs" color="accent">{t('shell.inspector.notNull')}</Text>}
        </Flex>
      ))}
    </Stack>
  )
}

function TableSummary({ connectionId, schema, table }: { connectionId: string; schema?: string; table: string }) {
  const { t } = useTranslation()
  const schemaName = schema ?? ''
  const columnsKey = `${connectionId}:${schemaName}:${table}`
  const columns = useSchemaStore(s => s.columns.get(columnsKey) ?? [])
  const fetchColumns = useSchemaStore(s => s.fetchColumns)

  useEffect(() => {
    if (columns.length === 0) {
      void fetchColumns(connectionId, table, schemaName)
    }
  }, [connectionId, table, schemaName, columns.length, fetchColumns])

  return (
    <Stack direction="vertical" gap="sm" className="p-3">
      <Text size="sm" className="font-mono font-semibold">{table}</Text>
      <Box>
        <Text size="xs" color="muted" className="mb-1">{t('shell.inspector.columnsLabel')}</Text>
        {columns.length === 0 ? (
          <Text size="xs" color="muted">{t('shell.inspector.loading')}</Text>
        ) : (
          columns.map(c => (
            <Flex key={c.name} align="baseline" gap="sm" className="py-1 border-b border-border last:border-b-0">
              <Text size="xs" className="font-mono font-semibold">{c.name}</Text>
              <Text size="xs" color="muted">{c.dataType}</Text>
              {c.isPrimaryKey && <Badge tone="pk" size="xs">{t('shell.inspector.primaryKey')}</Badge>}
              {c.isForeignKey && <Badge tone="fk" size="xs">{t('shell.inspector.foreignKey')}</Badge>}
            </Flex>
          ))
        )}
      </Box>
    </Stack>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box>
      <Text size="xs" color="muted" className="mb-1 uppercase tracking-wider">{title}</Text>
      <Stack direction="vertical" gap="none">{children}</Stack>
    </Box>
  )
}

function Stat({ label, value, valueTone }: { label: string; value: string; valueTone?: 'accent' | 'muted' | 'error' }) {
  return (
    <Flex justify="between" align="baseline" className="py-0.5">
      <Text size="xs" color="muted">{label}</Text>
      <Text size="sm" className="font-mono truncate ml-2" color={valueTone}>{value}</Text>
    </Flex>
  )
}
