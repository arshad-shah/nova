import type { PluginContext } from '../../sdk/types'
import type { PluginManifest } from '../../types'
import type { CompletionItem } from '@shared/plugin-ui-types'
import { RedisAdapter, buildRedisConnection } from './redis-adapter'
import { getTableData, jsonExporter } from './data-format'

export const manifest: PluginManifest = {
  name: 'verql-plugin-redis',
  version: '1.0.0',
  displayName: 'Redis',
  description: 'Redis database driver',
  main: 'index.js',
  contributes: {
    drivers: [{ id: 'redis', name: 'Redis' }],
    settings: [
      {
        key: 'defaultDb',
        title: 'Default database index',
        type: 'number',
        default: 0,
        min: 0,
        max: 15,
        description: 'Database number selected when a connection profile does not specify one.'
      },
      {
        key: 'scanCount',
        title: 'Key scan batch size',
        type: 'number',
        default: 200,
        min: 10,
        max: 5000,
        step: 50,
        description: 'COUNT hint used when listing keys via SCAN.'
      },
      {
        key: 'commandTimeoutMs',
        title: 'Command timeout (ms)',
        type: 'number',
        default: 5000,
        min: 100,
        max: 60000,
        step: 100,
        description: 'Abort a command if Redis does not respond within this window.'
      }
    ],
    exporters: [{ id: 'json', name: 'JSON (Redis key/value)', extension: 'json' }],
    formatters: [{ id: 'commands', name: 'Redis commands' }]
  }
}

/**
 * Tidy a Redis command buffer: trim each line and upper-case the command verb
 * (Redis command names are case-insensitive). Argument text — including spacing
 * inside quoted values — is left untouched, so it can never corrupt a value.
 */
function tidyRedisCommands(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return ''
      const m = /^(\S+)(\s[\s\S]*)?$/.exec(trimmed)
      return m ? m[1].toUpperCase() + (m[2] ?? '') : trimmed
    })
    .join('\n')
}

// ─── Static completion data ──────────────────────────────────────────────────

