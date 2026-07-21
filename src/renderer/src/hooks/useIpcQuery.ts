import { useEffect, useState } from 'react'
import type { IpcChannelMap } from '@shared/ipc'

interface IpcQueryResult<T> {
  data: T | undefined
  loading: boolean
}

/**
 * Fetch-on-mount for a typed IPC channel. The one home for the
 * `useEffect(() => { let active = true; invoke(...).then(setState); return () => { active = false } }, deps)`
 * boilerplate that a dozen panels/modals copy-pasted (each re-implementing the
 * cancellation guard so a resolve after unmount doesn't set state).
 *
 * Re-fetches whenever `deps` change. Errors are swallowed (the channels here are
 * best-effort metadata reads); callers that need error surfacing should invoke
 * directly and route through `notifyError`.
 */
export function useIpcQuery<K extends keyof IpcChannelMap>(
  channel: K,
  args: IpcChannelMap[K]['args'],
  deps: React.DependencyList = [],
): IpcQueryResult<IpcChannelMap[K]['return']> {
  const [data, setData] = useState<IpcChannelMap[K]['return'] | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    window.electronAPI
      .invoke(channel, ...args)
      .then((result) => {
        if (active) {
          setData(result)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading }
}
