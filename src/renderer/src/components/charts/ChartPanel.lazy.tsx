import { lazyComponent } from '@/components/common/lazyComponent'

/**
 * Lazy boundary for the bottom-dock chart panel. Import this from render sites
 * so the charting stack (`@arshad-shah/swift-chart`) loads on first use rather
 * than at boot.
 */
export const ChartPanel = lazyComponent(() =>
  import('./ChartPanel').then((m) => ({ default: m.ChartPanel })),
)
