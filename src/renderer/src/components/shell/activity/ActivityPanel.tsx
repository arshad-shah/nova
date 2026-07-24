import { useEffect } from 'react'
import { useActivityStore } from '@/stores/activity'
import { ActivityList } from './ActivityList'

/** Container: wires the live activity store; owns nothing else. */
export function ActivityPanel() {
  const entries = useActivityStore((s) => s.entries)
  const init = useActivityStore((s) => s.init)
  const clear = useActivityStore((s) => s.clear)

  useEffect(() => { void init() }, [init])

  return <ActivityList entries={entries} onClear={() => void clear()} />
}
