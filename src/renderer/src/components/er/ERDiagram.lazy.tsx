import { lazyComponent } from '@/components/common/lazyComponent'

/**
 * Lazy boundary for the ER diagram view. Import this from render sites so the
 * diagram renderer and its layout code load on first use rather than at boot.
 */
export const ERDiagram = lazyComponent(() =>
  import('./ERDiagram').then((m) => ({ default: m.ERDiagram })),
)
