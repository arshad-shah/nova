import { useEffect, useMemo, useState } from 'react'
import { ErdView } from './ErdView'
import { buildDiagram } from './adapter'
import type { Diagram } from './model'
import { useSelectionStore } from '@/stores/selection'
import { useSchemaStore } from '@/stores/schema'
import { useDataNouns, nounVars } from '@/hooks/useDataNouns'
import { Flex, Text, Box, Button, Spinner } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'

interface Props {
  connectionId: string
  schema: string
}

const EMPTY: Diagram = { entities: [], relationships: [] }

export function ERDiagram({ connectionId, schema }: Props) {
  const { t } = useTranslation()
  const nouns = useDataNouns(connectionId)
  const [diagram, setDiagram] = useState<Diagram>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [direction, setDirection] = useState<'LR' | 'TB'>('LR')
  const { fetchTables, fetchColumns } = useSchemaStore()

  useEffect(() => {
    let cancelled = false

    async function loadSchema() {
      setLoading(true)
      const tables = await fetchTables(connectionId, schema)

      const tablesWithColumns = await Promise.all(
        tables
          .filter((table) => table.type === 'table')
          .map(async (table) => {
            const columns = await fetchColumns(connectionId, table.name, schema)
            return { name: table.name, columns }
          })
      )

      if (cancelled) return

      setDiagram(buildDiagram(tablesWithColumns))
      setLoading(false)
    }

    loadSchema()
    return () => {
      cancelled = true
    }
  }, [connectionId, schema, fetchTables, fetchColumns])

  const legendLabels = useMemo(
    () => ({
      entries: [
        t('shell.er.legend.exactlyOne'),
        t('shell.er.legend.zeroOrOne'),
        t('shell.er.legend.oneOrMany'),
        t('shell.er.legend.zeroOrMany'),
      ] as const,
      nonIdentifying: t('shell.er.legend.nonIdentifying'),
    }),
    [t]
  )

  const controlLabels = useMemo(
    () => ({ zoomIn: t('shell.er.zoomIn'), zoomOut: t('shell.er.zoomOut'), fit: t('shell.er.fit') }),
    [t]
  )

  if (loading) {
    return (
      <Flex align="center" justify="center" className="flex-1 bg-bg-tertiary h-full">
        <Spinner size="md" label={t('shell.er.loading')} />
      </Flex>
    )
  }

  if (diagram.entities.length === 0) {
    return (
      <Flex align="center" justify="center" className="flex-1 bg-bg-tertiary h-full">
        <Text size="sm" color="muted">
          {t('shell.er.noTables', { ...nounVars(nouns), schema })}
        </Text>
      </Flex>
    )
  }

  return (
    <Box className="h-full relative">
      <ErdView
        diagram={diagram}
        direction={direction}
        legendLabels={legendLabels}
        controlLabels={controlLabels}
        ariaLabel={t('shell.er.ariaLabel', {
          entities: diagram.entities.length,
          relationships: diagram.relationships.length,
        })}
        onSelect={(id) => {
          useSelectionStore.getState().setSelection(
            id ? { kind: 'erNode', connectionId, schema, table: id } : null
          )
        }}
      />
      <Flex gap="xs" className="absolute top-3 left-3 z-10">
        <Button
          variant="outline"
          size="xs"
          onClick={() => setDirection('LR')}
          className={`transition-colors ${
            direction === 'LR'
              ? 'border-accent text-accent bg-accent/10'
              : 'border-border text-text-muted hover:text-text-primary'
          }`}
        >
          {t('shell.er.horizontal')}
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => setDirection('TB')}
          className={`transition-colors ${
            direction === 'TB'
              ? 'border-accent text-accent bg-accent/10'
              : 'border-border text-text-muted hover:text-text-primary'
          }`}
        >
          {t('shell.er.vertical')}
        </Button>
      </Flex>
    </Box>
  )
}
