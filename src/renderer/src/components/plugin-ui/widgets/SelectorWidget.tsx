import { useEffect, useState } from 'react'
import { Select } from '@/primitives'
import { usePluginUIStore } from '@/stores/plugin-ui'
import { useConnectionsStore } from '@/stores/connections'
import type { SelectorWidget as SelectorWidgetType } from '@shared/plugin-ui-types'

interface Props {
  widget: SelectorWidgetType
  pluginId: string
}

export function SelectorWidgetRenderer({ widget, pluginId }: Props) {
  const activeConnectionId = useConnectionsStore((s) => s.activeConnectionId)
  const resolveOptions = usePluginUIStore(s => s.resolveOptions)
  const executeAction = usePluginUIStore(s => s.executeAction)
  const [options, setOptions] = useState(widget.options ?? [])
  const [value, setValue] = useState(widget.value ?? '')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!widget.resolver || !activeConnectionId) return
    let cancelled = false
    setLoading(true)
    resolveOptions(pluginId, widget.resolver, activeConnectionId)
      .then((resolved) => {
        if (!cancelled) {
          setOptions(resolved)
          if (!value && resolved.length > 0) setValue(resolved[0].value)
        }
      })
      .catch(() => { /* resolver failed — keep existing options */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [widget.resolver, activeConnectionId, pluginId, resolveOptions, value])

  const handleChange = (newValue: string) => {
    setValue(newValue)
    executeAction(pluginId, widget.onChange, { value: newValue, connectionId: activeConnectionId ?? '' })
  }

  if (widget.visible === false) return null

  return (
    <Select
      aria-label={widget.label}
      value={value}
      onChange={handleChange}
      options={options}
      size="xs"
      disabled={loading}
      searchable={widget.searchable}
    />
  )
}
