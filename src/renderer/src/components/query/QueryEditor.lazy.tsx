import { lazyComponent } from '@/components/common/lazyComponent'

/**
 * Lazy boundary for the Monaco-backed query editor. Import this from render
 * sites so `monaco-editor` / `@monaco-editor/react` land in their own chunk and
 * load on first use rather than at boot.
 */
export const QueryEditor = lazyComponent(() =>
  import('./QueryEditor').then((m) => ({ default: m.QueryEditor })),
)