const REDIS_COMMANDS: CompletionItem[] = [
  // Strings
  { label: 'GET',       kind: 'command', detail: 'Get the value of a key',                                   sortText: '0_GET' },
  { label: 'SET',       kind: 'command', detail: 'Set the string value of a key',                            sortText: '0_SET' },
  { label: 'MGET',      kind: 'command', detail: 'Get the values of all given keys',                         sortText: '0_MGET' },
  { label: 'MSET',      kind: 'command', detail: 'Set multiple keys to multiple values',                     sortText: '0_MSET' },
  { label: 'INCR',      kind: 'command', detail: 'Increment the integer value of a key by one',              sortText: '0_INCR' },
  { label: 'DECR',      kind: 'command', detail: 'Decrement the integer value of a key by one',              sortText: '0_DECR' },
  { label: 'APPEND',    kind: 'command', detail: 'Append a value to a key',                                  sortText: '0_APPEND' },
  { label: 'STRLEN',    kind: 'command', detail: 'Get the length of the value stored in a key',              sortText: '0_STRLEN' },
  { label: 'SETNX',     kind: 'command', detail: 'Set the value of a key, only if the key does not exist',   sortText: '0_SETNX' },
  { label: 'SETEX',     kind: 'command', detail: 'Set the value and expiration of a key',                    sortText: '0_SETEX' },
  { label: 'GETRANGE',  kind: 'command', detail: 'Get a substring of the string stored at a key',            sortText: '0_GETRANGE' },
  { label: 'SETRANGE',  kind: 'command', detail: 'Overwrite part of a string at a key',                      sortText: '0_SETRANGE' },

  // Hashes
  { label: 'HGET',      kind: 'command', detail: 'Get the value of a hash field',                            sortText: '1_HGET' },
  { label: 'HSET',      kind: 'command', detail: 'Set the string value of a hash field',                     sortText: '1_HSET' },
  { label: 'HMGET',     kind: 'command', detail: 'Get the values of all given hash fields',                  sortText: '1_HMGET' },
  { label: 'HMSET',     kind: 'command', detail: 'Set multiple hash fields to multiple values',              sortText: '1_HMSET' },
  { label: 'HDEL',      kind: 'command', detail: 'Delete one or more hash fields',                           sortText: '1_HDEL' },
  { label: 'HGETALL',   kind: 'command', detail: 'Get all the fields and values in a hash',                  sortText: '1_HGETALL' },
  { label: 'HKEYS',     kind: 'command', detail: 'Get all the fields in a hash',                             sortText: '1_HKEYS' },
  { label: 'HVALS',     kind: 'command', detail: 'Get all the values in a hash',                             sortText: '1_HVALS' },
  { label: 'HLEN',      kind: 'command', detail: 'Get the number of fields in a hash',                       sortText: '1_HLEN' },
  { label: 'HEXISTS',   kind: 'command', detail: 'Determine if a hash field exists',                         sortText: '1_HEXISTS' },
  { label: 'HINCRBY',   kind: 'command', detail: 'Increment the integer value of a hash field',              sortText: '1_HINCRBY' },

  // Lists
  { label: 'LPUSH',     kind: 'command', detail: 'Prepend one or multiple values to a list',                 sortText: '2_LPUSH' },
  { label: 'RPUSH',     kind: 'command', detail: 'Append one or multiple values to a list',                  sortText: '2_RPUSH' },
  { label: 'LPOP',      kind: 'command', detail: 'Remove and get the first element in a list',               sortText: '2_LPOP' },
  { label: 'RPOP',      kind: 'command', detail: 'Remove and get the last element in a list',                sortText: '2_RPOP' },
  { label: 'LRANGE',    kind: 'command', detail: 'Get a range of elements from a list',                      sortText: '2_LRANGE' },
  { label: 'LLEN',      kind: 'command', detail: 'Get the length of a list',                                 sortText: '2_LLEN' },
  { label: 'LINDEX',    kind: 'command', detail: 'Get an element from a list by its index',                  sortText: '2_LINDEX' },
  { label: 'LSET',      kind: 'command', detail: 'Set the value of an element in a list by its index',       sortText: '2_LSET' },
  { label: 'LREM',      kind: 'command', detail: 'Remove elements from a list',                              sortText: '2_LREM' },
  { label: 'LINSERT',   kind: 'command', detail: 'Insert an element before or after another element',        sortText: '2_LINSERT' },

  // Sets
  { label: 'SADD',       kind: 'command', detail: 'Add one or more members to a set',                        sortText: '3_SADD' },
  { label: 'SREM',       kind: 'command', detail: 'Remove one or more members from a set',                   sortText: '3_SREM' },
  { label: 'SMEMBERS',   kind: 'command', detail: 'Get all the members in a set',                            sortText: '3_SMEMBERS' },
  { label: 'SISMEMBER',  kind: 'command', detail: 'Determine if a given value is a member of a set',         sortText: '3_SISMEMBER' },
  { label: 'SCARD',      kind: 'command', detail: 'Get the number of members in a set',                      sortText: '3_SCARD' },
  { label: 'SUNION',     kind: 'command', detail: 'Add multiple sets',                                       sortText: '3_SUNION' },
  { label: 'SINTER',     kind: 'command', detail: 'Intersect multiple sets',                                 sortText: '3_SINTER' },
  { label: 'SDIFF',      kind: 'command', detail: 'Subtract multiple sets',                                  sortText: '3_SDIFF' },
  { label: 'SRANDMEMBER', kind: 'command', detail: 'Get one or multiple random members from a set',          sortText: '3_SRANDMEMBER' },

  // Sorted Sets
  { label: 'ZADD',          kind: 'command', detail: 'Add one or more members to a sorted set',                sortText: '4_ZADD' },
  { label: 'ZREM',          kind: 'command', detail: 'Remove one or more members from a sorted set',           sortText: '4_ZREM' },
  { label: 'ZRANGE',        kind: 'command', detail: 'Return a range of members in a sorted set by index',     sortText: '4_ZRANGE' },
  { label: 'ZREVRANGE',     kind: 'command', detail: 'Return a range of members in a sorted set, by index, with scores ordered from high to low', sortText: '4_ZREVRANGE' },
  { label: 'ZSCORE',        kind: 'command', detail: 'Get the score associated with the given member',         sortText: '4_ZSCORE' },
  { label: 'ZRANK',         kind: 'command', detail: 'Determine the index of a member in a sorted set',        sortText: '4_ZRANK' },
  { label: 'ZCARD',         kind: 'command', detail: 'Get the number of members in a sorted set',              sortText: '4_ZCARD' },
  { label: 'ZCOUNT',        kind: 'command', detail: 'Count the members in a sorted set with scores within given values', sortText: '4_ZCOUNT' },
  { label: 'ZINCRBY',       kind: 'command', detail: 'Increment the score of a member in a sorted set',        sortText: '4_ZINCRBY' },
  { label: 'ZRANGEBYSCORE', kind: 'command', detail: 'Return a range of members in a sorted set by score',     sortText: '4_ZRANGEBYSCORE' },

  // Keys
  { label: 'DEL',       kind: 'command', detail: 'Delete a key',                                             sortText: '5_DEL' },
  { label: 'EXISTS',    kind: 'command', detail: 'Determine if a key exists',                                sortText: '5_EXISTS' },
  { label: 'EXPIRE',    kind: 'command', detail: 'Set a key\'s time to live in seconds',                     sortText: '5_EXPIRE' },
  { label: 'TTL',       kind: 'command', detail: 'Get the time to live for a key',                           sortText: '5_TTL' },
  { label: 'PTTL',      kind: 'command', detail: 'Get the time to live for a key in milliseconds',           sortText: '5_PTTL' },
  { label: 'PERSIST',   kind: 'command', detail: 'Remove the expiration from a key',                         sortText: '5_PERSIST' },
  { label: 'TYPE',      kind: 'command', detail: 'Determine the type stored at key',                         sortText: '5_TYPE' },
  { label: 'KEYS',      kind: 'command', detail: 'Find all keys matching the given pattern',                  sortText: '5_KEYS' },
  { label: 'SCAN',      kind: 'command', detail: 'Incrementally iterate the keys space',                     sortText: '5_SCAN' },
  { label: 'RENAME',    kind: 'command', detail: 'Rename a key',                                             sortText: '5_RENAME' },
  { label: 'RANDOMKEY', kind: 'command', detail: 'Return a random key from the keyspace',                    sortText: '5_RANDOMKEY' },

  // Server
  { label: 'PING',      kind: 'command', detail: 'Ping the server',                                          sortText: '6_PING' },
  { label: 'INFO',      kind: 'command', detail: 'Get information and statistics about the server',           sortText: '6_INFO' },
  { label: 'DBSIZE',    kind: 'command', detail: 'Return the number of keys in the selected database',        sortText: '6_DBSIZE' },
  { label: 'FLUSHDB',   kind: 'command', detail: 'Remove all keys from the current database',                sortText: '6_FLUSHDB' },
  { label: 'FLUSHALL',  kind: 'command', detail: 'Remove all keys from all databases',                       sortText: '6_FLUSHALL' },
  { label: 'CONFIG',    kind: 'command', detail: 'Get, set, or reset Redis server configuration parameters', sortText: '6_CONFIG' },
  { label: 'CLIENT',    kind: 'command', detail: 'Get and modify the connection options',                    sortText: '6_CLIENT' },
  { label: 'SLOWLOG',   kind: 'command', detail: 'Manages the Redis slow queries log',                       sortText: '6_SLOWLOG' },
  { label: 'DEBUG',     kind: 'command', detail: 'A container for debugging commands',                       sortText: '6_DEBUG' },

  // Pub/Sub
  { label: 'SUBSCRIBE',   kind: 'command', detail: 'Listen for messages published to the given channels',    sortText: '7_SUBSCRIBE' },
  { label: 'UNSUBSCRIBE', kind: 'command', detail: 'Stop listening for messages on given channels',          sortText: '7_UNSUBSCRIBE' },
  { label: 'PUBLISH',     kind: 'command', detail: 'Post a message to a channel',                            sortText: '7_PUBLISH' },
  { label: 'PSUBSCRIBE',  kind: 'command', detail: 'Listen for messages published to channels matching a pattern', sortText: '7_PSUBSCRIBE' },

  // Transactions
  { label: 'MULTI',     kind: 'command', detail: 'Mark the start of a transaction block',                    sortText: '8_MULTI' },
  { label: 'EXEC',      kind: 'command', detail: 'Execute all commands issued after MULTI',                  sortText: '8_EXEC' },
  { label: 'DISCARD',   kind: 'command', detail: 'Discard all commands issued after MULTI',                  sortText: '8_DISCARD' },
  { label: 'WATCH',     kind: 'command', detail: 'Watch the given keys to determine execution of MULTI/EXEC block', sortText: '8_WATCH' },
  { label: 'UNWATCH',   kind: 'command', detail: 'Forget about all watched keys',                            sortText: '8_UNWATCH' },

  // Scripting
  { label: 'EVAL',      kind: 'command', detail: 'Execute a Lua script server side',                         sortText: '9_EVAL' },
  { label: 'EVALSHA',   kind: 'command', detail: 'Execute a Lua script by its SHA1 digest',                  sortText: '9_EVALSHA' },

  // RedisJSON
  { label: 'JSON.SET',  kind: 'command', detail: 'RedisJSON: Set the JSON value at path in each key',        sortText: 'A_JSON_SET' },
  { label: 'JSON.GET',  kind: 'command', detail: 'RedisJSON: Return the value at path in each key',          sortText: 'A_JSON_GET' },
  { label: 'JSON.DEL',  kind: 'command', detail: 'RedisJSON: Delete a value',                                sortText: 'A_JSON_DEL' },
  { label: 'JSON.MGET', kind: 'command', detail: 'RedisJSON: Return the values at path from multiple keys',  sortText: 'A_JSON_MGET' },
  { label: 'JSON.TYPE', kind: 'command', detail: 'RedisJSON: Return the type of the JSON value at path',     sortText: 'A_JSON_TYPE' },
]

