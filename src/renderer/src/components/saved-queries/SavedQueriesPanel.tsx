import { useState, useSyncExternalStore } from 'react'
import { matchesFilter } from '@/lib/fuzzy-match'
import { Search, Play, Trash2, Clock } from 'lucide-react'
import type { SavedQuery } from '@shared/appdata'
import { IPC_CHANNELS } from '@shared/ipc'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionsStore, getActiveProfile } from '@/stores/connections'
import { initialAutoCommit } from '@/lib/initial-autocommit'
import { Stack, ScrollArea, Text, EmptyState, IconButton, Box, Flex, Input, SearchInput } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'
import { ipc } from '@/platform/client'

// Saved queries persist in the SQLite app-data store (main process). This module
// keeps a synchronous in-memory mirror — so existing callers like `saveQuery`
// and `findSavedQuery` stay synchronous — and write-through to the store via
// IPC. The mirror is loaded once on boot by `hydrateSavedQueries`.
// See docs/proposals/internal-app-data-store.md.
const LEGACY_KEY = 'verql:saved-queries'
const listeners = new Set<() => void>()
let savedQueries: SavedQuery[] = []
let hydrated = false

const hasIpc = (): boolean => ipc.available()

function notify() { for (const l of listeners) l() }
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
function snapshot() { return savedQueries }

function upsertRemote(q: SavedQuery) {
  if (hasIpc()) void ipc.invoke(IPC_CHANNELS.APPDATA_SAVED_QUERIES_UPSERT, q)
}
function deleteRemote(id: string) {
  if (hasIpc()) void ipc.invoke(IPC_CHANNELS.APPDATA_SAVED_QUERIES_DELETE, id)
}

/** Read the pre-SQLite localStorage payload for one-time migration. Legacy
 *  timestamps were ISO strings; coerce them to epoch ms. */
function readLegacy(): SavedQuery[] | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>
    if (!Array.isArray(parsed)) return null
    const toMs = (v: unknown): number =>
      typeof v === 'number' ? v : (Date.parse(String(v)) || Date.now())
    return parsed.map((q) => ({
      id: String(q.id),
      name: String(q.name),
      sql: String(q.sql),
      ...(q.connectionType ? { connectionType: String(q.connectionType) } : {}),
      createdAt: toMs(q.createdAt),
      updatedAt: toMs(q.updatedAt),
    }))
  } catch {
    return null
  }
}

/** Load the saved-query mirror from the app-data store, migrating any legacy
 *  localStorage payload on first run. Called once during app boot. */
export async function hydrateSavedQueries(): Promise<void> {
  if (hydrated || !hasIpc()) return
  hydrated = true
  let list = await ipc.invoke(IPC_CHANNELS.APPDATA_SAVED_QUERIES_LIST)
  if (list.length === 0) {
    const legacy = readLegacy()
    if (legacy && legacy.length > 0) {
      await ipc.invoke(IPC_CHANNELS.APPDATA_SAVED_QUERIES_IMPORT, legacy)
      try { localStorage.removeItem(LEGACY_KEY) } catch { /* ignore */ }
      list = legacy
    }
  }
  savedQueries = list
  notify()
}

export function useSavedQueries(): SavedQuery[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

export function SavedQueriesPanel() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const queries = useSavedQueries()
  const filtered = search.trim()
    ? queries.filter(q => matchesFilter(search, q.name, q.sql))
    : queries

  const handleOpenQuery = (query: SavedQuery) => { openSavedQuery(query) }

  const handleDelete = (id: string) => removeSavedQuery(id)

  return (
    <Stack className="h-full">
      <Box className="px-2 py-1.5">
        <SearchInput size="lg" onClear={() => setSearch('')} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('query.saved.searchPlaceholder')} />
      </Box>

      <ScrollArea direction="vertical" className="flex-1 px-1">
        {filtered.length === 0 && (
          <EmptyState
            icon={<Clock size={20} className="text-text-muted" />}
            title={queries.length === 0 ? t('query.saved.emptyTitle') : t('query.saved.noMatches')}
            description={queries.length === 0 ? t('query.saved.emptyDescription') : undefined}
            className="py-8"
          />
        )}

        {filtered.map(query => (
          <Box
            key={query.id}
            className="group px-2 py-1.5 rounded-md hover:bg-hover cursor-pointer transition-colors"
            onClick={() => handleOpenQuery(query)}
          >
            <Flex align="center" justify="between">
              <Text size="xs" color="primary" truncate className="flex-1">{query.name}</Text>
              <Flex className="hidden group-hover:flex items-center gap-0.5">
                <IconButton
                  label={t('query.saved.openInNewTab')}
                  size="xs"
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); handleOpenQuery(query) }}
                  className="text-text-muted hover:text-success"
                >
                  <Play size={10} />
                </IconButton>
                <IconButton
                  label={t('query.saved.delete')}
                  size="xs"
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); handleDelete(query.id) }}
                  className="text-text-muted hover:text-error"
                >
                  <Trash2 size={10} />
                </IconButton>
              </Flex>
            </Flex>
            <Text size="xs" color="muted" truncate className="text-3xs mt-0.5 font-mono block">{query.sql}</Text>
          </Box>
        ))}
      </ScrollArea>
    </Stack>
  )
}

/**
 * Upsert a saved query. If `id` matches an existing record we overwrite it
 * (IDE-style save). Otherwise a new record is created. Returns the saved id.
 */
export function saveQuery(opts: {
  id?: string
  name: string
  sql: string
  connectionType?: string
}): string {
  const now = Date.now()
  const existingIdx = opts.id ? savedQueries.findIndex(q => q.id === opts.id) : -1
  if (existingIdx >= 0) {
    const prev = savedQueries[existingIdx]
    const updated: SavedQuery = { ...prev, name: opts.name, sql: opts.sql, connectionType: opts.connectionType ?? prev.connectionType, updatedAt: now }
    savedQueries = [
      ...savedQueries.slice(0, existingIdx),
      updated,
      ...savedQueries.slice(existingIdx + 1)
    ]
    upsertRemote(updated)
    notify()
    return prev.id
  }
  const id = `sq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const created: SavedQuery = { id, name: opts.name, sql: opts.sql, createdAt: now, updatedAt: now, connectionType: opts.connectionType }
  savedQueries = [...savedQueries, created]
  upsertRemote(created)
  notify()
  return id
}

/** Delete a saved query from the mirror and the app-data store. */
export function removeSavedQuery(id: string): void {
  savedQueries = savedQueries.filter(q => q.id !== id)
  deleteRemote(id)
  notify()
}

export function findSavedQueryByName(name: string): SavedQuery | undefined {
  return savedQueries.find(q => q.name === name)
}

/** Resolve a saved query by id or (case-insensitive) name. */
export function findSavedQuery(idOrName: string): SavedQuery | undefined {
  const needle = idOrName.trim()
  if (!needle) return undefined
  return savedQueries.find(q => q.id === needle)
    ?? savedQueries.find(q => q.name.toLowerCase() === needle.toLowerCase())
}

/** Open a saved query in a new query tab, pre-filled but not executed. */
export function openSavedQuery(query: SavedQuery): void {
  const { activeConnectionId } = useConnectionsStore.getState()
  const activeProfile = getActiveProfile()
  const tabId = useTabsStore.getState().addQueryTab(activeConnectionId, null, {
    autoCommit: initialAutoCommit(activeProfile)
  })
  useTabsStore.setState((s) => ({
    tabs: s.tabs.map(t => t.id === tabId ? { ...t, sql: query.sql, title: query.name } : t)
  }))
}

