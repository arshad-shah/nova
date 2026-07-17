// BUG: formatMongoResult() branches solely on `Array.isArray(data)` and then
// assumes every element is a document, reading `Object.keys(data[0])` for
// column names and `Object.entries(doc)` per row. `distinct` (and any future
// op returning a plain array of scalars) returns an array of *strings or
// numbers*, not documents:
//   - a multi-character string gets shredded into one column per character
//     index via `Object.entries('alice')` -> [['0','a'],['1','l'],...], so
//     "alice" and "bob" render as different-width partial rows instead of one
//     value each.
//   - a plain number has no own enumerable properties, so
//     `Object.entries(42)` is `[]` and the value is silently dropped —
//     the row renders as `{}` with no visible data at all.
// This reproduces the exact path `query('distinct')` feeds through
// `formatMongoResult`, pinned as current (broken) behaviour.
import { describe, it, expect } from 'vitest'
import { formatMongoResult } from '../../../src/main/plugins/bundled/mongodb/mongo-adapter'

describe('BUG: formatMongoResult shreds/loses scalar array results (e.g. distinct)', () => {
  it('shreds a multi-character distinct string into one column per character index', () => {
    const result = formatMongoResult(['alice', 'bob'], 0)
    // Desired behaviour would be one row per value under a single column
    // (e.g. { value: 'alice' }); instead each row is a partial character map.
    expect(result.rows[0]).toEqual({ '0': 'a', '1': 'l', '2': 'i', '3': 'c', '4': 'e' })
    expect(result.rows[1]).toEqual({ '0': 'b', '1': 'o', '2': 'b' })
    // Column set is taken from the FIRST value only, so "bob"'s row is
    // missing columns '3' and '4' that "alice" contributed.
    expect(result.fields.map(f => f.name)).toEqual(['0', '1', '2', '3', '4'])
  })

  it('silently drops numeric distinct values entirely (Object.entries(number) is empty)', () => {
    const result = formatMongoResult([42, 7], 0)
    expect(result.rows).toEqual([{}, {}])
    expect(result.rowCount).toBe(2)
  })
})
