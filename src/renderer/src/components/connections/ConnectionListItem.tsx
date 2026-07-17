import { MoreHorizontal } from 'lucide-react'
import { Badge, Flex, IconButton, Text } from '@/primitives'
import { DropdownMenu } from '@/primitives/surfaces/DropdownMenu'
import type { MenuNode } from '@/primitives/surfaces/menu/types'
import type { ConnectionProfile } from '@shared/types'
import { useTranslation } from '@/i18n/I18nProvider'

/**
 * Two-letter chips for the most common engines. Anything not listed falls
 * back to the first two letters of the type id (uppercased), so a future
 * plugin-contributed driver still renders sensibly without a code change.
 */
const TYPE_BADGE: Record<string, { label: string; tone: 'accent' | 'warning' | 'info' | 'error' | 'default' | 'success' }> = {
  postgresql: { label: 'PG', tone: 'accent'  },
  mysql:      { label: 'MY', tone: 'warning' },
  sqlite:     { label: 'SL', tone: 'info'    },
  mongodb:    { label: 'MG', tone: 'success' },
  redis:      { label: 'RD', tone: 'error'   },
  snowflake:  { label: 'SF', tone: 'info'    },
}
function typeChip(type: string) {
  return TYPE_BADGE[type] ?? { label: type.slice(0, 2).toUpperCase(), tone: 'default' as const }
}

/**
 * Builds the muted one-line summary under the connection name. Skips empty
 * pieces (file-backed sqlite has no host/user; cloud connections may omit
 * port). Joining only the present fields keeps the line readable instead
 * of "  · 5432 · " for half-configured profiles.
 */
function describe(c: { username?: string; host?: string; port?: number; database?: string }): string {
  const left = c.username ? `${c.username}@` : ''
  const hostPort = c.host ? `${c.host}${c.port ? `:${c.port}` : ''}` : ''
  const db = c.database ? `/${c.database}` : ''
  return [left + hostPort + db].filter(Boolean).join(' ').trim()
}

export interface ConnectionListItemProps {
  connection: ConnectionProfile
  /** Live session state — drives the status dot and the connect/disconnect action. */
  connected: boolean
  /** Whether this row is the "active" connection for new query tabs. */
  active: boolean

  // Action callbacks — kept as bare functions (not store actions) so the
  // component is pure presentation and trivially storyable.
  onActivate: () => void
  onEdit: () => void
  onConnect: () => void
  onDisconnect: () => void
  onOpenQueryTab: () => void
  onDelete: () => void
}

/**
 * A single connection row. Pure presentation: receives a `ConnectionProfile`
 * plus a few callbacks, owns no store. The `ActiveConnectionsPanel` wires the
 * callbacks to the connections + tabs stores; Storybook drives the same
 * component with fixtures to develop the visual states in isolation.
 *
 * Visual layers (top to bottom of the column):
 *   - Status dot tinted by the user's chosen connection colour
 *   - Title line: engine chip · name · Live/Active badge
 *   - Subtitle: user@host:port/db (mono, indented to align under the title)
 *   - Right-aligned hover actions: edit / connect / disconnect / open
 */
export function ConnectionListItem({
  connection,
  connected,
  active,
  onActivate,
  onEdit,
  onConnect,
  onDisconnect,
  onOpenQueryTab,
  onDelete,
}: ConnectionListItemProps) {
  const { t } = useTranslation()
  const chip = typeChip(connection.type)
  const summary = describe(connection)
  const dotColor = connection.color ?? (connected ? 'var(--color-success)' : 'var(--color-text-disabled)')

  // All row actions live in an overflow menu so the row stays uncluttered and
  // destructive actions (delete) aren't a stray click away.
  const menuItems: MenuNode[] = [
    connected
      ? { kind: 'item', id: 'disconnect', label: t('connections.active.menuDisconnect'), onSelect: onDisconnect }
      : { kind: 'item', id: 'connect', label: t('connections.active.menuConnect'), onSelect: onConnect },
    ...(connected ? [{ kind: 'item' as const, id: 'open-query-tab', label: t('connections.active.menuOpenQueryTab'), onSelect: onOpenQueryTab }] : []),
    { kind: 'item', id: 'edit', label: t('connections.active.menuEdit'), onSelect: onEdit },
    { kind: 'item', id: 'delete', label: t('connections.active.menuDelete'), onSelect: onDelete, tone: 'danger' },
  ]

  return (
    <Flex
      align="center"
      gap="sm"
      className={`group px-3 py-1.5 cursor-pointer transition-colors border-l-2 ${
        active
          ? 'bg-accent/10 border-l-accent'
          : connected
            ? 'border-l-transparent hover:bg-hover'
            : 'border-l-transparent hover:bg-hover opacity-80'
      }`}
      onClick={onActivate}
    >
      {/* Status dot — full colour + halo when connected, faded ring when not. */}
      <span
        className="shrink-0 inline-block w-2.5 h-2.5 rounded-full"
        style={{
          backgroundColor: dotColor,
          opacity: connected ? 1 : 0.45,
          boxShadow: connected
            ? `0 0 0 1.5px color-mix(in srgb, ${dotColor} 35%, transparent), 0 0 6px color-mix(in srgb, ${dotColor} 50%, transparent)`
            : 'inset 0 0 0 1px var(--color-border-strong)',
        }}
        aria-label={connected ? t('connections.active.statusConnected') : t('connections.active.statusDisconnected')}
      />

      <Flex direction="column" className="flex-1 min-w-0">
        <Flex align="center" gap="xs">
          <Badge tone={chip.tone} size="sm" className="font-mono text-[9px] leading-none px-1.5 py-0.5 shrink-0">
            {chip.label}
          </Badge>
          <Text size="xs" weight={active ? 'medium' : 'normal'} truncate className="flex-1">
            {connection.name}
          </Text>
          {connected && !active && (
            <Badge tone="success" size="sm" className="text-[9px] uppercase tracking-wider shrink-0">
              {t('connections.active.badgeLive')}
            </Badge>
          )}
          {active && (
            <Badge tone="accent" size="sm" className="text-[9px] uppercase tracking-wider shrink-0">
              {t('connections.active.badgeActive')}
            </Badge>
          )}
        </Flex>
        {summary && (
          <Text size="xs" color="muted" truncate className="text-[10px] font-mono">
            {summary}
          </Text>
        )}
      </Flex>

      {/* The kebab opens the overflow menu. Wrapping span stops the row's
          onActivate from firing when the user just wants the menu. */}
      <span
        className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu
          trigger={
            <IconButton label={t('connections.active.moreActions')} size="xs" variant="ghost">
              <MoreHorizontal size={13} />
            </IconButton>
          }
          items={menuItems}
        />
      </span>
    </Flex>
  )
}
