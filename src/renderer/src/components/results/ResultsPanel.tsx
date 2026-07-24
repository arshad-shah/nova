import { ResultsGrid } from './ResultsGrid.lazy'
import { ResultsStatusBar } from './ResultsStatusBar'
import { PluginSlot } from '@/components/plugins/PluginSlot'
import { ExplainResult } from '@/components/ai/ExplainResult'
import type { QueryResult } from '@shared/types'
import { Flex, Box } from '@/primitives'

interface Props {
  results: QueryResult
  sql?: string
  tabId?: string
  aiExplanation?: string | null
}

export function ResultsPanel({ results, sql, tabId, aiExplanation }: Props) {
  const pluginActions = sql && tabId
    ? (
      <PluginSlot
        id="results.actions"
        context={{ tabId, sql, results, explanation: aiExplanation ?? null }}
      />
    )
    : null

  return (
    <Flex direction="column" className="h-full min-h-0">
      <Box className="flex-1 min-h-0 overflow-hidden">
        <ResultsGrid results={results} tabId={tabId} />
      </Box>
      {tabId && <ExplainResult tabId={tabId} explanation={aiExplanation ?? null} />}
      <ResultsStatusBar results={results} actions={pluginActions} />
    </Flex>
  )
}
