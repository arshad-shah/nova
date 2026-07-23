import type { PluginContext } from '../../sdk/types'
import type { PluginManifest } from '../../types'
import type { CompletionItem } from '@shared/plugin-ui-types'
import { MongoAdapter } from './mongo-adapter'
import { formatJson } from '../../sdk/format-json'
import { getTableData, jsonLinesExporter, bsonArrayExporter, jsonLinesImporter } from './data-format'

export const manifest: PluginManifest = {
  name: 'verql-plugin-mongodb',
  version: '1.0.0',
  displayName: 'MongoDB',
  description: 'MongoDB database driver',
  main: 'index.js',
  contributes: {
    drivers: [{ id: 'mongodb', name: 'MongoDB' }],
    settings: [
      {
        key: 'defaultLimit',
        title: 'Default query limit',
        type: 'number',
        default: 100,
        min: 1,
        max: 10000,
        step: 50,
        description: 'Row cap used when no explicit limit is provided in a query.'
      },
      {
        key: 'defaultAuthSource',
        title: 'Default auth source',
        type: 'text',
        default: 'admin',
        description: 'Authentication database used when a connection profile does not set one.'
      },
      {
        key: 'preferSrv',
        title: 'Prefer SRV connection strings',
        type: 'boolean',
        default: false,
        description: 'Use mongodb+srv:// by default for new connections.'
      }
    ],
    exporters: [
      { id: 'jsonl', name: 'JSON Lines', extension: 'jsonl' },
      { id: 'json-array', name: 'JSON Array', extension: 'json' }
    ],
    importers: [
      { id: 'jsonl', name: 'JSON Lines', extensions: ['jsonl', 'ndjson'] }
    ],
    formatters: [
      { id: 'json', name: 'JSON (MongoDB)' }
    ]
  }
}

// ─── Static completion data ──────────────────────────────────────────────────

const MONGO_OPERATIONS: CompletionItem[] = [
  { label: 'find',        kind: 'command', detail: 'Query documents',                         sortText: '0_find' },
  { label: 'findOne',     kind: 'command', detail: 'Query a single document',                 sortText: '0_findOne' },
  { label: 'aggregate',   kind: 'command', detail: 'Run an aggregation pipeline',             sortText: '0_aggregate' },
  { label: 'count',       kind: 'command', detail: 'Count matching documents',                sortText: '0_count' },
  { label: 'distinct',    kind: 'command', detail: 'Find distinct values for a field',        sortText: '0_distinct' },
  { label: 'insertOne',   kind: 'command', detail: 'Insert a single document',                sortText: '0_insertOne' },
  { label: 'insertMany',  kind: 'command', detail: 'Insert multiple documents',               sortText: '0_insertMany' },
  { label: 'updateOne',   kind: 'command', detail: 'Update the first matching document',      sortText: '0_updateOne' },
  { label: 'updateMany',  kind: 'command', detail: 'Update all matching documents',           sortText: '0_updateMany' },
  { label: 'deleteOne',   kind: 'command', detail: 'Delete the first matching document',      sortText: '0_deleteOne' },
  { label: 'deleteMany',  kind: 'command', detail: 'Delete all matching documents',           sortText: '0_deleteMany' },
]

const PIPELINE_STAGES: CompletionItem[] = [
  { label: '$match',       kind: 'operator', detail: 'Filter documents',                           sortText: '1_match' },
  { label: '$group',       kind: 'operator', detail: 'Group documents by expression',              sortText: '1_group' },
  { label: '$sort',        kind: 'operator', detail: 'Sort documents',                             sortText: '1_sort' },
  { label: '$limit',       kind: 'operator', detail: 'Limit number of documents',                  sortText: '1_limit' },
  { label: '$skip',        kind: 'operator', detail: 'Skip documents',                             sortText: '1_skip' },
  { label: '$project',     kind: 'operator', detail: 'Reshape documents (include/exclude fields)', sortText: '1_project' },
  { label: '$unwind',      kind: 'operator', detail: 'Deconstruct array field',                    sortText: '1_unwind' },
  { label: '$lookup',      kind: 'operator', detail: 'Perform a join with another collection',     sortText: '1_lookup' },
  { label: '$addFields',   kind: 'operator', detail: 'Add new fields to documents',                sortText: '1_addFields' },
  { label: '$replaceRoot', kind: 'operator', detail: 'Replace root document',                      sortText: '1_replaceRoot' },
  { label: '$count',       kind: 'operator', detail: 'Count documents in pipeline',                sortText: '1_count' },
  { label: '$merge',       kind: 'operator', detail: 'Write pipeline results to a collection',     sortText: '1_merge' },
  { label: '$out',         kind: 'operator', detail: 'Write pipeline results to a collection',     sortText: '1_out' },
  { label: '$facet',       kind: 'operator', detail: 'Multi-faceted aggregations',                 sortText: '1_facet' },
  { label: '$bucket',      kind: 'operator', detail: 'Categorize documents into buckets',          sortText: '1_bucket' },
  { label: '$unionWith',   kind: 'operator', detail: 'Combine pipeline results from two collections', sortText: '1_unionWith' },
]

