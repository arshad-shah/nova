// The redis plugin wires its command "formatter" and driver descriptor at
// activate() time. `tidyRedisCommands` (the formatter body) isn't exported —
// it's only reachable through the registered formatter — so we capture it via
// a fake ctx the same way `bundled-session-caps.test.ts` does for the SQL
// drivers. Also verifies the DB-agnostic nouns declaration, since that's what
// makes the renderer's generic "object/field/record" language resolve
// correctly for a non-relational driver.
import { describe, it, expect } from 'vitest'
import { DriverRegistryImpl } from '../../src/main/plugins/sdk/driver-registry'
import { FormatterRegistryImpl } from '../../src/main/plugins/sdk/formatter-registry'
import { activate } from '../../src/main/plugins/bundled/redis/index'

function ctxWith(drivers: DriverRegistryImpl, formatters: FormatterRegistryImpl) {
  const noop = () => ({ dispose() {} })
  return {
    drivers, formatters,
    exporters: { register: noop },
    ai: { registerContextProvider: noop },
    completions: { register: noop },
  } as never
}

function setup() {
  const drivers = new DriverRegistryImpl()
  const formatters = new FormatterRegistryImpl()
  activate(ctxWith(drivers, formatters))
  return { drivers, formatters }
}

describe('redis command formatter (tidyRedisCommands)', () => {
  it('upper-cases only the leading command verb, leaving arguments untouched', () => {
    const { formatters } = setup()
    const format = formatters.get('commands')!.format
    expect(format('get user:1')).toBe('GET user:1')
    expect(format('set  foo   "bar baz"')).toBe('SET  foo   "bar baz"')
  })

  it('collapses whitespace-only lines to empty, but keeps line structure', () => {
    const { formatters } = setup()
    const format = formatters.get('commands')!.format
    expect(format('get a\n   \nset b 1')).toBe('GET a\n\nSET b 1')
  })

  it('is a no-op on an already-blank buffer', () => {
    const { formatters } = setup()
    const format = formatters.get('commands')!.format
    expect(format('')).toBe('')
  })

  it('handles a bare command with no arguments', () => {
    const { formatters } = setup()
    const format = formatters.get('commands')!.format
    expect(format('ping')).toBe('PING')
  })
})

describe('redis driver descriptor', () => {
  it('declares key/field/entry nouns (not table/column/row) for the generic renderer', () => {
    const { drivers } = setup()
    const descriptor = drivers.get('redis')!
    expect(descriptor.nouns).toEqual({
      object: { one: 'key', many: 'keys' },
      field: { one: 'field', many: 'fields' },
      record: { one: 'entry', many: 'entries' },
    })
  })

  it('sampleQuery escapes glob metacharacters in the prefix before building KEYS', async () => {
    const { drivers } = setup()
    const descriptor = drivers.get('redis')!
    const sample = await descriptor.sampleQuery!('user*[1]')
    expect(sample).toBe('KEYS user\\*\\[1\\]:*')
  })

  it('editorLanguage is plaintext, not sql — Redis commands are not SQL', () => {
    const { drivers } = setup()
    expect(drivers.get('redis')!.editorLanguage).toBe('plaintext')
  })
})
