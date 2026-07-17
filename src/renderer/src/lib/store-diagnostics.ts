import { isDiagnosticsVerbose, recordActivity } from './diagnostics'
import { ACTIVITY_KIND } from '@shared/activity'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionsStore } from '@/stores/connections'
import { useUiStore } from '@/stores/ui'
import { useSchemaStore } from '@/stores/schema'
import { useAIStore } from '@/stores/ai'

interface SubscribableStore {
  subscribe: (listener: (state: unknown, prev: unknown) => void) => () => void
}

/** Subscribe to a store and record which top-level keys changed on each update.
 *  The verbose check is inside the callback so there's no diffing cost until a
 *  dev turns verbose on (the subscription itself is effectively free). */
function watch(name: string, store: SubscribableStore): void {
  store.subscribe((state, prev) => {
    if (!isDiagnosticsVerbose()) return
    const s = state as Record<string, unknown>
    const p = prev as Record<string, unknown>
    const changed: string[] = []
    for (const k of Object.keys(s)) {
      if (typeof s[k] === 'function') continue
      if (s[k] !== p[k]) changed.push(k)
    }
    if (changed.length === 0) return
    recordActivity({
      kind: ACTIVITY_KIND.STORE,
      level: 'debug',
      title: `${name}: ${changed.join(', ')}`,
      source: name,
      metadata: { changed },
    })
  })
}

let installed = false

/** Wire up verbose renderer diagnostics: state-store mutations + long tasks.
 *  Idempotent; call once at startup. Capture only happens when verbose is on. */
export function installRendererDiagnostics(): void {
  if (installed) return
  installed = true

  watch('tabs', useTabsStore as unknown as SubscribableStore)
  watch('connections', useConnectionsStore as unknown as SubscribableStore)
  watch('ui', useUiStore as unknown as SubscribableStore)
  watch('schema', useSchemaStore as unknown as SubscribableStore)
  watch('ai', useAIStore as unknown as SubscribableStore)

  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const obs = new PerformanceObserver((list) => {
        if (!isDiagnosticsVerbose()) return
        for (const e of list.getEntries()) {
          recordActivity({
            kind: ACTIVITY_KIND.PERF,
            level: 'debug',
            title: `Long task · ${Math.round(e.duration)}ms`,
            durationMs: e.duration,
            metadata: { name: e.name, startTime: Math.round(e.startTime) },
          })
        }
      })
      // 'longtask' only emits tasks >50ms per spec, so this is naturally sparse.
      obs.observe({ entryTypes: ['longtask'] })
    } catch {
      /* longtask unsupported in this engine — skip perf capture */
    }
  }
}
