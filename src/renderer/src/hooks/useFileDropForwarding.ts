import { useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { ipc } from '@/platform/client'

/** Forwards files dropped anywhere on the window to the main process, which
 *  routes each path to the plugin that claims its extension (e.g. `.sqlite` →
 *  the sqlite plugin opens it). The renderer stays ignorant of which
 *  extensions are claimed; the registry decides. */
export function useFileDropForwarding(): void {
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
      }
    }
    const handleDrop = (e: DragEvent) => {
      if (!e.dataTransfer) return
      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return
      e.preventDefault()
      for (const f of files) {
        const path = (f as File & { path?: string }).path
        if (!path) continue
        ipc.invoke(IPC_CHANNELS.PLUGINS_DRAG_DROP, path).catch(() => {})
      }
    }
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])
}
