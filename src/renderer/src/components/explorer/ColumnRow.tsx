import { Key, Link, Hash } from 'lucide-react'
import { Badge } from '@/primitives/data-display/Badge'
import { ContextMenu } from '@/primitives/surfaces/ContextMenu'
import type { MenuNode } from '@/primitives/surfaces/menu/types'
import { Box } from '@/primitives'
import { useClipboard } from '@/hooks/useClipboard'
import { useDataNouns } from '@/hooks/useDataNouns'
import type { SchemaColumn } from '@shared/types'
import { useTranslation } from '@/i18n/I18nProvider'

interface ColumnRowProps {
  column: SchemaColumn
  tableName: string
  connectionId: string
}

// ─── ColumnIcon ────────────────────────────────────────────────────────────────

const ICON_BOX = 'inline-flex items-center justify-center rounded shrink-0 size-[18px]'

function ColumnIcon({ column }: { column: SchemaColumn }) {
  if (column.isPrimaryKey) {
    return (
      <Box as="span" className={`${ICON_BOX} bg-key-pk-bg text-key-pk`}>
        <Key size={10} strokeWidth={1.8} />
      </Box>
    )
  }

  if (column.isForeignKey) {
    return (
      <Box as="span" className={`${ICON_BOX} bg-key-fk-bg text-key-fk`}>
        <Link size={10} strokeWidth={1.8} />
      </Box>
    )
  }

  return (
    <Box as="span" className={`${ICON_BOX} bg-bg-tertiary/50 text-text-disabled`}>
      <Hash size={10} strokeWidth={1.8} />
    </Box>
  )
}

// ─── ConstraintBadge ───────────────────────────────────────────────────────────

function ConstraintBadge({ column }: { column: SchemaColumn }) {
  if (column.isPrimaryKey) {
    return <Badge tone="pk" size="xs" className="font-semibold leading-4 shrink-0">PK</Badge>
  }

  if (column.isForeignKey) {
    return <Badge tone="fk" size="xs" className="font-semibold leading-4 shrink-0">FK</Badge>
  }

  return null
}

// ─── ColumnRow ─────────────────────────────────────────────────────────────────

export function ColumnRow({ column, tableName, connectionId }: ColumnRowProps) {
  const { t } = useTranslation()
  const { copy } = useClipboard()
  const nouns = useDataNouns(connectionId)

  const qualifiedName = `${tableName}.${column.name}`

  const menuItems: MenuNode[] = [
    {
      kind: 'item',
      id: 'copy-column-name',
      label: t('explorer.menu.copyColumnName', { field: nouns.field.one }),
      onSelect: () => copy(column.name, { toast: { key: 'explorer.toast.copiedColumnName', vars: { field: nouns.field.one } } }),
    },
    {
      kind: 'item',
      id: 'copy-qualified-name',
      label: t('explorer.menu.copyQualifiedName'),
      onSelect: () => copy(qualifiedName, { toast: 'explorer.toast.copiedQualifiedName' }),
    },
  ]

  return (
    <ContextMenu items={menuItems}>
      <Box className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs min-w-0 cursor-default group hover:bg-hover">
        <ColumnIcon column={column} />

        <Box as="span" className="flex-1 truncate min-w-0 text-text-primary">
          {column.name}
        </Box>

        <Box as="span" className="text-3xs shrink-0 text-text-muted">
          {column.dataType}
        </Box>

        <ConstraintBadge column={column} />
      </Box>
    </ContextMenu>
  )
}