const QUERY_OPERATORS: CompletionItem[] = [
  { label: '$eq',       kind: 'operator', detail: 'Equal to',                             sortText: '2_eq' },
  { label: '$ne',       kind: 'operator', detail: 'Not equal to',                         sortText: '2_ne' },
  { label: '$gt',       kind: 'operator', detail: 'Greater than',                         sortText: '2_gt' },
  { label: '$gte',      kind: 'operator', detail: 'Greater than or equal',                sortText: '2_gte' },
  { label: '$lt',       kind: 'operator', detail: 'Less than',                            sortText: '2_lt' },
  { label: '$lte',      kind: 'operator', detail: 'Less than or equal',                   sortText: '2_lte' },
  { label: '$in',       kind: 'operator', detail: 'Matches any value in array',           sortText: '2_in' },
  { label: '$nin',      kind: 'operator', detail: 'Matches no value in array',            sortText: '2_nin' },
  { label: '$and',      kind: 'operator', detail: 'Logical AND',                          sortText: '2_and' },
  { label: '$or',       kind: 'operator', detail: 'Logical OR',                           sortText: '2_or' },
  { label: '$not',      kind: 'operator', detail: 'Inverts effect of query expression',   sortText: '2_not' },
  { label: '$nor',      kind: 'operator', detail: 'Logical NOR',                          sortText: '2_nor' },
  { label: '$exists',   kind: 'operator', detail: 'Field existence check',                sortText: '2_exists' },
  { label: '$type',     kind: 'operator', detail: 'Match by BSON type',                   sortText: '2_type' },
  { label: '$regex',    kind: 'operator', detail: 'Regular expression match',             sortText: '2_regex' },
  { label: '$expr',     kind: 'operator', detail: 'Allows aggregation expressions',       sortText: '2_expr' },
  { label: '$all',      kind: 'operator', detail: 'Matches arrays containing all values', sortText: '2_all' },
  { label: '$elemMatch', kind: 'operator', detail: 'Matches array element by criteria',   sortText: '2_elemMatch' },
  { label: '$size',     kind: 'operator', detail: 'Matches array by length',              sortText: '2_size' },
]

const UPDATE_OPERATORS: CompletionItem[] = [
  { label: '$set',      kind: 'operator', detail: 'Set field value',                      sortText: '3_set' },
  { label: '$unset',    kind: 'operator', detail: 'Remove field',                         sortText: '3_unset' },
  { label: '$inc',      kind: 'operator', detail: 'Increment field value',                sortText: '3_inc' },
  { label: '$push',     kind: 'operator', detail: 'Append to array',                      sortText: '3_push' },
  { label: '$pull',     kind: 'operator', detail: 'Remove matching elements from array',  sortText: '3_pull' },
  { label: '$addToSet', kind: 'operator', detail: 'Add element if not already in array',  sortText: '3_addToSet' },
  { label: '$pop',      kind: 'operator', detail: 'Remove first or last array element',   sortText: '3_pop' },
  { label: '$rename',   kind: 'operator', detail: 'Rename a field',                       sortText: '3_rename' },
  { label: '$min',      kind: 'operator', detail: 'Update field to minimum value',        sortText: '3_min' },
  { label: '$max',      kind: 'operator', detail: 'Update field to maximum value',        sortText: '3_max' },
  { label: '$mul',      kind: 'operator', detail: 'Multiply field value',                 sortText: '3_mul' },
]

const SNIPPETS: CompletionItem[] = [
  {
    label: 'find-all',
    kind: 'snippet',
    detail: 'Find all documents in a collection',
    insertText: '{"collection": "", "operation": "find", "filter": {}}',
    sortText: '4_find_all',
  },
  {
    label: 'find-with-filter',
    kind: 'snippet',
    detail: 'Find documents matching a filter',
    insertText: '{"collection": "", "operation": "find", "filter": {"field": "value"}}',
    sortText: '4_find_filter',
  },
  {
    label: 'aggregate',
    kind: 'snippet',
    detail: 'Run an aggregation pipeline',
    insertText: '{"collection": "", "operation": "aggregate", "pipeline": []}',
    sortText: '4_aggregate',
  },
  {
    label: 'insert-one',
    kind: 'snippet',
    detail: 'Insert a single document',
    insertText: '{"collection": "", "operation": "insertOne", "document": {}}',
    sortText: '4_insertOne',
  },
  {
    label: 'update-one',
    kind: 'snippet',
    detail: 'Update a single document',
    insertText: '{"collection": "", "operation": "updateOne", "filter": {}, "update": {"$set": {}}}',
    sortText: '4_updateOne',
  },
  {
    label: 'delete-one',
    kind: 'snippet',
    detail: 'Delete a single document',
    insertText: '{"collection": "", "operation": "deleteOne", "filter": {}}',
    sortText: '4_deleteOne',
  },
]

