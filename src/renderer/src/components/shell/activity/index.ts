// The Activity panel, split out of the former single ActivityList.tsx: a thin
// container (ActivityPanel), the presentational composition (ActivityList), the
// filter bar, the scroll region, and one row. Pure logic (kind meta, duration
// scaling) lives in `@/lib/activity`.
export { ActivityPanel } from './ActivityPanel'
export { ActivityList, type ActivityListProps } from './ActivityList'
export { ActivityStream } from './ActivityStream'
export { ActivityRow } from './ActivityRow'
export { ActivityFilterBar } from './ActivityFilterBar'
