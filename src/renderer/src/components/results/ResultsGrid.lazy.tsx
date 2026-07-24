import { lazyComponent } from '@/components/common/lazyComponent'

/**
 * Lazy boundary for the ag-grid results grid. Import this from render sites so
 * `ag-grid-community` / `ag-grid-react` land in their own chunk and load on
 * first use rather than at boot.
 */
export const ResultsGrid = lazyComponent(() =>
  import('./ResultsGrid').then((m) => ({ default: m.ResultsGrid })),
)
