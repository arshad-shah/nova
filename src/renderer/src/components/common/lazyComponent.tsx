import { lazy, Suspense, type ComponentType } from 'react'
import { PanelFallback } from './PanelFallback'

/**
 * Wrap a dynamically-imported component in a Suspense boundary with the shared
 * panel fallback. This is the one place code-splitting is applied: the heavy
 * renderer modules (Monaco, ag-grid, swift-chart, shiki/react-markdown) stay out
 * of the eager entry bundle and download on first use instead of before first
 * paint.
 *
 * The wrapped module is still directly importable by its Storybook story and
 * tests — only the render sites go through the lazy boundary, so stories keep
 * mounting the real component synchronously. The returned component keeps the
 * exact type (and props) of the wrapped one, inferred from `loader`, so call
 * sites are unchanged.
 */
export function lazyComponent<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
): T {
  const Lazy = lazy(loader)
  // Props are forwarded verbatim to the wrapped component; the public prop types
  // are preserved by the return type `T`, so the internal `any` never leaks out.
  function LazyComponentBoundary(props: any) {
    return (
      <Suspense fallback={<PanelFallback />}>
        <Lazy {...props} />
      </Suspense>
    )
  }
  return LazyComponentBoundary as unknown as T
}
