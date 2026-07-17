import { CheckCircle, AlertTriangle, XCircle, PowerOff, Clock } from 'lucide-react'
import type { MessageKey } from '@shared/i18n'

export interface StateConfig {
  labelKey: MessageKey
  variant: 'success' | 'warning' | 'error' | 'default'
  icon: typeof CheckCircle
}

export const STATE_CONFIG: Record<string, StateConfig> = {
  active: { labelKey: 'plugins.detail.state.active', variant: 'success', icon: CheckCircle },
  degraded: { labelKey: 'plugins.detail.state.degraded', variant: 'warning', icon: AlertTriangle },
  error: { labelKey: 'plugins.detail.state.error', variant: 'error', icon: XCircle },
  inactive: { labelKey: 'plugins.detail.state.inactive', variant: 'default', icon: PowerOff },
  discovered: { labelKey: 'plugins.detail.state.discovered', variant: 'default', icon: Clock },
  validated: { labelKey: 'plugins.detail.state.validated', variant: 'default', icon: Clock },
  resolved: { labelKey: 'plugins.detail.state.resolved', variant: 'default', icon: Clock },
  activating: { labelKey: 'plugins.detail.state.activating', variant: 'default', icon: Clock },
}

export const CONTRIBUTION_BADGE_VARIANTS: Record<string, 'accent' | 'info' | 'success' | 'warning' | 'error' | 'default'> = {
  driver: 'accent',
  command: 'info',
  panel: 'success',
  exporter: 'warning',
  importer: 'warning',
  theme: 'default',
  middleware: 'default',
  setting: 'default',
}

// Centralised because `PluginDetailView.tsx` both drives the `Tabs` widget off
// this set and branches on the active tab id to pick which tab body to render
// — the same ids were re-typed as bare string literals at every branch.
export const DETAIL_TAB = {
  OVERVIEW: 'overview',
  PERMISSIONS: 'permissions',
  CONTRIBUTIONS: 'contributions',
  ERRORS: 'errors',
  SETTINGS: 'settings',
} as const
export type DetailTabId = (typeof DETAIL_TAB)[keyof typeof DETAIL_TAB]

export const DETAIL_TAB_IDS = Object.values(DETAIL_TAB) as DetailTabId[]
