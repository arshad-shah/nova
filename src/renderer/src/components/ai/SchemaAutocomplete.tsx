import { useState, useEffect, useRef, useCallback, type KeyboardEvent, type RefObject } from 'react'
import { useSchemaStore } from '@/stores/schema'
import { useConnectionsStore } from '@/stores/connections'

interface SchemaItem {
  label: string
  detail: string
  type: 'table' | 'column'
}

interface Props {
  triggerText: string
  onSelect: (item: string) => void
  onDismiss: () => void
  anchorRef: RefObject<HTMLElement | null>
}

export function SchemaAutocomplete({ triggerText, onSelect, onDismiss, anchorRef }: Props) {
  const [items, setItems] = useState<SchemaItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const activeConnectionId = useConnectionsStore(s => s.activeConnectionId)

  const tables = useSchemaStore(s => s.tables)
  const columns = useSchemaStore(s => s.columns)
  const schemas = useSchemaStore(s => s.schemas)
  const fetchSchemas = useSchemaStore(s => s.fetchSchemas)
  const fetchTables = useSchemaStore(s => s.fetchTables)

  // Ensure schema data is loaded for the active connection
  useEffect(() => {
    if (!activeConnectionId) return

    // Check if we have any tables cached for this connection
    let hasTables = false
    for (const key of tables.keys()) {
      if (key.startsWith(activeConnectionId)) { hasTables = true; break }
    }

    if (!hasTables) {
      // Fetch schemas first, then tables for each schema
      fetchSchemas(activeConnectionId).then(schemaList => {
        const schemasToFetch = schemaList.length > 0 ? schemaList : ['public']
        for (const schema of schemasToFetch.slice(0, 5)) {
          fetchTables(activeConnectionId, schema)
        }
      })
    }
  }, [activeConnectionId, tables, fetchSchemas, fetchTables])

  useEffect(() => {
    if (!activeConnectionId) {
      setItems([])
      return
    }

    const allItems: SchemaItem[] = []

    // Gather tables
    for (const [key, tableList] of tables) {
      if (!key.startsWith(activeConnectionId)) continue
      for (const t of tableList) {
        allItems.push({ label: t.name, detail: 'table', type: 'table' })
      }
    }

    // Gather columns
    for (const [key, colList] of columns) {
      if (!key.startsWith(activeConnectionId)) continue
      // key format: connectionId:schema:table
      const parts = key.split(':')
      const tableName = parts[parts.length - 1]
      for (const c of colList) {
        allItems.push({
          label: `${tableName}.${c.name}`,
          detail: c.dataType,
          type: 'column'
        })
      }
    }

    // Filter by trigger text (text after @)
    const filter = triggerText.toLowerCase()
    const filtered = filter
      ? allItems.filter(i => i.label.toLowerCase().includes(filter))
      : allItems

    // Sort: tables first, then columns, alphabetical within
    filtered.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'table' ? -1 : 1
      return a.label.localeCompare(b.label)
    })

    setItems(filtered.slice(0, 20))
    setSelectedIndex(0)
  }, [triggerText, activeConnectionId, tables, columns])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      if (items[selectedIndex]) {
        onSelect(items[selectedIndex].label)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onDismiss()
    }
  }, [items, selectedIndex, onSelect, onDismiss])

  // Expose handleKeyDown to parent
  useEffect(() => {
    const el = anchorRef.current
    if (!el) return
    const listener = (e: Event) => handleKeyDown(e as unknown as KeyboardEvent)
    el.addEventListener('keydown', listener)
    return () => el.removeEventListener('keydown', listener)
  }, [anchorRef, handleKeyDown])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const selected = list.children[selectedIndex] as HTMLElement
    if (selected) selected.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (items.length === 0) return null

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto rounded-lg border border-border bg-bg-primary shadow-lg z-50"
    >
      {items.map((item, i) => (
        <button
          key={item.label}
          className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-hover transition-colors ${
            i === selectedIndex ? 'bg-hover' : ''
          }`}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(item.label)
          }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            item.type === 'table' ? 'bg-info' : 'bg-success'
          }`} />
          <span className="text-text-primary font-medium truncate">{item.label}</span>
          <span className="text-text-muted ml-auto shrink-0">{item.detail}</span>
        </button>
      ))}
    </div>
  )
}
