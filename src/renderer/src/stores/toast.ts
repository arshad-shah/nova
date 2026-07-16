import { create } from 'zustand'
import { IPC_EVENTS } from '@shared/ipc'

export interface Toast {
  id: string
  /** `warning` was renderable by the Toast primitive but unreachable from here,
   *  so nothing could ever raise one. */
  type: 'error' | 'success' | 'info' | 'warning'
  title: string
  message?: string
  /** One action — Undo, Retry, View. More than one and it wants a dialog. */
  action?: { label: string; onClick: () => void }
  /** If true, toast stays until manually dismissed or updated */
  persistent?: boolean
  /** Auto-dismiss time (ms) for non-persistent toasts. The ToastContainer owns
   *  the countdown (so it can animate the toast out before removal); falls back
   *  to its own default when omitted. */
  duration?: number
}

interface ToastState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'> & { id?: string }) => string
  updateToast: (id: string, updates: Partial<Omit<Toast, 'id'>>) => void
  removeToast: (id: string) => void
}

let nextId = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  // The store no longer auto-removes on a timer — the ToastContainer runs the
  // countdown and calls removeToast(id) after it animates the toast out.
  // Removing it here would make non-persistent toasts vanish without animating.
  addToast: (toast) => {
    const id = toast.id ?? String(++nextId)
    set((state) => ({
      toasts: [...state.toasts.filter((t) => t.id !== id), { ...toast, id }],
    }))
    return id
  },
  updateToast: (id, updates) => {
    set((state) => ({
      toasts: state.toasts.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }))
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

// Plugin notifications bus → toasts. Plugins call `ctx.notifications.show(…)`
// in the main process; the host broadcasts `notifications:show` to every
// renderer window, where we materialise it as a toast. Kept here so any
// component that renders <ToastContainer/> picks it up without needing to
// register its own subscriber.
if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.on(IPC_EVENTS.NOTIFICATIONS_SHOW, (payload) => {
    if (!payload || typeof payload !== 'object') return
    const { kind, title, message } = payload as { kind?: string; title?: string; message?: string }
    if (!title) return
    const type: Toast['type'] =
      kind === 'error' ? 'error'
      : kind === 'success' ? 'success'
      : kind === 'warning' ? 'warning'
      : 'info'
    useToastStore.getState().addToast({ type, title, message })
  })
}
