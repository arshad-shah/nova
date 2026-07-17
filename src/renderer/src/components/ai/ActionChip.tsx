import { useState, type ReactNode } from 'react'
import { errorMessage } from '@shared/errors'
import {
  ArrowUpRight, Settings, Plus, PanelLeft, SquarePlus, Network, AlertTriangle, type LucideIcon
} from 'lucide-react'
import { appActions } from '@/lib/app-actions/registry'
import { APP_ACTION } from '@/lib/app-actions/ids'
import { useToastStore } from '@/stores/toast'
import { useTranslation } from '@/i18n/I18nProvider'
import { Button, Tag } from '@/primitives'

// Per-action icons (lucide only — no emoji). Unknown ids fall back to a generic
// "jump to" arrow so any plugin-registered action still renders sensibly.
const ICONS: Record<string, LucideIcon> = {
  [APP_ACTION.OPEN_SETTINGS]: Settings,
  [APP_ACTION.NEW_CONNECTION]: Plus,
  [APP_ACTION.OPEN_EXPLORER]: PanelLeft,
  [APP_ACTION.OPEN_SECONDARY_PANEL]: PanelLeft,
  [APP_ACTION.NEW_QUERY_TAB]: SquarePlus,
  [APP_ACTION.OPEN_ER_DIAGRAM]: Network
}

interface Props {
  actionId: string
  params: Record<string, string>
  /** The markdown link text the AI wrote; used as the chip label. */
  children?: ReactNode
}

export function ActionChip({ actionId, params, children }: Props) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const action = appActions.get(actionId)

  // Unknown / unavailable action — render a disabled, non-actionable chip so the
  // user isn't left with a dead link that silently does nothing.
  if (!action) {
    return (
      <Tag
        className="rounded-md bg-transparent text-text-muted align-baseline"
        title={t('aiui.actionChip.unavailable')}
      >
        <AlertTriangle className="h-3 w-3" />
        {children ?? actionId}
      </Tag>
    )
  }

  const Icon = ICONS[actionId] ?? ArrowUpRight
  const label = children ?? action.title
  const isMutating = action.kind === 'mutating'

  const handleClick = async () => {
    if (busy) return
    if (isMutating && !window.confirm(t('aiui.actionChip.confirmMutating', { title: action.title }))) return
    setBusy(true)
    try {
      await appActions.run(actionId, params)
    } catch (err) {
      useToastStore.getState().addToast({
        type: 'error',
        title: t('aiui.actionChip.actionFailed'),
        message: errorMessage(err)
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="bare"
      size="none"
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium align-baseline transition-colors disabled:opacity-60 ${
        isMutating
          ? 'border-warning/40 text-warning hover:bg-warning/10'
          : 'border-accent/50 text-accent hover:bg-accent/10'
      }`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {label}
    </Button>
  )
}
