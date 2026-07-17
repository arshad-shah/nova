import { useCallback, useEffect } from 'react'
import { useDriverCapabilitiesStore } from '@/stores/driver-capabilities'
import {
  resolveDriverPresentation,
  type ResolvedDriverPresentation,
} from '@/lib/driver-presentation'

/**
 * Resolves each driver's declared visual identity (chip label + semantic tone).
 *
 * Returns a lookup rather than a single value because every consumer renders a
 * LIST of connections with mixed driver types, and a hook cannot be called
 * inside a `.map()`. The types present are pre-fetched so the lookup is
 * synchronous during render; a type that hasn't resolved yet falls back, and
 * re-renders with its real identity once the fetch lands.
 *
 * Mirrors `useDataNouns`, which does the same for the driver's data nouns.
 *
 * @param types the driver ids about to be rendered
 */
export function useDriverPresentation(
  types: string[]
): (type: string) => ResolvedDriverPresentation {
  const byType = useDriverCapabilitiesStore((s) => s.byType)
  const fetch = useDriverCapabilitiesStore((s) => s.fetch)

  // Depend on the set of types, not the array identity — callers build this
  // list inline on every render, so the array is a new object each time.
  const key = Array.from(new Set(types)).sort().join(',')
  useEffect(() => {
    if (!key) return
    for (const type of key.split(',')) fetch(type).catch(() => {})
  }, [key, fetch])

  return useCallback(
    (type: string) => resolveDriverPresentation(byType[type]?.presentation, type),
    [byType]
  )
}
