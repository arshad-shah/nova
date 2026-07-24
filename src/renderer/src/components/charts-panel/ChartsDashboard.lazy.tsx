import { lazyComponent } from '@/components/common/lazyComponent'

/**
 * Lazy boundary for the charts sidebar dashboard. Import this from render sites
 * so the charting stack (`@arshad-shah/swift-chart`) loads on first use rather
 * than at boot.
 */
export const ChartsDashboard = lazyComponent(() =>
  import('./ChartsDashboard').then((m) => ({ default: m.ChartsDashboard })),
)