// ─── Plugin ──────────────────────────────────────────────────────────────────

export function activate(ctx: PluginContext): void {
  // ── Export contributions ───────────────────────────────────────────────────
  ctx.exporters.register('json', jsonExporter)

  // ── Formatter (plaintext command buffer) ────────────────────────────────────
  ctx.formatters.register('commands', {
    language: 'plaintext',
    displayName: 'Redis commands',
    appliesToTypes: ['redis'],
    format: tidyRedisCommands
  })

  // ── AI context provider ────────────────────────────────────────────────────
  ctx.ai.registerContextProvider({
    id: 'redis-query-format',
    appliesTo(connectionId: string) {
      const profile = ctx.connections.getProfile(connectionId)
      return profile?.type === 'redis'
    },
    async getContext() {
      return `Query format for this database:
The query_execute tool expects Redis commands as plain text, one command per line.
Examples:
- GET mykey
- SET mykey "hello"
- HGETALL user:1
- KEYS user:*
- LPUSH mylist "item1"
Multiple commands can be sent on separate lines and will be executed sequentially.
Do not use SQL syntax. Use standard Redis commands.`
    }
  })

  ctx.drivers.register('redis', {
    createAdapter: (config) => {
      const { options, database } = buildRedisConnection(config as Record<string, unknown>)
      return new RedisAdapter(options, database)
    },
    editorLanguage: 'plaintext',
    statementSyntax: 'redis',
    presentation: { abbreviation: 'RD', tone: 'error' },
    nouns: {
      object: { one: 'key', many: 'keys' },
      field: { one: 'field', many: 'fields' },
      record: { one: 'entry', many: 'entries' },
    },
    // "Tables" are key prefixes (e.g. `user:1`,`user:2` → `user`). List the keys
    // under the prefix instead of `GET <prefix>` (a prefix isn't itself a key, so
    // GET returned nil — or WRONGTYPE on a non-string key). Glob metachars in the
    // prefix are escaped so a name can't expand into an unintended wildcard.
    sampleQuery: async (prefix: string) => `KEYS ${prefix.replace(/[*?[\]\\]/g, '\\$&')}:*`,
    getTableData,
    connectionFields: [
      { key: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
      { key: 'port', label: 'Port', type: 'number', required: true, default: 6379 },
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'database', label: 'Database (0-15)', type: 'number', default: 0 },
      { key: 'ssl', label: 'SSL', type: 'boolean', default: false }
    ]
  })

  // ── Completion provider ────────────────────────────────────────────────────

  ctx.completions.register(async (_connectionId) => {
    return REDIS_COMMANDS
  })
}
