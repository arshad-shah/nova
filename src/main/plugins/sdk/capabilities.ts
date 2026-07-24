// src/main/plugins/sdk/capabilities.ts
import type { DriverFactory } from './types'
import type { DriverCapabilities } from '@shared/driver-capabilities'

/** Build the function-free capability object the renderer consumes. The only
 *  place static driver capabilities are serialized for IPC. */
export function serializeStaticCapabilities(factory: DriverFactory): DriverCapabilities {
  return {
    sqlDialect: factory.sqlDialect,
    editorLanguage: factory.editorLanguage,
    statementSyntax: factory.statementSyntax,
    supportsDollarQuoting: factory.supportsDollarQuoting,
    errorRules: factory.errorRules,
    defaultSchemaUseConnectionDatabase: factory.defaultSchemaUseConnectionDatabase,
    defaultSchemaCandidates: factory.defaultSchemaCandidates,
    hasSampleQuery: typeof factory.sampleQuery === 'function',
    hasGetTableData: typeof factory.getTableData === 'function',
    nouns: factory.nouns,
    presentation: factory.presentation,
    session: factory.session,
    explain: factory.explain,
    sessionInspection: factory.sessionInspection,
    databaseSwitch: factory.databaseSwitch,
    pagination: factory.pagination,
  }
}