const STATIC_COMPLETIONS: CompletionItem[] = [
  ...MONGO_OPERATIONS,
  ...PIPELINE_STAGES,
  ...QUERY_OPERATORS,
  ...UPDATE_OPERATORS,
  ...SNIPPETS,
]

// ─── Plugin ──────────────────────────────────────────────────────────────────

export function activate(ctx: PluginContext): void {
  // ── Export / Import contributions ──────────────────────────────────────────
  ctx.exporters.register('jsonl', jsonLinesExporter)
  ctx.exporters.register('json-array', bsonArrayExporter)
  ctx.importers.register('jsonl', jsonLinesImporter)
  // MongoDB's editor language is JSON; format the query document with the shared
  // SDK helper (a no-op on shell-style/partial input).
  ctx.formatters.register('json', {
    language: 'json',
    displayName: 'JSON (MongoDB)',
    appliesToTypes: ['mongodb'],
    format: (src) => formatJson(src)
  })

  // ── AI context provider ────────────────────────────────────────────────────
  // Tells the AI assistant how to format queries for MongoDB connections.
  ctx.ai.registerContextProvider({
    id: 'mongodb-query-format',
    appliesTo(connectionId: string) {
      const profile = ctx.connections.getProfile(connectionId)
      return profile?.type === 'mongodb'
    },
    async getContext() {
      return `Query format for this database:
The query_execute tool expects a JSON object string (not MongoDB shell syntax like db.collection.find()).
Required fields: "collection" (string), "operation" (string).
Allowed operations: find, findOne, aggregate, count, distinct, insertOne, insertMany, updateOne, updateMany, deleteOne, deleteMany.
Optional fields: "filter" (object), "pipeline" (array), "sort" (object), "limit" (number), "projection" (object), "update" (object), "document" (object), "documents" (array), "field" (string).

Examples:
- Count: {"collection":"events","operation":"count","filter":{}}
- Find with filter: {"collection":"users","operation":"find","filter":{"age":{"$gt":25}},"limit":10}
- Aggregate: {"collection":"orders","operation":"aggregate","pipeline":[{"$group":{"_id":"$status","total":{"$sum":1}}}]}
- Insert: {"collection":"users","operation":"insertOne","document":{"name":"Alice","age":30}}`
    }
  })

  ctx.drivers.register('mongodb', {
    editorLanguage: 'json',
    statementSyntax: 'mongodb',
    presentation: { abbreviation: 'MG', tone: 'success' },
    nouns: {
      object: { one: 'collection', many: 'collections' },
      field: { one: 'field', many: 'fields' },
      record: { one: 'document', many: 'documents' },
    },
    createAdapter: (config) => {
      const host = config.host as string || 'localhost'
      const port = config.port as number || 27017
      const database = config.database as string || 'test'
      const username = config.username as string | undefined
      const password = config.password as string | undefined
      const authSource = config.authSource as string || 'admin'
      const srv = config.srv as boolean || false
      const ssl = config.ssl as boolean || false

      const protocol = srv ? 'mongodb+srv' : 'mongodb'
      const auth = username && password
        ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
        : ''
      const hostPort = srv ? host : `${host}:${port}`
      const params = new URLSearchParams()
      if (username) params.set('authSource', authSource)
      if (ssl) params.set('tls', 'true')
      const query = params.toString()

      const uri = `${protocol}://${auth}${hostPort}/${database}${query ? '?' + query : ''}`
      return new MongoAdapter(uri, database)
    },
    sampleQuery: async (collection: string) =>
      JSON.stringify({ collection, operation: 'find', filter: {}, limit: 100 }),
    getTableData,
    connectionFields: [
      { key: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
      { key: 'port', label: 'Port', type: 'number', required: true, default: 27017 },
      { key: 'database', label: 'Database', type: 'text', required: true },
      { key: 'username', label: 'Username', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'authSource', label: 'Auth Source', type: 'text', default: 'admin' },
      { key: 'srv', label: 'Use SRV', type: 'boolean', default: false },
      { key: 'ssl', label: 'SSL', type: 'boolean', default: false }
    ],
    databaseSwitch: { supported: true }
  })

  // ── Completion provider ────────────────────────────────────────────────────

  ctx.completions.register(async (connectionId) => {
    const items: CompletionItem[] = [...STATIC_COMPLETIONS]

    try {
      const tables = await ctx.schema.getTables(connectionId)
      for (const t of tables) {
        items.push({
          label: t.name,
          kind: 'collection',
          detail: 'Collection',
          sortText: `0_col_${t.name}`,
        })
      }
    } catch {
      // schema unavailable — return static completions only
    }

    return items
  })
}
