import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useConnectionsStore } from '@/stores/connections'
import { Search, Plus, Check } from 'lucide-react'
import { Button, Input, Text, Box, Flex, ScrollArea } from '@/primitives'
import { cn } from '@/primitives/utils/cn'
import { useClickOutside } from '@/hooks/useClickOutside'
import { useTranslation } from '@/i18n/I18nProvider'

const DB_ABBREVIATIONS: Record<string, string> = {
  postgresql: 'PG',
  mysql: 'MY',
  sqlite: 'SL',
  mongodb: 'MG',
  redis: 'RD',
}

const DB_TYPE_COLORS: Record<string, string> = {
  postgresql: 'text-accent',
  mysql: 'text-warning',
  sqlite: 'text-info',
  redis: 'text-error',
}

// mongodb has no dedicated semantic token (not a status hue); route its brand
// accent through the theme's decorative color scale instead of a raw hex.
const DB_TYPE_STYLE: Record<string, CSSProperties> = {
  mongodb: { color: 'var(--color-decorative-2)' },
}

interface ConnectionSwitcherProps {
  isOpen: boolean
  onClose: () => void
  onNewConnection: () => void
}

export function ConnectionSwitcher({ isOpen, onClose, onNewConnection }: ConnectionSwitcherProps) {
  const { t } = useTranslation()
  const { connections, activeConnectionId, connectedIds, setActiveConnection, connect } =
    useConnectionsStore()
  const [filter, setFilter] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setFilter('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useClickOutside(panelRef, onClose, { enabled: isOpen, deferAttach: true })

  if (!isOpen) return null

  const lowerFilter = filter.toLowerCase()
  const filtered = connections.filter(
    (c) =>
      c.name.toLowerCase().includes(lowerFilter) ||
      c.database.toLowerCase().includes(lowerFilter) ||
      (c.host ?? '').toLowerCase().includes(lowerFilter)
  )

  const activeConn = filtered.find((c) => c.id === activeConnectionId)
  const connectedConns = filtered.filter(
    (c) => c.id !== activeConnectionId && connectedIds.has(c.id)
  )
  const savedConns = filtered.filter((c) => !connectedIds.has(c.id))

  const handleSelect = async (id: string) => {
    if (connectedIds.has(id)) {
      setActiveConnection(id)
    } else {
      await connect(id)
    }
    onClose()
  }

  const renderConnection = (c: typeof connections[0], isActive: boolean) => {
    const abbr = DB_ABBREVIATIONS[c.type] ?? c.type.slice(0, 2).toUpperCase()
    const color = DB_TYPE_COLORS[c.type] ?? 'text-text-primary'
    const colorStyle = DB_TYPE_STYLE[c.type]
    const isLive = connectedIds.has(c.id)

    return (
      <Button
        key={c.id}
        variant="ghost"
        onClick={() => handleSelect(c.id)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 h-auto text-left',
          isActive ? 'bg-accent/10 border border-accent/20' : 'hover:bg-hover',
          !isLive && 'opacity-50'
        )}
      >
        <div
          className={cn(
            'h-1.75 w-1.75 shrink-0 rounded-full',
            isLive ? 'bg-success shadow-[0_0_4px_rgba(40,200,64,0.4)]' : 'bg-text-tertiary'
          )}
        />
        <Box className="min-w-0 flex-1">
          <Flex align="center" gap="xs">
            <Text as="span" weight="semibold" className={cn('text-[10px]', color)} style={colorStyle}>{abbr}</Text>
            <Text as="span" truncate className="text-[10px] text-text-primary">{c.name}</Text>
          </Flex>
          <Text as="p" truncate className="text-[9px] text-text-tertiary">
            {c.host ? `${c.host}${c.port ? `:${c.port}` : ''}` : c.database}
          </Text>
        </Box>
        {isActive && <Check size={10} className="text-accent shrink-0" />}
      </Button>
    )
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        'absolute bottom-full left-0 mb-1 w-65',
        'bg-bg-secondary border border-border-default',
        'rounded-t-lg shadow-[0_-4px_20px_rgba(0,0,0,0.5)]',
        'animate-in slide-in-from-bottom-2 duration-150'
      )}
    >
      <Box className="p-2 border-b border-border-default">
        <Flex align="center" gap="xs" className="rounded-[5px] border border-border-default bg-bg-tertiary px-2 py-1">
          <Search size={11} className="text-text-tertiary shrink-0" />
          <Input
            ref={inputRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('shell.connectionSwitcher.filterPlaceholder')}
            size="sm"
            className="flex-1 bg-transparent border-0 focus:ring-0 px-0 text-[10px]"
          />
        </Flex>
      </Box>

      <ScrollArea direction="vertical">
        {activeConn && (
          <Box className="px-1.5 pt-1">
            <Text as="p" weight="semibold" className="px-1.5 py-1 text-[8px] uppercase tracking-wider text-text-tertiary">
              {t('shell.connectionSwitcher.active')}
            </Text>
            {renderConnection(activeConn, true)}
          </Box>
        )}

        {connectedConns.length > 0 && (
          <Box className="px-1.5 pt-0.5">
            <Text as="p" weight="semibold" className="px-1.5 py-1 text-[8px] uppercase tracking-wider text-text-tertiary">
              {t('shell.connectionSwitcher.connected')}
            </Text>
            {connectedConns.map((c) => renderConnection(c, false))}
          </Box>
        )}

        {savedConns.length > 0 && (
          <Box className="px-1.5 pt-0.5 border-t border-border-subtle">
            <Text as="p" weight="semibold" className="px-1.5 py-1 text-[8px] uppercase tracking-wider text-text-tertiary">
              {t('shell.connectionSwitcher.saved')}
            </Text>
            {savedConns.map((c) => renderConnection(c, false))}
          </Box>
        )}
      </ScrollArea>

      <Box className="border-t border-border-default p-1.5">
        <Button
          variant="ghost"
          onClick={() => {
            onNewConnection()
            onClose()
          }}
          className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-[10px] text-accent hover:bg-hover h-auto"
        >
          <Plus size={10} />
          {t('shell.connectionSwitcher.newConnection')}
        </Button>
      </Box>
    </div>
  )
}
