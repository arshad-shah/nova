import { describe, it, expect, beforeEach } from 'vitest'
import { notifyError } from '../../src/renderer/src/lib/notify-error'
import { useToastStore } from '../../src/renderer/src/stores/toast'
import { useNotificationsStore } from '../../src/renderer/src/stores/notifications'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  useNotificationsStore.setState({ notifications: [] })
})

describe('notifyError', () => {
  it('adds both a toast and a persistent notification by default', () => {
    notifyError('column "email" does not exist', {})
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useNotificationsStore.getState().notifications).toHaveLength(1)
  })

  it('classifies the raw error through the shared parser rather than showing raw driver noise', () => {
    notifyError(`Error invoking remote method 'db:query': column "email" does not exist`, {})
    const toast = useToastStore.getState().toasts[0]
    expect(toast.title).not.toContain('Error invoking remote method')
  })

  it('prefixes a caller-supplied title onto the parsed title with an em-dash', () => {
    notifyError('column "email" does not exist', { titlePrefix: 'AI: Generate SQL failed' })
    const toast = useToastStore.getState().toasts[0]
    expect(toast.title).toMatch(/^AI: Generate SQL failed — /)
  })

  it('silent: true skips the toast but still records the persistent notification', () => {
    notifyError('boom', { silent: true })
    expect(useToastStore.getState().toasts).toHaveLength(0)
    expect(useNotificationsStore.getState().notifications).toHaveLength(1)
  })

  it('ephemeral: true skips the persistent notification but still shows a toast', () => {
    notifyError('boom', { ephemeral: true })
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useNotificationsStore.getState().notifications).toHaveLength(0)
  })

  it('silent + ephemeral together produce neither a toast nor a notification', () => {
    notifyError('boom', { silent: true, ephemeral: true })
    expect(useToastStore.getState().toasts).toHaveLength(0)
    expect(useNotificationsStore.getState().notifications).toHaveLength(0)
  })

  it('passes the source through to the persistent notification only', () => {
    notifyError('boom', { source: { type: 'tab', id: 't1', label: 'Query 1' } })
    expect(useNotificationsStore.getState().notifications[0].source).toEqual({ type: 'tab', id: 't1', label: 'Query 1' })
  })

  it('both entries carry the same parsed title and message', () => {
    notifyError('column "email" does not exist', {})
    const toast = useToastStore.getState().toasts[0]
    const note = useNotificationsStore.getState().notifications[0]
    expect(toast.title).toBe(note.title)
    expect(toast.message).toBe(note.message)
  })
})
