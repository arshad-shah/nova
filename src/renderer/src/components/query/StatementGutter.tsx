import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { editor } from 'monaco-editor'
import { Check, AlertCircle } from 'lucide-react'
import { Spinner } from '@/primitives/feedback/Spinner'
import { Button } from '@/primitives/forms/Button'
import { Text } from '@/primitives/typography/Text'
import {
  getStatementContribution,
  type LensAction,
  type Statement,
  type LensActionContext,
} from '@/lib/statement-registry'
import { useStatementStatus, hashStatement, type StatementStatus } from '@/stores/statement-status'
import { useTranslation } from '@/i18n/I18nProvider'

interface Props {
  editor: editor.IStandaloneCodeEditor
  tabId: string
  connectionId: string | null
  /** Real db type — passed through to lens-action handlers via the context. */
  dbType: string | undefined
  /** Driver-declared statement syntax (capability) used to select the splitter +
   *  lens actions. No gutter renders when the driver declares none. */
  statementSyntax: string | undefined
}

interface ZoneEntry {
  zoneId: string
  containerEl: HTMLDivElement
  stmt: Statement
}

export function StatementGutter({ editor, tabId, connectionId, dbType, statementSyntax }: Props) {
  const entriesRef = useRef<ZoneEntry[]>([])
  const [, setTick] = useState(0)
  const bump = () => setTick((n) => n + 1)

  useEffect(() => {
    if (!statementSyntax) return
    const contribution = getStatementContribution(statementSyntax)
    if (!contribution) return

    const reconcile = () => {
      const model = editor.getModel()
      if (!model) return
      let stmts: Statement[] = []
      try {
        stmts = contribution.splitStatements(model.getValue())
      } catch (err) {
        console.warn('[statement-gutter] splitter threw:', err)
      }

      editor.changeViewZones((accessor) => {
        for (const e of entriesRef.current) {
          accessor.removeZone(e.zoneId)
        }
        entriesRef.current = []

        for (const stmt of stmts) {
          // The view zone owns its domNode — Monaco renders it inline at the
          // requested line. React portals into containerEl below; we never
          // call addContentWidget (that would re-parent the DOM away from
          // the zone into Monaco's overlay layer and the zone would render
          // blank). The portal mounts inside the zone's own DOM, so the
          // buttons land in the right place automatically.
          // Monaco's view-zone DOM lives below the view-lines layer; without
          // pointer-events + z-index overrides the buttons render but clicks
          // fall through to the editor text. Force both wrappers to receive
          // events and float above the lines layer.
          const containerEl = document.createElement('div')
          containerEl.className = 'verql-stmt-gutter flex items-center gap-1 px-2 h-[24px] text-xs'
          containerEl.style.pointerEvents = 'auto'
          containerEl.style.position = 'relative'
          containerEl.style.zIndex = '10'
          const domNode = document.createElement('div')
          domNode.style.width = '100%'
          domNode.style.pointerEvents = 'auto'
          domNode.style.position = 'relative'
          domNode.style.zIndex = '10'
          domNode.appendChild(containerEl)

          const zoneId = accessor.addZone({
            afterLineNumber: Math.max(0, stmt.startLine - 1),
            heightInLines: 1,
            domNode,
          })

          entriesRef.current.push({ zoneId, containerEl, stmt })
        }
      })

      bump()
    }

    reconcile()
    let timer: number | undefined
    const sub = editor.onDidChangeModelContent(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(reconcile, 100) as unknown as number
    })

    return () => {
      window.clearTimeout(timer)
      sub.dispose()
      editor.changeViewZones((accessor) => {
        for (const e of entriesRef.current) {
          accessor.removeZone(e.zoneId)
        }
        entriesRef.current = []
      })
    }
  }, [editor, statementSyntax])

  // Need the syntax (to pick the splitter/actions) and the real db type (passed
  // to lens-action handlers via the context).
  if (!statementSyntax || !dbType) return null
  const contribution = getStatementContribution(statementSyntax)
  if (!contribution) return null

  return (
    <>
      {entriesRef.current.map((entry) =>
        createPortal(
          <GutterRow
            stmt={entry.stmt}
            actions={contribution.lensActions}
            tabId={tabId}
            connectionId={connectionId}
            dbType={dbType}
          />,
          entry.containerEl,
          entry.zoneId
        )
      )}
    </>
  )
}

function GutterRow({
  stmt,
  actions,
  tabId,
  connectionId,
  dbType,
}: {
  stmt: Statement
  actions: LensAction[]
  tabId: string
  connectionId: string | null
  dbType: string
}) {
  const status = useStatementStatus((s) => s.get(tabId, hashStatement(stmt.text)))
  const ctx: LensActionContext = { stmt, tabId, connectionId, dbType }

  return (
    <>
      {actions
        .filter((a) => !a.when || a.when(stmt))
        .map((a) => (
          <Button
            key={a.id}
            variant="ghost"
            size="xs"
            onClick={() => a.handler(ctx)}
            className="!h-6 !px-1.5 gap-1 text-text-secondary hover:text-text-primary"
          >
            {a.icon ? <a.icon size={12} /> : null}
            {a.title}
          </Button>
        ))}
      {status ? <StatusChip status={status} /> : null}
    </>
  )
}

function StatusChip({ status }: { status: StatementStatus }) {
  const { t } = useTranslation()
  if (status.kind === 'running') {
    return (
      <Text as="span" size="xs" color="muted" className="ml-2 inline-flex items-center gap-1">
        <Spinner size="xs" className="text-current" />
        {t('query.statement.running')}
      </Text>
    )
  }
  if (status.kind === 'error') {
    return (
      <Text as="span" size="xs" color="error" className="ml-2 inline-flex items-center gap-1">
        <AlertCircle size={10} />
        {t('query.statement.failed')}
        {status.durationMs != null ? ` · ${formatMs(status.durationMs)}` : null}
      </Text>
    )
  }
  return (
    <Text as="span" size="xs" color="success" className="ml-2 inline-flex items-center gap-1">
      <Check size={10} />
      {status.durationMs != null ? formatMs(status.durationMs) : t('query.statement.ok')}
      {status.rowCount != null
        ? ` · ${t('query.statement.rows', { count: status.rowCount })}`
        : null}
    </Text>
  )
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
