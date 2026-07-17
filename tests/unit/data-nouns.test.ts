// resolveDataNouns/nounVars/titleCase are exercised only indirectly through
// the useDataNouns hook test — this covers the pure functions directly,
// including the per-field (not all-or-nothing) fallback behaviour.
import { describe, it, expect } from 'vitest'
import { resolveDataNouns, titleCase, nounVars } from '../../src/renderer/src/lib/data-nouns'
import { t } from '../../shared/i18n'

describe('resolveDataNouns', () => {
  it('falls back to generic i18n nouns when no capability nouns are given', () => {
    const r = resolveDataNouns(undefined, t)
    expect(r.object.one).toBe('object')
    expect(r.field.one).toBe('field')
    expect(r.record.one).toBe('record')
  })

  it('fills in only the concepts a driver omits, per-field, not all-or-nothing', () => {
    // The driver declares "object" (collection) but not field/record — those
    // two should still fall back individually, not collapse the whole result.
    const r = resolveDataNouns({ object: { one: 'collection', many: 'collections' } }, t)
    expect(r.object.one).toBe('collection')
    expect(r.field.one).toBe('field')
    expect(r.record.one).toBe('record')
  })

  it('uses every declared noun when a driver supplies all three', () => {
    const r = resolveDataNouns(
      {
        object: { one: 'collection', many: 'collections' },
        field: { one: 'attribute', many: 'attributes' },
        record: { one: 'document', many: 'documents' },
      },
      t
    )
    expect(r).toEqual({
      object: { one: 'collection', many: 'collections' },
      field: { one: 'attribute', many: 'attributes' },
      record: { one: 'document', many: 'documents' },
    })
  })
})

describe('titleCase', () => {
  it('capitalizes only the first character', () => {
    expect(titleCase('table')).toBe('Table')
  })

  it('leaves an already-capitalized word untouched', () => {
    expect(titleCase('Table')).toBe('Table')
  })

  it('returns an empty string unchanged', () => {
    expect(titleCase('')).toBe('')
  })

  it('handles a single character', () => {
    expect(titleCase('x')).toBe('X')
  })
})

describe('nounVars', () => {
  it('produces lower-case and Title-cased singular/plural for all three concepts', () => {
    const vars = nounVars({
      object: { one: 'table', many: 'tables' },
      field: { one: 'column', many: 'columns' },
      record: { one: 'row', many: 'rows' },
    })
    expect(vars).toEqual({
      object: 'table', objects: 'tables', Object: 'Table', Objects: 'Tables',
      field: 'column', fields: 'columns', Field: 'Column', Fields: 'Columns',
      record: 'row', records: 'rows', Record: 'Row', Records: 'Rows',
    })
  })
})
